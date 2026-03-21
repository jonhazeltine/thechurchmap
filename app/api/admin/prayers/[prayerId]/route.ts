import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { updatePrayerStatusSchema } from "@shared/schema";
import { z } from "zod";

// Schema for full prayer update (title, body, status, answered fields)
const updatePrayerSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(2000).optional(),
  answered_at: z.string().nullable().optional(),
  answered_note: z.string().max(2000).nullable().optional(),
  mark_answered: z.boolean().optional(),
  unmark_answered: z.boolean().optional(),
});

export async function PATCH(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const { prayerId } = req.params;
    const body = req.body;
    
    // Validate request body - use flexible schema that allows status, title, or body updates
    const validation = updatePrayerSchema.safeParse(body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request body', details: validation.error });
    }

    const { status, title, body: prayerBody, answered_note, mark_answered, unmark_answered } = validation.data;
    
    // Verify JWT with admin client (service role)
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin using service role client (bypasses RLS)
    const { data: platformRoles } = await adminClient
      .from('city_platform_users')
      .select('*')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
      .eq('is_active', true);

    const { data: churchAdminRoles } = await adminClient
      .from('church_user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_approved', true);

    // Get prayer to check ownership and church access
    const { data: prayer } = await adminClient
      .from('prayers')
      .select('church_id, submitted_by_user_id')
      .eq('id', prayerId)
      .single();

    if (!prayer) {
      return res.status(404).json({ error: 'Prayer not found' });
    }

    const isPlatformAdmin = (platformRoles || []).length > 0;
    const churchAdminChurchIds = (churchAdminRoles || []).map(r => r.church_id);
    const isChurchAdmin = churchAdminChurchIds.includes(prayer.church_id);
    const isOwner = prayer.submitted_by_user_id === user.id;

    console.log('🔍 Prayer Update Auth Check:', {
      user: user.email,
      isPlatformAdmin,
      isChurchAdmin,
      isOwner,
      prayerId,
    });

    // Authorization rules:
    // - Status changes: Only admins (platform admin or church admin)
    // - Title/body changes: Admins OR the prayer submitter
    // - Mark answered: Admins OR the prayer submitter
    const isAdmin = isPlatformAdmin || isChurchAdmin;
    
    if (status && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden - Only admins can change prayer status' });
    }
    
    if ((title || prayerBody) && !isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Forbidden - You can only edit your own prayers' });
    }

    if ((mark_answered || unmark_answered) && !isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Forbidden - Only admins or the prayer submitter can mark prayers as answered' });
    }

    // Build update data - only include fields that are present
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
      if (status === 'approved') {
        updateData.approved_at = new Date().toISOString();
        updateData.approved_by_user_id = user.id;
      }
    }
    
    if (title) {
      updateData.title = title;
    }
    
    if (prayerBody) {
      updateData.body = prayerBody;
    }

    // Handle marking prayer as answered
    if (mark_answered) {
      updateData.answered_at = new Date().toISOString();
      updateData.answered_by_user_id = user.id;
      updateData.answered_note = answered_note || null;
    }

    // Handle unmarking prayer as answered
    if (unmark_answered) {
      updateData.answered_at = null;
      updateData.answered_by_user_id = null;
      updateData.answered_note = null;
    }

    const { data, error } = await adminClient
      .from('prayers')
      .update(updateData)
      .eq('id', prayerId)
      .select('*, church:churches!prayers_church_id_fkey(id, name)')
      .single();

    if (error) {
      console.error('Error updating prayer:', error);
      return res.status(500).json({ error: 'Failed to update prayer' });
    }

    // If a prayer was approved, update the linked prayer post's last_activity_at
    // This ensures the prayer post bubbles up in the community feed
    if (status === 'approved' && data.church_id) {
      try {
        // Find the prayer post for this church
        const { data: prayerPost } = await adminClient
          .from('posts')
          .select('id')
          .eq('linked_church_id', data.church_id)
          .eq('post_type', 'prayer_post')
          .maybeSingle();

        if (prayerPost) {
          // Update the prayer post's last_activity_at to bubble it up in the feed
          await adminClient
            .from('posts')
            .update({ 
              last_activity_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', prayerPost.id);
          
          console.log('📿 Updated prayer post activity for approved prayer:', {
            prayerId,
            churchId: data.church_id,
            postId: prayerPost.id
          });
        } else {
          console.log('📿 No prayer post found for church:', data.church_id);
        }
      } catch (postUpdateError) {
        // Don't fail the prayer approval if post update fails
        console.error('Error updating prayer post activity:', postUpdateError);
      }
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('Error in update prayer:', error);
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
    const { prayerId } = req.params;
    
    // Verify JWT with admin client (service role)
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin using service role client (bypasses RLS)
    const { data: platformRoles } = await adminClient
      .from('city_platform_users')
      .select('*')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
      .eq('is_active', true);

    const { data: churchAdminRoles } = await adminClient
      .from('church_user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_approved', true);

    // Get prayer to check ownership and church access
    const { data: prayer } = await adminClient
      .from('prayers')
      .select('church_id, submitted_by_user_id')
      .eq('id', prayerId)
      .single();

    if (!prayer) {
      return res.status(404).json({ error: 'Prayer not found' });
    }

    const isPlatformAdmin = (platformRoles || []).length > 0;
    const churchAdminChurchIds = (churchAdminRoles || []).map(r => r.church_id);
    const isChurchAdmin = churchAdminChurchIds.includes(prayer.church_id);
    const isOwner = prayer.submitted_by_user_id === user.id;
    const isAdmin = isPlatformAdmin || isChurchAdmin;

    console.log('🔍 Prayer Delete Auth Check:', {
      user: user.email,
      isPlatformAdmin,
      isChurchAdmin,
      isOwner,
      prayerId,
    });

    // Authorization: Admins OR the prayer owner can delete
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Forbidden - You can only delete your own prayers or be an admin' });
    }

    // Delete the prayer
    const { error } = await adminClient
      .from('prayers')
      .delete()
      .eq('id', prayerId);

    if (error) {
      console.error('Error deleting prayer:', error);
      return res.status(500).json({ error: 'Failed to delete prayer' });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error in delete prayer:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
