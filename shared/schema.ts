import { z } from "zod";
import { pgTable, varchar, integer, doublePrecision, timestamp, primaryKey, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Calling types
export type CallingType = 'place' | 'people' | 'problem' | 'purpose';
export const callingTypes = ["place", "people", "problem", "purpose"] as const;

// Calling option interface
export interface CallingOption {
  value: string;
  label: string;
  type: CallingType;
}

// Calling options list
export const callingOptions: CallingOption[] = [
  // A. CALLED TO A PLACE
  { value: 'neighborhood',             label: 'Neighborhood',             type: 'place' },
  { value: 'district_corridor',        label: 'District / Corridor',      type: 'place' },
  { value: 'zip_codes',                label: 'Zip Code(s)',              type: 'place' },
  { value: 'city_metro',               label: 'City / Metro',             type: 'place' },
  { value: 'region',                   label: 'Region',                   type: 'place' },
  { value: 'urban_core',               label: 'Urban Core',               type: 'place' },
  { value: 'suburban_edge',            label: 'Suburban Edge',            type: 'place' },
  { value: 'rural_communities',        label: 'Rural Communities',        type: 'place' },

  // B. CALLED TO A PEOPLE
  { value: 'families',                 label: 'Families',                 type: 'people' },
  { value: 'single_parents',           label: 'Single Parents',           type: 'people' },
  { value: 'youth_students',           label: 'Youth / Students',         type: 'people' },
  { value: 'young_adults',             label: 'Young Adults',             type: 'people' },
  { value: 'immigrants_refugees',      label: 'Immigrants / Refugees',    type: 'people' },
  { value: 'cultural_ethnic',          label: 'Specific Cultural / Ethnic Communities', type: 'people' },
  { value: 'justice_impacted',         label: 'Justice-Impacted (Incarcerated / Returning Citizens)', type: 'people' },
  { value: 'seniors',                  label: 'Seniors',                  type: 'people' },
  { value: 'marketplace_leaders',      label: 'Marketplace Leaders',      type: 'people' },
  { value: 'artists_creatives',        label: 'Artists / Creatives',      type: 'people' },
  { value: 'educators',                label: 'Educators',                type: 'people' },
  { value: 'healthcare_workers',       label: 'Healthcare Workers',       type: 'people' },
  { value: 'trades_labor',             label: 'Trades / Labor Force',     type: 'people' },
  { value: 'veterans',                 label: 'Veterans',                 type: 'people' },
  { value: 'marginalized_overlooked',  label: 'The Marginalized / Overlooked', type: 'people' },

  // C. CALLED TO A PROBLEM
  { value: 'poverty_relief',           label: 'Poverty Relief',           type: 'problem' },
  { value: 'affordable_housing',       label: 'Affordable Housing',       type: 'problem' },
  { value: 'food_insecurity',          label: 'Food Insecurity',          type: 'problem' },
  { value: 'foster_adoption',          label: 'Foster Care & Adoption',   type: 'problem' },
  { value: 'mental_health',            label: 'Mental Health',            type: 'problem' },
  { value: 'loneliness',               label: 'Loneliness',               type: 'problem' },
  { value: 'addiction',                label: 'Addiction',                type: 'problem' },
  { value: 'violence_reduction',       label: 'Violence Reduction',       type: 'problem' },
  { value: 'racial_healing',           label: 'Racial Healing',           type: 'problem' },
  { value: 'family_restoration',       label: 'Family Restoration',       type: 'problem' },
  { value: 'youth_development',        label: 'Youth Development',        type: 'problem' },
  { value: 'education_gaps',           label: 'Education Gaps',           type: 'problem' },
  { value: 'homelessness',             label: 'Homelessness',             type: 'problem' },
  { value: 'elder_care',               label: 'Elder Care',               type: 'problem' },
  { value: 'human_trafficking',        label: 'Human Trafficking',        type: 'problem' },
  { value: 'immigration_support',      label: 'Immigration Support',      type: 'problem' },
  { value: 'financial_stewardship',    label: 'Financial Stewardship',    type: 'problem' },
  { value: 'entrepreneurship_jobs',    label: 'Entrepreneurship / Job Creation', type: 'problem' },
  { value: 'creation_care',            label: 'Creation Care',            type: 'problem' },
  { value: 'crisis_response',          label: 'Crisis Response / Disaster Relief', type: 'problem' },

  // D. CALLED TO A PURPOSE
  { value: 'spiritual_renewal',        label: 'Spiritual Renewal',        type: 'purpose' },
  { value: 'reconciliation_peacemaking', label: 'Reconciliation & Peacemaking', type: 'purpose' },
  { value: 'formation_discipleship',   label: 'Formation & Discipleship Depth', type: 'purpose' },
  { value: 'church_planting',          label: 'Church-Planting & Multiplication', type: 'purpose' },
  { value: 'hospitality_stranger',     label: 'Hospitality to the Stranger', type: 'purpose' },
  { value: 'economic_renewal',         label: 'Economic Renewal & Community Flourishing', type: 'purpose' },
  { value: 'healing_restoration',      label: 'Healing & Restoration',    type: 'purpose' },
  { value: 'cultural_creation',        label: 'Cultural Creation & Imagination Shaping', type: 'purpose' },
  { value: 'marketplace_discipleship', label: 'Marketplace Discipleship & Public Witness', type: 'purpose' },
  { value: 'regional_unity',           label: 'Regional Unity Building',  type: 'purpose' },
  { value: 'innovation_new',           label: 'Innovation / New Expressions', type: 'purpose' },
];

// Unified Color Scheme - Single source of truth for all calling/area colors
// These colors are mirrored in client/src/index.css as CSS variables

// Calling type colors for map visualization and UI elements
export const CALLING_COLORS: Record<CallingType, string> = {
  place: "#2E86AB",     // Blue - solid fill style
  people: "#27AE60",    // Green - outline style  
  problem: "#E67E22",   // Orange - outline style
  purpose: "#9B59B6",   // Purple - solid fill style
};

// Map area type colors (distinct from calling colors)
export const MAP_AREA_COLORS = {
  primaryMinistryArea: "#EAB308",   // Yellow/Gold - unique identifier for church's main zone
  boundary: "#3B82F6",              // Blue - city/place boundaries
  boundaryOutline: "#2563EB",       // Darker blue - boundary outlines
  globalArea: "#3B82F6",            // Blue - neighborhoods/corridors
  globalAreaOutline: "#2563EB",     // Darker blue - global area outlines
  defaultCalling: "#2E86AB",        // Place blue - fallback for areas without calling
  defaultCallingOutline: "#1A5A8A", // Darker place blue - fallback outline color
};

export function getColorForCallingType(callingType: CallingType | null | undefined): string {
  if (!callingType) return "#94a3b8"; // Neutral gray for areas without calling
  return CALLING_COLORS[callingType] || "#94a3b8";
}

// Helper functions for ministry area UI (Sprint 1.9)
export function getCallingTypeColor(callingType: CallingType): string {
  return CALLING_COLORS[callingType];
}

export function getCallingTypeLabel(callingType: CallingType): string {
  return callingType.charAt(0).toUpperCase() + callingType.slice(1);
}

// Area types
export const areaTypes = ["church", "neighborhood", "corridor", "custom"] as const;
export type AreaType = typeof areaTypes[number];

// GeoJSON types for PostGIS geography fields returned via ST_AsGeoJSON
export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][]; // [[[lng, lat], ...]]
}

export interface GeoJSONMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][]; // [[[[lng, lat], ...]]]
}

// Boundary type (from Supabase)
export interface Boundary {
  id: string;
  external_id?: string; // e.g., FIPS code, census GEOID, etc
  name: string;
  type: string; // City, County, ZIP, Neighborhood, Place, County Subdivision
  source?: string; // TIGER, GR Open Data, NCES, etc.
  state_fips?: string; // State FIPS code (e.g., "06" for California)
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: any; // GeoJSON coordinates
  };
  created_at?: string;
}

// Church verification status types
// 'verified' = Google verified with high confidence
// 'user_verified' = Manually verified by admin/user
// 'unverified' = Google could not find this church (display as "Google Not Found")
// 'flagged_for_review' = Needs human review (low quality or low confidence)
// 'flagged' = Manually flagged for issues
// 'pending' = Awaiting initial verification
export const churchVerificationStatuses = ['verified', 'user_verified', 'unverified', 'flagged_for_review', 'flagged', 'pending'] as const;
export type ChurchVerificationStatus = typeof churchVerificationStatuses[number];

export const churchVerificationSources = ['google_places', 'manual_review', 'osm', 'initial_import'] as const;
export type ChurchVerificationSource = typeof churchVerificationSources[number];

// Church type (from Supabase)
export interface Church {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  denomination: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  location: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  } | null;
  display_lat: number | null; // Visual offset for map pin (doesn't affect geospatial queries)
  display_lng: number | null; // Visual offset for map pin (doesn't affect geospatial queries)
  primary_ministry_area: {
    type: "Polygon";
    coordinates: [number, number][][]; // Primary ministry area - custom drawn polygon
  } | null;
  place_calling_id: string | null;
  collaboration_have: string[];
  collaboration_need: string[];
  profile_photo_url: string | null;
  banner_image_url: string | null;
  description: string | null;
  approved: boolean;
  claimed_by: string | null;
  boundary_ids: string[];
  prayer_auto_approve: boolean; // Sprint 2.0: Auto-approve prayers vs. require moderation
  prayer_name_display_mode: string; // Sprint 2.0: How to display submitter names (e.g., 'first_name_last_initial')
  source?: string; // Source of church data: 'manual', 'osm_mi_church', etc.
  external_id?: string; // External identifier from source, e.g. 'node/123456'
  county_fips?: string; // 5-digit county FIPS for region filtering
  verification_status?: ChurchVerificationStatus; // Current verification status
  last_verified_at?: string; // When church was last verified
  last_verified_source?: ChurchVerificationSource; // How it was verified
  data_quality_score?: number; // 0-100 completeness score
  data_quality_breakdown?: Record<string, number>; // Field-level scores
  google_place_id?: string; // Matched Google Places ID
  google_match_confidence?: number; // 0-1 confidence score
  google_last_checked_at?: string; // When last checked against Google
  partnership_status?: PartnershipStatus; // Fund the Mission partnership status
  partnership_updated_at?: string; // When partnership status last changed
  partnership_notes?: string; // Notes about partnership status
  formation_church_id?: string | null; // Formation App church ID for prayer exchange pairing
  formation_api_key?: string | null; // Church-specific Formation API key for prayer exchange
  created_at: string;
  updated_at: string;
}

// Church verification event for audit trail
export interface ChurchVerificationEvent {
  id: string;
  church_id: string;
  city_platform_id?: string;
  verification_status: ChurchVerificationStatus;
  verification_source: ChurchVerificationSource;
  data_quality_score?: number;
  google_match_confidence?: number;
  reviewer_id?: string;
  notes?: string;
  changes_made?: Record<string, any>;
  created_at: string;
}

// ============================================================================
// REGION SETTINGS (Michigan Expansion)
// Controls which regions have OSM-imported churches enabled
// ============================================================================

export type RegionType = 'county' | 'zip' | 'custom' | 'state';

