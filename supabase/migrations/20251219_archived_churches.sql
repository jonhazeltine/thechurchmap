-- Archive table for deleted duplicate churches
-- Preserves church data for recovery if needed (e.g., accidental deletion of Google imports)

CREATE TABLE IF NOT EXISTS archived_churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Original church ID for reference
  original_church_id UUID NOT NULL,
  
  -- Core church data (copied from churches table)
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  denomination TEXT,
  description TEXT,
  profile_photo_url TEXT,
  banner_image_url TEXT,
  
  -- Location data
  location GEOMETRY(Point, 4326),
  display_lat DOUBLE PRECISION,
  display_lng DOUBLE PRECISION,
  
  -- Verification & Quality data
  approved BOOLEAN DEFAULT false,
  verification_status TEXT,
  last_verified_at TIMESTAMPTZ,
  last_verified_source TEXT,
  data_quality_score INTEGER,
  data_quality_breakdown JSONB,
  google_place_id TEXT,
  google_match_confidence DOUBLE PRECISION,
  google_last_checked_at TIMESTAMPTZ,
  source TEXT,
  
  -- Collaboration & Partnership
  collaboration_have TEXT[],
  collaboration_need TEXT[],
  partnership_status TEXT,
  partnership_updated_at TIMESTAMPTZ,
  partnership_notes TEXT,
  
  -- Admin & System data
  created_by_user_id UUID,
  claimed_by UUID,
  primary_ministry_area GEOMETRY(Polygon, 4326),
  boundary_ids UUID[],
  
  -- Original timestamps
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ,
  
  -- Archive metadata
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_reason TEXT NOT NULL DEFAULT 'duplicate_resolution',
  cluster_signature TEXT,
  survivor_church_id UUID,
  city_platform_id UUID REFERENCES city_platforms(id) ON DELETE SET NULL,
  
  -- Notes for context
  notes TEXT
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_archived_churches_original_id 
ON archived_churches(original_church_id);

CREATE INDEX IF NOT EXISTS idx_archived_churches_platform 
ON archived_churches(city_platform_id);

CREATE INDEX IF NOT EXISTS idx_archived_churches_archived_at 
ON archived_churches(archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_archived_churches_reason 
ON archived_churches(archived_reason);

CREATE INDEX IF NOT EXISTS idx_archived_churches_cluster 
ON archived_churches(cluster_signature);

-- Enable RLS
ALTER TABLE archived_churches ENABLE ROW LEVEL SECURITY;

-- Platform admins and super admins can view archived churches
CREATE POLICY "Platform admins can view archived churches"
ON archived_churches FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM city_platform_users cpu
    WHERE cpu.city_platform_id = archived_churches.city_platform_id
    AND cpu.user_id = auth.uid()
    AND cpu.role IN ('platform_owner', 'platform_admin')
    AND cpu.is_active = true
  )
  OR (auth.jwt() -> 'user_metadata' ->> 'super_admin')::boolean = true
);

-- Platform admins can insert archived churches
CREATE POLICY "Platform admins can insert archived churches"
ON archived_churches FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM city_platform_users cpu
    WHERE cpu.city_platform_id = archived_churches.city_platform_id
    AND cpu.user_id = auth.uid()
    AND cpu.role IN ('platform_owner', 'platform_admin')
    AND cpu.is_active = true
  )
  OR (auth.jwt() -> 'user_metadata' ->> 'super_admin')::boolean = true
);

-- Platform admins can delete archived churches (for permanent cleanup if needed)
CREATE POLICY "Platform admins can delete archived churches"
ON archived_churches FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM city_platform_users cpu
    WHERE cpu.city_platform_id = archived_churches.city_platform_id
    AND cpu.user_id = auth.uid()
    AND cpu.role IN ('platform_owner', 'platform_admin')
    AND cpu.is_active = true
  )
  OR (auth.jwt() -> 'user_metadata' ->> 'super_admin')::boolean = true
);
