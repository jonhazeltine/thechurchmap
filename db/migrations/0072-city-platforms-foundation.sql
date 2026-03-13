-- =====================================================================
-- CITY PLATFORMS FOUNDATION
-- =====================================================================
-- Migration 0072: Multi-city platform architecture
-- 
-- This migration establishes the foundation for supporting multiple
-- city-based platforms within a single global system.
--
-- Key tables:
-- - city_platforms: Core entity for each city network
-- - city_platform_boundaries: Links platforms to geographic boundaries
-- - city_platform_churches: Links churches to platforms with status
-- - city_platform_users: Role-based access per platform
--
-- Also extends: posts, prayers with optional city_platform_id
-- =====================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. CITY PLATFORMS TABLE
-- =====================================================================
-- Core entity representing a city-based ministry network

CREATE TABLE IF NOT EXISTS city_platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Primary boundary (the main city)
  primary_boundary_id UUID REFERENCES boundaries(id) ON DELETE SET NULL,
  
  -- Computed/cached geometry union of all included boundaries
  -- Updated when boundaries are added/removed
  combined_geometry GEOGRAPHY(MULTIPOLYGON, 4326),
  
  -- Map viewport defaults
  default_center_lat DOUBLE PRECISION,
  default_center_lng DOUBLE PRECISION,
  default_zoom INTEGER DEFAULT 11,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false, -- Whether visible in public directory
  
  -- Ownership
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  logo_url TEXT,
  banner_url TEXT,
  website TEXT,
  contact_email TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

-- Indexes for city_platforms
CREATE INDEX IF NOT EXISTS idx_city_platforms_slug ON city_platforms(slug);
CREATE INDEX IF NOT EXISTS idx_city_platforms_active ON city_platforms(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_city_platforms_primary_boundary ON city_platforms(primary_boundary_id);
CREATE INDEX IF NOT EXISTS idx_city_platforms_combined_geometry ON city_platforms USING GIST(combined_geometry);

-- =====================================================================
-- 2. CITY PLATFORM BOUNDARIES TABLE
-- =====================================================================
-- Links platforms to multiple boundaries (city + ZIPs + counties)

CREATE TYPE boundary_role AS ENUM ('primary', 'included', 'excluded');

-- Note: 'excluded' role allows marking boundaries that should be cut out from the platform area

CREATE TABLE IF NOT EXISTS city_platform_boundaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city_platform_id UUID NOT NULL REFERENCES city_platforms(id) ON DELETE CASCADE,
  boundary_id UUID NOT NULL REFERENCES boundaries(id) ON DELETE CASCADE,
  
  -- Role of this boundary in the platform
  role boundary_role NOT NULL DEFAULT 'included',
  
  -- Order for display purposes
  sort_order INTEGER DEFAULT 0,
  
  -- Timestamps
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Prevent duplicate boundary-platform links
  UNIQUE(city_platform_id, boundary_id)
);

-- Indexes for city_platform_boundaries
CREATE INDEX IF NOT EXISTS idx_cpb_platform ON city_platform_boundaries(city_platform_id);
CREATE INDEX IF NOT EXISTS idx_cpb_boundary ON city_platform_boundaries(boundary_id);
CREATE INDEX IF NOT EXISTS idx_cpb_role ON city_platform_boundaries(role);

-- =====================================================================
-- 3. CITY PLATFORM CHURCHES TABLE
-- =====================================================================
-- Links churches to platforms with visibility and claim status

CREATE TYPE church_platform_status AS ENUM ('visible', 'hidden', 'featured', 'pending');

CREATE TABLE IF NOT EXISTS city_platform_churches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city_platform_id UUID NOT NULL REFERENCES city_platforms(id) ON DELETE CASCADE,
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  
  -- Visibility status within the platform
  status church_platform_status NOT NULL DEFAULT 'visible',
  
  -- Claim status
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  
  -- Invitation tracking
  invite_sent_at TIMESTAMPTZ,
  invite_sent_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_token TEXT, -- For claim verification
  
  -- Timestamps
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate church-platform links
  UNIQUE(city_platform_id, church_id)
);