export interface RegionSetting {
  id: string;
  region_type: RegionType;
  region_id: string; // FIPS code, ZIP code, or custom ID
  region_name: string;
  state_fips: string;
  is_enabled: boolean;
  enabled_at: string | null;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Michigan counties - 83 total
export const MICHIGAN_COUNTIES: { fips: string; name: string }[] = [
  { fips: '26001', name: 'Alcona County' },
  { fips: '26003', name: 'Alger County' },
  { fips: '26005', name: 'Allegan County' },
  { fips: '26007', name: 'Alpena County' },
  { fips: '26009', name: 'Antrim County' },
  { fips: '26011', name: 'Arenac County' },
  { fips: '26013', name: 'Baraga County' },
  { fips: '26015', name: 'Barry County' },
  { fips: '26017', name: 'Bay County' },
  { fips: '26019', name: 'Benzie County' },
  { fips: '26021', name: 'Berrien County' },
  { fips: '26023', name: 'Branch County' },
  { fips: '26025', name: 'Calhoun County' },
  { fips: '26027', name: 'Cass County' },
  { fips: '26029', name: 'Charlevoix County' },
  { fips: '26031', name: 'Cheboygan County' },
  { fips: '26033', name: 'Chippewa County' },
  { fips: '26035', name: 'Clare County' },
  { fips: '26037', name: 'Clinton County' },
  { fips: '26039', name: 'Crawford County' },
  { fips: '26041', name: 'Delta County' },
  { fips: '26043', name: 'Dickinson County' },
  { fips: '26045', name: 'Eaton County' },
  { fips: '26047', name: 'Emmet County' },
  { fips: '26049', name: 'Genesee County' },
  { fips: '26051', name: 'Gladwin County' },
  { fips: '26053', name: 'Gogebic County' },
  { fips: '26055', name: 'Grand Traverse County' },
  { fips: '26057', name: 'Gratiot County' },
  { fips: '26059', name: 'Hillsdale County' },
  { fips: '26061', name: 'Houghton County' },
  { fips: '26063', name: 'Huron County' },
  { fips: '26065', name: 'Ingham County' },
  { fips: '26067', name: 'Ionia County' },
  { fips: '26069', name: 'Iosco County' },
  { fips: '26071', name: 'Iron County' },
  { fips: '26073', name: 'Isabella County' },
  { fips: '26075', name: 'Jackson County' },
  { fips: '26077', name: 'Kalamazoo County' },
  { fips: '26079', name: 'Kalkaska County' },
  { fips: '26081', name: 'Kent County' },
  { fips: '26083', name: 'Keweenaw County' },
  { fips: '26085', name: 'Lake County' },
  { fips: '26087', name: 'Lapeer County' },
  { fips: '26089', name: 'Leelanau County' },
  { fips: '26091', name: 'Lenawee County' },
  { fips: '26093', name: 'Livingston County' },
  { fips: '26095', name: 'Luce County' },
  { fips: '26097', name: 'Mackinac County' },
  { fips: '26099', name: 'Macomb County' },
  { fips: '26101', name: 'Manistee County' },
  { fips: '26103', name: 'Marquette County' },
  { fips: '26105', name: 'Mason County' },
  { fips: '26107', name: 'Mecosta County' },
  { fips: '26109', name: 'Menominee County' },
  { fips: '26111', name: 'Midland County' },
  { fips: '26113', name: 'Missaukee County' },
  { fips: '26115', name: 'Monroe County' },
  { fips: '26117', name: 'Montcalm County' },
  { fips: '26119', name: 'Montmorency County' },
  { fips: '26121', name: 'Muskegon County' },
  { fips: '26123', name: 'Newaygo County' },
  { fips: '26125', name: 'Oakland County' },
  { fips: '26127', name: 'Oceana County' },
  { fips: '26129', name: 'Ogemaw County' },
  { fips: '26131', name: 'Ontonagon County' },
  { fips: '26133', name: 'Osceola County' },
  { fips: '26135', name: 'Oscoda County' },
  { fips: '26137', name: 'Otsego County' },
  { fips: '26139', name: 'Ottawa County' },
  { fips: '26141', name: 'Presque Isle County' },
  { fips: '26143', name: 'Roscommon County' },
  { fips: '26145', name: 'Saginaw County' },
  { fips: '26147', name: 'St. Clair County' },
  { fips: '26149', name: 'St. Joseph County' },
  { fips: '26151', name: 'Sanilac County' },
  { fips: '26153', name: 'Schoolcraft County' },
  { fips: '26155', name: 'Shiawassee County' },
  { fips: '26157', name: 'Tuscola County' },
  { fips: '26159', name: 'Van Buren County' },
  { fips: '26161', name: 'Washtenaw County' },
  { fips: '26163', name: 'Wayne County' },
  { fips: '26165', name: 'Wexford County' },
];

// Calling type (from Supabase)
export interface Calling {
  id: string;
  name: string;
  type: CallingType;
  description: string | null;
  color: string | null;
  created_at: string;
}

// Church-Calling junction
export interface ChurchCalling {
  id: string;
  church_id: string;
  calling_id: string;
  custom_boundary_enabled: boolean; // Flag to enable custom boundary drawing for this calling
  created_at: string;
}

// Area type (from Supabase)
export interface Area {
  id: string;
  name: string;
  type: AreaType;
  church_id: string | null;
  calling_id: string | null;
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
  created_by: string | null;
  created_at: string;
  is_primary: boolean;
}

// Ministry Area with Calling Info (Sprint 1.8 - for "Show All Ministry Areas")
export interface MinistryAreaWithCalling {
  id: string;
  name: string;
  type: AreaType | 'primary';
  church_id: string | null;
  church_name: string | null;
  calling_id: string | null;  // Links to specific calling for calling-specific boundaries
  is_primary?: boolean;  // True for primary ministry areas
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
  calling_type: CallingType | null;
  calling_name: string | null;  // Specific calling name (e.g., "Addiction", "Youth")
  calling_color: string | null;
  created_at: string;
  population?: number | null;  // Total population within polygon from tract overlaps
}

// Profile pending type
export interface ProfilePending {
  id: string;
  church_id: string;
  submitted_data: Record<string, any>;
  submitted_by: string | null;
  created_at: string;
}

// =====================================================================
// SPRINT 2.0 - IDENTITY, OWNERSHIP & PRAYER TYPES
// =====================================================================

// Profile type (Sprint 2.0 - linked to auth.users)
export interface Profile {
  id: string; // FK to auth.users.id
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  last_initial: string | null;
  primary_church_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// Church user role types
export type ChurchUserRole = 'member' | 'church_admin';

// Church user role (Sprint 2.0)
export interface ChurchUserRoleRecord {
  id: string;
  user_id: string;
  church_id: string;
  role: ChurchUserRole;
  is_approved: boolean;
  approved_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// Platform role types
// @deprecated - Use CityPlatformRole from city_platform_users instead
export type PlatformRole = 'platform_admin';

// Platform role (Sprint 2.0)
// @deprecated - Use CityPlatformUser instead. Kept for backward compatibility.
export interface PlatformRoleRecord {
  id: string;
  user_id: string;
  role: PlatformRole;
  is_active: boolean;
  created_at: string;
}

// Canonical admin role type (from city_platform_users)
export type CityPlatformRole = 'super_admin' | 'platform_owner' | 'platform_admin' | 'church_admin' | 'member';

// Prayer status types
export type PrayerStatus = 'pending' | 'approved' | 'rejected' | 'archived';

// Prayer name display modes
export type PrayerNameDisplayMode = 'first_name_last_initial';

// Prayer (Sprint 2.0 - church-specific, regional, and global prayer requests)
export interface Prayer {
  id: string;
  church_id: string;
  submitted_by_user_id: string | null;
  title: string;
  body: string;
  status: PrayerStatus;
  is_anonymous: boolean;
  display_first_name: string | null;
  display_last_initial: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by_user_id: string | null;
  // Guest submission fields (for non-authenticated users)
  guest_name: string | null;
  guest_email: string | null;
  // Prayer Mode V2 - Regional/Global support
  region_type: string | null; // e.g., 'city', 'county', 'zip'
  region_id: string | null; // External ID (e.g., FIPS code)
  area_id: string | null; // Reference to custom area
  global: boolean; // Whether shown globally
  // City Platform scoping (Phase 5C)
  city_platform_id: string | null; // Reference to city_platforms table
  // Church-initiated prayer requests (posted by church admins on behalf of the church)
  is_church_request: boolean; // true = church admin posted this for the church, false = individual submitted
  // Answered prayer tracking
  answered_at: string | null;
  answered_by_user_id: string | null;
  answered_note: string | null;
  // Tract-scoped prayer fields
  scope_type: string | null; // 'platform' | 'boundary' | 'tract' | null
  tract_id: string | null; // references boundaries_tracts.geoid
  click_lat: number | null; // latitude of the click point
  click_lng: number | null; // longitude of the click point
  // Formation App prayer exchange integration
  formation_prayer_id: string | null; // Links to Formation prayer_request_id for bidirectional sync
  formation_synced_at: string | null; // When this prayer was last synced with Formation
  formation_source: boolean; // true = prayer originated from Formation App
  // Prayer Journey reference
  journey_id: string | null;
  journey_step_id: string | null;
}

// Prayer interaction types
export type PrayerInteractionType = 'prayed';

// Prayer interaction (Sprint 2.0)
export interface PrayerInteraction {
  id: string;
  prayer_id: string;
  user_id: string | null; // null for anonymous
  interaction_type: PrayerInteractionType;
  created_at: string;
}

// =====================================================================
// PRAYER JOURNEYS - Admin-curated guided prayer experiences
// =====================================================================

export type PrayerJourneyStatus = 'draft' | 'published' | 'archived';

export type PrayerJourneyStepType =
  | 'boundary'
  | 'church'
  | 'community_need'
  | 'custom'
  | 'scripture'
  | 'user_prayer'
  | 'thanksgiving'
  | 'prayer_request';

export interface PrayerJourney {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  created_by_user_id: string;
  church_id: string | null;
  city_platform_id: string | null;
  tract_ids: string[];
  status: PrayerJourneyStatus;
  published_at: string | null;
  share_token: string | null;
  starts_at: string | null;
  expires_at: string | null;
  platform_approved: boolean;
  show_qr_code: boolean;
  presentation_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface PrayerJourneyStep {
  id: string;
  journey_id: string;
  sort_order: number;
  step_type: PrayerJourneyStepType;
  title: string | null;
  body: string | null;
  scripture_ref: string | null;
  scripture_text: string | null;
  church_id: string | null;
  metric_key: string | null;
  ai_generated: boolean;
  is_excluded: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
}

export const insertPrayerJourneySchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(1000).optional().nullable(),
  church_id: z.string().uuid().optional().nullable(),
  city_platform_id: z.string().uuid().optional().nullable(),
  tract_ids: z.array(z.string()).default([]),
});

export const updatePrayerJourneySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  cover_image_url: z.string().url().optional().nullable(),
  tract_ids: z.array(z.string()).optional(),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  show_qr_code: z.boolean().optional(),
  presentation_mode: z.boolean().optional(),
});

export const insertPrayerJourneyStepSchema = z.object({
  step_type: z.enum(['boundary', 'church', 'community_need', 'custom', 'scripture', 'user_prayer', 'thanksgiving', 'prayer_request']),
  sort_order: z.number().int().min(0).default(0),
  title: z.string().max(200).optional().nullable(),
  body: z.string().max(5000).optional().nullable(),
  scripture_ref: z.string().max(200).optional().nullable(),
  scripture_text: z.string().max(2000).optional().nullable(),
  church_id: z.string().uuid().optional().nullable(),
  metric_key: z.string().optional().nullable(),
  ai_generated: z.boolean().default(false),
  is_excluded: z.boolean().default(false),
  metadata: z.record(z.any()).optional().nullable(),
});

export const updatePrayerJourneyStepSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  body: z.string().max(5000).optional().nullable(),
  scripture_ref: z.string().max(200).optional().nullable(),
  scripture_text: z.string().max(2000).optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
  is_excluded: z.boolean().optional(),
  ai_generated: z.boolean().optional(),
  metadata: z.record(z.any()).optional().nullable(),
});

export type InsertPrayerJourney = z.infer<typeof insertPrayerJourneySchema>;
export type UpdatePrayerJourney = z.infer<typeof updatePrayerJourneySchema>;
export type InsertPrayerJourneyStep = z.infer<typeof insertPrayerJourneyStepSchema>;
export type UpdatePrayerJourneyStep = z.infer<typeof updatePrayerJourneyStepSchema>;


// =====================================================================
// INTERNAL ADMIN TAGS (Platform Admin Only)
// Hidden tags for internal church labeling, invisible to regular users
// =====================================================================

// Internal tag definition
export interface InternalTag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color_hex: string;
  icon_key: string;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Internal tag with usage count (for admin management)
export interface InternalTagWithUsage extends InternalTag {
  usage_count: number;
}

// Church-tag assignment record
export interface InternalChurchTag {
  id: string;
  church_id: string;
  tag_id: string;
  applied_by: string | null;
  applied_at: string;
  notes: string | null;
}

// Church's assigned tag with full tag details
export interface ChurchInternalTag {
  tag_id: string;
  tag_name: string;
  tag_slug: string;
  tag_description: string | null;
  color_hex: string;
  icon_key: string;
  applied_at: string;
  applied_by: string | null;
  notes: string | null;
}

// Insert/update schemas for internal tags
export const insertInternalTagSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(50, "Tag name too long"),
  slug: z.string().min(1, "Slug is required").max(50, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().max(200, "Description too long").optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  icon_key: z.string().min(1, "Icon is required").max(50, "Icon key too long"),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const updateInternalTagSchema = insertInternalTagSchema.partial();

export const assignInternalTagSchema = z.object({
  church_id: z.string().uuid("Invalid church ID"),
  tag_id: z.string().uuid("Invalid tag ID"),
  notes: z.string().max(500, "Notes too long").optional(),
});

export type InsertInternalTag = z.infer<typeof insertInternalTagSchema>;
export type UpdateInternalTag = z.infer<typeof updateInternalTagSchema>;
export type AssignInternalTag = z.infer<typeof assignInternalTagSchema>;

// =====================================================================
// COLLABORATION TAXONOMY TYPES (Database-driven tag system)
// =====================================================================

// Collaboration tag (individual collaboration option)
export interface CollaborationTag {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// Tag with usage count (for admin endpoints)
export interface CollaborationTagWithUsage extends CollaborationTag {
  usage_count: number;
}

// Extended profile with church info and roles
export interface ProfileWithChurch extends Profile {
  primary_church?: Church;
  church_roles?: ChurchUserRoleRecord[];
  platform_roles?: PlatformRoleRecord[];
  is_platform_admin?: boolean;
}

// Prayer with submitter info
export interface PrayerWithSubmitter extends Prayer {
  submitter?: Profile;
  approved_by?: Profile;
  church?: Church;
  interaction_count?: number;
  user_has_prayed?: boolean;
}

// Prayer for Prayer Mode V2 visible endpoint
export interface VisiblePrayer {
  id: string;
  title: string;
  body: string;
  church_id: string | null;
  church_name: string | null;
  display_first_name: string | null;
  display_last_initial: string | null;
  region_type: string | null;
  region_id: string | null;
  global: boolean;
  interaction_count: number;
  created_at: string;
  source?: 'real' | 'template'; // Real prayer from DB vs template rendered on-the-fly
  isTemplate?: boolean; // True for template prayers (not stored in DB)
  submitted_by_user_id: string | null; // User ID if user-submitted, null if template
  is_church_request?: boolean; // true = church admin posted this for the church
  scope_type?: string | null; // 'platform' | 'boundary' | 'tract' | null
  tract_id?: string | null; // references boundaries_tracts.geoid
  click_lat?: number | null;
  click_lng?: number | null;
}

// Recent prayer interaction for live ticker
export interface RecentPrayerInteraction {
  id: string;
  prayer_id: string;
  prayer_title: string;
  church_name: string | null;
  region_type: string | null;
  user_first_name: string | null;
  user_last_initial: string | null;
  created_at: string;
}

// =====================================================================
// PRAYER PROMPT TYPES (Health-based prayer prompts for Prayer Mode)
// =====================================================================

// Severity levels for health metrics
export type HealthSeverityLevel = 'low' | 'moderate' | 'concerning' | 'critical' | 'very_critical';

// Prayer prompt type from database
export interface PrayerPromptType {
  id: string;
  metric_key: string;
  need_description: string;
  prayer_template: string;
  severity_levels: HealthSeverityLevel[];
  weight: number;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Prompt with resolved variables for display
export interface ResolvedPrayerPrompt {
  id: string;
  metric_key: string;
  metric_display: string;
  severity: HealthSeverityLevel;
  need_description: string;
  prayer_text: string;
  area_name?: string;
  value?: number;
}

// API response for prompts-for-area endpoint
export interface PrayerPromptsForAreaResponse {
  prompts: ResolvedPrayerPrompt[];
  area_summary: {
    center: [number, number];
    critical_count: number;
    concerning_count: number;
  };
}

// Insert schemas for forms
export const insertChurchSchema = z.object({
  name: z.string().min(1, "Church name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  denomination: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  location: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  display_lat: z.number().optional().nullable(), // Visual offset for map pin
  display_lng: z.number().optional().nullable(), // Visual offset for map pin
  place_calling_id: z.string().uuid().optional(),
  collaboration_have: z.array(z.string()).default([]),
  collaboration_need: z.array(z.string()).default([]),
  profile_photo_url: z.string().optional(),
  description: z.string().optional(),
  formation_church_id: z.string().optional().nullable(),
  formation_api_key: z.string().optional().nullable(),
});

export const insertCallingSchema = z.object({
  name: z.string().min(1, "Calling name is required"),
  type: z.enum(callingTypes),
  description: z.string().optional(),
  color: z.string().optional(),
});

export const insertAreaSchema = z.object({
  name: z.string().min(1, "Area name is required"),
  type: z.enum(areaTypes),
  church_id: z.string().uuid().optional(),
  calling_id: z.string().uuid().optional(),
  geometry: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }),
});

export type InsertChurch = z.infer<typeof insertChurchSchema>;
export type InsertCalling = z.infer<typeof insertCallingSchema>;
export type InsertArea = z.infer<typeof insertAreaSchema>;

// =====================================================================
// SPRINT 2.0 - VALIDATION SCHEMAS
// =====================================================================

// Profile validation schema
export const insertProfileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1, "Full name is required"),
  first_name: z.string().optional(),
  last_initial: z.string().optional(),
  primary_church_id: z.string().uuid().optional(),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1, "Full name is required").optional(),
  first_name: z.string().optional(),
  last_initial: z.string().optional(),
  primary_church_id: z.string().uuid().optional(),
});

// Prayer validation schema
export const insertPrayerSchema = z.object({
  church_id: z.string().uuid("Invalid church ID"),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  body: z.string().min(1, "Prayer request is required").max(2000, "Prayer too long"),
  is_anonymous: z.boolean().default(false),
  city_platform_id: z.string().uuid().optional(), // City platform scoping (Phase 5C)
  scope_type: z.enum(['platform', 'boundary', 'tract']).nullable().optional(),
  tract_id: z.string().nullable().optional(),
  click_lat: z.number().min(-90).max(90).nullable().optional(),
  click_lng: z.number().min(-180).max(180).nullable().optional(),
  journey_id: z.string().uuid().optional().nullable(),
  journey_step_id: z.string().uuid().optional().nullable(),
});

// Church admin prayer request schema (church-initiated prayer needs)
export const insertChurchPrayerRequestSchema = z.object({
  church_id: z.string().uuid("Invalid church ID"),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  body: z.string().max(2000, "Prayer too long").optional().default(""),
  city_platform_id: z.string().uuid().optional(),
});

export const updatePrayerStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'archived']),
});

// Admin prayer creation schema (global/platform-wide/regional)
export const createAdminPrayerSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  body: z.string().min(1, "Prayer request is required").max(2000, "Prayer too long"),
  global: z.boolean().default(false),
  platform_wide: z.boolean().default(false), // Platform-wide prayer (visible across entire platform)
  region_type: z.string().optional(), // e.g., 'city', 'county', 'zip', 'platform_region'
  region_id: z.string().optional(), // External ID (e.g., FIPS code) or platform region ID
  area_id: z.string().uuid().optional(), // Reference to custom area
  submitter_name: z.string().optional(), // Optional display name
  city_platform_id: z.string().uuid().optional(), // City platform scoping (Phase 5C)
}).refine(
  (data) => data.global || data.platform_wide || data.region_type || data.area_id,
  {
    message: "Prayer must be either global, platform-wide, regional, or area-specific",
    path: ["global"],
  }
);

// Church user role validation
export const insertChurchUserRoleSchema = z.object({
  user_id: z.string().uuid(),
  church_id: z.string().uuid(),
  role: z.enum(['member', 'church_admin']),
  is_approved: z.boolean().default(false),
});

export const approveChurchMemberSchema = z.object({
  is_approved: z.boolean(),
});

// Prayer settings validation
export const updatePrayerSettingsSchema = z.object({
  prayer_auto_approve: z.boolean().optional(),
  prayer_name_display_mode: z.enum(['first_name_last_initial']).optional(),
});

// Collaboration taxonomy validation schemas
export const insertCollaborationTagSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_]+$/, "Slug must be lowercase alphanumeric with underscores"),
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  sort_order: z.number().int().default(0),
});

export const updateCollaborationTagSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_]+$/, "Slug must be lowercase alphanumeric with underscores").optional(),
  label: z.string().min(1, "Label is required").optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});


export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type InsertPrayer = z.infer<typeof insertPrayerSchema>;
export type UpdatePrayerStatus = z.infer<typeof updatePrayerStatusSchema>;
export type CreateAdminPrayer = z.infer<typeof createAdminPrayerSchema>;
export type InsertChurchUserRole = z.infer<typeof insertChurchUserRoleSchema>;
export type ApproveChurchMember = z.infer<typeof approveChurchMemberSchema>;
export type UpdatePrayerSettings = z.infer<typeof updatePrayerSettingsSchema>;
export type InsertCollaborationTag = z.infer<typeof insertCollaborationTagSchema>;
export type UpdateCollaborationTag = z.infer<typeof updateCollaborationTagSchema>;

// =====================================================================
// SPRINT 4.0 - GLOBAL COMMUNITY FEED + CHURCH-LINKED POSTS
// =====================================================================

// Media types for posts
export type PostMediaType = 'image' | 'video' | 'none';

// Body format enum for rich text support
export type PostBodyFormat = 'plain_text' | 'rich_text_json';

// Post status types
export type PostStatus = 'published' | 'removed';

// Post type (general vs prayer_post)
export type PostType = 'general' | 'prayer_post';

// Comment type (standard, prayer_tap, encouragement)
export type CommentType = 'standard' | 'prayer_tap' | 'encouragement';

