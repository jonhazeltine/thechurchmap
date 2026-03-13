import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { z } from "zod";

const updateChurchSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
});

async function checkAdminAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true };
  }

  const { data: platformRoles } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['platform_owner', 'platform_admin']);

  return { hasAccess: (platformRoles?.length || 0) > 0, isSuperAdmin: false };
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

    const { hasAccess } = await checkAdminAccess(adminClient, user.id, user.user_metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id: churchId } = req.params;

    const parseResult = updateChurchSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.errors });
    }

    const updateData = parseResult.data;

    // Filter out undefined values
    const filteredData = Object.fromEntries(
      Object.entries(updateData).filter(([_, v]) => v !== undefined)
    );

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data: updatedChurch, error: updateError } = await adminClient
      .from('churches')
      .update(filteredData)
      .eq('id', churchId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating church:', updateError);
      return res.status(500).json({ error: 'Failed to update church' });
    }

    return res.status(200).json(updatedChurch);

  } catch (error) {
    console.error('Error in admin church update:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