-- Indexes for city_platform_churches
CREATE INDEX IF NOT EXISTS idx_cpc_platform ON city_platform_churches(city_platform_id);
CREATE INDEX IF NOT EXISTS idx_cpc_church ON city_platform_churches(church_id);
CREATE INDEX IF NOT EXISTS idx_cpc_status ON city_platform_churches(status);
CREATE INDEX IF NOT EXISTS idx_cpc_claimed ON city_platform_churches(is_claimed) WHERE is_claimed = true;
CREATE INDEX IF NOT EXISTS idx_cpc_invite_token ON city_platform_churches(invite_token) WHERE invite_token IS NOT NULL;

-- =====================================================================
-- 4. CITY PLATFORM USERS TABLE
-- =====================================================================
-- Role-based access control per platform

CREATE TYPE city_platform_role AS ENUM (
  'super_admin',     -- Global authority (stored here for completeness but also in profiles)
  'platform_owner',  -- Owns the city platform
  'platform_admin',  -- Administers the city platform
  'church_admin',    -- Manages a specific church within the platform
  'member'           -- General participant
);

CREATE TABLE IF NOT EXISTS city_platform_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city_platform_id UUID REFERENCES city_platforms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role within this platform
  role city_platform_role NOT NULL,
  
  -- For church_admin role, which church they admin
  church_id UUID REFERENCES churches(id) ON DELETE CASCADE,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  -- super_admin doesn't need a city_platform_id (they're global)
  -- church_admin must have a church_id
  CONSTRAINT valid_super_admin CHECK (
    role != 'super_admin' OR city_platform_id IS NULL
  ),
  CONSTRAINT valid_church_admin CHECK (
    role != 'church_admin' OR church_id IS NOT NULL
  ),
  CONSTRAINT valid_platform_role CHECK (
    role IN ('super_admin') OR city_platform_id IS NOT NULL
  )
);

-- Indexes for city_platform_users
CREATE INDEX IF NOT EXISTS idx_cpu_platform ON city_platform_users(city_platform_id);
CREATE INDEX IF NOT EXISTS idx_cpu_user ON city_platform_users(user_id);
CREATE INDEX IF NOT EXISTS idx_cpu_role ON city_platform_users(role);
CREATE INDEX IF NOT EXISTS idx_cpu_church ON city_platform_users(church_id) WHERE church_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpu_super_admin ON city_platform_users(user_id) WHERE role = 'super_admin';

-- Unique constraint: one role per user per platform (except super_admin which is global)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cpu_unique_platform_user 
  ON city_platform_users(city_platform_id, user_id, role) 
  WHERE city_platform_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cpu_unique_super_admin
  ON city_platform_users(user_id)
  WHERE role = 'super_admin';

-- =====================================================================
-- 5. EXTEND POSTS TABLE
-- =====================================================================
-- Add optional city_platform_id for scoping posts to platforms

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'city_platform_id'
  ) THEN
    ALTER TABLE posts ADD COLUMN city_platform_id UUID REFERENCES city_platforms(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_posts_city_platform ON posts(city_platform_id) WHERE city_platform_id IS NOT NULL;
  END IF;
END $$;

-- =====================================================================
-- 6. EXTEND PRAYERS TABLE
-- =====================================================================
-- Add optional city_platform_id for scoping prayers to platforms

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'prayers' AND column_name = 'city_platform_id'
  ) THEN
    ALTER TABLE prayers ADD COLUMN city_platform_id UUID REFERENCES city_platforms(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_prayers_city_platform ON prayers(city_platform_id) WHERE city_platform_id IS NOT NULL;
  END IF;
END $$;

-- =====================================================================
-- 7. UPDATE BOUNDARIES TABLE - Add parent_id for hierarchy
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boundaries' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE boundaries ADD COLUMN parent_id UUID REFERENCES boundaries(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_boundaries_parent ON boundaries(parent_id) WHERE parent_id IS NOT NULL;
  END IF;
  
  -- Add state_fips column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boundaries' AND column_name = 'state_fips'
  ) THEN
    ALTER TABLE boundaries ADD COLUMN state_fips VARCHAR(2);
    CREATE INDEX IF NOT EXISTS idx_boundaries_state_fips ON boundaries(state_fips) WHERE state_fips IS NOT NULL;
  END IF;
  
  -- Add county_fips column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boundaries' AND column_name = 'county_fips'
  ) THEN
    ALTER TABLE boundaries ADD COLUMN county_fips VARCHAR(5);
    CREATE INDEX IF NOT EXISTS idx_boundaries_county_fips ON boundaries(county_fips) WHERE county_fips IS NOT NULL;
  END IF;