// Group visibility types
export type GroupVisibility = 'public' | 'private';

// Group member role types
export type GroupMemberRole = 'member' | 'moderator' | 'admin';

// Group (Sprint 4.0 - future expansion)
export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  visibility: GroupVisibility;
  created_at: string;
  updated_at: string;
}

// Group member (Sprint 4.0 - future expansion)
export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  created_at: string;
  updated_at: string;
}

// Media asset (uploaded media for posts)
export interface MediaAsset {
  id: string;
  post_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  media_type: 'image' | 'video';
  width: number | null;
  height: number | null;
  created_at: string;
}

// Post (Sprint 4.0 - global feed + church-linked posts)
export interface Post {
  id: string;
  author_id: string;
  group_id: string | null;
  church_id: string | null;
  title: string | null;
  body: string;
  body_format: PostBodyFormat;
  rich_body: any | null;
  media_url: string | null;
  media_urls: string[];
  media_type: PostMediaType;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  // Prayer post extensions
  post_type: PostType;
  linked_church_id: string | null;
  last_activity_at: string;
  cover_image_url: string | null;
  // City Platform scoping (Phase 5C)
  city_platform_id: string | null; // Reference to city_platforms table
}

// Comment status types
export type CommentStatus = 'published' | 'removed' | 'pending';

// Post comment (Sprint 4.0)
export interface PostComment {
  id: string;
  post_id: string;
  author_id: string | null;
  body: string;
  body_format: PostBodyFormat;
  rich_body: any | null;
  status: CommentStatus;
  created_at: string;
  updated_at: string;
  // Prayer response extensions
  comment_type: CommentType;
  display_name: string | null;
  prayer_id: string | null;
  // Guest comment support
  guest_name: string | null;
}

// Reaction types for posts
export type ReactionType = 'like' | 'pray' | 'celebrate' | 'support';

// Post reaction
export interface PostReaction {
  id: string;
  post_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

// Reaction counts object
export interface ReactionCounts {
  like: number;
  pray: number;
  celebrate: number;
  support: number;
}

// Platform summary for prayer post attribution
export interface PlatformSummary {
  id: string;
  name: string;
  logo_url: string | null;
}

// Extended post with author and church info
export interface PostWithDetails extends Post {
  author?: Profile;
  church?: Church;
  linked_church?: Church; // For prayer posts - the church being prayed for
  platform?: PlatformSummary; // For prayer posts - platform attribution instead of user
  comment_count?: number;
  media_assets?: MediaAsset[];
  reaction_counts?: ReactionCounts;
  user_reactions?: ReactionType[];
  preview_comments?: PreviewComment[]; // Inline preview comments for prayer posts
  is_first_prayer_post?: boolean; // Whether this is the first prayer post in the list (gets more comments)
}

// Extended comment with author info and reactions
export interface PostCommentWithAuthor extends PostComment {
  author?: Profile;
  reaction_counts?: ReactionCounts;
  user_reactions?: ReactionType[];
}

// Preview comment for community feed (lightweight)
export interface PreviewComment {
  id: string;
  post_id: string;
  body: string;
  body_format: PostBodyFormat;
  created_at: string;
  display_name: string | null;
  guest_name: string | null;
  comment_type: CommentType;
  author?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    avatar_url: string | null;
  };
}

// Church summary for search/picker (lightweight)
export interface ChurchSummary {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  denomination: string | null;
}

// =====================================================================
// SPRINT 4.0 - VALIDATION SCHEMAS
// =====================================================================

// Post validation schemas
export const insertPostSchema = z.object({
  title: z.string().max(200, "Title too long").optional(),
  body: z.string().min(1, "Post body is required").max(5000, "Post too long"),
  bodyFormat: z.enum(['plain_text', 'rich_text_json']).default('plain_text'),
  richBody: z.any().optional(),
  mediaUrl: z.string().url().optional(),
  mediaUrls: z.array(z.string().url()).max(10, "Maximum 10 images allowed").optional(),
  mediaType: z.enum(['image', 'video', 'none']).default('none'),
  churchId: z.string().uuid().optional(),
  cityPlatformId: z.string().uuid().optional(), // City platform scoping (Phase 5C)
});

export const updatePostSchema = z.object({
  title: z.string().max(200, "Title too long").optional(),
  body: z.string().min(1, "Post body is required").max(5000, "Post too long").optional(),
  bodyFormat: z.enum(['plain_text', 'rich_text_json']).optional(),
  richBody: z.any().optional(),
  status: z.enum(['published', 'removed']).optional(),
});

// Comment validation schemas
export const insertCommentSchema = z.object({
  body: z.string().min(1, "Comment is required").max(2000, "Comment too long"),
  bodyFormat: z.enum(['plain_text', 'rich_text_json']).default('plain_text'),
  richBody: z.any().optional(),
  guest_name: z.string().min(2).max(100).optional(),
  guest_full_name: z.string().min(2).max(100).optional(),
});

export const updateCommentSchema = z.object({
  body: z.string().min(1, "Comment is required").max(1000, "Comment too long").optional(),
  status: z.enum(['published', 'removed']).optional(),
});

// Admin-only status update schemas
export const updatePostStatusSchema = z.object({
  status: z.enum(['published', 'removed']),
});

export const updateCommentStatusSchema = z.object({
  status: z.enum(['published', 'removed']),
});

// Group validation schemas (future)
export const insertGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").optional(),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

// Prayer response schema (for community-prayer integration)
export const addPrayerResponseSchema = z.object({
  commentType: z.enum(['prayer_tap', 'encouragement']),
  body: z.string().min(1, "Message is required").max(2000, "Message too long"),
  displayName: z.string().max(100).optional(),
  prayerId: z.string().uuid().optional(),
});

export type InsertPost = z.infer<typeof insertPostSchema>;
export type UpdatePost = z.infer<typeof updatePostSchema>;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type UpdateComment = z.infer<typeof updateCommentSchema>;
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type UpdateGroup = z.infer<typeof updateGroupSchema>;
export type AddPrayerResponse = z.infer<typeof addPrayerResponseSchema>;

// Extended church with callings and boundaries for display
export interface ChurchWithCallings extends Church {
  callings?: Calling[];
  boundaries?: Boundary[];
}

// Collaboration options
export const COLLAB_OPTIONS = [
  // Life-Stage & Family
  { value: "youth",              label: "Youth Ministry" },
  { value: "college",            label: "College Ministry" },
  { value: "youngAdults",        label: "Young Adult Ministry" },
  { value: "men",                label: "Men's Ministry" },
  { value: "women",              label: "Women's Ministry" },
  { value: "singles",            label: "Singles Ministry" },
  { value: "seniors",            label: "Seniors Ministry" },

  { value: "parenting",          label: "Parenting Workshops" },
  { value: "marriage",           label: "Marriage Enrichment" },
  { value: "premarital",         label: "Premarital Mentoring" },
  { value: "singleParents",      label: "Single Parent Support" },
  { value: "blendedFamilies",    label: "Blended Family Support" },

  // Care & Support
  { value: "recovery",           label: "Recovery / Freedom Ministries" },
  { value: "specialNeeds",       label: "Special-Needs Ministry" },
  { value: "fosterAdopt",        label: "Foster & Adoptive Support" },
  { value: "caregivers",         label: "Caregiver Support" },
  { value: "grief",              label: "Grief & Loss Care" },
  { value: "veterans",           label: "Veterans Support" },

  // Worship, Creative, Production
  { value: "worship",            label: "Worship Leaders / Teams" },
  { value: "creative",           label: "Creative Direction / Design" },
  { value: "production",         label: "Production Teams (Audio / Lighting)" },
  { value: "livestream",         label: "Livestream Setup & Training" },
  { value: "stageDesign",        label: "Stage Design & Initial Build" },

  // Teaching & Preaching
  { value: "teachingTeam",       label: "Teaching / Preaching Support" },
  { value: "seriesPlanning",     label: "Series Design & Shared Arcs" },
  { value: "marriageTeaching",   label: "Marriage / Family Specialist" },
  { value: "missionsTeaching",   label: "Missions / Global Focus" },
  { value: "justiceTeaching",    label: "Justice / Mercy Topics" },
  { value: "formationTeaching",  label: "Spiritual Formation Topics" },
  { value: "pulpitSupply",       label: "Pulpit Supply / Sabbatical Coverage" },

  // Org, Legal, Finance
  { value: "legal",              label: "Legal Review & Liability" },
  { value: "insurance",          label: "Insurance Optimization" },
  { value: "hr",                 label: "HR / Employment & Conflict Coaching" },
  { value: "bookkeeping",        label: "Bookkeeping Support" },
  { value: "financeOversight",   label: "Financial Oversight / Review" },
  { value: "policy",             label: "Policy Creation & Handbooks" },
  { value: "orgHealth",          label: "Organizational Health Diagnostics" },
  { value: "strategy",           label: "Strategic Planning Facilitation" },
  { value: "leadershipPipeline", label: "Leadership Pipeline Development" },
  { value: "succession",         label: "Succession Planning Support" },

  // Community Impact & Events
  { value: "neighborhoodOutreach", label: "Neighborhood Outreach / Clean-Ups" },
  { value: "schoolPartners",       label: "School Partnerships" },
  { value: "communityMeals",       label: "Community Meal Events" },
  { value: "parkEvents",           label: "Park / Public Space Events" },
  { value: "seasonalDrives",       label: "Seasonal Drives (Coats / Backpacks)" },
  { value: "vbsEvents",            label: "VBS / Large Kids Events" },
  { value: "conferences",          label: "Multi-Church Conferences" },
  { value: "holidayEvents",        label: "Large Holiday Events" },
  { value: "citywideWorship",      label: "Citywide Worship Gatherings" },
  { value: "campsRetreats",        label: "Camps & Retreats" },

  // Prayer Initiatives
  { value: "prayerGatherings",   label: "City Blessing Gatherings" },
  { value: "prayerWalks",        label: "Neighborhood Prayer Walks" },
  { value: "prayerCovering",     label: "Prayer Covering Teams" },
  { value: "prayerNights",       label: "Multi-Church Prayer Nights" },

  // Disaster & Emergency Response
  { value: "disasterResponse",   label: "Disaster Response Teams" },
  { value: "shelter",            label: "Shelter Coordination" },
  { value: "supplies",           label: "Supply Collection & Distribution" },
  { value: "emergencyComms",     label: "Emergency Communication Hubs" },
  { value: "agencyPartners",     label: "City / Agency Partnerships" },

  // Missions Infrastructure
  { value: "missionTrips",       label: "Mission Trip Coordination" },
  { value: "missionaryCare",     label: "Missionary Care Teams" },
  { value: "intlPartners",       label: "International Partner Support" },
  { value: "crossCultural",      label: "Cross-Cultural Coaching" },
  { value: "reliefPacking",      label: "Packing & Relief Teams" },
  { value: "missionsAdmin",      label: "Missions Admin & Logistics" },

  // Facilities – Space
  { value: "sharedWorshipSpace", label: "Shared Worship Space" },
  { value: "coLocation",         label: "Long-Term Co-Location / Multi-Church Campus" },
  { value: "incubatorSpace",     label: "Incubator Space for Plants / Ministries" },
  { value: "weekdaySpace",       label: "Weekday Admin / Classroom Space" },
  { value: "spaceStewardship",   label: "Space Stewardship / Matching" },

  // Facilities – Operations
  { value: "facilityMgmt",       label: "Facility Management Expertise" },
  { value: "hvac",               label: "HVAC / Mechanical Expertise" },
  { value: "securitySystems",    label: "Security System Setup & Guidance" },
  { value: "safetyCompliance",   label: "Safety & Compliance Assessments" },
  { value: "avInfrastructure",   label: "AV Infrastructure Planning & Consulting" },
];

