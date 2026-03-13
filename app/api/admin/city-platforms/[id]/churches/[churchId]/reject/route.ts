import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../../../lib/supabaseServer";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper to resolve platform ID (can be UUID or slug)
async function resolvePlatformId(
  client: ReturnType<typeof supabaseServer>,
  idOrSlug: string
): Promise<string | null> {
  if (UUID_REGEX.test(idOrSlug)) {
    return idOrSlug;
  }
  
  // Try as slug
  const { data } = await client
    .from('city_platforms')
    .select('id')
    .eq('slug', idOrSlug)
    .single();
  return data?.id || null;
}

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

    const { id: platformIdOrSlug, churchId } = req.params;

    // Resolve platform slug to UUID if needed
    const platformId = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platformId) {
      return res.status(404).json({ error: 'Platform not found' });
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

    const { data: existingLink, error: linkError } = await adminClient
      .from('city_platform_churches')
      .select('id, status')
      .eq('city_platform_id', platformId)
      .eq('church_id', churchId)
      .single();

    if (linkError || !existingLink) {
      return res.status(404).json({ error: 'Church not found in this platform' });
    }

    const now = new Date().toISOString();
    const { data: updatedLink, error: updateError } = await adminClient
      .from('city_platform_churches')
      .update({ 
        status: 'hidden', 
        updated_at: now,
      })
      .eq('id', existingLink.id)
      .select('id, status, church_id')
      .single();

    if (updateError) {
      console.error('Error rejecting church:', updateError);
      return res.status(500).json({ error: 'Failed to reject church' });
    }

    console.log(`[Admin] Church ${churchId} rejected (hidden) for platform ${platformId} by user ${user.id}`);

    return res.status(200).json({ 
      success: true, 
      message: 'Church submission rejected',
      data: updatedLink
    });

  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/churches/:churchId/reject:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
