-- Track reviewed duplicate clusters so they don't reappear in the wizard
-- When an admin reviews a cluster and says "these are NOT duplicates, keep them all"
-- we store that decision here

CREATE TABLE IF NOT EXISTS reviewed_duplicate_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_platform_id UUID NOT NULL REFERENCES city_platforms(id) ON DELETE CASCADE,
  church_ids UUID[] NOT NULL,
  cluster_signature TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'keep_all',
  notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviewed_duplicate_clusters_platform 
ON reviewed_duplicate_clusters(city_platform_id);

CREATE INDEX IF NOT EXISTS idx_reviewed_duplicate_clusters_signature 
ON reviewed_duplicate_clusters(city_platform_id, cluster_signature);

ALTER TABLE reviewed_duplicate_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view reviewed clusters"
ON reviewed_duplicate_clusters FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM city_platform_users cpu
    WHERE cpu.city_platform_id = reviewed_duplicate_clusters.city_platform_id
    AND cpu.user_id = auth.uid()
    AND cpu.role IN ('platform_owner', 'platform_admin')
    AND cpu.is_active = true
  )
  OR (auth.jwt() -> 'user_metadata' ->> 'super_admin')::boolean = true
);

CREATE POLICY "Platform admins can insert reviewed clusters"
ON reviewed_duplicate_clusters FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM city_platform_users cpu
    WHERE cpu.city_platform_id = reviewed_duplicate_clusters.city_platform_id
    AND cpu.user_id = auth.uid()
    AND cpu.role IN ('platform_owner', 'platform_admin')
    AND cpu.is_active = true
  )
  OR (auth.jwt() -> 'user_metadata' ->> 'super_admin')::boolean = true
);

CREATE POLICY "Platform admins can delete reviewed clusters"
ON reviewed_duplicate_clusters FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM city_platform_users cpu
    WHERE cpu.city_platform_id = reviewed_duplicate_clusters.city_platform_id
    AND cpu.user_id = auth.uid()
    AND cpu.role IN ('platform_owner', 'platform_admin')
    AND cpu.is_active = true
  )
  OR (auth.jwt() -> 'user_metadata' ->> 'super_admin')::boolean = true
);