// Export same options for both have and need (all options can be used for either)
export const COLLAB_HAVE_OPTIONS = COLLAB_OPTIONS;
export const COLLAB_NEED_OPTIONS = COLLAB_OPTIONS;

// Search/filter types
export interface ChurchFilters {
  callings?: string[];
  denomination?: string;
  searchTerm?: string;
  collabHave?: string[];
  collabNeed?: string[];
  boundaryIds?: string[];
  boundaryFilterFocus?: boolean;
  boundaryFilterLocated?: boolean;
  boundaryGeometries?: Record<string, { type: "Polygon" | "MultiPolygon"; coordinates: any }>;
  polygon?: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
  internalTagIds?: string[];
}

// ============================================================================
// HEALTH DATA OVERLAY TYPES
// ============================================================================

// Health metric category (Clinical Care, Health Behavior, etc.)
export interface HealthMetricCategory {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  color?: string;
  sort_order: number;
}

// Health metric definition (Life Expectancy, Obesity Rate, etc.)
export interface HealthMetric {
  id: string;
  metric_key: string;
  display_name: string;
  category_id?: string;
  category?: HealthMetricCategory;
  description?: string;
  unit?: string;
  is_percentage: boolean;
  higher_is_better?: boolean;
  available_at_city: boolean;
  available_at_tract: boolean;
}

// Health metric data point (actual values)
export interface HealthMetricData {
  id: string;
  metric_id: string;
  geo_fips: string;
  geo_level: 'city' | 'tract';
  geo_name?: string;
  state_fips?: string;
  state_abbr?: string;
  estimate?: number;
  lower_ci?: number;
  upper_ci?: number;
  numerator?: number;
  denominator?: number;
  data_period?: string;
  period_type?: string;
  source_name?: string;
  group_name: string;
  census_year?: number;
  version?: string;
}

// Combined metric with latest data (for UI display)
export interface HealthMetricWithData {
  metric_id: string;
  metric_key: string;
  display_name: string;
  category_name: string;
  category_display_name: string;
  category_color?: string;
  estimate?: number;
  lower_ci?: number;
  upper_ci?: number;
  data_period?: string;
  unit?: string;
  is_percentage: boolean;
  higher_is_better?: boolean;
}

// Tract data for choropleth rendering
export interface TractMetricData {
  geo_fips: string;
  geo_name?: string;
  estimate?: number;
  lower_ci?: number;
  upper_ci?: number;
  data_period?: string;
}

// Health metric names mapping - ALL CDC PLACES metrics + Census ACS socioeconomic metrics
// Removed: violent_crime (no tract API), reading_scores (district-level only), 
// disconnected_youth (county-level only), life_expectancy (county-level only),
// opioid_overdose_deaths (county-level only), preventable_hospitalizations (no free API),
// EPA metrics (API unreachable from Replit dev), USDA Food Access (API unreachable from Replit dev)
export const HEALTH_METRIC_KEYS: Record<string, { display: string; category: string }> = {
  // ==================== CLINICAL CARE & PREVENTION ====================
  'dental_visit': { display: 'Dental Visit', category: 'clinical_care' },
  'health_insurance': { display: 'Uninsured Adults 18-64', category: 'clinical_care' },
  'routine_checkup': { display: 'Annual Checkup', category: 'clinical_care' },
  'cholesterol_screening': { display: 'Cholesterol Screening', category: 'clinical_care' },
  'colorectal_cancer_screening': { display: 'Colorectal Cancer Screening', category: 'clinical_care' },
  'mammography': { display: 'Mammography (Women 50-74)', category: 'clinical_care' },
  'taking_bp_medication': { display: 'Taking BP Medication', category: 'clinical_care' },
  
  // ==================== HEALTH BEHAVIORS ====================
  'binge_drinking': { display: 'Binge Drinking', category: 'health_behavior' },
  'current_smoking': { display: 'Current Smoking', category: 'health_behavior' },
  'physical_inactivity': { display: 'Physical Inactivity', category: 'health_behavior' },
  'sleep': { display: 'Short Sleep (<7 hours)', category: 'health_behavior' },
  
  // ==================== HEALTH OUTCOMES ====================
  'arthritis': { display: 'Arthritis', category: 'health_outcomes' },
  'asthma': { display: 'Asthma', category: 'health_outcomes' },
  'cancer': { display: 'Cancer (non-skin)', category: 'health_outcomes' },
  'cardiovascular_disease': { display: 'Coronary Heart Disease', category: 'health_outcomes' },
  'copd': { display: 'COPD', category: 'health_outcomes' },
  'depression': { display: 'Depression', category: 'health_outcomes' },
  'diabetes': { display: 'Diabetes', category: 'health_outcomes' },
  'frequent_mental_distress': { display: 'Frequent Mental Distress', category: 'health_outcomes' },
  'frequent_physical_distress': { display: 'Frequent Physical Distress', category: 'health_outcomes' },
  'general_health': { display: 'Fair/Poor Health Status', category: 'health_outcomes' },
  'high_blood_pressure': { display: 'High Blood Pressure', category: 'health_outcomes' },
  'high_cholesterol': { display: 'High Cholesterol', category: 'health_outcomes' },
  // kidney_disease removed - not available in CDC PLACES tract-level data
  'obesity': { display: 'Obesity', category: 'health_outcomes' },
  'stroke': { display: 'Stroke', category: 'health_outcomes' },
  'teeth_lost': { display: 'All Teeth Lost (65+)', category: 'health_outcomes' },
  
  // ==================== DISABILITIES ====================
  'any_disability': { display: 'Any Disability', category: 'disabilities' },
  'cognitive_disability': { display: 'Cognitive Disability', category: 'disabilities' },
  'hearing_disability': { display: 'Hearing Disability', category: 'disabilities' },
  'mobility_disability': { display: 'Mobility Disability', category: 'disabilities' },
  'vision_disability': { display: 'Vision Disability', category: 'disabilities' },
  'self_care_disability': { display: 'Self-Care Disability', category: 'disabilities' },
  'independent_living_disability': { display: 'Independent Living Disability', category: 'disabilities' },
  
  // ==================== SOCIAL NEEDS (Ministry-Relevant!) ====================
  'food_insecurity': { display: 'Food Insecurity', category: 'social_needs' },
  'food_stamps': { display: 'Receiving Food Stamps/SNAP', category: 'social_needs' },
  'housing_insecurity': { display: 'Housing Insecurity', category: 'social_needs' },
  'social_isolation': { display: 'Social Isolation', category: 'social_needs' },
  'lack_social_support': { display: 'Lack of Social/Emotional Support', category: 'social_needs' },
  'transportation_barriers': { display: 'Transportation Barriers', category: 'social_needs' },
  'utility_shutoff_threat': { display: 'Utility Shutoff Threat', category: 'social_needs' },
  
  // ==================== SOCIAL & ECONOMIC (Census ACS) ====================
  'child_poverty': { display: 'Child Poverty', category: 'social_economic' },
  'children_in_single_parent_households': { display: 'Children in Single-Parent Households', category: 'social_economic' },
  'high_school_completion': { display: 'High School Completion', category: 'social_economic' },
  'income_inequality': { display: 'Income Inequality (GINI)', category: 'social_economic' },
  'poverty': { display: 'Poverty Rate', category: 'social_economic' },
  'racial_ethnic_diversity': { display: 'Racial/Ethnic Diversity', category: 'social_economic' },
  'racial_ethnic_isolation': { display: 'Racial/Ethnic Isolation', category: 'social_economic' },
  'unemployment': { display: 'Unemployment', category: 'social_economic' },
  'uninsured': { display: 'Uninsured All Ages (Census)', category: 'social_economic' },
  
  // ==================== PHYSICAL ENVIRONMENT (Census ACS) ====================
  'broadband_connection': { display: 'Broadband Connection', category: 'physical_environment' },
  'housing_cost_burden': { display: 'Housing Cost Burden (30%+)', category: 'physical_environment' },
  
  // ==================== PUBLIC SAFETY (Grand Rapids Open Data) ====================
  // Crimes Against Persons
  'assault_rate': { display: 'Assault Rate', category: 'public_safety' },
  'sex_offense_rate': { display: 'Sex Offense Rate', category: 'public_safety' },
  'robbery_rate': { display: 'Robbery Rate', category: 'public_safety' },
  // Crimes Against Property
  'theft_rate': { display: 'Theft Rate', category: 'public_safety' },
  'burglary_rate': { display: 'Burglary Rate', category: 'public_safety' },
  'vehicle_theft_rate': { display: 'Vehicle Theft Rate', category: 'public_safety' },
  'vandalism_rate': { display: 'Vandalism Rate', category: 'public_safety' },
  'fraud_rate': { display: 'Fraud Rate', category: 'public_safety' },
  // Crimes Against Society
  'drug_offense_rate': { display: 'Drug Offense Rate', category: 'public_safety' },
  'weapons_offense_rate': { display: 'Weapons Offense Rate', category: 'public_safety' },
};

// Color scales for choropleth rendering - green to red (intuitive traffic light colors)
export const HEALTH_METRIC_COLOR_SCALES = {
  // Green to Red scale (higher is worse - disease, poverty, risk factors, uninsured)
  // Low values = green (good), High values = red (needs attention)
  negative: ['#1a9850', '#91cf60', '#fee08b', '#fc8d59', '#d73027'],
  // Red to Green scale (higher is better - life expectancy, dental visits, screenings)  
  // Low values = red (needs attention), High values = green (good)
  positive: ['#d73027', '#fc8d59', '#fee08b', '#91cf60', '#1a9850'],
  // Yellow-orange scale (neutral - general metrics without clear good/bad direction)
  neutral: ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'],
};

// Negative metrics: higher values are WORSE (diseases, poverty, risk factors, etc.)
// Used by both Area Intelligence and Map Choropleth for consistent color classification
// Keys must match HEALTH_METRIC_KEYS exactly!
export const NEGATIVE_HEALTH_METRICS = new Set([
  // Health Outcomes (diseases and distress) - all are negative
  'obesity', 'diabetes', 'high_blood_pressure', 'stroke', 'cancer', 
  'copd', 'asthma', 'depression', 'arthritis',
  'cardiovascular_disease', 'general_health', 'high_cholesterol', 'teeth_lost',
  'frequent_mental_distress', 'frequent_physical_distress',
  // Health Behaviors (bad behaviors) - all are negative
  'current_smoking', 'binge_drinking', 'physical_inactivity', 'sleep',
  // Clinical Care - only health_insurance (uninsured rate) is negative
  'health_insurance',
  // Community Wellbeing (problems) - all are negative
  'food_insecurity', 'food_stamps', 'housing_insecurity', 'social_isolation', 
  'transportation_barriers', 'lack_social_support', 'utility_shutoff_threat',
  // Economic Indicators (problems) - most are negative
  'poverty', 'child_poverty', 'unemployment', 'uninsured',
  'housing_cost_burden', 'income_inequality', 'racial_ethnic_isolation',
  'children_in_single_parent_households',
  // Disabilities - all are negative
  'any_disability', 'cognitive_disability', 'hearing_disability', 'mobility_disability',
  'vision_disability', 'self_care_disability', 'independent_living_disability',
  // Public Safety - all are negative (higher crime = worse)
  'assault_rate', 'sex_offense_rate', 'robbery_rate',
  'theft_rate', 'burglary_rate', 'vehicle_theft_rate', 'vandalism_rate', 'fraud_rate',
  'drug_offense_rate', 'weapons_offense_rate',
]);

