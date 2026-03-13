import type { Church, ChurchVerificationStatus, ChurchVerificationSource } from "@shared/schema";

export interface DataQualityBreakdown {
  address_location: number;
  contact: number;
  metadata: number;
  total: number;
}

export interface VerificationResult {
  church_id: string;
  status: ChurchVerificationStatus;
  score: number;
  breakdown: DataQualityBreakdown;
  google_place_id?: string;
  google_match_confidence?: number;
  enrichment?: Partial<Church>;
  reason?: string;
}

const WEIGHTS = {
  address_location: 0.4,
  contact: 0.3,
  metadata: 0.3,
};

export function calculateDataQualityScore(church: Partial<Church>): DataQualityBreakdown {
  let addressLocationScore = 0;
  let addressLocationMax = 0;
  
  if (church.address) {
    addressLocationScore += 25;
  }
  addressLocationMax += 25;
  
  if (church.city) {
    addressLocationScore += 15;
  }
  addressLocationMax += 15;
  
  if (church.state) {
    addressLocationScore += 10;
  }
  addressLocationMax += 10;
  
  if (church.zip) {
    addressLocationScore += 10;
  }
  addressLocationMax += 10;
  
  // Check for location - could be GeoJSON Point format or have coordinates array
  // GeoJSON from PostGIS: { type: "Point", coordinates: [lng, lat] }
  // Direct check for any valid location object
  const loc = church.location as any;
  const hasLocation = loc && typeof loc === 'object' && (
    ('coordinates' in loc) || 
    (loc.type === 'Point')
  );
  if (hasLocation) {
    addressLocationScore += 40;
  }
  addressLocationMax += 40;
  
  const addressLocationPercent = addressLocationMax > 0 
    ? Math.round((addressLocationScore / addressLocationMax) * 100) 
    : 0;

  let contactScore = 0;
  let contactMax = 0;
  
  if (church.phone) {
    contactScore += 40;
  }
  contactMax += 40;
  
  if (church.website) {
    contactScore += 35;
  }
  contactMax += 35;
  
  if (church.email) {
    contactScore += 25;
  }
  contactMax += 25;
  
  const contactPercent = contactMax > 0 
    ? Math.round((contactScore / contactMax) * 100) 
    : 0;

  let metadataScore = 0;
  let metadataMax = 0;
  
  if (church.denomination) {
    metadataScore += 25;
  }
  metadataMax += 25;
  
  if (church.description) {
    metadataScore += 25;
  }
  metadataMax += 25;
  
  if (church.profile_photo_url) {
    metadataScore += 25;
  }
  metadataMax += 25;
  
  if (church.place_calling_id) {
    metadataScore += 25;
  }
  metadataMax += 25;
  
  const metadataPercent = metadataMax > 0 
    ? Math.round((metadataScore / metadataMax) * 100) 
    : 0;

  const total = Math.round(
    addressLocationPercent * WEIGHTS.address_location +
    contactPercent * WEIGHTS.contact +
    metadataPercent * WEIGHTS.metadata
  );

  return {
    address_location: addressLocationPercent,
    contact: contactPercent,
    metadata: metadataPercent,
    total,
  };
}

export function determineVerificationStatus(
  score: number,
  googleMatchConfidence?: number,
  source?: string
): ChurchVerificationStatus {
  // High confidence Google match = verified (Google Verified)
  if (googleMatchConfidence !== undefined && googleMatchConfidence >= 0.85) {
    return 'verified';
  }
  
  // Manual entry with decent score = user_verified (Auto/User Verified)
  if (source === 'manual') {
    return score >= 50 ? 'user_verified' : 'flagged_for_review';
  }
  
  // High quality data (70+) with decent Google match (0.5+) = verified
  if (score >= 70 && googleMatchConfidence !== undefined && googleMatchConfidence >= 0.5) {
    return 'verified';
  }
  
  // Low Google confidence = needs review
  if (googleMatchConfidence !== undefined && googleMatchConfidence < 0.5) {
    return 'flagged_for_review';
  }
  
  // Very low quality (score < 30) = needs review
  if (score < 30) {
    return 'flagged_for_review';
  }
  
  // Medium quality with decent Google match (0.5-0.85) = verified
  if (score >= 50 && googleMatchConfidence !== undefined && googleMatchConfidence >= 0.5) {
    return 'verified';
  }
  
  // Google not found (googleMatchConfidence is undefined) = needs review
  // This ensures churches that Google couldn't find get human attention
  return 'flagged_for_review';
}