END $$;

-- =====================================================================
-- 8. ROW LEVEL SECURITY
-- =====================================================================

-- Enable RLS on new tables
ALTER TABLE city_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_platform_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_platform_churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_platform_users ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 8.1 CITY PLATFORMS POLICIES
-- =====================================================================

-- Public can read active/public platforms
CREATE POLICY "city_platforms_public_read" ON city_platforms
  FOR SELECT USING (is_active = true AND is_public = true);

-- Authenticated users can read platforms they belong to or are admin of
CREATE POLICY "city_platforms_member_read" ON city_platforms
  FOR SELECT TO authenticated USING (
    -- Super admins can see all
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    -- Platform members can see their platforms
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platforms.id
        AND cpu.user_id = auth.uid()
        AND cpu.is_active = true
    )
    -- Active public platforms are visible
    OR (is_active = true AND is_public = true)
  );

-- Only super admins can INSERT new platforms
CREATE POLICY "city_platforms_super_admin_insert" ON city_platforms
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- Platform owners and super admins can UPDATE
CREATE POLICY "city_platforms_owner_update" ON city_platforms
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platforms.id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platforms.id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- Only super admins can DELETE platforms
CREATE POLICY "city_platforms_super_admin_delete" ON city_platforms
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- =====================================================================
-- 8.2 CITY PLATFORM BOUNDARIES POLICIES
-- =====================================================================

-- Authenticated users can read boundaries for their platforms
CREATE POLICY "cpb_member_read" ON city_platform_boundaries
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_boundaries.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.is_active = true
    )
  );

-- Platform admins and super admins can INSERT
CREATE POLICY "cpb_admin_insert" ON city_platform_boundaries
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_boundaries.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- Platform admins and super admins can UPDATE
CREATE POLICY "cpb_admin_update" ON city_platform_boundaries
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_boundaries.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_boundaries.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- Platform admins and super admins can DELETE
CREATE POLICY "cpb_admin_delete" ON city_platform_boundaries
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_boundaries.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- =====================================================================
-- 8.3 CITY PLATFORM CHURCHES POLICIES
-- =====================================================================

-- Authenticated users can read churches in their platforms
CREATE POLICY "cpc_member_read" ON city_platform_churches
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_churches.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.is_active = true
    )
  );

-- Platform admins and super admins can INSERT
CREATE POLICY "cpc_admin_insert" ON city_platform_churches
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_churches.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- Platform admins, super admins, and church admins can UPDATE
CREATE POLICY "cpc_admin_update" ON city_platform_churches
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_churches.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    -- Church admins can update their own church's status
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.church_id = city_platform_churches.church_id
        AND cpu.user_id = auth.uid()
        AND cpu.role = 'church_admin'
        AND cpu.is_active = true
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_churches.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.church_id = city_platform_churches.church_id
        AND cpu.user_id = auth.uid()
        AND cpu.role = 'church_admin'
        AND cpu.is_active = true
    )
  );

-- Platform admins and super admins can DELETE
CREATE POLICY "cpc_admin_delete" ON city_platform_churches
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = city_platform_churches.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- =====================================================================
-- 8.4 CITY PLATFORM USERS POLICIES
-- =====================================================================

-- Users can read their own records; admins can read platform members
CREATE POLICY "cpu_self_read" ON city_platform_users
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu2
      WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
        AND cpu2.user_id = auth.uid()
        AND cpu2.role IN ('platform_owner', 'platform_admin')
        AND cpu2.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu2
      WHERE cpu2.user_id = auth.uid()
        AND cpu2.role = 'super_admin'
        AND cpu2.is_active = true
    )
  );