// POSITIVE metrics (higher = better) - NOT in NEGATIVE_HEALTH_METRICS:
// Clinical Care: dental_visit, routine_checkup, cholesterol_screening, 
//   colorectal_cancer_screening, mammography, taking_bp_medication
// Economic Indicators: high_school_completion
// Physical Environment: broadband_connection
// Neutral: racial_ethnic_diversity

// Helper function to check if a metric is negative (higher = worse)
export function isNegativeMetric(metricKey: string): boolean {
  return NEGATIVE_HEALTH_METRICS.has(metricKey);
}

// =====================================================================
// CRIME METRIC THRESHOLDS (Per 100K Population)
// =====================================================================
// These thresholds are designed for per-capita crime rates and work across
// city sizes - from small rural towns to large urban metros.
// Based on FBI UCR ranges for meaningful color separation.

export const CRIME_THRESHOLD_GROUPS = {
  // Violent crimes: assault, robbery, sex offense, weapons
  // These typically have lower rates - most areas 0-500 per 100K
  violent: [100, 250, 500, 1000], // Thresholds: green<100, yg<250, yellow<500, orange<1000, red>=1000
  
  // Property crimes: theft, burglary, vehicle theft, vandalism, fraud
  // Higher base rates - property crimes are more common
  property: [500, 1500, 3000, 5000], // Thresholds: green<500, yg<1500, yellow<3000, orange<5000, red>=5000
  
  // Drug offenses: separate category with mid-range thresholds
  drugs: [200, 500, 1000, 2000], // Thresholds: green<200, yg<500, yellow<1000, orange<2000, red>=2000
};

// Map each crime metric to its threshold group
export const CRIME_METRIC_GROUP: Record<string, keyof typeof CRIME_THRESHOLD_GROUPS> = {
  // Violent crimes
  'assault_rate': 'violent',
  'robbery_rate': 'violent',
  'sex_offense_rate': 'violent',
  'weapons_offense_rate': 'violent',
  // Property crimes
  'theft_rate': 'property',
  'burglary_rate': 'property',
  'vehicle_theft_rate': 'property',
  'vandalism_rate': 'property',
  'fraud_rate': 'property',
  // Drug crimes
  'drug_offense_rate': 'drugs',
};

// All public safety metric keys
export const PUBLIC_SAFETY_METRICS = new Set(Object.keys(CRIME_METRIC_GROUP));

// Helper function to check if a metric is a public safety/crime metric
export function isPublicSafetyMetric(metricKey: string): boolean {
  return PUBLIC_SAFETY_METRICS.has(metricKey);
}

// Get crime thresholds for a given metric key
// Returns [t1, t2, t3, t4] where colors are: green<t1, yg<t2, yellow<t3, orange<t4, red>=t4
export function getCrimeThresholds(metricKey: string): number[] | null {
  const group = CRIME_METRIC_GROUP[metricKey];
  if (!group) return null;
  return CRIME_THRESHOLD_GROUPS[group];
}

// =====================================================================
// CITY PLATFORM TYPES (Multi-City Architecture)
// =====================================================================

// City Platform role types
export type CityPlatformRole = 'super_admin' | 'platform_owner' | 'platform_admin' | 'church_admin' | 'member';

// Boundary role in a platform
export type BoundaryRole = 'primary' | 'included' | 'excluded';

// Church status within a platform
export type ChurchPlatformStatus = 'visible' | 'hidden' | 'featured' | 'pending';

// City Platform - core entity for each city network
// Note: combined_geometry is stored as PostGIS geography but returned as GeoJSON via ST_AsGeoJSON
export interface CityPlatform {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  primary_boundary_id: string | null;
  combined_geometry: GeoJSONMultiPolygon | null; // PostGIS geography returned as GeoJSON
  default_center_lat: number | null;
  default_center_lng: number | null;
  default_zoom: number;
  is_active: boolean;
  is_public: boolean;
  auto_approve_members: boolean; // Whether to auto-approve membership requests
  display_lds_churches: boolean; // Whether to display LDS/Mormon churches
  display_jw_churches: boolean; // Whether to display Jehovah's Witness churches
  created_by_user_id: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

// City Platform Boundary - links platforms to geographic boundaries
export interface CityPlatformBoundary {
  id: string;
  city_platform_id: string;
  boundary_id: string;
  role: BoundaryRole;
  sort_order: number;
  added_at: string;
  added_by_user_id: string | null;
}

// City Platform Church - links churches to platforms
export interface CityPlatformChurch {
  id: string;
  city_platform_id: string;
  church_id: string;
  status: ChurchPlatformStatus;
  is_claimed: boolean;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  invite_sent_at: string | null;
  invite_sent_by_user_id: string | null;
  invite_token: string | null;
  added_at: string;
  updated_at: string;
}

// City Platform User - role-based access
export interface CityPlatformUser {
  id: string;
  city_platform_id: string | null; // null for super_admin
  user_id: string;
  role: CityPlatformRole;
  church_id: string | null; // for church_admin role
  is_active: boolean;
  can_manage_boundaries: boolean; // add-on permission for boundary management
  created_at: string;
  updated_at: string;
}

// Zod schemas for validation
// Note: Defaults here match SQL defaults in 0072-city-platforms-foundation.sql
export const insertCityPlatformSchema = z.object({
  name: z.string().min(2, "Platform name must be at least 2 characters"),
  slug: z.string().min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().optional().nullable(),
  primary_boundary_id: z.string().uuid().optional().nullable(),
  default_center_lat: z.number().optional().nullable(),
  default_center_lng: z.number().optional().nullable(),
  default_zoom: z.number().int().min(1).max(20).default(11),
  is_active: z.boolean().default(false), // SQL default is false
  is_public: z.boolean().default(false), // SQL default is false
  auto_approve_members: z.boolean().default(false), // SQL default is false
  display_lds_churches: z.boolean().default(false), // SQL default is false
  display_jw_churches: z.boolean().default(false), // SQL default is false
  logo_url: z.string().url().optional().nullable(),
  banner_url: z.string().url().optional().nullable(),
  website: z.string().url().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
});

// Reserved slugs that cannot be used as platform slugs (match route paths)
export const RESERVED_PLATFORM_SLUGS = [
  'about',
  'admin',
  'auth',
  'agent-program',
  'apply-for-platform',
  'church',
  'churches',
  'community',
  'explore',
  'facility-sharing',
  'journey',
  'journeys',
  'login',
  'map',
  'methodology',
  'ministry-area',
  'ministry-areas',
  'onboarding',
  'platform',
  'platforms',
  'prayers',
  'profile',
  'signatures',
  'signup',
  'api',
] as const;

// Platform settings schema - for updating platform settings (subset of full schema)
export const updatePlatformSettingsSchema = z.object({
  name: z.string().min(2, "Platform name must be at least 2 characters").optional(),
  slug: z.string()
    .min(3, "Slug must be at least 3 characters")
    .max(100, "Slug must be at most 100 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only")
    .refine(
      (val) => !RESERVED_PLATFORM_SLUGS.includes(val as any),
      "This slug is reserved and cannot be used for a platform"
    )
    .optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  is_public: z.boolean().optional(),
  auto_approve_members: z.boolean().optional(),
  display_lds_churches: z.boolean().optional(),
  display_jw_churches: z.boolean().optional(),
  logo_url: z.string().url().optional().nullable().or(z.literal('')),
  banner_url: z.string().url().optional().nullable().or(z.literal('')),
  website: z.string().url().optional().nullable().or(z.literal('')),
  contact_email: z.string().email().optional().nullable().or(z.literal('')),
});

export type UpdatePlatformSettings = z.infer<typeof updatePlatformSettingsSchema>;

export type InsertCityPlatform = z.infer<typeof insertCityPlatformSchema>;

export const insertCityPlatformBoundarySchema = z.object({
  city_platform_id: z.string().uuid(),
  boundary_id: z.string().uuid(),
  role: z.enum(['primary', 'included', 'excluded']).default('included'),
  sort_order: z.number().int().default(0), // SQL default is 0
});

export type InsertCityPlatformBoundary = z.infer<typeof insertCityPlatformBoundarySchema>;

export const insertCityPlatformUserSchema = z.object({
  city_platform_id: z.string().uuid().optional().nullable(), // null for super_admin
  user_id: z.string().uuid(),
  role: z.enum(['super_admin', 'platform_owner', 'platform_admin', 'church_admin', 'member']),
  church_id: z.string().uuid().optional().nullable(), // required for church_admin
  is_active: z.boolean().default(true), // SQL default is true
});

export type InsertCityPlatformUser = z.infer<typeof insertCityPlatformUserSchema>;

export const updateCityPlatformUserSchema = z.object({
  role: z.enum(['super_admin', 'platform_owner', 'platform_admin', 'church_admin', 'member']).optional(),
  church_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
});

export type UpdateCityPlatformUser = z.infer<typeof updateCityPlatformUserSchema>;

export const insertCityPlatformChurchSchema = z.object({
  city_platform_id: z.string().uuid(),
  church_id: z.string().uuid(),
  status: z.enum(['visible', 'hidden', 'featured', 'pending']).default('visible'), // SQL default is 'visible'
  is_claimed: z.boolean().default(false), // SQL default is false
  claimed_by_user_id: z.string().uuid().optional().nullable(),
});

export type InsertCityPlatformChurch = z.infer<typeof insertCityPlatformChurchSchema>;

// Extended types with related data
export interface CityPlatformWithBoundaries extends CityPlatform {
  boundaries: (CityPlatformBoundary & { boundary: Boundary })[];
  church_count: number;
  member_count: number;
}

// =====================================================================
// PLATFORM REGIONS SYSTEM
// Named groupings of boundaries for city platforms (e.g., Downtown, East Side)
// =====================================================================

// Default color palette for regions (12 distinct colors)
export const REGION_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#F97316", // Orange
  "#6366F1", // Indigo
  "#14B8A6", // Teal
  "#A855F7", // Purple
] as const;

// Color for unassigned boundaries
export const UNASSIGNED_BOUNDARY_COLOR = "#9CA3AF"; // Gray-400

// Platform Region - named grouping of boundaries
export interface PlatformRegion {
  id: string;
  city_platform_id: string;
  name: string;
  color: string;
  cover_image_url: string | null;
  sort_order: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// Region Boundary - join table linking regions to boundaries
export interface RegionBoundary {
  id: string;
  region_id: string;
  boundary_id: string;
  added_at: string;
}

// Region with counts (from RPC function)
export interface PlatformRegionWithCounts {
  id: string;
  name: string;
  color: string;
  cover_image_url: string | null;
  sort_order: number;
  boundary_count: number;
  church_count: number;
  boundary_ids?: string[];
}

// Region with full boundary details
export interface PlatformRegionWithBoundaries extends PlatformRegion {
  boundaries: RegionBoundary[];
  boundary_details?: Boundary[];
}

// Zod schemas for validation
export const insertPlatformRegionSchema = z.object({
  city_platform_id: z.string().uuid(),
  name: z.string().min(1, "Region name is required").max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex code").default("#3B82F6"),
  cover_image_url: z.string().url().optional().nullable(),
  sort_order: z.number().int().default(0),
});

export type InsertPlatformRegion = z.infer<typeof insertPlatformRegionSchema>;

export const updatePlatformRegionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  cover_image_url: z.string().url().optional().nullable(),
  sort_order: z.number().int().optional(),
});

