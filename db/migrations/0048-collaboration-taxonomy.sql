-- =====================================================================
-- COLLABORATION TAXONOMY: DATABASE-DRIVEN TAG SYSTEM
-- =====================================================================
-- Migration 0048: Move collaboration tags from hardcoded COLLAB_OPTIONS
--                 to database tables for admin management
-- Created: 2025-11-24
-- Updated: 2025-11-24 - Restructured to use 2 categories (have/need)
--
-- This migration creates:
-- - collaboration_categories table (2 categories: have and need)
-- - collaboration_tags table for individual collaboration options
-- - Seed data for 2 categories and 150 tag entries (75 tags × 2 categories)
-- - RLS policies for public read, super admin write
-- - Indexes for efficient queries and filtering
--
-- Dependencies: Requires platform_roles table from migration 0040
-- =====================================================================

-- =====================================================================
-- COLLABORATION CATEGORIES TABLE
-- =====================================================================
-- Categories organize tags into "We Offer" and "We Need" sections
CREATE TABLE collaboration_categories (
  key VARCHAR(50) PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================================
-- COLLABORATION TAGS TABLE
-- =====================================================================
-- Individual collaboration tags (replaces hardcoded COLLAB_OPTIONS)
-- NOTE: Same tag slug appears in both categories (have and need)
CREATE TABLE collaboration_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key VARCHAR(50) NOT NULL REFERENCES collaboration_categories(key) ON DELETE CASCADE,
  slug VARCHAR(50) NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- Composite unique constraint: same slug can exist in different categories
  CONSTRAINT unique_category_slug UNIQUE (category_key, slug)
);

-- =====================================================================
-- INDEXES
-- =====================================================================
-- Index for filtering by category
CREATE INDEX idx_collaboration_tags_category_key ON collaboration_tags(category_key);

-- Index for filtering active tags
CREATE INDEX idx_collaboration_tags_is_active ON collaboration_tags(is_active);

-- Composite index for common queries (category + active + slug)
CREATE INDEX idx_collaboration_tags_category_active ON collaboration_tags(category_key, is_active, slug);

-- =====================================================================
-- SEED CATEGORIES
-- =====================================================================
-- Insert 2 categories for "We Offer" and "We Need"
INSERT INTO collaboration_categories (key, label, description, sort_order) VALUES
  ('collaboration_have', 'We Offer', 'Resources, expertise, and support we can share with other churches', 1),
  ('collaboration_need', 'We Need', 'Resources, expertise, and support we are looking for from other churches', 2);

-- =====================================================================
-- SEED COLLABORATION TAGS
-- =====================================================================
-- Insert all 75 tags from COLLAB_OPTIONS array
-- Each tag is inserted TWICE: once for "have" category, once for "need" category
-- Total: 150 rows (75 tags × 2 categories)

