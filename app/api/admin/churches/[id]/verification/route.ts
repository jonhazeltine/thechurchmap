import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";
import {
  calculateDataQualityScore,
  determineVerificationStatus,
} from "../../../../../../server/services/church-data-quality";
import type { ChurchVerificationStatus, ChurchVerificationSource } from "@shared/schema";

const manualVerificationSchema = z.object({
  verification_status: z.enum(['verified', 'unverified', 'flagged_for_review']),
  notes: z.string().optional(),
  apply_enrichment: z.boolean().optional(),
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

    const { hasAccess } = await checkAdminAccess(adminClient, user.id, user.user_metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id: churchId } = req.params;

    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select(`
        id,
        name,
        address,
        city,
        state,
        zip,
        phone,
        website,
        email,
        denomination,
        description,
        profile_photo_url,
        location,
        place_calling_id,
        verification_status,
        last_verified_at,
        last_verified_source,
        data_quality_score,
        data_quality_breakdown,
        google_place_id,
        google_match_confidence,
        google_last_checked_at,
        source,
        created_at,
        updated_at
      `)
      .eq('id', churchId)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const calculatedBreakdown = calculateDataQualityScore(church);

    const { data: verificationHistory, error: historyError } = await adminClient
      .from('church_verification_events')
      .select(`
        id,
        verification_status,
        verification_source,
        data_quality_score,
        google_match_confidence,
        notes,
        changes_made,
        created_at,
        reviewer:reviewer_id (
          id,
          full_name
        )
      `)
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (historyError) {
      console.warn('Could not fetch verification history:', historyError);
    }

    return res.status(200).json({
      church: {
        id: church.id,
        name: church.name,
        address: church.address,
        city: church.city,
        state: church.state,
        zip: church.zip,
        phone: church.phone,
        website: church.website,
        email: church.email,
        denomination: church.denomination,
        source: church.source,
      },
      verification: {
        status: church.verification_status || 'unverified',
        last_verified_at: church.last_verified_at,
        last_verified_source: church.last_verified_source,
      },
      data_quality: {
        score: church.data_quality_score || calculatedBreakdown.total,
        breakdown: church.data_quality_breakdown || calculatedBreakdown,
        calculated_breakdown: calculatedBreakdown,
      },
      google_match: {
        place_id: church.google_place_id,
        confidence: church.google_match_confidence,
        last_checked_at: church.google_last_checked_at,
      },
      history: verificationHistory || [],
    });
  } catch (error) {
    console.error('Error in GET /api/admin/churches/:id/verification:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
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

    const { hasAccess } = await checkAdminAccess(adminClient, user.id, user.user_metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id: churchId } = req.params;

    const parseResult = manualVerificationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { verification_status, notes } = parseResult.data;

    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select('*')
      .eq('id', churchId)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const breakdown = calculateDataQualityScore(church);
    const now = new Date().toISOString();

    const { error: updateError } = await adminClient
      .from('churches')
      .update({
        verification_status: verification_status as ChurchVerificationStatus,
        last_verified_at: now,
        last_verified_source: 'manual_review' as ChurchVerificationSource,
        data_quality_score: breakdown.total,
        data_quality_breakdown: breakdown,
        updated_at: now,
      })
      .eq('id', churchId);

    if (updateError) {
      console.error('Error updating church verification:', updateError);
      return res.status(500).json({ error: 'Failed to update verification status' });
    }

    const { error: eventError } = await adminClient
      .from('church_verification_events')
      .insert({
        church_id: churchId,
        verification_status: verification_status,
        verification_source: 'manual_review',
        data_quality_score: breakdown.total,
        reviewer_id: user.id,
        notes: notes || null,
        changes_made: {
          previous_status: church.verification_status,
          new_status: verification_status,
        },
      });

    if (eventError) {
      console.warn('Could not create verification event:', eventError);
    }

    return res.status(200).json({
      success: true,
      church_id: churchId,
      verification: {
        status: verification_status,
        last_verified_at: now,
        last_verified_source: 'manual_review',
      },
      data_quality: {
        score: breakdown.total,
        breakdown,
      },
    });
  } catch (error) {
    console.error('Error in POST /api/admin/churches/:id/verification:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
