import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { z } from "zod";

const updateProfilePendingSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

async function checkSubmissionAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  submissionId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean; submission: any | null }> {
  const isSuperAdmin = userMetadata?.super_admin === true;

  const { data: submission, error } = await adminClient
    .from('profiles_pending')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (error || !submission) {
    return { hasAccess: false, isSuperAdmin, submission: null };
  }
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true, submission };
  }

  // Check if user has platform admin access to this church
  const { data: platformChurches } = await adminClient
    .from('city_platform_churches')
    .select('city_platform_id')
    .eq('church_id', submission.church_id);

  if (!platformChurches || platformChurches.length === 0) {
    return { hasAccess: false, isSuperAdmin: false, submission };
  }

  const platformIds = platformChurches.map(pc => pc.city_platform_id);

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('city_platform_id', platformIds)
    .in('role', ['platform_owner', 'platform_admin'])
    .limit(1)
    .single();

  return { hasAccess: !!userRole, isSuperAdmin: false, submission };
}

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: submissionId } = req.params;

    const { hasAccess, submission } = await checkSubmissionAccess(
      adminClient,
      user.id,
      submissionId,
      user.user_metadata
    );

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get church details
    const { data: church } = await adminClient
      .from('churches')
      .select('*')
      .eq('id', submission.church_id)
      .single();

    // Get submitter profile
    let submitter = null;
    if (submission.submitted_by) {
      const { data: submitterProfile } = await adminClient
        .from('profiles')
        .select('id, full_name, first_name, avatar_url')
        .eq('id', submission.submitted_by)
        .single();

      if (submitterProfile) {
        // Get submitter email
        let submitterEmail = null;
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(submission.submitted_by);
          submitterEmail = authUser?.user?.email || null;
        } catch (err) {
          console.error('Error fetching submitter email:', err);
        }
        submitter = { ...submitterProfile, email: submitterEmail };
      }
    }

    return res.status(200).json({
      ...submission,
      church: church || null,
      submitter,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/profiles-pending/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: submissionId } = req.params;

    const { hasAccess, submission } = await checkSubmissionAccess(
      adminClient,
      user.id,
      submissionId,
      user.user_metadata
    );

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const parseResult = updateProfilePendingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { action } = parseResult.data;

    if (action === 'approve') {
      // Apply the submitted data to the church
      const submittedData = submission.submitted_data;
      
      // Filter out any fields that shouldn't be updated directly
      const allowedFields = [
        'name', 'address', 'city', 'state', 'zip', 'phone', 'email', 
        'website', 'description', 'denomination', 'logo_url', 'banner_url',
        'service_times', 'social_links'
      ];
      
      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (submittedData[field] !== undefined) {
          updateData[field] = submittedData[field];
        }
      }

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await adminClient
          .from('churches')
          .update(updateData)
          .eq('id', submission.church_id);

        if (updateError) {
          console.error('Error updating church:', updateError);
          return res.status(500).json({ error: 'Failed to apply profile changes' });
        }
      }

      // Delete the pending submission
      const { error: deleteError } = await adminClient
        .from('profiles_pending')
        .delete()
        .eq('id', submissionId);

      if (deleteError) {
        console.error('Error deleting pending submission:', deleteError);
        return res.status(500).json({ error: 'Failed to remove pending submission' });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Profile changes approved and applied',
        action: 'approved'
      });
    } else {
      // Reject - just delete the pending submission
      const { error: deleteError } = await adminClient
        .from('profiles_pending')
        .delete()
        .eq('id', submissionId);

      if (deleteError) {
        console.error('Error deleting pending submission:', deleteError);
        return res.status(500).json({ error: 'Failed to reject submission' });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Profile submission rejected',
        action: 'rejected'
      });
    }

  } catch (error) {
    console.error('Error in PATCH /api/admin/profiles-pending/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function DELETE(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: submissionId } = req.params;

    const { hasAccess, submission } = await checkSubmissionAccess(
      adminClient,
      user.id,
      submissionId,
      user.user_metadata
    );

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: deleteError } = await adminClient
      .from('profiles_pending')
      .delete()
      .eq('id', submissionId);

    if (deleteError) {
      console.error('Error deleting pending submission:', deleteError);
      return res.status(500).json({ error: 'Failed to delete submission' });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/admin/profiles-pending/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
