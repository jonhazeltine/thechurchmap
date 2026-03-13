import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import wkx from "wkx";

const STREET_SUFFIX_MAP: Record<string, string> = {
  'street': 'st',
  'avenue': 'ave',
  'drive': 'dr',
  'road': 'rd',
  'lane': 'ln',
  'court': 'ct',
  'circle': 'cir',
  'boulevard': 'blvd',
  'highway': 'hwy',
  'place': 'pl',
  'way': 'way',
  'trail': 'trl',
  'parkway': 'pkwy',
  'terrace': 'ter',
  'northeast': 'ne',
  'northwest': 'nw',
  'southeast': 'se',
  'southwest': 'sw',
  'north': 'n',
  'south': 's',
  'east': 'e',
  'west': 'w',
};

function normalizeAddress(address: string | null | undefined): string {
  if (!address) return '';
  
  let normalized = address.toLowerCase()
    .replace(/[.,#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = normalized.split(' ');
  const normalizedWords = words.map(word => STREET_SUFFIX_MAP[word] || word);
  
  return normalizedWords.join(' ');
}

function calculateSimilarity(s1: string, s2: string): number {
  // Normalize first
  const norm1 = (s1 || '').toLowerCase().trim();
  const norm2 = (s2 || '').toLowerCase().trim();
  
  // Both empty = identical (1.0)
  if (norm1 === '' && norm2 === '') return 1;
  // One empty, one not = completely different (0)
  if (norm1 === '' || norm2 === '') return 0;
  // Exact match
  if (norm1 === norm2) return 1;
  
  const longer = norm1.length > norm2.length ? norm1 : norm2;
  const shorter = norm1.length > norm2.length ? norm2 : norm1;
  
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  let matches = 0;
  const shorterArr = shorter.split('');
  const longerArr = longer.split('');
  
  for (let i = 0; i < shorterArr.length; i++) {
    const idx = longerArr.indexOf(shorterArr[i]);
    if (idx !== -1) {
      matches++;
      longerArr[idx] = '';
    }
  }
  
  return matches / longer.length;
}

function parseLocationToCoords(location: any): { lat: number; lng: number } | null {
  if (!location) return null;
  
  const locStr = typeof location === 'string' ? location : String(location);
  
  const wktMatch = locStr.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (wktMatch) {
    return {
      lng: parseFloat(wktMatch[1]),
      lat: parseFloat(wktMatch[2]),
    };
  }
  
  if (/^[0-9A-Fa-f]+$/.test(locStr) && locStr.length >= 34) {
    try {
      const buffer = Buffer.from(locStr, 'hex');
      const geom = wkx.Geometry.parse(buffer) as any;
      if (geom && typeof geom.x === 'number' && typeof geom.y === 'number') {
        return {
          lng: geom.x,
          lat: geom.y,
        };
      }
    } catch (e: any) {
    }
  }
  
  return null;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

async function resolvePlatformId(
  adminClient: ReturnType<typeof supabaseServer>,
  platformIdOrSlug: string
): Promise<{ id: string; name: string } | null> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(platformIdOrSlug)) {
    const { data } = await adminClient
      .from('city_platforms')
      .select('id, name')
      .eq('id', platformIdOrSlug)
      .single();
    return data;
  }
  
  const { data } = await adminClient
    .from('city_platforms')
    .select('id, name')
    .eq('slug', platformIdOrSlug)
    .single();
  return data;
}

type ConfidenceTier = 'auto' | 'review' | 'manual';

function generateClusterSignature(churchIds: string[]): string {
  return [...churchIds].sort().join('|');
}

async function getReviewedClusterSignatures(
  adminClient: ReturnType<typeof supabaseServer>,
  platformId: string
): Promise<Set<string>> {
  const { data, error } = await adminClient
    .from('reviewed_duplicate_clusters')
    .select('cluster_signature')
    .eq('city_platform_id', platformId);

  if (error) {
    console.error('Error fetching reviewed clusters:', error);
    return new Set();
  }

  return new Set((data || []).map(r => r.cluster_signature));
}

interface ChurchRecord {
  id: string;
  name: string;
  address: string;
  addressNorm: string;
  nameNorm: string;
  source: string;
  status: string;
  platformChurchId: string;
  lat?: number;
  lng?: number;
  verificationStatus: string | null;
  dataQualityScore: number;
  googleMatchConfidence: number;
  createdAt: Date;
  survivorScore: number;
}

interface DuplicateCluster {
  clusterId: string;
  signature: string;
  churches: ChurchRecord[];
  survivor: ChurchRecord;
  duplicates: ChurchRecord[];
  confidenceTier: ConfidenceTier;
  tierReason: string;
  maxNameSimilarity: number;
  maxAddressSimilarity: number;
}

interface ClusterResult {
  clusters: DuplicateCluster[];
  summary: {
    totalClusters: number;
    autoResolvable: number;
    needsReview: number;
    needsManual: number;
    totalDuplicatesToHide: number;
  };
}

function createSignature(name: string, address: string): string {
  const nameNorm = name.toLowerCase().trim();
  const addrNorm = normalizeAddress(address);
  return `${nameNorm}|${addrNorm}`;
}

function calculateSurvivorScore(church: {
  status: string;
  verificationStatus: string | null;
  dataQualityScore: number;
  googleMatchConfidence: number;
}): number {
  let score = 0;
  
  if (church.status === 'visible' && church.verificationStatus === 'verified') {
    score += 100;
  } else if (church.status === 'visible') {
    score += 50;
  }
  
  score += church.dataQualityScore || 0;
  score += church.googleMatchConfidence || 0;
  
  return score;
}

function determineConfidenceTier(cluster: ChurchRecord[]): { tier: ConfidenceTier; reason: string; maxNameSim: number; maxAddrSim: number } {
  if (cluster.length < 2) {
    return { tier: 'manual', reason: 'Single church - not a cluster', maxNameSim: 1, maxAddrSim: 1 };
  }

  const sorted = [...cluster].sort((a, b) => b.survivorScore - a.survivorScore);
  const topScore = sorted[0].survivorScore;
  const secondScore = sorted[1]?.survivorScore || 0;
  const scoreDiff = topScore - secondScore;

  let maxNameSimilarity = 0;
  let minNameSimilarity = 1;
  let maxAddressSimilarity = 0;
  let allNearIdentical = true;
  let hasProximityPair = false; // Any pair within 100ft (30m)
  let proximityPairWithDifferentNames = false; // Close proximity but different names

  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const nameSim = calculateSimilarity(cluster[i].nameNorm, cluster[j].nameNorm);
      const addrSim = calculateSimilarity(cluster[i].addressNorm, cluster[j].addressNorm);
      
      maxNameSimilarity = Math.max(maxNameSimilarity, nameSim);
      minNameSimilarity = Math.min(minNameSimilarity, nameSim);
      maxAddressSimilarity = Math.max(maxAddressSimilarity, addrSim);

      const combinedSim = (nameSim + addrSim) / 2;
      if (combinedSim < 0.95) {
        allNearIdentical = false;
      }

      // Check physical proximity (100ft ≈ 30m)
      if (cluster[i].lat && cluster[i].lng && cluster[j].lat && cluster[j].lng) {
        const distance = haversineDistance(cluster[i].lat, cluster[i].lng, cluster[j].lat, cluster[j].lng);
        if (distance <= 30) { // 100 feet ≈ 30 meters
          hasProximityPair = true;
          // If names are very different (<50% similar), flag for review
          if (nameSim < 0.5) {
            proximityPairWithDifferentNames = true;
          }
        }
      }
    }
  }

  // RULE 1: Same location + different names → always needs review
  // Could be different churches sharing a building
  if (proximityPairWithDifferentNames) {
    return { 
      tier: 'review', 
      reason: `Same location but different names (${Math.round(minNameSimilarity * 100)}% similarity) - may be separate churches`, 
      maxNameSim: maxNameSimilarity, 
      maxAddrSim: maxAddressSimilarity 
    };
  }

  // RULE 2: Same location + same/similar names → auto-resolvable duplicate
  if (hasProximityPair && maxNameSimilarity >= 0.85) {
    return { 
      tier: 'auto', 
      reason: 'Same location with matching names - clear duplicate', 
      maxNameSim: maxNameSimilarity, 
      maxAddrSim: maxAddressSimilarity 
    };
  }

  // Near-identical records (>=95% combined similarity) can be auto-resolved
  // even with tied scores - we'll pick the best one arbitrarily
  if (allNearIdentical) {
    if (scoreDiff > 10) {
      return { tier: 'auto', reason: 'Near-identical records with clear winner', maxNameSim: maxNameSimilarity, maxAddrSim: maxAddressSimilarity };
    } else {
      // Tied scores but clearly duplicates - still auto-resolvable
      return { tier: 'auto', reason: 'Near-identical records (tied scores - will keep oldest)', maxNameSim: maxNameSimilarity, maxAddrSim: maxAddressSimilarity };
    }
  }

  if (maxNameSimilarity < 0.6) {
    return { tier: 'manual', reason: `Names differ significantly (${Math.round(maxNameSimilarity * 100)}% similarity)`, maxNameSim: maxNameSimilarity, maxAddrSim: maxAddressSimilarity };
  }

  if (maxAddressSimilarity >= 0.95 && maxNameSimilarity >= 0.9) {
    if (scoreDiff > 10) {
      return { tier: 'auto', reason: 'High address and name match with clear winner', maxNameSim: maxNameSimilarity, maxAddrSim: maxAddressSimilarity };
    } else {
      return { tier: 'auto', reason: 'High similarity match (tied scores - will keep oldest)', maxNameSim: maxNameSimilarity, maxAddrSim: maxAddressSimilarity };
    }
  }

  if (scoreDiff <= 10) {
    return { tier: 'review', reason: `Scores are close (within ${Math.round(scoreDiff)} points)`, maxNameSim: maxNameSimilarity, maxAddrSim: maxAddressSimilarity };
  }

  return { tier: 'review', reason: 'Multiple viable candidates', maxNameSim: maxNameSimilarity, maxAddrSim: maxAddressSimilarity };
}