-- =====================================================================
-- LIFE-STAGE & FAMILY (12 tags × 2 = 24 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  -- "We Offer" category
  ('collaboration_have', 'youth',            'Youth Ministry', 1),
  ('collaboration_have', 'college',          'College Ministry', 2),
  ('collaboration_have', 'youngAdults',      'Young Adult Ministry', 3),
  ('collaboration_have', 'men',              'Men''s Ministry', 4),
  ('collaboration_have', 'women',            'Women''s Ministry', 5),
  ('collaboration_have', 'singles',          'Singles Ministry', 6),
  ('collaboration_have', 'seniors',          'Seniors Ministry', 7),
  ('collaboration_have', 'parenting',        'Parenting Workshops', 8),
  ('collaboration_have', 'marriage',         'Marriage Enrichment', 9),
  ('collaboration_have', 'premarital',       'Premarital Mentoring', 10),
  ('collaboration_have', 'singleParents',    'Single Parent Support', 11),
  ('collaboration_have', 'blendedFamilies',  'Blended Family Support', 12),
  
  -- "We Need" category (same tags)
  ('collaboration_need', 'youth',            'Youth Ministry', 1),
  ('collaboration_need', 'college',          'College Ministry', 2),
  ('collaboration_need', 'youngAdults',      'Young Adult Ministry', 3),
  ('collaboration_need', 'men',              'Men''s Ministry', 4),
  ('collaboration_need', 'women',            'Women''s Ministry', 5),
  ('collaboration_need', 'singles',          'Singles Ministry', 6),
  ('collaboration_need', 'seniors',          'Seniors Ministry', 7),
  ('collaboration_need', 'parenting',        'Parenting Workshops', 8),
  ('collaboration_need', 'marriage',         'Marriage Enrichment', 9),
  ('collaboration_need', 'premarital',       'Premarital Mentoring', 10),
  ('collaboration_need', 'singleParents',    'Single Parent Support', 11),
  ('collaboration_need', 'blendedFamilies',  'Blended Family Support', 12);

-- =====================================================================
-- CARE & SUPPORT (6 tags × 2 = 12 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'recovery',      'Recovery / Freedom Ministries', 13),
  ('collaboration_have', 'specialNeeds',  'Special-Needs Ministry', 14),
  ('collaboration_have', 'fosterAdopt',   'Foster & Adoptive Support', 15),
  ('collaboration_have', 'caregivers',    'Caregiver Support', 16),
  ('collaboration_have', 'grief',         'Grief & Loss Care', 17),
  ('collaboration_have', 'veterans',      'Veterans Support', 18),
  
  ('collaboration_need', 'recovery',      'Recovery / Freedom Ministries', 13),
  ('collaboration_need', 'specialNeeds',  'Special-Needs Ministry', 14),
  ('collaboration_need', 'fosterAdopt',   'Foster & Adoptive Support', 15),
  ('collaboration_need', 'caregivers',    'Caregiver Support', 16),
  ('collaboration_need', 'grief',         'Grief & Loss Care', 17),
  ('collaboration_need', 'veterans',      'Veterans Support', 18);

-- =====================================================================
-- WORSHIP, CREATIVE, PRODUCTION (5 tags × 2 = 10 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'worship',     'Worship Leaders / Teams', 19),
  ('collaboration_have', 'creative',    'Creative Direction / Design', 20),
  ('collaboration_have', 'production',  'Production Teams (Audio / Lighting)', 21),
  ('collaboration_have', 'livestream',  'Livestream Setup & Training', 22),
  ('collaboration_have', 'stageDesign', 'Stage Design & Initial Build', 23),
  
  ('collaboration_need', 'worship',     'Worship Leaders / Teams', 19),
  ('collaboration_need', 'creative',    'Creative Direction / Design', 20),
  ('collaboration_need', 'production',  'Production Teams (Audio / Lighting)', 21),
  ('collaboration_need', 'livestream',  'Livestream Setup & Training', 22),
  ('collaboration_need', 'stageDesign', 'Stage Design & Initial Build', 23);

-- =====================================================================
-- TEACHING & PREACHING (7 tags × 2 = 14 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'teachingTeam',      'Teaching / Preaching Support', 24),
  ('collaboration_have', 'seriesPlanning',    'Series Design & Shared Arcs', 25),
  ('collaboration_have', 'marriageTeaching',  'Marriage / Family Specialist', 26),
  ('collaboration_have', 'missionsTeaching',  'Missions / Global Focus', 27),
  ('collaboration_have', 'justiceTeaching',   'Justice / Mercy Topics', 28),
  ('collaboration_have', 'formationTeaching', 'Spiritual Formation Topics', 29),
  ('collaboration_have', 'pulpitSupply',      'Pulpit Supply / Sabbatical Coverage', 30),
  
  ('collaboration_need', 'teachingTeam',      'Teaching / Preaching Support', 24),
  ('collaboration_need', 'seriesPlanning',    'Series Design & Shared Arcs', 25),
  ('collaboration_need', 'marriageTeaching',  'Marriage / Family Specialist', 26),
  ('collaboration_need', 'missionsTeaching',  'Missions / Global Focus', 27),
  ('collaboration_need', 'justiceTeaching',   'Justice / Mercy Topics', 28),
  ('collaboration_need', 'formationTeaching', 'Spiritual Formation Topics', 29),
  ('collaboration_need', 'pulpitSupply',      'Pulpit Supply / Sabbatical Coverage', 30);

-- =====================================================================
-- ORG, LEGAL, FINANCE (10 tags × 2 = 20 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'legal',             'Legal Review & Liability', 31),
  ('collaboration_have', 'insurance',         'Insurance Optimization', 32),
  ('collaboration_have', 'hr',                'HR / Employment & Conflict Coaching', 33),
  ('collaboration_have', 'bookkeeping',       'Bookkeeping Support', 34),
  ('collaboration_have', 'financeOversight',  'Financial Oversight / Review', 35),
  ('collaboration_have', 'policy',            'Policy Creation & Handbooks', 36),
  ('collaboration_have', 'orgHealth',         'Organizational Health Diagnostics', 37),
  ('collaboration_have', 'strategy',          'Strategic Planning Facilitation', 38),
  ('collaboration_have', 'leadershipPipeline', 'Leadership Pipeline Development', 39),
  ('collaboration_have', 'succession',        'Succession Planning Support', 40),
  
  ('collaboration_need', 'legal',             'Legal Review & Liability', 31),
  ('collaboration_need', 'insurance',         'Insurance Optimization', 32),
  ('collaboration_need', 'hr',                'HR / Employment & Conflict Coaching', 33),
  ('collaboration_need', 'bookkeeping',       'Bookkeeping Support', 34),
  ('collaboration_need', 'financeOversight',  'Financial Oversight / Review', 35),
  ('collaboration_need', 'policy',            'Policy Creation & Handbooks', 36),
  ('collaboration_need', 'orgHealth',         'Organizational Health Diagnostics', 37),
  ('collaboration_need', 'strategy',          'Strategic Planning Facilitation', 38),
  ('collaboration_need', 'leadershipPipeline', 'Leadership Pipeline Development', 39),
  ('collaboration_need', 'succession',        'Succession Planning Support', 40);

-- =====================================================================
-- COMMUNITY IMPACT & EVENTS (10 tags × 2 = 20 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'neighborhoodOutreach', 'Neighborhood Outreach / Clean-Ups', 41),
  ('collaboration_have', 'schoolPartners',       'School Partnerships', 42),
  ('collaboration_have', 'communityMeals',       'Community Meal Events', 43),
  ('collaboration_have', 'parkEvents',           'Park / Public Space Events', 44),
  ('collaboration_have', 'seasonalDrives',       'Seasonal Drives (Coats / Backpacks)', 45),
  ('collaboration_have', 'vbsEvents',            'VBS / Large Kids Events', 46),
  ('collaboration_have', 'conferences',          'Multi-Church Conferences', 47),
  ('collaboration_have', 'holidayEvents',        'Large Holiday Events', 48),
  ('collaboration_have', 'citywideWorship',      'Citywide Worship Gatherings', 49),
  ('collaboration_have', 'campsRetreats',        'Camps & Retreats', 50),
  
  ('collaboration_need', 'neighborhoodOutreach', 'Neighborhood Outreach / Clean-Ups', 41),
  ('collaboration_need', 'schoolPartners',       'School Partnerships', 42),
  ('collaboration_need', 'communityMeals',       'Community Meal Events', 43),
  ('collaboration_need', 'parkEvents',           'Park / Public Space Events', 44),
  ('collaboration_need', 'seasonalDrives',       'Seasonal Drives (Coats / Backpacks)', 45),
  ('collaboration_need', 'vbsEvents',            'VBS / Large Kids Events', 46),
  ('collaboration_need', 'conferences',          'Multi-Church Conferences', 47),
  ('collaboration_need', 'holidayEvents',        'Large Holiday Events', 48),
  ('collaboration_need', 'citywideWorship',      'Citywide Worship Gatherings', 49),
  ('collaboration_need', 'campsRetreats',        'Camps & Retreats', 50);

-- =====================================================================
-- PRAYER INITIATIVES (4 tags × 2 = 8 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'prayerGatherings', 'City Blessing Gatherings', 51),
  ('collaboration_have', 'prayerWalks',      'Neighborhood Prayer Walks', 52),
  ('collaboration_have', 'prayerCovering',   'Prayer Covering Teams', 53),
  ('collaboration_have', 'prayerNights',     'Multi-Church Prayer Nights', 54),
  
  ('collaboration_need', 'prayerGatherings', 'City Blessing Gatherings', 51),
  ('collaboration_need', 'prayerWalks',      'Neighborhood Prayer Walks', 52),
  ('collaboration_need', 'prayerCovering',   'Prayer Covering Teams', 53),
  ('collaboration_need', 'prayerNights',     'Multi-Church Prayer Nights', 54);

-- =====================================================================
-- DISASTER & EMERGENCY RESPONSE (5 tags × 2 = 10 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'disasterResponse', 'Disaster Response Teams', 55),
  ('collaboration_have', 'shelter',          'Shelter Coordination', 56),
  ('collaboration_have', 'supplies',         'Supply Collection & Distribution', 57),
  ('collaboration_have', 'emergencyComms',   'Emergency Communication Hubs', 58),
  ('collaboration_have', 'agencyPartners',   'City / Agency Partnerships', 59),
  
  ('collaboration_need', 'disasterResponse', 'Disaster Response Teams', 55),
  ('collaboration_need', 'shelter',          'Shelter Coordination', 56),
  ('collaboration_need', 'supplies',         'Supply Collection & Distribution', 57),
  ('collaboration_need', 'emergencyComms',   'Emergency Communication Hubs', 58),
  ('collaboration_need', 'agencyPartners',   'City / Agency Partnerships', 59);

-- =====================================================================
-- MISSIONS INFRASTRUCTURE (6 tags × 2 = 12 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'missionTrips',    'Mission Trip Coordination', 60),
  ('collaboration_have', 'missionaryCare',  'Missionary Care Teams', 61),
  ('collaboration_have', 'intlPartners',    'International Partner Support', 62),
  ('collaboration_have', 'crossCultural',   'Cross-Cultural Coaching', 63),
  ('collaboration_have', 'reliefPacking',   'Packing & Relief Teams', 64),
  ('collaboration_have', 'missionsAdmin',   'Missions Admin & Logistics', 65),
  
  ('collaboration_need', 'missionTrips',    'Mission Trip Coordination', 60),
  ('collaboration_need', 'missionaryCare',  'Missionary Care Teams', 61),
  ('collaboration_need', 'intlPartners',    'International Partner Support', 62),
  ('collaboration_need', 'crossCultural',   'Cross-Cultural Coaching', 63),
  ('collaboration_need', 'reliefPacking',   'Packing & Relief Teams', 64),
  ('collaboration_need', 'missionsAdmin',   'Missions Admin & Logistics', 65);

-- =====================================================================
-- FACILITIES – SPACE (5 tags × 2 = 10 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'sharedWorshipSpace', 'Shared Worship Space', 66),
  ('collaboration_have', 'coLocation',         'Long-Term Co-Location / Multi-Church Campus', 67),
  ('collaboration_have', 'incubatorSpace',     'Incubator Space for Plants / Ministries', 68),
  ('collaboration_have', 'weekdaySpace',       'Weekday Admin / Classroom Space', 69),
  ('collaboration_have', 'spaceStewardship',   'Space Stewardship / Matching', 70),
  
  ('collaboration_need', 'sharedWorshipSpace', 'Shared Worship Space', 66),
  ('collaboration_need', 'coLocation',         'Long-Term Co-Location / Multi-Church Campus', 67),
  ('collaboration_need', 'incubatorSpace',     'Incubator Space for Plants / Ministries', 68),
  ('collaboration_need', 'weekdaySpace',       'Weekday Admin / Classroom Space', 69),
  ('collaboration_need', 'spaceStewardship',   'Space Stewardship / Matching', 70);

-- =====================================================================
-- FACILITIES – OPERATIONS (5 tags × 2 = 10 rows)
-- =====================================================================
INSERT INTO collaboration_tags (category_key, slug, label, sort_order) VALUES
  ('collaboration_have', 'facilityMgmt',      'Facility Management Expertise', 71),
  ('collaboration_have', 'hvac',              'HVAC / Mechanical Expertise', 72),
  ('collaboration_have', 'securitySystems',   'Security System Setup & Guidance', 73),
  ('collaboration_have', 'safetyCompliance',  'Safety & Compliance Assessments', 74),
  ('collaboration_have', 'avInfrastructure',  'AV Infrastructure Planning & Consulting', 75),
  
  ('collaboration_need', 'facilityMgmt',      'Facility Management Expertise', 71),
  ('collaboration_need', 'hvac',              'HVAC / Mechanical Expertise', 72),
  ('collaboration_need', 'securitySystems',   'Security System Setup & Guidance', 73),
  ('collaboration_need', 'safetyCompliance',  'Safety & Compliance Assessments', 74),
  ('collaboration_need', 'avInfrastructure',  'AV Infrastructure Planning & Consulting', 75);

-- =====================================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================================

-- Enable RLS on both tables
ALTER TABLE collaboration_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_tags ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS POLICIES: COLLABORATION_CATEGORIES
-- =====================================================================

-- Policy: Allow SELECT to all authenticated and anonymous users (public taxonomy)
CREATE POLICY "Categories viewable by everyone"
  ON collaboration_categories FOR SELECT
  TO authenticated, anon
  USING (TRUE);

-- Policy: Allow INSERT to super admins only
CREATE POLICY "Categories insertable by super admins"
  ON collaboration_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = TRUE
    )
  );