-- Platform admins can INSERT members, super admins can insert any role
-- Church_admin role requires church_id to be a church within the same platform
CREATE POLICY "cpu_admin_insert" ON city_platform_users
  FOR INSERT TO authenticated WITH CHECK (
    -- Super admins can insert any role including other super admins
    EXISTS (
      SELECT 1 FROM city_platform_users cpu2
      WHERE cpu2.user_id = auth.uid()
        AND cpu2.role = 'super_admin'
        AND cpu2.is_active = true
    )
    -- Platform owners can insert admins and lower roles (not super_admin or platform_owner)
    -- Church_admin must have valid church_id from same platform
    OR (
      city_platform_users.role IN ('platform_admin', 'member')
      AND EXISTS (
        SELECT 1 FROM city_platform_users cpu2
        WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
          AND cpu2.user_id = auth.uid()
          AND cpu2.role = 'platform_owner'
          AND cpu2.is_active = true
      )
    )
    -- Platform owners can insert church_admin if church belongs to platform
    OR (
      city_platform_users.role = 'church_admin'
      AND city_platform_users.church_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM city_platform_users cpu2
        WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
          AND cpu2.user_id = auth.uid()
          AND cpu2.role = 'platform_owner'
          AND cpu2.is_active = true
      )
      AND EXISTS (
        SELECT 1 FROM city_platform_churches cpc
        WHERE cpc.city_platform_id = city_platform_users.city_platform_id
          AND cpc.church_id = city_platform_users.church_id
          AND cpc.status IN ('visible', 'featured')
      )
    )
    -- Platform admins can invite members only
    OR (
      city_platform_users.role = 'member'
      AND EXISTS (
        SELECT 1 FROM city_platform_users cpu2
        WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
          AND cpu2.user_id = auth.uid()
          AND cpu2.role = 'platform_admin'
          AND cpu2.is_active = true
      )
    )
    -- Platform admins can invite church_admins if church belongs to platform
    OR (
      city_platform_users.role = 'church_admin'
      AND city_platform_users.church_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM city_platform_users cpu2
        WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
          AND cpu2.user_id = auth.uid()
          AND cpu2.role = 'platform_admin'
          AND cpu2.is_active = true
      )
      AND EXISTS (
        SELECT 1 FROM city_platform_churches cpc
        WHERE cpc.city_platform_id = city_platform_users.city_platform_id
          AND cpc.church_id = city_platform_users.church_id
          AND cpc.status IN ('visible', 'featured')
      )
    )
  );

-- Admins can UPDATE roles within their scope
-- Church_admin role requires church_id to be a church within the same platform
CREATE POLICY "cpu_admin_update" ON city_platform_users
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu2
      WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
        AND cpu2.user_id = auth.uid()
        AND cpu2.role IN ('platform_owner', 'platform_admin')
        AND cpu2.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu2
      WHERE cpu2.user_id = auth.uid()
        AND cpu2.role = 'super_admin'
        AND cpu2.is_active = true
    )
  ) WITH CHECK (
    -- Super admins can update to any role
    EXISTS (
      SELECT 1 FROM city_platform_users cpu2
      WHERE cpu2.user_id = auth.uid()
        AND cpu2.role = 'super_admin'
        AND cpu2.is_active = true
    )
    -- Platform owners can update to platform_admin or member
    OR (
      city_platform_users.role IN ('platform_admin', 'member')
      AND EXISTS (
        SELECT 1 FROM city_platform_users cpu2
        WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
          AND cpu2.user_id = auth.uid()
          AND cpu2.role = 'platform_owner'
          AND cpu2.is_active = true
      )
    )
    -- Platform owners can update to church_admin if church belongs to platform
    OR (
      city_platform_users.role = 'church_admin'
      AND city_platform_users.church_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM city_platform_users cpu2
        WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
          AND cpu2.user_id = auth.uid()
          AND cpu2.role = 'platform_owner'
          AND cpu2.is_active = true
      )
      AND EXISTS (
        SELECT 1 FROM city_platform_churches cpc
        WHERE cpc.city_platform_id = city_platform_users.city_platform_id
          AND cpc.church_id = city_platform_users.church_id
          AND cpc.status IN ('visible', 'featured')
      )
    )
    -- Platform admins can update to member only
    OR (
      city_platform_users.role = 'member'
      AND EXISTS (
        SELECT 1 FROM city_platform_users cpu2
        WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
          AND cpu2.user_id = auth.uid()
          AND cpu2.role = 'platform_admin'
          AND cpu2.is_active = true
      )
    )
    -- Platform admins can update to church_admin if church belongs to platform
    OR (
      city_platform_users.role = 'church_admin'
      AND city_platform_users.church_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM city_platform_users cpu2
        WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
          AND cpu2.user_id = auth.uid()
          AND cpu2.role = 'platform_admin'
          AND cpu2.is_active = true
      )
      AND EXISTS (
        SELECT 1 FROM city_platform_churches cpc
        WHERE cpc.city_platform_id = city_platform_users.city_platform_id
          AND cpc.church_id = city_platform_users.church_id
          AND cpc.status IN ('visible', 'featured')
      )
    )
  );

