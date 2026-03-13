-- =====================================================================
-- GRAND RAPIDS CITY PLATFORM INITIALIZATION
-- =====================================================================
-- Migration 0073: Create Grand Rapids as the first city platform
-- 
-- This migration:
-- 1. Creates the Grand Rapids city platform
-- 2. Links Kent County as the primary boundary
-- 3. Imports existing Kent County churches into the platform
-- 4. Assigns jhazeltine@gmail.com as super_admin
-- 5. Migrates existing posts/prayers to the platform
-- =====================================================================

-- =====================================================================
-- 1. CREATE GRAND RAPIDS CITY PLATFORM
-- =====================================================================

-- First, get the Kent County boundary ID
DO $$
DECLARE
  v_kent_boundary_id UUID;
  v_platform_id UUID;
  v_super_admin_user_id UUID;
  v_grand_rapids_place_id UUID;
  v_church_count INTEGER;
BEGIN
  -- Find Kent County boundary
  SELECT id INTO v_kent_boundary_id
  FROM boundaries
  WHERE name ILIKE '%kent%' 
    AND type = 'county'
  LIMIT 1;
  
  -- Find Grand Rapids place boundary (for center coordinates)
  SELECT id INTO v_grand_rapids_place_id
  FROM boundaries
  WHERE name ILIKE '%grand rapids%' 
    AND type = 'place'
  LIMIT 1;
  
  -- Check if platform already exists
  IF EXISTS (SELECT 1 FROM city_platforms WHERE slug = 'grand-rapids') THEN
    RAISE NOTICE 'Grand Rapids platform already exists, skipping creation';
    RETURN;
  END IF;
  
  -- Create the Grand Rapids platform
  INSERT INTO city_platforms (
    name,
    slug,
    description,
    primary_boundary_id,
    default_center_lat,
    default_center_lng,
    default_zoom,
    is_active,
    is_public
  ) VALUES (
    'Grand Rapids',
    'grand-rapids',
    'Grand Rapids and surrounding Kent County area - the first Kingdom Map city platform',
    v_kent_boundary_id,
    42.9634,  -- Grand Rapids center lat
    -85.6681, -- Grand Rapids center lng
    11,
    true,
    true
  )
  RETURNING id INTO v_platform_id;
  
  RAISE NOTICE 'Created Grand Rapids platform with ID: %', v_platform_id;
  
  -- Link Kent County as primary boundary
  IF v_kent_boundary_id IS NOT NULL THEN
    INSERT INTO city_platform_boundaries (
      city_platform_id,
      boundary_id,
      role,
      sort_order
    ) VALUES (
      v_platform_id,
      v_kent_boundary_id,
      'primary',
      0
    );
    RAISE NOTICE 'Linked Kent County as primary boundary';
  END IF;
  
  -- Link Grand Rapids place if found
  IF v_grand_rapids_place_id IS NOT NULL THEN
    INSERT INTO city_platform_boundaries (
      city_platform_id,
      boundary_id,
      role,
      sort_order
    ) VALUES (
      v_platform_id,
      v_grand_rapids_place_id,
      'included',
      1
    )
    ON CONFLICT (city_platform_id, boundary_id) DO NOTHING;
    RAISE NOTICE 'Linked Grand Rapids place boundary';
  END IF;
  
  -- Import all Kent County churches into the platform
  INSERT INTO city_platform_churches (
    city_platform_id,
    church_id,
    status,
    is_claimed,
    claimed_by_user_id
  )
  SELECT 
    v_platform_id,
    c.id,
    'visible'::church_platform_status,
    c.claimed_by IS NOT NULL,
    c.claimed_by
  FROM churches c
  WHERE c.county_fips = '26081'  -- Kent County FIPS
    OR c.county_fips IS NULL  -- Include churches without county_fips (manual entries)
  ON CONFLICT (city_platform_id, church_id) DO NOTHING;
  
  GET DIAGNOSTICS v_church_count = ROW_COUNT;
  RAISE NOTICE 'Imported % churches into Grand Rapids platform', v_church_count;
  
  -- Migrate existing posts to the platform
  UPDATE posts 
  SET city_platform_id = v_platform_id
  WHERE city_platform_id IS NULL;
  
  -- Migrate existing prayers to the platform
  UPDATE prayers 
  SET city_platform_id = v_platform_id
  WHERE city_platform_id IS NULL
    AND church_id IS NOT NULL;
  
  RAISE NOTICE 'Grand Rapids city platform initialization complete!';
END $$;

-- =====================================================================
-- 2. ASSIGN SUPER ADMIN
-- =====================================================================

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Find the user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'jhazeltine@gmail.com'
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User jhazeltine@gmail.com not found. Super admin will need to be assigned after user registers.';
    RETURN;
  END IF;
  
  -- Check if already super admin
  IF EXISTS (
    SELECT 1 FROM city_platform_users 
    WHERE user_id = v_user_id AND role = 'super_admin'
  ) THEN
    RAISE NOTICE 'User is already super_admin, skipping';
    RETURN;
  END IF;
  
  -- Insert super admin record (no city_platform_id for super admin)
  INSERT INTO city_platform_users (
    city_platform_id,
    user_id,
    role,
    is_active
  ) VALUES (
    NULL,  -- Super admin is global, not tied to a platform
    v_user_id,
    'super_admin',
    true
  );
  
  RAISE NOTICE 'Assigned super_admin role to jhazeltine@gmail.com';
END $$;

-- =====================================================================
-- 3. ALSO MAKE SUPER ADMIN THE PLATFORM OWNER OF GRAND RAPIDS
-- =====================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_platform_id UUID;
BEGIN
  -- Find the user
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'jhazeltine@gmail.com'
  LIMIT 1;
  
  -- Find Grand Rapids platform
  SELECT id INTO v_platform_id
  FROM city_platforms
  WHERE slug = 'grand-rapids'
  LIMIT 1;
  
  IF v_user_id IS NULL OR v_platform_id IS NULL THEN
    RAISE NOTICE 'User or platform not found, skipping platform owner assignment';
    RETURN;
  END IF;
  
  -- Assign as platform owner
  INSERT INTO city_platform_users (
    city_platform_id,
    user_id,
    role,
    is_active
  ) VALUES (
    v_platform_id,
    v_user_id,
    'platform_owner',
    true
  )
  ON CONFLICT DO NOTHING;
  
  -- Update the platform's created_by
  UPDATE city_platforms 
  SET created_by_user_id = v_user_id
  WHERE id = v_platform_id;
  
  RAISE NOTICE 'Assigned platform_owner role to jhazeltine@gmail.com for Grand Rapids';
END $$;

-- =====================================================================
-- 4. SUMMARY QUERY
-- =====================================================================

-- Run this to verify the setup
SELECT 
  cp.name as platform_name,
  cp.slug,
  cp.is_active,
  (SELECT COUNT(*) FROM city_platform_churches cpc WHERE cpc.city_platform_id = cp.id) as church_count,
  (SELECT COUNT(*) FROM city_platform_users cpu WHERE cpu.city_platform_id = cp.id) as user_count,
  (SELECT COUNT(*) FROM city_platform_users cpu WHERE cpu.role = 'super_admin') as super_admin_count
FROM city_platforms cp;