-- Policy: Allow UPDATE to super admins only
CREATE POLICY "Categories updatable by super admins"
  ON collaboration_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = TRUE
    )
  );

-- Policy: Allow DELETE to super admins only
CREATE POLICY "Categories deletable by super admins"
  ON collaboration_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = TRUE
    )
  );

-- =====================================================================
-- RLS POLICIES: COLLABORATION_TAGS
-- =====================================================================

-- Policy: Allow SELECT to all authenticated and anonymous users (public taxonomy)
CREATE POLICY "Tags viewable by everyone"
  ON collaboration_tags FOR SELECT
  TO authenticated, anon
  USING (TRUE);

-- Policy: Allow INSERT to super admins only
CREATE POLICY "Tags insertable by super admins"
  ON collaboration_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = TRUE
    )
  );

-- Policy: Allow UPDATE to super admins only
CREATE POLICY "Tags updatable by super admins"
  ON collaboration_tags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = TRUE
    )
  );

-- Policy: Allow DELETE to super admins only
CREATE POLICY "Tags deletable by super admins"
  ON collaboration_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM platform_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = TRUE
    )
  );

-- =====================================================================
-- VERIFICATION QUERY
-- =====================================================================
-- Verify migration success by showing counts and sample data

DO $$
DECLARE
  category_count INTEGER;
  tag_count INTEGER;
  active_tag_count INTEGER;
  have_tag_count INTEGER;
  need_tag_count INTEGER;
