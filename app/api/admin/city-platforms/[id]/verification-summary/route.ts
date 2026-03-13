import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { calculateVerificationSummary } from "../../../../../../server/services/church-data-quality";

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

    const { data: platformChurches, error: churchesError } = await adminClient
      .from('city_platform_churches')
      .select(`
        church_id,
        status,
        churches:church_id (
          id,
          name,
          verification_status,
          data_quality_score,
          last_verified_at
        )
      `)
      .eq('city_platform_id', platformId);

    if (churchesError) {
      console.error('Error fetching platform churches:', churchesError);
      return res.status(500).json({ error: 'Failed to fetch platform churches' });
    }

    const churches = (platformChurches || [])
      .filter((pc: any) => pc.churches)
      .map((pc: any) => ({
        id: pc.churches.id,
        name: pc.churches.name,
        verification_status: pc.churches.verification_status,
        data_quality_score: pc.churches.data_quality_score,
        last_verified_at: pc.churches.last_verified_at,
        platform_status: pc.status,
      }));

    // Helper to safely parse date and get timestamp
    const safeGetTimestamp = (dateStr: string | null | undefined): number | null => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date.getTime();
    };

    // Calculate last verification timestamps
    const allVerifiedDates = churches
      .map((c: any) => safeGetTimestamp(c.last_verified_at))
      .filter((ts): ts is number => ts !== null);
    
    // Filter needs_review churches using same logic as frontend mutation (flagged or low quality score)
    const needsReviewChurches = churches.filter((c: any) => 
      c.verification_status === 'flagged' || 
      (c.data_quality_score !== null && c.data_quality_score < 30)
    );
    
    const needsReviewVerifiedDates = needsReviewChurches
      .map((c: any) => safeGetTimestamp(c.last_verified_at))
      .filter((ts): ts is number => ts !== null);

    const lastVerificationTimestamps = {
      all: allVerifiedDates.length > 0 ? new Date(Math.max(...allVerifiedDates)).toISOString() : null,
      needs_review: needsReviewVerifiedDates.length > 0 ? new Date(Math.max(...needsReviewVerifiedDates)).toISOString() : null,
    };
    
    // Count by platform status
    const platformStatusCounts = { visible: 0, pending: 0, hidden: 0, featured: 0 };
    churches.forEach((c: any) => {
      if (c.platform_status && platformStatusCounts.hasOwnProperty(c.platform_status)) {
        platformStatusCounts[c.platform_status as keyof typeof platformStatusCounts]++;
      }
    });
    
    // Count needs_attention by platform status (to show how many hidden churches need review)
    const needsAttentionByStatus = { visible: 0, pending: 0, hidden: 0, featured: 0 };
    churches.forEach((c: any) => {
      const needsReview = c.verification_status === 'flagged' || 
                          c.verification_status === 'flagged_for_review' ||
                          c.verification_status === 'pending' ||
                          (c.data_quality_score !== null && c.data_quality_score < 30);
      if (needsReview && c.platform_status && needsAttentionByStatus.hasOwnProperty(c.platform_status)) {
        needsAttentionByStatus[c.platform_status as keyof typeof needsAttentionByStatus]++;
      }
    });

    const summary = calculateVerificationSummary(churches);

    return res.status(200).json({
      platform: {
        id: platform.id,
        name: platform.name,
      },
      summary,
      breakdown: {
        by_status: {
          verified: summary.verified,
          google_verified: summary.google_verified,
          user_verified: summary.user_verified,
          unverified: summary.unverified,
          not_verified_yet: summary.not_verified_yet,
          flagged_for_review: summary.flagged_for_review,
        },
        by_quality: {
          high: churches.filter((c: any) => (c.data_quality_score || 0) >= 70).length,
          medium: churches.filter((c: any) => {
            const score = c.data_quality_score || 0;
            return score >= 40 && score < 70;
          }).length,
          low: churches.filter((c: any) => (c.data_quality_score || 0) < 40).length,
        },
        by_platform_status: platformStatusCounts,
        needs_attention_by_platform_status: needsAttentionByStatus,
        last_verification: lastVerificationTimestamps,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/admin/city-platforms/:id/verification-summary:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
