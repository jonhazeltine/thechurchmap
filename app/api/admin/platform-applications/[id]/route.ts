import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { updatePlatformApplicationSchema } from "@shared/schema";

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

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { id } = req.params;

    const { data: application, error: applicationError } = await adminClient
      .from('city_platform_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (applicationError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const { data: applicantProfile } = await adminClient
      .from('profiles')
      .select('id, full_name, first_name, last_name, avatar_url')
      .eq('id', application.applicant_user_id)
      .single();

    let boundaries = [];
    if (application.boundary_ids && application.boundary_ids.length > 0) {
      const { data: boundaryData } = await adminClient
        .from('geographic_boundaries')
        .select('id, name, type, external_id, source')
        .in('id', application.boundary_ids);

      boundaries = boundaryData || [];
    }

    let reviewer = null;
    if (application.reviewed_by_user_id) {
      const { data: reviewerProfile } = await adminClient
        .from('profiles')
        .select('id, full_name, first_name, last_name')
        .eq('id', application.reviewed_by_user_id)
        .single();
      reviewer = reviewerProfile;
    }

    let createdPlatform = null;
    if (application.created_platform_id) {
      const { data: platform } = await adminClient
        .from('city_platforms')
        .select('id, name, slug, is_active, is_public')
        .eq('id', application.created_platform_id)
        .single();
      createdPlatform = platform;
    }

    return res.status(200).json({
      ...application,
      applicant: applicantProfile || null,
      boundaries,
      reviewer,
      created_platform: createdPlatform,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/platform-applications/:id:', error);
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

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { id } = req.params;

    const { data: application, error: applicationError } = await adminClient
      .from('city_platform_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (applicationError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status === 'approved' || application.status === 'rejected') {
      return res.status(400).json({ 
        error: `Cannot update application: it has already been ${application.status}` 
      });
    }

    const parseResult = updatePlatformApplicationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { status, reviewer_notes } = parseResult.data;

    const now = new Date().toISOString();
    let createdPlatformId: string | null = null;
    let churchesLinkedCount = 0;

    if (status === 'approved') {
      const slug = application.requested_platform_slug || 
        application.requested_platform_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const { data: existingSlug } = await adminClient
        .from('city_platforms')
        .select('id')
        .eq('slug', slug)
        .single();

      if (existingSlug) {
        return res.status(400).json({
          error: 'Platform slug already exists. Please update the application slug before approving.',
        });
      }

      const { data: newPlatform, error: platformError } = await adminClient
        .from('city_platforms')
        .insert({
          name: application.requested_platform_name,
          slug: slug,
          description: application.city_description,
          is_active: false,
          is_public: false,
          created_by_user_id: application.applicant_user_id,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (platformError) {
        console.error('Error creating platform:', platformError);
        return res.status(500).json({ error: 'Failed to create platform' });
      }

      createdPlatformId = newPlatform.id;

      const { error: userError } = await adminClient
        .from('city_platform_users')
        .insert({
          city_platform_id: newPlatform.id,
          user_id: application.applicant_user_id,
          role: 'platform_owner',
          is_active: true,
          created_at: now,
          updated_at: now,
        });

      if (userError) {
        console.error('Error creating platform user:', userError);
      }

      if (application.boundary_ids && application.boundary_ids.length > 0) {
        const boundaryInserts = application.boundary_ids.map((boundaryId: string, index: number) => ({
          city_platform_id: newPlatform.id,
          boundary_id: boundaryId,
          role: index === 0 ? 'primary' : 'included',
          sort_order: index,
          added_at: now,
          added_by_user_id: user.id,
        }));

        const { error: boundaryError } = await adminClient
          .from('city_platform_boundaries')
          .insert(boundaryInserts);

        if (boundaryError) {
          console.error('Error creating platform boundaries:', boundaryError);
        }

        // Auto-link churches within the platform boundaries
        const { data: churchesInBoundaries, error: churchesError } = await adminClient
          .rpc('fn_churches_within_boundaries', {
            p_boundary_ids: application.boundary_ids,
          });

        if (churchesError) {
          console.error('Error finding churches within boundaries:', churchesError);
        } else if (churchesInBoundaries && churchesInBoundaries.length > 0) {
          // Create city_platform_churches records for each church found
          const churchInserts = churchesInBoundaries.map((church: { church_id: string }) => ({
            city_platform_id: newPlatform.id,
            church_id: church.church_id,
            status: 'visible',
            is_claimed: false,
            added_at: now,
            updated_at: now,
          }));

          const { error: churchLinkError } = await adminClient
            .from('city_platform_churches')
            .insert(churchInserts);

          if (churchLinkError) {
            console.error('Error linking churches to platform:', churchLinkError);
          } else {
            churchesLinkedCount = churchesInBoundaries.length;
            console.log(`Successfully linked ${churchesLinkedCount} churches to platform ${newPlatform.name}`);
          }
        }
      }
    }

    const { data: updatedApplication, error: updateError } = await adminClient
      .from('city_platform_applications')
      .update({
        status,
        reviewer_notes: reviewer_notes || null,
        reviewed_by_user_id: user.id,
        reviewed_at: now,
        created_platform_id: createdPlatformId,
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating application:', updateError);
      return res.status(500).json({ error: 'Failed to update application' });
    }

    let responseMessage = '';
    if (status === 'approved') {
      responseMessage = `Application approved. Platform "${application.requested_platform_name}" has been created with ${churchesLinkedCount} church${churchesLinkedCount === 1 ? '' : 'es'} auto-linked.`;
    } else if (status === 'rejected') {
      responseMessage = 'Application has been rejected.';
    } else {
      responseMessage = `Application status updated to ${status}.`;
    }

    return res.status(200).json({
      message: responseMessage,
      application: updatedApplication,
      created_platform_id: createdPlatformId,
      churches_linked: churchesLinkedCount,
    });

  } catch (error) {
    console.error('Error in PATCH /api/admin/platform-applications/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
