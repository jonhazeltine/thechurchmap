import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../../lib/supabaseServer";

async function checkPlatformAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  platformId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true };
  }

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', platformId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['platform_owner', 'platform_admin'])
    .single();

  return { hasAccess: !!userRole, isSuperAdmin: false };
}

export async function POST(req: Request, res: Response) {
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

    const { id: platformIdOrSlug } = req.params;
    const { churchIds } = req.body;

    // Resolve platform ID (handle both UUID and slug)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(platformIdOrSlug);
    let platformId = platformIdOrSlug;
    
    if (!isUuid) {
      const { data: platform, error: platformError } = await adminClient
        .from('city_platforms')
        .select('id')
        .eq('slug', platformIdOrSlug)
        .single();
      
      if (platformError || !platform) {
        return res.status(404).json({ error: 'Platform not found' });
      }
      platformId = platform.id;
    }

    if (!Array.isArray(churchIds) || churchIds.length === 0) {
      return res.status(400).json({ error: 'churchIds must be a non-empty array' });
    }

    if (churchIds.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 churches can be approved at once' });
    }

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const now = new Date().toISOString();

    const { data: updatedLinks, error: updateError } = await adminClient
      .from('city_platform_churches')
      .update({ 
        status: 'visible', 
        updated_at: now,
      })
      .eq('city_platform_id', platformId)
      .in('church_id', churchIds)
      .select('id, church_id');

    if (updateError) {
      console.error('Error bulk approving churches:', updateError);
      return res.status(500).json({ error: 'Failed to approve churches' });
    }

    const approvedChurchIds = updatedLinks?.map(link => link.church_id) || [];

    if (approvedChurchIds.length > 0) {
      const { error: churchUpdateError } = await adminClient
        .from('churches')
        .update({ approved: true })
        .in('id', approvedChurchIds);

      if (churchUpdateError) {
        console.error('Error updating church approved status:', churchUpdateError);
      }
    }

    console.log(`[Admin] Bulk approved ${approvedChurchIds.length} churches for platform ${platformId} by user ${user.id}`);

    return res.status(200).json({ 
      success: true, 
      message: `${approvedChurchIds.length} churches approved successfully`,
      approved: approvedChurchIds.length
    });

  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/churches/bulk-approve:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