BEGIN
  -- Count categories
  SELECT COUNT(*) INTO category_count FROM collaboration_categories;
  
  -- Count all tags
  SELECT COUNT(*) INTO tag_count FROM collaboration_tags;
  
  -- Count active tags
  SELECT COUNT(*) INTO active_tag_count FROM collaboration_tags WHERE is_active = TRUE;
  
  -- Count tags per category
  SELECT COUNT(*) INTO have_tag_count FROM collaboration_tags WHERE category_key = 'collaboration_have';
  SELECT COUNT(*) INTO need_tag_count FROM collaboration_tags WHERE category_key = 'collaboration_need';
  
  -- Output verification results
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'COLLABORATION TAXONOMY MIGRATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Categories created: %', category_count;
  RAISE NOTICE 'Total tags created: %', tag_count;
  RAISE NOTICE 'Active tags: %', active_tag_count;
  RAISE NOTICE 'Tags in "We Offer" category: %', have_tag_count;
  RAISE NOTICE 'Tags in "We Need" category: %', need_tag_count;
  RAISE NOTICE '';
  
  -- Verify expected counts
  IF category_count != 2 THEN
    RAISE WARNING 'Expected 2 categories, found %', category_count;
  END IF;
  
  IF tag_count != 150 THEN
    RAISE WARNING 'Expected 150 tags (75 × 2 categories), found %', tag_count;
  END IF;
  
  IF have_tag_count != 75 THEN
    RAISE WARNING 'Expected 75 tags in "We Offer", found %', have_tag_count;
  END IF;
  
  IF need_tag_count != 75 THEN
    RAISE WARNING 'Expected 75 tags in "We Need", found %', need_tag_count;
  END IF;
  
  RAISE NOTICE 'Sample data by category:';
  RAISE NOTICE '----------------------------------------';
