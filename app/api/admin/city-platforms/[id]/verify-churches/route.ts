import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";
import {
  calculateDataQualityScore,
  determineVerificationStatus,
} from "../../../../../../server/services/church-data-quality";
import {
  findGooglePlaceMatch,
  getPlaceDetails,
} from "../../../../../../server/services/google-places";
import type { ChurchVerificationStatus, ChurchVerificationSource } from "@shared/schema";

function parseLocation(location: any): { lat: number; lng: number } | null {
  if (!location) return null;
  
  let locationObj = location;
  
  if (typeof location === 'string') {
    try {
      locationObj = JSON.parse(location);
    } catch {
      return null;
    }
  }
  
  if (typeof locationObj === 'object' && locationObj !== null) {
    if (locationObj.coordinates && Array.isArray(locationObj.coordinates)) {
      const [lng, lat] = locationObj.coordinates;
      if (typeof lat === 'number' && typeof lng === 'number') {
        return { lat, lng };
      }
    }
    if (typeof locationObj.lat === 'number' && typeof locationObj.lng === 'number') {
      return { lat: locationObj.lat, lng: locationObj.lng };
    }
  }
  
  return null;
}

const batchVerifySchema = z.object({
  churchIds: z.array(z.string().uuid()).optional(),
  skipGoogleMatch: z.boolean().optional(),
});

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

    const parseResult = batchVerifySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { churchIds, skipGoogleMatch } = parseResult.data;

    let linkQuery = adminClient
      .from('city_platform_churches')
      .select('church_id')
      .eq('city_platform_id', platformId);

    if (churchIds && churchIds.length > 0) {
      linkQuery = linkQuery.in('church_id', churchIds);
    }

    const { data: platformChurchLinks, error: linksError } = await linkQuery;

    if (linksError) {
      console.error('Error fetching platform church links:', linksError);
      return res.status(500).json({ error: 'Failed to fetch platform churches' });
    }

    const churchIdList = (platformChurchLinks || []).map((pc: any) => pc.church_id);
    
    console.log(`[Verification] Platform ${platform.name} has ${churchIdList.length} linked church IDs from city_platform_churches`);
    
    if (churchIdList.length === 0) {
      return res.status(200).json({
        platform: { id: platform.id, name: platform.name },
        summary: { total: 0, verified: 0, unverified: 0, flagged_for_review: 0, enriched: 0, errors: 0 },
        details: [],
      });
    }

    // Try the new verification-specific RPC first (returns all churches including unapproved, with GeoJSON locations)
    console.log(`[Verification] Calling fn_get_platform_churches_for_verification for platform ${platformId}`);
    const { data: verificationChurches, error: verificationRpcError } = await adminClient.rpc('fn_get_platform_churches_for_verification', {
      p_platform_id: platformId
    });
    
    console.log(`[Verification] RPC returned: error=${verificationRpcError ? verificationRpcError.message : 'null'}, data length=${verificationChurches?.length ?? 'null'}`);
    
    let churches: any[];
    
    if (!verificationRpcError && verificationChurches && verificationChurches.length > 0) {
      const churchIdSet = new Set(churchIdList);
      const filteredChurches = verificationChurches.filter((c: any) => churchIdSet.has(c.id));
      console.log(`[Verification] Got ${verificationChurches.length} from fn_get_platform_churches_for_verification, filtered to ${filteredChurches.length} requested churches`);
      
      churches = filteredChurches.map((c: any) => {
        const parsed = parseLocation(c.location);
        if (parsed) {
          console.log(`[Verification] Parsed location for "${c.name}": ${parsed.lat}, ${parsed.lng}`);
        } else if (c.location) {
          console.log(`[Verification] Failed to parse location for "${c.name}":`, typeof c.location, c.location);
        } else {
          console.log(`[Verification] Church "${c.name}" has no location data`);
        }
        return {
          ...c,
          parsedLocation: parsed
        };
      });
    } else {
      // Fallback: try old RPC or direct query
      if (verificationRpcError) {
        console.error('Error calling fn_get_platform_churches_for_verification:', verificationRpcError);
      }
      console.log('[Verification] Falling back to fn_get_churches_simple');
      
      const { data: allSimpleChurches, error: simpleError } = await adminClient.rpc('fn_get_churches_simple');
      
      if (!simpleError && allSimpleChurches) {
        const churchIdSet = new Set(churchIdList);
        const filteredChurches = allSimpleChurches.filter((c: any) => churchIdSet.has(c.id));
        console.log(`[Verification] Got ${allSimpleChurches.length} from fn_get_churches_simple, filtered to ${filteredChurches.length} platform churches`);
        
        churches = filteredChurches.map((c: any) => {
          const parsed = parseLocation(c.location);
          if (parsed) {
            console.log(`[Verification] Parsed location for "${c.name}": ${parsed.lat}, ${parsed.lng}`);
          }
          return { ...c, parsedLocation: parsed };
        });
        
        // For churches not in the RPC results (unapproved), we need GeoJSON conversion
        // Since direct table query returns WKB, log a warning
        const foundIds = new Set(churches.map((c: any) => c.id));
        const missingIds = churchIdList.filter((id: string) => !foundIds.has(id));
        if (missingIds.length > 0) {
          console.log(`[Verification] ${missingIds.length} churches not in fn_get_churches_simple (unapproved). These need fn_get_platform_churches_for_verification RPC to be deployed.`);
          // Fetch basic info but warn about missing location
          const { data: extraChurches } = await adminClient
            .from('churches')
            .select('id, name, address, city, state, zip, phone, website, email, denomination, description, profile_photo_url, place_calling_id, verification_status, google_place_id, source')
            .in('id', missingIds);
          
          if (extraChurches) {
            for (const c of extraChurches) {
              console.log(`[Verification] Church "${c.name}" is unapproved - cannot get GeoJSON location without new RPC. Skipping Google lookup.`);
              churches.push({ ...c, parsedLocation: null });
            }
          }
        }
      } else {
        console.error('Error calling fn_get_churches_simple:', simpleError);
        return res.status(500).json({ error: 'Failed to fetch churches. Please ensure the fn_get_platform_churches_for_verification RPC is deployed.' });
      }
    }

    console.log(`[Verification] Starting batch verification for ${churches.length} churches on platform ${platform.name}`);

    const results = {
      total: churches.length,
      verified: 0,
      unverified: 0,
      flagged: 0,
      enriched: 0,
      errors: 0,
      details: [] as Array<{
        church_id: string;
        church_name: string;
        status: ChurchVerificationStatus;
        score: number;
        google_matched: boolean;
        enriched: boolean;
        error?: string;
      }>,
    };

    const now = new Date().toISOString();

    for (const church of churches) {
      try {
        const breakdown = calculateDataQualityScore(church);
        console.log(`[Verification] Church "${church.name}" - Quality Score: ${breakdown.total} (address_location: ${breakdown.address_location}, contact: ${breakdown.contact}, metadata: ${breakdown.metadata})`);
        
        let googleMatchConfidence: number | undefined;
        let googlePlaceId: string | undefined;
        let enrichmentData: Record<string, any> = {};

        const coords = church.parsedLocation || parseLocation(church.location);
        
        if (!skipGoogleMatch && coords) {
          const { lat, lng } = coords;
          console.log(`[Verification] Looking up Google Places for "${church.name}" at ${lat}, ${lng}`);
          
          try {
            const match = await findGooglePlaceMatch(church.name, lat, lng);
            
            if (match) {
              console.log(`[Verification] Google match found for "${church.name}": "${match.name}" (confidence: ${match.confidence}, place_id: ${match.place_id})`);
              googleMatchConfidence = match.confidence;
              googlePlaceId = match.place_id;

              // Always fetch details and enrich missing data when we have a Google match
              // Use minimum threshold of 0.3 to avoid enriching from completely wrong matches
              // The 0.7 threshold is only used for marking as "verified", not for enrichment
              const ENRICHMENT_THRESHOLD = 0.3;
              
              if (match.confidence >= ENRICHMENT_THRESHOLD) {
                console.log(`[Verification] Match confidence ${match.confidence} >= ${ENRICHMENT_THRESHOLD}, fetching details for enrichment...`);
                const details = await getPlaceDetails(match.place_id);
                
                if (details) {
                  console.log(`[Verification] Got Place Details:`, { phone: details.phone, website: details.website, address: details.address });
                  console.log(`[Verification] Church existing data:`, { phone: church.phone, website: church.website, address: church.address });
                  
                  if (!church.phone && details.phone) {
                    enrichmentData.phone = details.phone;
                    console.log(`[Verification] Will enrich phone: ${details.phone}`);
                  }
                  if (!church.website && details.website) {
                    enrichmentData.website = details.website;
                    console.log(`[Verification] Will enrich website: ${details.website}`);
                  }
                  if (!church.address && details.address) {
                    enrichmentData.address = details.address;
                    console.log(`[Verification] Will enrich address: ${details.address}`);
                  }
                  
                  if (Object.keys(enrichmentData).length === 0) {
                    console.log(`[Verification] No enrichment needed - church already has all available data`);
                  }
                } else {
                  console.log(`[Verification] No Place Details returned`);
                }
              } else {
                console.log(`[Verification] Match confidence ${match.confidence} < ${ENRICHMENT_THRESHOLD} minimum threshold, skipping enrichment to avoid wrong data`);
              }
            } else {
              console.log(`[Verification] No Google match found for "${church.name}"`);
            }
          } catch (googleError) {
            console.warn(`[Verification] Google match failed for ${church.name}:`, googleError);
          }
        } else if (!coords) {
          console.log(`[Verification] Church "${church.name}" has no coordinates, skipping Google lookup`);
        } else if (skipGoogleMatch) {
          console.log(`[Verification] Google matching skipped for "${church.name}" (skipGoogleMatch=true)`);
        }

        const hasEnrichment = Object.keys(enrichmentData).length > 0;

        // Recalculate quality score AFTER enrichment so the new data is factored in
        let finalBreakdown = breakdown;
        if (hasEnrichment) {
          const enrichedChurch = { ...church, ...enrichmentData };
          finalBreakdown = calculateDataQualityScore(enrichedChurch);
          console.log(`[Verification] Recalculated score after enrichment for "${church.name}": ${breakdown.total} -> ${finalBreakdown.total}`);
        }

        const status = determineVerificationStatus(
          finalBreakdown.total,
          googleMatchConfidence,
          church.source
        );
        
        console.log(`[Verification] Determined status for "${church.name}": ${status} (score=${finalBreakdown.total}, googleConfidence=${googleMatchConfidence}, source=${church.source})`);
        
        if (status === 'unverified') {
          console.log(`[Verification] *** UNVERIFIED CHURCH: "${church.name}" (id=${church.id}) - score=${finalBreakdown.total}, googleConfidence=${googleMatchConfidence}, source=${church.source}`);
        }

        const updateData: Record<string, any> = {
          verification_status: status,
          last_verified_at: now,
          last_verified_source: 'google_places' as ChurchVerificationSource,
          data_quality_score: finalBreakdown.total,
          data_quality_breakdown: finalBreakdown,
          google_last_checked_at: skipGoogleMatch ? undefined : now,
          updated_at: now,
        };

        if (googlePlaceId) {
          updateData.google_place_id = googlePlaceId;
        }
        if (googleMatchConfidence !== undefined) {
          updateData.google_match_confidence = googleMatchConfidence;
        }

        if (hasEnrichment) {
          Object.assign(updateData, enrichmentData);
        }

        const { error: updateError } = await adminClient
          .from('churches')
          .update(updateData)
          .eq('id', church.id);

        if (updateError) {
          console.error(`[Verification] Error updating church ${church.id}:`, updateError);
          results.errors++;
          results.details.push({
            church_id: church.id,
            church_name: church.name,
            status: 'unverified',
            score: breakdown.total,
            google_matched: false,
            enriched: false,
            error: updateError.message,
          });
          continue;
        }

        await adminClient
          .from('church_verification_events')
          .insert({
            church_id: church.id,
            city_platform_id: platformId,
            verification_status: status,
            verification_source: 'google_places',
            data_quality_score: finalBreakdown.total,
            google_match_confidence: googleMatchConfidence,
            reviewer_id: user.id,
            notes: hasEnrichment ? `Auto-enriched fields: ${Object.keys(enrichmentData).join(', ')}` : null,
            changes_made: hasEnrichment ? { enrichment: enrichmentData } : null,
          });

        switch (status) {
          case 'verified':
            results.verified++;
            break;
          case 'flagged_for_review':
            results.flagged++;
            break;
          default:
            results.unverified++;
        }

        if (hasEnrichment) {
          results.enriched++;
        }

        results.details.push({
          church_id: church.id,
          church_name: church.name,
          status,
          score: finalBreakdown.total,
          google_matched: googleMatchConfidence !== undefined && googleMatchConfidence >= 0.5,
          enriched: hasEnrichment,
        });

      } catch (churchError) {
        console.error(`[Verification] Error processing church ${church.id}:`, churchError);
        results.errors++;
        results.details.push({
          church_id: church.id,
          church_name: church.name,
          status: 'unverified',
          score: 0,
          google_matched: false,
          enriched: false,
          error: churchError instanceof Error ? churchError.message : 'Unknown error',
        });
      }
    }

    console.log(`[Verification] Batch verification complete: ${results.total} total, ${results.verified} verified, ${results.flagged} flagged, ${results.unverified} unverified, ${results.enriched} enriched, ${results.errors} errors`);

    return res.status(200).json({
      platform: {
        id: platform.id,
        name: platform.name,
      },
      summary: {
        total: results.total,
        verified: results.verified,
        unverified: results.unverified,
        flagged_for_review: results.flagged,
        enriched: results.enriched,
        errors: results.errors,
      },
      details: results.details,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/verify-churches:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
