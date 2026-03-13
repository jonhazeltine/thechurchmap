import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function resolvePlatformId(
  client: ReturnType<typeof supabaseServer>,
  idOrSlug: string
): Promise<{ id: string; name: string } | null> {
  if (isValidUUID(idOrSlug)) {
    const { data } = await client
      .from('city_platforms')
      .select('id, name')
      .eq('id', idOrSlug)
      .single();
    return data;
  }
  
  const { data } = await client
    .from('city_platforms')
    .select('id, name')
    .eq('slug', idOrSlug)
    .single();
  return data;
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

    const { id: platformIdOrSlug } = req.params;

    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    // Get all church IDs linked to this platform with 'unverified' status
    const { data: platformChurches, error: fetchError } = await adminClient
      .from('city_platform_churches')
      .select(`
        church_id,
        churches:church_id (
          id,
          verification_status
        )
      `)
      .eq('city_platform_id', platformId);

    if (fetchError) {
      console.error('Error fetching platform churches:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch platform churches' });
    }

    // Filter to only unverified churches
    const unverifiedChurchIds = (platformChurches || [])
      .filter((pc: any) => pc.churches?.verification_status === 'unverified')
      .map((pc: any) => pc.church_id);

    if (unverifiedChurchIds.length === 0) {
      return res.status(200).json({
        message: 'No unverified churches found',
        updated: 0,
      });
    }

    const now = new Date().toISOString();

    // Update all unverified churches to flagged_for_review
    const { error: updateError, count } = await adminClient
      .from('churches')
      .update({
        verification_status: 'flagged_for_review',
        updated_at: now,
      })
      .in('id', unverifiedChurchIds);

    if (updateError) {
      console.error('Error updating churches:', updateError);
      return res.status(500).json({ error: 'Failed to update churches' });
    }

    console.log(`[Migration] Updated ${unverifiedChurchIds.length} churches from 'unverified' to 'flagged_for_review' for platform ${platform.name}`);

    return res.status(200).json({
      message: `Successfully migrated ${unverifiedChurchIds.length} churches from 'unverified' to 'flagged_for_review'`,
      updated: unverifiedChurchIds.length,
      churchIds: unverifiedChurchIds,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/migrate-unverified:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