export type UpdatePlatformRegion = z.infer<typeof updatePlatformRegionSchema>;

export const insertRegionBoundarySchema = z.object({
  region_id: z.string().uuid(),
  boundary_id: z.string().uuid(),
});

export type InsertRegionBoundary = z.infer<typeof insertRegionBoundarySchema>;

// Bulk update schema for assigning multiple boundaries to a region
export const assignBoundariesToRegionSchema = z.object({
  region_id: z.string().uuid(),
  boundary_ids: z.array(z.string().uuid()),
});

export interface UserPlatformAccess {
  platform_id: string;
  platform_name: string;
  platform_slug: string;
  user_role: CityPlatformRole;
  is_super_admin: boolean;
}

// Extended city platform user with profile data
export interface CityPlatformUserWithProfile extends CityPlatformUser {
  profile?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    email?: string;
  };
  church?: {
    id: string;
    name: string;
  };
}

// =====================================================================
// CHURCH CLAIMS SYSTEM (Phase 5E)
// Allows users to claim ownership of churches within city platforms
// =====================================================================

// Church claim status types
export type ChurchClaimStatus = 'pending' | 'approved' | 'rejected' | 'released';

// Church claim - represents a user's claim to administer a church
export interface ChurchClaim {
  id: string;
  church_id: string;
  city_platform_id: string;
  user_id: string;
  status: ChurchClaimStatus;
  role_at_church: string | null;
  phone: string | null;
  verification_notes: string | null;
  reviewer_notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Church claim with related data for display
export interface ChurchClaimWithDetails extends ChurchClaim {
  church: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    address: string | null;
  };
  user: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  platform: {
    id: string;
    name: string;
    slug: string;
  };
  reviewer?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
}

// Zod schema for wizard data from ClaimChurchWizard
export const claimWizardDataSchema = z.object({
  selectedPlatformId: z.string().uuid().optional(),
  roleSelection: z.string().optional(),
  callings: z.array(z.string()).optional(),
  facility_details: z.object({
    seating_capacity: z.string().optional(),
    parking_spaces: z.string().optional(),
    has_kitchen: z.boolean().optional(),
    has_audio_visual: z.boolean().optional(),
    has_childcare_facilities: z.boolean().optional(),
  }).optional(),
  collaboration_tags: z.array(z.string()).optional(),
}).optional();

export type ClaimWizardData = z.infer<typeof claimWizardDataSchema>;

// Zod schema for submitting a church claim
export const insertChurchClaimSchema = z.object({
  church_id: z.string().uuid("Invalid church ID"),
  city_platform_id: z.string().uuid("Invalid platform ID"),
  role_at_church: z.string().min(1, "Role at church is required").max(100, "Role too long"),
  phone: z.string().max(20, "Phone number too long").optional().nullable(),
  verification_notes: z.string().min(10, "Please provide details about your connection to this church").max(1000, "Notes too long"),
  wizard_data: z.string().optional(), // JSON string of ClaimWizardData
});

export type InsertChurchClaim = z.infer<typeof insertChurchClaimSchema>;

// Zod schema for updating a church claim (admin approval/rejection)
export const updateChurchClaimSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewer_notes: z.string().max(500, "Notes too long").optional().nullable(),
});

export type UpdateChurchClaim = z.infer<typeof updateChurchClaimSchema>;

// ============================================================================
// CITY PLATFORM APPLICATIONS (Phase 6)
// Users apply to create a new city platform, super admins review and set up
// ============================================================================

export type PlatformApplicationStatus = 'pending' | 'in_review' | 'approved' | 'rejected';
export type ApplicationBoundaryType = 'city' | 'county' | 'zip' | 'school_district' | 'custom';

export interface CityPlatformApplication {
  id: string;
  applicant_user_id: string;
  applicant_email: string;
  applicant_name: string;
  
  // Requested platform details
  requested_platform_name: string;
  requested_platform_slug: string | null;
  requested_boundary_type: ApplicationBoundaryType;
  boundary_ids: string[]; // Array of boundary IDs from geographic_boundaries
  
  // Application narrative
  city_description: string;
  ministry_vision: string;
  existing_partners: string | null;
  leadership_experience: string | null;
  expected_timeline: string | null;
  
  // Status tracking
  status: PlatformApplicationStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  
  // If approved, link to created platform
  created_platform_id: string | null;
  
  created_at: string;
  updated_at: string;
}

// Extended application with profile and boundary data
export interface CityPlatformApplicationWithDetails extends CityPlatformApplication {
  applicant?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  boundaries?: Boundary[];
  reviewer?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  created_platform?: CityPlatform;
}

// Zod schema for submitting a platform application
export const insertPlatformApplicationSchema = z.object({
  requested_platform_name: z.string().min(2, "Platform name must be at least 2 characters").max(100, "Platform name too long"),
  requested_platform_slug: z.string().min(2, "Slug must be at least 2 characters").max(50, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional().nullable(),
  requested_boundary_type: z.enum(['city', 'county', 'zip', 'school_district', 'custom']),
  boundary_ids: z.array(z.string().uuid()).min(1, "At least one boundary must be selected"),
  city_description: z.string().min(20, "Please provide more detail about the city").max(1000, "Description too long"),
  ministry_vision: z.string().min(20, "Please share more about your vision").max(2000, "Vision statement too long"),
  existing_partners: z.string().max(1000, "Partner list too long").optional().nullable(),
  leadership_experience: z.string().max(1000, "Experience description too long").optional().nullable(),
  expected_timeline: z.string().max(200, "Timeline too long").optional().nullable(),
});

export type InsertPlatformApplication = z.infer<typeof insertPlatformApplicationSchema>;

// Zod schema for updating a platform application (admin review)
export const updatePlatformApplicationSchema = z.object({
  status: z.enum(['in_review', 'approved', 'rejected']),
  reviewer_notes: z.string().max(1000, "Notes too long").optional().nullable(),
});

export type UpdatePlatformApplication = z.infer<typeof updatePlatformApplicationSchema>;

// =====================================================================
// PLATFORM MEMBERSHIP REQUESTS (Member Onboarding Flow)
// Users can request to join a platform, platform admins review and approve/reject
// =====================================================================

export type PlatformMembershipRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PlatformMembershipRequest {
  id: string;
  platform_id: string;
  user_id: string;
  status: PlatformMembershipRequestStatus;
  message: string | null;
  reviewer_notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformMembershipRequestWithDetails extends PlatformMembershipRequest {
  user: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  platform: {
    id: string;
    name: string;
    slug: string;
  };
  reviewer?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
}

export const insertMembershipRequestSchema = z.object({
  platform_id: z.string().uuid("Invalid platform ID"),
  message: z.string().max(500, "Message too long").optional().nullable(),
});

export type InsertMembershipRequest = z.infer<typeof insertMembershipRequestSchema>;

export const updateMembershipRequestSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewer_notes: z.string().max(500, "Notes too long").optional().nullable(),
});

export type UpdateMembershipRequest = z.infer<typeof updateMembershipRequestSchema>;

export interface UserMembershipStatus {
  isMember: boolean;
  hasPendingRequest: boolean;
  role?: CityPlatformRole;
  request?: PlatformMembershipRequest;
}

// =====================================================================
// USER ONBOARDING & PENDING CHURCHES
// Multi-step signup flow with church selection
// =====================================================================

// User profile with church association
export interface UserProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  church_id: string | null; // User's primary church
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

// Status for pending church submissions
export type PendingChurchStatus = 'pending' | 'approved' | 'rejected';

// Pending church (submitted during onboarding, awaiting admin review)
export interface PendingChurch {
  id: string;
  submitted_by_user_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  denomination: string | null;
  website: string | null;
  phone: string | null;
  status: PendingChurchStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_church_id: string | null; // If approved, link to created church
  created_at: string;
  updated_at: string;
}

// Validation schemas for onboarding
export const selectChurchSchema = z.object({
  church_id: z.string().uuid("Invalid church ID"),
});

export type SelectChurchInput = z.infer<typeof selectChurchSchema>;

export const submitPendingChurchSchema = z.object({
  name: z.string().min(2, "Church name must be at least 2 characters"),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  denomination: z.string().optional().nullable(),
  website: z.string().url("Invalid website URL").optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
});

export type SubmitPendingChurchInput = z.infer<typeof submitPendingChurchSchema>;

// Response type for church search with platform info
export interface ChurchSearchResult {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  denomination: string | null;
  platform: {
    id: string;
    name: string;
  } | null;
}

// Onboarding completion response
export interface OnboardingResult {
  success: boolean;
  church_id: string | null;
  pending_church_id: string | null;
  platform_id: string | null;
  platform_name: string | null;
  joined_platform: boolean;
  message: string;
}

// =====================================================================
// DATA SOURCE MANAGEMENT
// Admin-controlled data ingestion scheduling for all data sources
// =====================================================================

export type DataSourceType = 'crime' | 'health' | 'demographics' | 'boundaries' | 'churches';
export type DataSourceCategory = 'arcgis' | 'socrata' | 'carto' | 'ckan' | 'api' | 'osm' | 'tigerweb' | 'cdc' | 'census';
export type DataSourceRunStatus = 'success' | 'failed' | 'running' | 'pending';
export type FrequencyLabel = 'Hourly' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | 'Manual';

export interface DataSourceConfig {
  id: string;
  source_key: string;           // Unique key e.g., 'crime_las_vegas', 'cdc_places'
  source_name: string;          // Human readable name
  source_type: DataSourceType;
  source_category: DataSourceCategory | null;
  
  enabled: boolean;
  cumulative_mode: boolean;     // If true, don't clear data before ingesting
  
  cron_expression: string | null;
  frequency_label: FrequencyLabel | null;
  
  last_run_at: string | null;
  last_run_status: DataSourceRunStatus | null;
  last_run_duration_ms: number | null;
  last_run_records: number | null;
  next_run_at: string | null;
  
  last_error_message: string | null;
  consecutive_failures: number;
  
  endpoint_url: string | null;
  state: string | null;
  city: string | null;
  record_count: number;
  
  requires_deduplication: boolean;
  requires_tract_assignment: boolean;
  
  created_at: string;
  updated_at: string;
}

export interface IngestionRun {
  id: string;
  data_source_id: string | null;
  dataset: string;
  state: string | null;
  city: string | null;
  started_at: string;
  completed_at: string | null;
  status: DataSourceRunStatus;
  features_fetched: number;
  features_inserted: number;
  features_updated: number;
  features_skipped: number;
  error_message: string | null;
  metadata: Record<string, any> | null;
}