async function findDuplicateClusters(
  adminClient: ReturnType<typeof supabaseServer>,
  platformId: string,
  excludeReviewed: boolean = true
): Promise<ClusterResult> {
  const reviewedSignatures = excludeReviewed
    ? await getReviewedClusterSignatures(adminClient, platformId)
    : new Set<string>();
  const { data: platformChurches, error: churchError } = await adminClient
    .from('city_platform_churches')
    .select(`
      id,
      status,
      church_id,
      churches:church_id (
        id,
        name,
        address,
        source,
        location,
        verification_status,
        data_quality_score,
        google_match_confidence,
        created_at
      )
    `)
    .eq('city_platform_id', platformId)
    .neq('status', 'hidden');

  if (churchError) {
    console.error('Error fetching platform churches:', churchError);
    throw new Error('Failed to fetch churches');
  }

  const churches: ChurchRecord[] = [];

  for (const pc of platformChurches || []) {
    const church = pc.churches as any;
    if (!church) continue;

    const coords = parseLocationToCoords(church.location);
    const createdAt = church.created_at ? new Date(church.created_at) : new Date();
    
    const record: ChurchRecord = {
      id: church.id,
      name: church.name || '',
      address: church.address || '',
      addressNorm: normalizeAddress(church.address),
      nameNorm: (church.name || '').toLowerCase().trim(),
      source: church.source || '',
      status: pc.status,
      platformChurchId: pc.id,
      lat: coords?.lat,
      lng: coords?.lng,
      verificationStatus: church.verification_status,
      dataQualityScore: church.data_quality_score || 0,
      googleMatchConfidence: church.google_match_confidence || 0,
      createdAt,
      survivorScore: 0,
    };
    
    record.survivorScore = calculateSurvivorScore({
      status: record.status,
      verificationStatus: record.verificationStatus,
      dataQualityScore: record.dataQualityScore,
      googleMatchConfidence: record.googleMatchConfidence,
    });

    churches.push(record);
  }

  const signatureClusters = new Map<string, ChurchRecord[]>();
  
  for (const church of churches) {
    const signature = createSignature(church.name, church.address);
    if (!signatureClusters.has(signature)) {
      signatureClusters.set(signature, []);
    }
    signatureClusters.get(signature)!.push(church);
  }

  const processedIds = new Set<string>();
  const finalClusters: ChurchRecord[][] = [];

  for (const [signature, signatureChurches] of signatureClusters) {
    if (signatureChurches.length >= 2) {
      for (const church of signatureChurches) {
        processedIds.add(church.id);
      }
      finalClusters.push(signatureChurches);
    }
  }

  const unprocessedChurches = churches.filter(c => !processedIds.has(c.id));
  
  for (let i = 0; i < unprocessedChurches.length; i++) {
    const church1 = unprocessedChurches[i];
    if (processedIds.has(church1.id)) continue;
    
    const proximityCluster: ChurchRecord[] = [church1];
    
    for (let j = i + 1; j < unprocessedChurches.length; j++) {
      const church2 = unprocessedChurches[j];
      if (processedIds.has(church2.id)) continue;
      
      if (church1.lat && church1.lng && church2.lat && church2.lng) {
        const distance = haversineDistance(church1.lat, church1.lng, church2.lat, church2.lng);
        const nameSimilarity = calculateSimilarity(church1.nameNorm, church2.nameNorm);
        const addressSimilarity = calculateSimilarity(church1.addressNorm, church2.addressNorm);
        
        // Only cluster if:
        // 1. Very close proximity (< 30m) - likely same building/parking lot, OR
        // 2. Close proximity (< 100m) AND both name AND address are similar
        // This prevents clustering different churches with the same name at different addresses
        const isVeryCloseProximity = distance <= 30;
        const isCloseWithSimilarDetails = distance <= 100 && nameSimilarity > 0.6 && addressSimilarity > 0.5;
        
        if (isVeryCloseProximity || isCloseWithSimilarDetails) {
          proximityCluster.push(church2);
          processedIds.add(church2.id);
        }
      }
    }
    
    if (proximityCluster.length >= 2) {
      processedIds.add(church1.id);
      finalClusters.push(proximityCluster);
    }
  }

  const duplicateClusters: DuplicateCluster[] = [];
  let clusterIndex = 0;
  
  for (let idx = 0; idx < finalClusters.length; idx++) {
    const clusterChurches = finalClusters[idx];
    
    const clusterChurchIds = clusterChurches.map(c => c.id);
    const clusterSignature = generateClusterSignature(clusterChurchIds);
    
    if (reviewedSignatures.has(clusterSignature)) {
      continue;
    }
    
    clusterIndex++;
    
    // Sort by score (high to low), then by createdAt (oldest first) as tie-breaker
    const sorted = [...clusterChurches].sort((a, b) => {
      const scoreDiff = b.survivorScore - a.survivorScore;
      if (scoreDiff !== 0) return scoreDiff;
      // Tie-breaker: prefer oldest record
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const survivor = sorted[0];
    const duplicates = sorted.slice(1);
    
    const { tier, reason, maxNameSim, maxAddrSim } = determineConfidenceTier(clusterChurches);
    
    const signature = createSignature(survivor.name, survivor.address);
    
    duplicateClusters.push({
      clusterId: `cluster-${clusterIndex}`,
      signature,
      churches: clusterChurches,
      survivor,
      duplicates,
      confidenceTier: tier,
      tierReason: reason,
      maxNameSimilarity: maxNameSim,
      maxAddressSimilarity: maxAddrSim,
    });
  }

  const autoResolvable = duplicateClusters.filter(c => c.confidenceTier === 'auto').length;
  const needsReview = duplicateClusters.filter(c => c.confidenceTier === 'review').length;
  const needsManual = duplicateClusters.filter(c => c.confidenceTier === 'manual').length;
  const totalDuplicatesToHide = duplicateClusters.reduce((sum, c) => sum + c.duplicates.length, 0);

  return {
    clusters: duplicateClusters,
    summary: {
      totalClusters: duplicateClusters.length,
      autoResolvable,
      needsReview,
      needsManual,
      totalDuplicatesToHide,
    },
  };
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

    const { hasAccess } = await checkPlatformAccess(adminClient, user.id, platformId, user.user_metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await findDuplicateClusters(adminClient, platformId);
    
    // Build flat list of all church IDs (actual church UUIDs) in any cluster
    const churchIdsInClusters = new Set<string>();
    for (const cluster of result.clusters) {
      for (const church of cluster.churches) {
        churchIdsInClusters.add(church.id);  // Use actual church UUID, not platformChurchId
      }
    }
    
    return res.json({
      ...result,
      churchIdsInClusters: Array.from(churchIdsInClusters),
    });
  } catch (error: any) {
    console.error('Error finding duplicate clusters:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
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

    const { id: platformIdOrSlug } = req.params;
    const { action, clusterId, survivorId, hideIds, tier } = req.body;

    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(adminClient, user.id, platformId, user.user_metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (action === 'hide-cluster') {
      if (!hideIds || !Array.isArray(hideIds) || hideIds.length === 0) {
        return res.status(400).json({ error: 'hideIds must be a non-empty array' });
      }

      const { error: updateError } = await adminClient
        .from('city_platform_churches')
        .update({ status: 'hidden' })
        .eq('city_platform_id', platformId)
        .in('id', hideIds);

      if (updateError) {
        console.error('[hide-cluster] Error updating status:', updateError);
        return res.status(500).json({ error: 'Failed to hide churches' });
      }

      return res.json({
        success: true,
        hiddenCount: hideIds.length,
      });
    }

    if (action === 'preview') {
      const result = await findDuplicateClusters(adminClient, platformId);
      
      let filteredClusters = result.clusters;
      if (tier && tier !== 'all') {
        filteredClusters = filteredClusters.filter(c => c.confidenceTier === tier);
      }

      const sample = filteredClusters.slice(0, 10);

      return res.json({
        action: 'preview',
        tier: tier || 'all',
        totalClusters: filteredClusters.length,
        sample: sample.map(c => ({
          clusterId: c.clusterId,
          signature: c.signature,
          confidenceTier: c.confidenceTier,
          tierReason: c.tierReason,
          survivorName: c.survivor.name,
          survivorScore: c.survivor.survivorScore,
          duplicateCount: c.duplicates.length,
          duplicateNames: c.duplicates.map(d => d.name),
        })),
        summary: result.summary,
      });
    }

    if (action === 'auto-resolve') {
      // clusterOverrides: { clusterId: { platformChurchId: 'keep' | 'hide' } }
      const { clusterOverrides } = req.body;
      const overrides: Record<string, Record<string, 'keep' | 'hide'>> = clusterOverrides || {};
      
      const result = await findDuplicateClusters(adminClient, platformId);
      
      const autoClusters = result.clusters.filter(c => c.confidenceTier === 'auto');
      
      // Build list of platform church IDs to archive along with their survivor info
      const toArchive: { platformChurchId: string; survivorPlatformChurchId: string; clusterChurchIds: string[] }[] = [];
      
      for (const cluster of autoClusters) {
        const clusterOverride = overrides[cluster.clusterId] || {};
        const clusterChurchIds = cluster.churches.map(c => c.id);
        
        for (const church of cluster.churches) {
          const overrideState = clusterOverride[church.platformChurchId];
          
          if (overrideState === 'hide') {
            toArchive.push({ 
              platformChurchId: church.platformChurchId, 
              survivorPlatformChurchId: cluster.survivor.platformChurchId,
              clusterChurchIds 
            });
          } else if (overrideState === 'keep') {
            continue;
          } else {
            if (church.platformChurchId !== cluster.survivor.platformChurchId) {
              toArchive.push({ 
                platformChurchId: church.platformChurchId, 
                survivorPlatformChurchId: cluster.survivor.platformChurchId,
                clusterChurchIds 
              });
            }
          }
        }
      }

      if (toArchive.length === 0) {
        return res.json({
          success: true,
          message: 'No auto-resolvable duplicates found',
          processedClusters: 0,
          archivedCount: 0,
        });
      }

      const platformChurchIdsToArchive = toArchive.map(t => t.platformChurchId);
      const survivorPlatformChurchIds = [...new Set(toArchive.map(t => t.survivorPlatformChurchId))];
      const allPlatformChurchIds = [...new Set([...platformChurchIdsToArchive, ...survivorPlatformChurchIds])];
      
      // Step 1: Get all platform-church records to find church_ids (including survivors) - with batching
      const QUERY_BATCH_SIZE = 100;
      const platformChurchRecords: Array<{id: string, church_id: string}> = [];

      for (let i = 0; i < allPlatformChurchIds.length; i += QUERY_BATCH_SIZE) {
        const batch = allPlatformChurchIds.slice(i, i + QUERY_BATCH_SIZE);
        const { data: batchRecords, error: fetchError } = await adminClient
          .from('city_platform_churches')
          .select('id, church_id')
          .eq('city_platform_id', platformId)
          .in('id', batch);

        if (fetchError) {
          console.error('[auto-resolve] Error fetching platform church records:', fetchError);
          return res.status(500).json({ error: 'Failed to fetch church records' });
        }
        
        if (batchRecords) {
          platformChurchRecords.push(...batchRecords);
        }
      }

      const platformChurchIdToChurchId = new Map<string, string>();
      for (const pc of platformChurchRecords) {
        platformChurchIdToChurchId.set(pc.id, pc.church_id);
      }

      const churchIds = [...new Set(platformChurchRecords.map(pc => pc.church_id))];

      // Step 2: Fetch full church data for archiving - with batching
      const churchesToArchive: any[] = [];

      for (let i = 0; i < churchIds.length; i += QUERY_BATCH_SIZE) {
        const batch = churchIds.slice(i, i + QUERY_BATCH_SIZE);
        const { data: batchChurches, error: churchFetchError } = await adminClient
          .from('churches')
          .select('*')
          .in('id', batch);

        if (churchFetchError) {
          console.error('[auto-resolve] Error fetching churches for archive:', churchFetchError);
          return res.status(500).json({ error: 'Failed to fetch church data for archiving' });
        }
        
        if (batchChurches) {
          churchesToArchive.push(...batchChurches);
        }
      }

      const churchDataMap = new Map<string, any>();
      for (const church of churchesToArchive) {
        churchDataMap.set(church.id, church);
      }

      // Step 3: Build archive records
      const archivedRecords: any[] = [];
      for (const item of toArchive) {
        const churchId = platformChurchIdToChurchId.get(item.platformChurchId);
        if (!churchId) continue;
        
        const church = churchDataMap.get(churchId);
        if (!church) continue;

        const clusterSignature = generateClusterSignature(item.clusterChurchIds);

        archivedRecords.push({
          original_church_id: church.id,
          name: church.name,
          address: church.address,
          city: church.city,
          state: church.state,
          zip: church.zip,
          phone: church.phone,
          email: church.email,
          website: church.website,
          denomination: church.denomination,
          description: church.description,
          profile_photo_url: church.profile_photo_url,
          banner_image_url: church.banner_image_url,
          location: church.location,
          display_lat: church.display_lat,
          display_lng: church.display_lng,
          approved: church.approved,
          verification_status: church.verification_status,
          last_verified_at: church.last_verified_at,
          last_verified_source: church.last_verified_source,
          data_quality_score: church.data_quality_score,
          data_quality_breakdown: church.data_quality_breakdown,
          google_place_id: church.google_place_id,
          google_match_confidence: church.google_match_confidence,
          google_last_checked_at: church.google_last_checked_at,
          source: church.source,
          collaboration_have: church.collaboration_have,
          collaboration_need: church.collaboration_need,
          partnership_status: church.partnership_status,
          partnership_updated_at: church.partnership_updated_at,
          partnership_notes: church.partnership_notes,
          created_by_user_id: church.created_by_user_id,
          claimed_by: church.claimed_by,
          primary_ministry_area: church.primary_ministry_area,
          boundary_ids: church.boundary_ids,
          original_created_at: church.created_at,
          original_updated_at: church.updated_at,
          archived_reason: 'duplicate_resolution',
          cluster_signature: clusterSignature,
          survivor_church_id: platformChurchIdToChurchId.get(item.survivorPlatformChurchId) || null,
          city_platform_id: platformId,
        });
      }

      // Insert archives in batches
      const BATCH_SIZE = 100;
      for (let i = 0; i < archivedRecords.length; i += BATCH_SIZE) {
        const batch = archivedRecords.slice(i, i + BATCH_SIZE);
        const { error: archiveError } = await adminClient
          .from('archived_churches')
          .insert(batch);

        if (archiveError) {
          console.error('[auto-resolve] Error archiving churches batch:', archiveError);
          return res.status(500).json({ error: `Failed to archive duplicate churches (batch ${Math.floor(i / BATCH_SIZE) + 1})` });
        }
      }

      // Step 4: Delete from city_platform_churches
      for (let i = 0; i < platformChurchIdsToArchive.length; i += BATCH_SIZE) {
        const batch = platformChurchIdsToArchive.slice(i, i + BATCH_SIZE);
        
        const { error: deleteError } = await adminClient
          .from('city_platform_churches')
          .delete()
          .eq('city_platform_id', platformId)
          .in('id', batch);

        if (deleteError) {
          console.error('[auto-resolve] Error deleting platform church links:', deleteError);
          return res.status(500).json({ error: `Failed to remove duplicate church links (batch ${Math.floor(i / BATCH_SIZE) + 1})` });
        }
      }

      // Step 5: Delete orphaned churches (not linked to any platform)
      for (const churchId of churchIds) {
        const { count, error: countError } = await adminClient
          .from('city_platform_churches')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId);

        if (countError) {
          console.warn('[auto-resolve] Error checking other platform links:', countError);
          continue;
        }

        if (count === 0) {
          const { error: deleteChurchError } = await adminClient
            .from('churches')
            .delete()
            .eq('id', churchId);

          if (deleteChurchError) {
            console.warn('[auto-resolve] Error deleting orphaned church:', churchId, deleteChurchError);
          }
        }
      }

      return res.json({
        success: true,
        message: `Auto-resolved ${autoClusters.length} clusters, archived and removed ${archivedRecords.length} duplicates`,
        processedClusters: autoClusters.length,
        archivedCount: archivedRecords.length,
      });
    }

    if (action === 'resolve-cluster') {
      if (!survivorId) {
        return res.status(400).json({ error: 'survivorId is required' });
      }
      if (!hideIds || !Array.isArray(hideIds) || hideIds.length === 0) {
        return res.status(400).json({ error: 'hideIds array is required' });
      }

      console.log('[resolve-cluster] Processing request:', {
        platformId,
        survivorId,
        hideIds,
        hideIdsCount: hideIds.length,
      });

      // Step 1: Get the platform-church records to find the actual church_ids (including survivor)
      const allIdsToFetch = [...hideIds, survivorId];
      const { data: platformChurchRecords, error: fetchError } = await adminClient
        .from('city_platform_churches')
        .select('id, church_id')
        .eq('city_platform_id', platformId)
        .in('id', allIdsToFetch);

      if (fetchError) {
        console.error('[resolve-cluster] Error fetching platform church records:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch church records' });
      }

      if (!platformChurchRecords || platformChurchRecords.length === 0) {
        console.warn('[resolve-cluster] No platform church records found for hideIds');
        return res.status(400).json({ 
          error: 'No churches found for the provided IDs.',
          debug: { platformId, hideIds }
        });
      }

      // Build a map of platformChurchId -> churchId
      const platformToChurchMap = new Map<string, string>();
      for (const pc of platformChurchRecords) {
        platformToChurchMap.set(pc.id, pc.church_id);
      }

      const survivorChurchId = platformToChurchMap.get(survivorId);
      const churchIds = hideIds.map(id => platformToChurchMap.get(id)).filter(Boolean) as string[];
      console.log('[resolve-cluster] Found church_ids to archive:', churchIds, 'survivor church_id:', survivorChurchId);

      // Step 2: Fetch full church data for archiving
      const { data: churchesToArchive, error: churchFetchError } = await adminClient
        .from('churches')
        .select('*')
        .in('id', churchIds);

      if (churchFetchError) {
        console.error('[resolve-cluster] Error fetching churches for archive:', churchFetchError);
        return res.status(500).json({ error: 'Failed to fetch church data for archiving' });
      }

      // Generate cluster signature for the archive record
      const allClusterChurchIds = [survivorId, ...hideIds].sort();
      const clusterSignature = generateClusterSignature(allClusterChurchIds);

      // Step 3: Archive the churches
      const archivedRecords = (churchesToArchive || []).map(church => ({
        original_church_id: church.id,
        name: church.name,
        address: church.address,
        city: church.city,
        state: church.state,
        zip: church.zip,
        phone: church.phone,
        email: church.email,
        website: church.website,
        denomination: church.denomination,
        description: church.description,
        profile_photo_url: church.profile_photo_url,
        banner_image_url: church.banner_image_url,
        location: church.location,
        display_lat: church.display_lat,
        display_lng: church.display_lng,
        approved: church.approved,
        verification_status: church.verification_status,
        last_verified_at: church.last_verified_at,
        last_verified_source: church.last_verified_source,
        data_quality_score: church.data_quality_score,
        data_quality_breakdown: church.data_quality_breakdown,
        google_place_id: church.google_place_id,
        google_match_confidence: church.google_match_confidence,
        google_last_checked_at: church.google_last_checked_at,
        source: church.source,
        collaboration_have: church.collaboration_have,
        collaboration_need: church.collaboration_need,
        partnership_status: church.partnership_status,
        partnership_updated_at: church.partnership_updated_at,
        partnership_notes: church.partnership_notes,
        created_by_user_id: church.created_by_user_id,
        claimed_by: church.claimed_by,
        primary_ministry_area: church.primary_ministry_area,
        boundary_ids: church.boundary_ids,
        original_created_at: church.created_at,
        original_updated_at: church.updated_at,
        archived_reason: 'duplicate_resolution',
        cluster_signature: clusterSignature,
        survivor_church_id: survivorChurchId || null,
        city_platform_id: platformId,
      }));

      if (archivedRecords.length > 0) {
        const { error: archiveError } = await adminClient
          .from('archived_churches')
          .insert(archivedRecords);

        if (archiveError) {
          console.error('[resolve-cluster] Error archiving churches:', archiveError);
          return res.status(500).json({ error: 'Failed to archive duplicate churches' });
        }
        console.log('[resolve-cluster] Archived', archivedRecords.length, 'churches');
      }

      // Step 4: Delete from city_platform_churches (the link records)
      const { error: deleteLinkError } = await adminClient
        .from('city_platform_churches')
        .delete()
        .eq('city_platform_id', platformId)
        .in('id', hideIds);

      if (deleteLinkError) {
        console.error('[resolve-cluster] Error deleting platform church links:', deleteLinkError);
        return res.status(500).json({ error: 'Failed to remove duplicate church links' });
      }

      // Step 5: Check if churches are linked to other platforms before deleting
      for (const churchId of churchIds) {
        const { count, error: countError } = await adminClient
          .from('city_platform_churches')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId);

        if (countError) {
          console.warn('[resolve-cluster] Error checking other platform links:', countError);
          continue;
        }

        // Only delete from churches table if not linked to any other platform
        if (count === 0) {
          const { error: deleteChurchError } = await adminClient
            .from('churches')
            .delete()
            .eq('id', churchId);

          if (deleteChurchError) {
            console.warn('[resolve-cluster] Error deleting church:', churchId, deleteChurchError);
          } else {
            console.log('[resolve-cluster] Deleted orphaned church:', churchId);
          }
        } else {
          console.log('[resolve-cluster] Church still linked to other platforms, keeping:', churchId);
        }
      }

      // Step 6: Approve the survivor - set status to 'visible' and approved to true
      const { error: approveSurvivorError } = await adminClient
        .from('city_platform_churches')
        .update({ 
          status: 'visible',
          updated_at: new Date().toISOString()
        })
        .eq('id', survivorId);

      if (approveSurvivorError) {
        console.warn('[resolve-cluster] Error approving survivor platform link:', approveSurvivorError);
      } else {
        console.log('[resolve-cluster] Approved survivor platform link:', survivorId);
      }

      // Also set approved=true on the church record
      if (survivorChurchId) {
        const { error: approveChurchError } = await adminClient
          .from('churches')
          .update({ approved: true })
          .eq('id', survivorChurchId);

        if (approveChurchError) {
          console.warn('[resolve-cluster] Error approving survivor church:', approveChurchError);
        } else {
          console.log('[resolve-cluster] Approved survivor church:', survivorChurchId);
        }
      }

      return res.json({
        success: true,
        message: `Cluster resolved: kept survivor, archived and removed ${archivedRecords.length} duplicates`,
        survivorId,
        archivedCount: archivedRecords.length,
        requestedCount: hideIds.length,
      });
    }

    if (action === 'mark-reviewed') {
      const { churchIds, decision, notes } = req.body;
      
      if (!churchIds || !Array.isArray(churchIds) || churchIds.length < 2) {
        return res.status(400).json({ error: 'churchIds array with at least 2 churches is required' });
      }

      const clusterSignature = generateClusterSignature(churchIds);
      
      const { data: existing } = await adminClient
        .from('reviewed_duplicate_clusters')
        .select('id')
        .eq('city_platform_id', platformId)
        .eq('cluster_signature', clusterSignature)
        .maybeSingle();

      if (existing) {
        return res.json({
          success: true,
          message: 'Cluster was already marked as reviewed',
          alreadyReviewed: true,
        });
      }

      const { error: insertError } = await adminClient
        .from('reviewed_duplicate_clusters')
        .insert({
          city_platform_id: platformId,
          church_ids: churchIds,
          cluster_signature: clusterSignature,
          decision: decision || 'keep_all',
          notes: notes || null,
          reviewed_by: user.id,
        });

      if (insertError) {
        console.error('Error marking cluster as reviewed:', insertError);
        return res.status(500).json({ error: 'Failed to mark cluster as reviewed' });
      }

      return res.json({
        success: true,
        message: 'Cluster marked as reviewed',
        churchCount: churchIds.length,
      });
    }

    if (action === 'get-reviewed') {
      const { data: reviewed, error: fetchError } = await adminClient
        .from('reviewed_duplicate_clusters')
        .select('*')
        .eq('city_platform_id', platformId)
        .order('reviewed_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching reviewed clusters:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch reviewed clusters' });
      }

      return res.json({
        success: true,
        reviewed: reviewed || [],
        count: reviewed?.length || 0,
      });
    }

    if (action === 'unreview-cluster') {
      const { reviewedClusterId } = req.body;
      
      if (!reviewedClusterId) {
        return res.status(400).json({ error: 'reviewedClusterId is required' });
      }

      const { error: deleteError } = await adminClient
        .from('reviewed_duplicate_clusters')
        .delete()
        .eq('id', reviewedClusterId)
        .eq('city_platform_id', platformId);

      if (deleteError) {
        console.error('Error removing reviewed cluster:', deleteError);
        return res.status(500).json({ error: 'Failed to remove reviewed status' });
      }

      return res.json({
        success: true,
        message: 'Cluster review removed - it will appear in duplicate detection again',
      });
    }

    if (action === 'get-archived') {
      const { data: archived, error: fetchError } = await adminClient
        .from('archived_churches')
        .select('*')
        .eq('city_platform_id', platformId)
        .order('archived_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching archived churches:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch archived churches' });
      }

      return res.json({
        success: true,
        archived: archived || [],
        count: archived?.length || 0,
      });
    }

    if (action === 'restore-archived') {
      const { archivedId } = req.body;
      
      if (!archivedId) {
        return res.status(400).json({ error: 'archivedId is required' });
      }

      const { data: archivedChurch, error: fetchError } = await adminClient
        .from('archived_churches')
        .select('*')
        .eq('id', archivedId)
        .eq('city_platform_id', platformId)
        .single();

      if (fetchError || !archivedChurch) {
        console.error('Error fetching archived church:', fetchError);
        return res.status(404).json({ error: 'Archived church not found' });
      }

      const { data: insertedChurch, error: insertError } = await adminClient
        .from('churches')
        .insert({
          id: archivedChurch.original_church_id,
          name: archivedChurch.name,
          address: archivedChurch.address,
          city: archivedChurch.city,
          state: archivedChurch.state,
          zip: archivedChurch.zip,
          phone: archivedChurch.phone,
          email: archivedChurch.email,
          website: archivedChurch.website,
          denomination: archivedChurch.denomination,
          description: archivedChurch.description,
          profile_photo_url: archivedChurch.profile_photo_url,
          banner_image_url: archivedChurch.banner_image_url,
          location: archivedChurch.location,
          display_lat: archivedChurch.display_lat,
          display_lng: archivedChurch.display_lng,
          approved: archivedChurch.approved,
          verification_status: archivedChurch.verification_status,
          last_verified_at: archivedChurch.last_verified_at,
          last_verified_source: archivedChurch.last_verified_source,
          data_quality_score: archivedChurch.data_quality_score,
          data_quality_breakdown: archivedChurch.data_quality_breakdown,
          google_place_id: archivedChurch.google_place_id,
          google_match_confidence: archivedChurch.google_match_confidence,
          google_last_checked_at: archivedChurch.google_last_checked_at,
          source: archivedChurch.source,
          collaboration_have: archivedChurch.collaboration_have,
          collaboration_need: archivedChurch.collaboration_need,
          partnership_status: archivedChurch.partnership_status,
          partnership_updated_at: archivedChurch.partnership_updated_at,
          partnership_notes: archivedChurch.partnership_notes,
          created_by_user_id: archivedChurch.created_by_user_id,
          claimed_by: archivedChurch.claimed_by,
          primary_ministry_area: archivedChurch.primary_ministry_area,
          boundary_ids: archivedChurch.boundary_ids,
        })
        .select('id')
        .single();

      if (insertError || !insertedChurch) {
        console.error('Error restoring church:', insertError);
        return res.status(500).json({ error: 'Failed to restore church to churches table' });
      }

      const { error: linkError } = await adminClient
        .from('city_platform_churches')
        .insert({
          city_platform_id: platformId,
          church_id: insertedChurch.id,
          status: 'visible',
          is_claimed: false,
        });

      if (linkError) {
        console.error('Error linking restored church to platform:', linkError);
        await adminClient.from('churches').delete().eq('id', insertedChurch.id);
        return res.status(500).json({ error: 'Failed to link church to platform' });
      }

      const { error: deleteError } = await adminClient
        .from('archived_churches')
        .delete()
        .eq('id', archivedId);

      if (deleteError) {
        console.error('Error deleting archive record:', deleteError);
      }

      return res.json({
        success: true,
        message: 'Church restored successfully',
        restoredChurchId: insertedChurch.id,
        churchName: archivedChurch.name,
      });
    }

    // Get hidden churches that are INSIDE platform boundaries (likely duplicates, not out-of-bounds)
    if (action === 'get-hidden-in-bounds') {
      // First get all hidden churches for this platform
      const { data: hiddenChurches, error: hiddenError } = await adminClient
        .from('city_platform_churches')
        .select(`
          id,
          church_id,
          status,
          churches:church_id (
            id,
            name,
            address,
            city,
            state,
            location,
            display_lat,
            display_lng
          )
        `)
        .eq('city_platform_id', platformId)
        .eq('status', 'hidden');

      if (hiddenError) {
        console.error('Error fetching hidden churches:', hiddenError);
        return res.status(500).json({ error: 'Failed to fetch hidden churches' });
      }

      if (!hiddenChurches || hiddenChurches.length === 0) {
        return res.json({
          success: true,
          hiddenInBounds: [],
          count: 0,
          message: 'No hidden churches found',
        });
      }

      // Get platform boundaries
      const { data: platformBoundaries, error: boundaryError } = await adminClient
        .from('city_platform_boundaries')
        .select('boundary_id')
        .eq('city_platform_id', platformId);

      if (boundaryError) {
        console.error('Error fetching platform boundaries:', boundaryError);
        return res.status(500).json({ error: 'Failed to fetch platform boundaries' });
      }

      const boundaryIds = (platformBoundaries || []).map(pb => pb.boundary_id);

      if (boundaryIds.length === 0) {
        // No boundaries defined, can't determine in-bounds
        return res.json({
          success: true,
          hiddenInBounds: hiddenChurches.map(hc => ({
            platformChurchId: hc.id,
            churchId: hc.church_id,
            ...(hc.churches as any),
          })),
          count: hiddenChurches.length,
          message: 'No platform boundaries defined - showing all hidden churches',
        });
      }

      // Get church IDs that are hidden
      const churchIds = hiddenChurches.map(hc => hc.church_id);

      // Use PostGIS to check which churches are inside boundaries
      const { data: inBoundsResult, error: spatialError } = await adminClient.rpc(
        'fn_churches_within_boundaries',
        { 
          p_boundary_ids: boundaryIds,
          p_church_ids: churchIds
        }
      );

      if (spatialError) {
        console.error('Error checking spatial containment:', spatialError);
        // Fallback: return all hidden churches
        return res.json({
          success: true,
          hiddenInBounds: hiddenChurches.map(hc => ({
            platformChurchId: hc.id,
            churchId: hc.church_id,
            ...(hc.churches as any),
          })),
          count: hiddenChurches.length,
          message: 'Spatial check failed - showing all hidden churches',
        });
      }

      const inBoundsChurchIds = new Set((inBoundsResult || []).map((r: any) => r.church_id || r.id));

      // Filter to only hidden churches that are in bounds
      const hiddenInBounds = hiddenChurches
        .filter(hc => inBoundsChurchIds.has(hc.church_id))
        .map(hc => ({
          platformChurchId: hc.id,
          churchId: hc.church_id,
          ...(hc.churches as any),
        }));

      return res.json({
        success: true,
        hiddenInBounds,
        count: hiddenInBounds.length,
        totalHidden: hiddenChurches.length,
        message: `Found ${hiddenInBounds.length} hidden churches inside platform boundaries (likely duplicates)`,
      });
    }

    // Restore hidden churches (set status back to visible)
    if (action === 'restore-hidden') {
      const { platformChurchIds } = req.body;
      
      if (!platformChurchIds || !Array.isArray(platformChurchIds) || platformChurchIds.length === 0) {
        return res.status(400).json({ error: 'platformChurchIds array is required' });
      }

      // Batch updates in chunks of 100 to avoid query limits
      const BATCH_SIZE = 100;
      let restoredCount = 0;
      let errorOccurred = false;

      for (let i = 0; i < platformChurchIds.length; i += BATCH_SIZE) {
        const batch = platformChurchIds.slice(i, i + BATCH_SIZE);
        
        const { error: updateError } = await adminClient
          .from('city_platform_churches')
          .update({ 
            status: 'visible',
            updated_at: new Date().toISOString()
          })
          .eq('city_platform_id', platformId)
          .in('id', batch);

        if (updateError) {
          console.error('Error restoring hidden churches batch:', updateError);
          errorOccurred = true;
          break;
        }
        
        restoredCount += batch.length;
      }

      if (errorOccurred) {
        return res.status(500).json({ 
          error: 'Failed to restore all hidden churches',
          partialSuccess: restoredCount > 0,
          restoredCount 
        });
      }

      return res.json({
        success: true,
        message: `Restored ${restoredCount} churches to visible`,
        restoredCount,
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use "preview", "auto-resolve", "resolve-cluster", "mark-reviewed", "get-reviewed", "unreview-cluster", "get-archived", "restore-archived", "get-hidden-in-bounds", or "restore-hidden".' });
  } catch (error: any) {
    console.error('Error processing cleanup duplicates:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