export function calculateNameSimilarity(name1: string, name2: string): number {
  const normalize = (s: string) => s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  if (n1 === n2) return 1.0;
  
  const words1 = n1.split(' ');
  const words2 = n2.split(' ');
  const words2Set = new Set(words2);
  
  const intersection = words1.filter(w => words2Set.has(w));
  const unionSet = new Set(words1.concat(words2));
  
  const jaccardSimilarity = intersection.length / unionSet.size;
  
  const shorter = n1.length < n2.length ? n1 : n2;
  const longer = n1.length >= n2.length ? n1 : n2;
  const containsBonus = longer.includes(shorter) ? 0.2 : 0;
  
  return Math.min(1.0, jaccardSimilarity + containsBonus);
}

export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateMatchConfidence(
  church: Partial<Church>,
  googleResult: {
    name: string;
    lat: number;
    lng: number;
    address?: string;
  }
): number {
  const nameSimilarity = calculateNameSimilarity(church.name || '', googleResult.name);
  
  let distanceScore = 0;
  if (church.location?.coordinates) {
    const [lng, lat] = church.location.coordinates;
    const distance = haversineDistance(lat, lng, googleResult.lat, googleResult.lng);
    
    if (distance < 0.05) distanceScore = 1.0;
    else if (distance < 0.1) distanceScore = 0.9;
    else if (distance < 0.3) distanceScore = 0.7;
    else if (distance < 0.5) distanceScore = 0.5;
    else if (distance < 1.0) distanceScore = 0.3;
    else distanceScore = 0;
  }
  
  const confidence = (nameSimilarity * 0.6) + (distanceScore * 0.4);
  
  return Math.round(confidence * 100) / 100;
}

export function getEnrichmentFields(
  church: Partial<Church>,
  googleData: {
    formatted_address?: string;
    vicinity?: string;
    formatted_phone_number?: string;
    website?: string;
  }
): Partial<Church> {
  const enrichment: Partial<Church> = {};
  
  if (!church.address && (googleData.formatted_address || googleData.vicinity)) {
    enrichment.address = googleData.formatted_address || googleData.vicinity;
  }
  
  if (!church.phone && googleData.formatted_phone_number) {
    enrichment.phone = googleData.formatted_phone_number;
  }
  
  if (!church.website && googleData.website) {
    enrichment.website = googleData.website;
  }
  
  return enrichment;
}

export interface VerificationSummary {
  total: number;
  verified: number;
  google_verified: number;
  user_verified: number;
  unverified: number;
  not_verified_yet: number;
  flagged_for_review: number;
  average_quality_score: number;
  needs_attention: number;
  recently_verified: number;
}

export function calculateVerificationSummary(
  churches: Array<{
    verification_status?: ChurchVerificationStatus | null;
    data_quality_score?: number;
    last_verified_at?: string;
  }>
): VerificationSummary {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  let googleVerified = 0;
  let userVerified = 0;
  let unverified = 0;
  let notVerifiedYet = 0;
  let needsReview = 0;
  let totalScore = 0;
  let scoreCount = 0;
  let recentlyVerified = 0;
  
  for (const church of churches) {
    switch (church.verification_status) {
      case 'verified':
        googleVerified++;
        break;
      case 'user_verified':
        userVerified++;
        break;
      case 'flagged':
      case 'flagged_for_review':
      case 'pending':
        needsReview++;
        break;
      case 'unverified':
        unverified++;
        break;
      case null:
      case undefined:
      default:
        notVerifiedYet++;
    }
    
    if (church.data_quality_score !== undefined) {
      totalScore += church.data_quality_score;
      scoreCount++;
    }
    
    if (church.last_verified_at && new Date(church.last_verified_at) > thirtyDaysAgo) {
      recentlyVerified++;
    }
  }
  
  return {
    total: churches.length,
    verified: googleVerified + userVerified,
    google_verified: googleVerified,
    user_verified: userVerified,
    unverified,
    not_verified_yet: notVerifiedYet,
    flagged_for_review: needsReview,
    average_quality_score: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
    needs_attention: needsReview,
    recently_verified: recentlyVerified,
  };
}