END $$;

-- Show tag counts by category
SELECT 
  cc.key,
  cc.label AS category,
  COUNT(ct.id) AS tag_count,
  COUNT(CASE WHEN ct.is_active THEN 1 END) AS active_tags
FROM collaboration_categories cc
LEFT JOIN collaboration_tags ct ON ct.category_key = cc.key
GROUP BY cc.key, cc.label, cc.sort_order
ORDER BY cc.sort_order;

-- Show first 10 tags from each category as sample
SELECT 
  ct.category_key,
  ct.slug,
  ct.label,
  ct.is_active,
  ct.sort_order
FROM collaboration_tags ct
WHERE ct.category_key = 'collaboration_have'
ORDER BY ct.sort_order
LIMIT 10;

-- =====================================================================
-- MIGRATION NOTES
-- =====================================================================
-- After running this migration:
--
-- 1. STRUCTURE:
--    - 2 categories: "collaboration_have" (We Offer) and "collaboration_need" (We Need)
--    - 150 tag entries: All 75 tags exist in BOTH categories
--    - Same tag slugs used in both categories (composite unique constraint)
--
-- 2. BACKWARD COMPATIBILITY:
--    - Churches table still has collaboration_have and collaboration_need
--      as text[] columns containing tag slugs
--    - Frontend can query collaboration_tags table to get labels/categories
--    - Existing church records with tag slugs remain valid
--
-- 3. COMPONENT BEHAVIOR:
--    - ChurchCollaborationEditor finds category by key "collaboration_have" / "collaboration_need"
--    - FilterSidebar uses same category lookup
--    - Both components get all 75 active tags from their respective category
--    - This matches original COLLAB_HAVE_OPTIONS = COLLAB_NEED_OPTIONS behavior
--
-- 4. TAG MANAGEMENT:
--    - Super admins can soft-delete tags (set is_active = FALSE on both entries)
--    - Soft-deleted tags hidden from UI but preserved for data integrity
--    - Categories cascade delete to tags (use with caution)
--    - Composite unique constraint prevents duplicate slugs within same category
--
-- 5. PERFORMANCE:
--    - Indexes support efficient filtering by category and active status
--    - Composite index optimizes common queries (category + active + slug)
--    - RLS policies allow public read access (no auth overhead)
--
-- =====================================================================