// Zod schemas for validation
export const createDataSourceConfigSchema = z.object({
  source_key: z.string().min(1),
  source_name: z.string().min(1),
  source_type: z.enum(['crime', 'health', 'demographics', 'boundaries', 'churches']),
  source_category: z.enum(['arcgis', 'socrata', 'carto', 'ckan', 'api', 'osm', 'tigerweb', 'cdc', 'census']).optional().nullable(),
  enabled: z.boolean().default(true),
  cumulative_mode: z.boolean().default(false),
  cron_expression: z.string().optional().nullable(),
  frequency_label: z.enum(['Hourly', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Manual']).optional().nullable(),
  endpoint_url: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  requires_deduplication: z.boolean().default(false),
  requires_tract_assignment: z.boolean().default(false),
});

export type CreateDataSourceConfigInput = z.infer<typeof createDataSourceConfigSchema>;

export const updateDataSourceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  cumulative_mode: z.boolean().optional(),
  cron_expression: z.string().optional().nullable(),
  frequency_label: z.enum(['Hourly', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Manual']).optional().nullable(),
});

export type UpdateDataSourceConfigInput = z.infer<typeof updateDataSourceConfigSchema>;

// Dashboard view with aggregated stats
export interface DataSourceDashboard {
  total_sources: number;
  enabled_sources: number;
  sources_by_type: Record<DataSourceType, number>;
  recent_runs: IngestionRun[];
  next_scheduled: DataSourceConfig[];
  failing_sources: DataSourceConfig[];
}

// =====================================================================
// PARTNERSHIP & SPONSORS (Fund the Mission)
// Mission funding infrastructure for church activation
// =====================================================================

// Partnership status for churches
export const partnershipStatuses = ['unclaimed', 'claimed', 'interest', 'pending', 'active'] as const;
export type PartnershipStatus = typeof partnershipStatuses[number];

// Sponsor levels
export const sponsorLevels = ['platform', 'regional', 'church'] as const;
export type SponsorLevel = typeof sponsorLevels[number];

// Sponsor types (professional category)
export const sponsorTypes = ['realtor', 'lender', 'other'] as const;
export type SponsorType = typeof sponsorTypes[number];

// Partnership application paths
export const partnershipApplicationPaths = ['explore', 'authorize'] as const;
export type PartnershipApplicationPath = typeof partnershipApplicationPaths[number];

// Partnership application status
export const partnershipApplicationStatuses = ['new', 'reviewed', 'closed'] as const;
export type PartnershipApplicationStatus = typeof partnershipApplicationStatuses[number];

// AARE submission status
export const aareSubmissionStatuses = ['new', 'contacted', 'closed'] as const;
export type AareSubmissionStatus = typeof aareSubmissionStatuses[number];

// Sponsor interface
export interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  headshot_url: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  description: string | null;
  level: SponsorLevel;
  sponsor_type: SponsorType;
  nmls_number: string | null;
  agent_license_number: string | null;
  is_active: boolean;
  sort_order: number;
  city_platform_id: string | null;
  created_at: string;
  updated_at: string;
  city_platform?: {
    id: string;
    name: string;
  };
}

// Sponsor assignment interface
export interface SponsorAssignment {
  id: string;
  sponsor_id: string;
  church_id: string | null;
  city_platform_id: string | null;
  platform_region_id: string | null;
  display_from: string;
  display_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sponsor?: Sponsor;
  platform_region?: {
    id: string;
    name: string;
  };
}

// Partnership application interface
export interface PartnershipApplication {
  id: string;
  church_id: string;
  user_id: string | null;
  path: PartnershipApplicationPath;
  applicant_name: string;
  applicant_role: string;
  applicant_email: string;
  applicant_phone: string | null;
  has_authority_affirmation: boolean;
  notes: string | null;
  status: PartnershipApplicationStatus;
  reviewer_id: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  submission_count: number;
  created_at: string;
  updated_at: string;
  church?: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  };
  submissions?: PartnershipApplicationSubmission[];
}

// Partnership application submission interface (tracks each form submission)
export interface PartnershipApplicationSubmission {
  id: string;
  application_id: string;
  path: PartnershipApplicationPath;
  applicant_name: string;
  applicant_role: string;
  applicant_email: string;
  applicant_phone: string | null;
  has_authority_affirmation: boolean;
  notes: string | null;
  user_id: string | null;
  created_at: string;
}

// AARE submission interface
export interface AareSubmission {
  id: string;
  church_id: string | null;
  user_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  submission_type: string;
  notes: string | null;
  status: AareSubmissionStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  church?: {
    id: string;
    name: string;
  };
}

// Fund the Mission page data (composite for the public page)
export interface FundMissionPageData {
  church: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    claimed_by: string | null;
    partnership_status: PartnershipStatus;
    profile_photo_url: string | null;
    banner_image_url: string | null;
    description: string | null;
  };
  callings: Array<{
    id: string;
    name: string;
    type: CallingType;
    description: string | null;
  }>;
  collaborationHave: string[];
  collaborationNeed: string[];
  sponsors: Array<Sponsor & { assignment: SponsorAssignment }>;
  isClaimed: boolean;
  hasExistingClaim: boolean;
  isPartnershipActive: boolean;
  medianHomePrice: number | null;
}

// Zod schemas for validation

export const insertSponsorSchema = z.object({
  name: z.string().min(1, "Sponsor name is required"),
  logo_url: z.string().url("Invalid logo URL").optional().nullable().or(z.literal('')),
  headshot_url: z.string().url("Invalid headshot URL").optional().nullable().or(z.literal('')),
  website_url: z.string().url("Invalid website URL").optional().nullable().or(z.literal('')),
  contact_email: z.string().email("Invalid email").optional().nullable().or(z.literal('')),
  contact_phone: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  level: z.enum(sponsorLevels),
  sponsor_type: z.enum(sponsorTypes).default('other'),
  nmls_number: z.string().optional().nullable(),
  agent_license_number: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  city_platform_id: z.string().uuid("Invalid platform ID").optional().nullable(),
});

export type InsertSponsor = z.infer<typeof insertSponsorSchema>;

export const updateSponsorSchema = insertSponsorSchema.partial();
export type UpdateSponsor = z.infer<typeof updateSponsorSchema>;

export const insertSponsorAssignmentSchema = z.object({
  sponsor_id: z.string().uuid("Invalid sponsor ID"),
  church_id: z.string().uuid("Invalid church ID").optional().nullable(),
  city_platform_id: z.string().uuid("Invalid platform ID").optional().nullable(),
  platform_region_id: z.string().uuid("Invalid region ID").optional().nullable(),
  display_from: z.string().datetime().optional(),
  display_to: z.string().datetime().optional().nullable(),
  is_active: z.boolean().default(true),
});

export type InsertSponsorAssignment = z.infer<typeof insertSponsorAssignmentSchema>;

export const insertPartnershipApplicationSchema = z.object({
  church_id: z.string().uuid("Invalid church ID"),
  path: z.enum(partnershipApplicationPaths),
  applicant_name: z.string().min(1, "Name is required"),
  applicant_role: z.string().min(1, "Role is required"),
  applicant_email: z.string().email("Valid email is required"),
  applicant_phone: z.string().optional().nullable(),
  has_authority_affirmation: z.boolean(),
  notes: z.string().optional().nullable(),
});

export type InsertPartnershipApplication = z.infer<typeof insertPartnershipApplicationSchema>;

export const updatePartnershipApplicationSchema = z.object({
  status: z.enum(partnershipApplicationStatuses),
  reviewer_notes: z.string().optional().nullable(),
});

export type UpdatePartnershipApplication = z.infer<typeof updatePartnershipApplicationSchema>;

export const insertAareSubmissionSchema = z.object({
  church_id: z.string().uuid("Invalid church ID").optional().nullable(),
  contact_name: z.string().min(1, "Name is required").optional().nullable(),
  contact_email: z.string().email("Valid email is required").optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  submission_type: z.string().default('fund_mission_page'),
  notes: z.string().optional().nullable(),
});

export type InsertAareSubmission = z.infer<typeof insertAareSubmissionSchema>;

export const updateAareSubmissionSchema = z.object({
  status: z.enum(aareSubmissionStatuses),
  admin_notes: z.string().optional().nullable(),
});

export type UpdateAareSubmission = z.infer<typeof updateAareSubmissionSchema>;

export const updateChurchPartnershipSchema = z.object({
  partnership_status: z.enum(partnershipStatuses),
  partnership_notes: z.string().optional().nullable(),
});

export type UpdateChurchPartnership = z.infer<typeof updateChurchPartnershipSchema>;

// =====================================================================
// MISSION FUNDING SUBMISSIONS (Buyer/Seller Intake)
// =====================================================================

export const buyerSellerTypes = ['buyer', 'seller', 'both'] as const;
export type BuyerSellerType = typeof buyerSellerTypes[number];

export const timelineOptions = ['0_3_months', '3_6_months', '6_plus_months'] as const;
export type TimelineOption = typeof timelineOptions[number];

export const missionFundingSubmissionStatuses = ['new', 'contacted', 'converted', 'closed'] as const;
export type MissionFundingSubmissionStatus = typeof missionFundingSubmissionStatuses[number];

export interface MissionFundingSubmission {
  id: string;
  church_id: string | null;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  buyer_seller_type: BuyerSellerType;
  timeline: TimelineOption | null;
  notes: string | null;
  is_logged_in: boolean;
  status: MissionFundingSubmissionStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  church?: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  };
}

export const insertMissionFundingSubmissionSchema = z.object({
  church_id: z.string().uuid("Invalid church ID").optional().nullable(),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone is required"),
  buyer_seller_type: z.enum(buyerSellerTypes),
  timeline: z.enum(timelineOptions).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type InsertMissionFundingSubmission = z.infer<typeof insertMissionFundingSubmissionSchema>;

export const updateMissionFundingSubmissionSchema = z.object({
  status: z.enum(missionFundingSubmissionStatuses),
  admin_notes: z.string().optional().nullable(),
});

export type UpdateMissionFundingSubmission = z.infer<typeof updateMissionFundingSubmissionSchema>;

// ============================================================
// Prayer Budget & Allocation Tables (Drizzle pgTable - local PostgreSQL)
// ============================================================

export const churchPrayerBudgets = pgTable("church_prayer_budgets", {
  church_id: uuid("church_id").primaryKey(),
  daily_intercessor_count: integer("daily_intercessor_count").notNull().default(0),
  total_budget_pct: integer("total_budget_pct").notNull().default(100),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const churchPrayerAllocations = pgTable("church_prayer_allocations", {
  church_id: uuid("church_id").notNull(),
  tract_geoid: varchar("tract_geoid", { length: 20 }).notNull(),
  allocation_pct: doublePrecision("allocation_pct").notNull().default(0),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.church_id, table.tract_geoid] }),
}));

export type ChurchPrayerBudget = typeof churchPrayerBudgets.$inferSelect;
export type InsertChurchPrayerBudget = typeof churchPrayerBudgets.$inferInsert;

export type ChurchPrayerAllocation = typeof churchPrayerAllocations.$inferSelect;
export type InsertChurchPrayerAllocation = typeof churchPrayerAllocations.$inferInsert;

export const insertChurchPrayerBudgetSchema = createInsertSchema(churchPrayerBudgets).omit({ created_at: true, updated_at: true });
export const insertChurchPrayerAllocationSchema = createInsertSchema(churchPrayerAllocations).omit({ updated_at: true });

// ============================================================
// Church Engagement Scores (Drizzle pgTable - local PostgreSQL)
// ============================================================

export const churchEngagementScores = pgTable("church_engagement_scores", {
  church_id: uuid("church_id").primaryKey(),
  base_score: doublePrecision("base_score").notNull().default(1.0),
  last_activity_at: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
  activity_count: integer("activity_count").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ChurchEngagementScore = typeof churchEngagementScores.$inferSelect;
export type InsertChurchEngagementScore = typeof churchEngagementScores.$inferInsert;

export const insertChurchEngagementScoreSchema = createInsertSchema(churchEngagementScores).omit({ created_at: true, updated_at: true });