-- Platform owners and super admins can DELETE users
CREATE POLICY "cpu_admin_delete" ON city_platform_users
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu2
      WHERE cpu2.city_platform_id = city_platform_users.city_platform_id
        AND cpu2.user_id = auth.uid()
        AND cpu2.role IN ('platform_owner', 'platform_admin')
        AND cpu2.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu2
      WHERE cpu2.user_id = auth.uid()
        AND cpu2.role = 'super_admin'
        AND cpu2.is_active = true
    )
  );

-- =====================================================================
-- 9. HELPER FUNCTIONS
-- =====================================================================

-- Function to check if user has a specific role for a platform
CREATE OR REPLACE FUNCTION fn_user_has_platform_role(
  p_user_id UUID,
  p_platform_id UUID,
  p_roles city_platform_role[]
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM city_platform_users cpu
    WHERE cpu.user_id = p_user_id
      AND (cpu.city_platform_id = p_platform_id OR cpu.role = 'super_admin')
      AND cpu.role = ANY(p_roles)
      AND cpu.is_active = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION fn_is_super_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM city_platform_users cpu
    WHERE cpu.user_id = p_user_id
      AND cpu.role = 'super_admin'
      AND cpu.is_active = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get all platforms a user has access to
CREATE OR REPLACE FUNCTION fn_get_user_platforms(p_user_id UUID)
RETURNS TABLE(
  platform_id UUID,
  platform_name TEXT,
  platform_slug TEXT,
  user_role city_platform_role,
  is_super_admin BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cp.id as platform_id,
    cp.name as platform_name,
    cp.slug as platform_slug,
    cpu.role as user_role,
    (cpu.role = 'super_admin') as is_super_admin
  FROM city_platform_users cpu
  LEFT JOIN city_platforms cp ON cpu.city_platform_id = cp.id
  WHERE cpu.user_id = p_user_id
    AND cpu.is_active = true
  ORDER BY 
    CASE WHEN cpu.role = 'super_admin' THEN 0 ELSE 1 END,
    cp.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_user_has_platform_role(UUID, UUID, city_platform_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_user_platforms(UUID) TO authenticated;

-- =====================================================================
-- 10. UPDATED_AT TRIGGERS
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER city_platforms_updated_at
  BEFORE UPDATE ON city_platforms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER city_platform_churches_updated_at
  BEFORE UPDATE ON city_platform_churches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER city_platform_users_updated_at
  BEFORE UPDATE ON city_platform_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- COMMENTS
-- =====================================================================

COMMENT ON TABLE city_platforms IS 'Core entity for city-based ministry networks. Each platform represents a geographic region with its own churches, feed, and community.';
COMMENT ON TABLE city_platform_boundaries IS 'Links platforms to geographic boundaries. A platform can include its primary city plus additional ZIPs and counties.';
COMMENT ON TABLE city_platform_churches IS 'Links churches to platforms with visibility and claim status. Churches can exist in multiple platforms but are only claimed once.';
COMMENT ON TABLE city_platform_users IS 'Role-based access control. Super admins are global, other roles are scoped to specific platforms.';
