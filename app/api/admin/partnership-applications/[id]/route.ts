import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { updatePartnershipApplicationSchema } from "@shared/schema";

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
      const { data: platformRoles } = await adminClient
        .from('platform_roles')
        .select('role, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);

      const isPlatformAdmin = (platformRoles || []).some(
        (role: any) => role.role === 'platform_admin' && role.is_active
      );

      if (!isPlatformAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const { id } = req.params;

    const { data: application, error } = await adminClient
      .from('partnership_applications')
      .select(`
        *,
        church:church_id (
          id,
          name,
          city,
          state,
          partnership_status
        )
      `)
      .eq('id', id)
      .single();

    if (error || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    return res.json(application);
  } catch (error) {
    console.error('Error in GET /api/admin/partnership-applications/:id:', error);
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
      const { data: platformRoles } = await adminClient
        .from('platform_roles')
        .select('role, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);

      const isPlatformAdmin = (platformRoles || []).some(
        (role: any) => role.role === 'platform_admin' && role.is_active
      );

      if (!isPlatformAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const { id } = req.params;

    const validationResult = updatePartnershipApplicationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const updateData = validationResult.data;

    // First get the application to know the church_id
    const { data: existingApp, error: fetchError } = await adminClient
      .from('partnership_applications')
      .select('church_id, path')
      .eq('id', id)
      .single();

    if (fetchError || !existingApp) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const { data: application, error: updateError } = await adminClient
      .from('partnership_applications')
      .update({
        ...updateData,
        reviewer_id: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        church:church_id (
          id,
          name,
          city,
          state
        )
      `)
      .single();

    if (updateError) {
      console.error('Error updating application:', updateError);
      return res.status(500).json({ error: 'Failed to update application' });
    }

    // If approved (status = reviewed), update the church's partnership_status to 'active'
    if (updateData.status === 'reviewed' && existingApp.church_id) {
      const { error: churchUpdateError } = await adminClient
        .from('churches')
        .update({
          partnership_status: 'active',
          partnership_updated_at: new Date().toISOString(),
        })
        .eq('id', existingApp.church_id);

      if (churchUpdateError) {
        console.error('Error updating church partnership status:', churchUpdateError);
        // Don't fail the request, just log the error
      }
    }

    // If withdrawn (status changed back to 'new'), revert church's partnership_status to 'pending'
    if (updateData.status === 'new' && existingApp.church_id) {
      const { error: churchUpdateError } = await adminClient
        .from('churches')
        .update({
          partnership_status: 'pending',
          partnership_updated_at: new Date().toISOString(),
        })
        .eq('id', existingApp.church_id);

      if (churchUpdateError) {
        console.error('Error reverting church partnership status:', churchUpdateError);
        // Don't fail the request, just log the error
      }
    }

    return res.json(application);
  } catch (error) {
    console.error('Error in PATCH /api/admin/partnership-applications/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
