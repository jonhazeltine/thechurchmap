-- Active Collaborations Table (COMPLETE - Self-contained)
-- Includes all required helper functions
-- Drops existing functions first to avoid conflicts

-- ============================================
-- STEP 1: Drop existing functions if they exist
-- ============================================

DROP FUNCTION IF EXISTS fn_is_super_admin(UUID);
DROP FUNCTION IF EXISTS fn_current_user_is_super_admin();
DROP FUNCTION IF EXISTS fn_is_church_admin(UUID);
DROP FUNCTION IF EXISTS fn_calculate_ministry_area_overlap(UUID, UUID);
DROP FUNCTION IF EXISTS fn_calculate_church_distance(UUID, UUID);
DROP FUNCTION IF EXISTS fn_get_collaboration_opportunities(UUID, INTEGER);

-- ============================================
-- STEP 2: Create super admin helper functions
-- ============================================

CREATE OR REPLACE FUNCTION fn_is_super_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = check_user_id
    AND (raw_user_meta_data->>'super_admin')::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION fn_current_user_is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN fn_is_super_admin(auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION fn_is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_current_user_is_super_admin() TO authenticated;

-- ============================================
-- STEP 3: Create active_collaborations table
-- ============================================

CREATE TABLE IF NOT EXISTS active_collaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The two churches in the collaboration
  church_a_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  church_b_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  
  -- Ensure church_a_id < church_b_id to prevent duplicate pairs
  CONSTRAINT unique_church_pair UNIQUE (church_a_id, church_b_id),
  CONSTRAINT ordered_church_ids CHECK (church_a_id < church_b_id),
  
  -- Collaboration status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'ended')),
  
  -- Which church initiated the collaboration
  initiated_by UUID REFERENCES churches(id),
  
  -- Optional description of the collaboration
  description TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  -- Track which user created/modified
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_active_collaborations_church_a ON active_collaborations(church_a_id);
CREATE INDEX IF NOT EXISTS idx_active_collaborations_church_b ON active_collaborations(church_b_id);
CREATE INDEX IF NOT EXISTS idx_active_collaborations_status ON active_collaborations(status);

-- Enable RLS
ALTER TABLE active_collaborations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 4: Church admin helper function
-- ============================================

CREATE OR REPLACE FUNCTION fn_is_church_admin(p_church_id UUID) 
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admins can manage any church
  IF fn_current_user_is_super_admin() THEN
    RETURN TRUE;
  END IF;
  
  -- Platform admins can manage churches in their platforms
  IF EXISTS (
    SELECT 1 FROM city_platform_users cpu
    JOIN city_platform_churches cpc ON cpc.city_platform_id = cpu.city_platform_id
    WHERE cpu.user_id = auth.uid()
    AND cpu.role IN ('platform_owner', 'platform_admin')
    AND cpu.is_active = TRUE
    AND cpc.church_id = p_church_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Church admins can manage their specific church
  IF EXISTS (
    SELECT 1 FROM city_platform_users 
    WHERE user_id = auth.uid()
    AND church_id = p_church_id
    AND role = 'church_admin'
    AND is_active = TRUE
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION fn_is_church_admin TO authenticated;

-- ============================================
-- STEP 5: RLS Policies for active_collaborations
-- ============================================

DROP POLICY IF EXISTS "Anyone can view active collaborations" ON active_collaborations;
DROP POLICY IF EXISTS "Church admins can create collaborations" ON active_collaborations;
DROP POLICY IF EXISTS "Church admins can update their collaborations" ON active_collaborations;
DROP POLICY IF EXISTS "Super admins can delete collaborations" ON active_collaborations;

CREATE POLICY "Anyone can view active collaborations"
  ON active_collaborations FOR SELECT
  USING (true);

CREATE POLICY "Church admins can create collaborations"
  ON active_collaborations FOR INSERT
  WITH CHECK (fn_is_church_admin(initiated_by));

CREATE POLICY "Church admins can update their collaborations"
  ON active_collaborations FOR UPDATE
  USING (fn_is_church_admin(church_a_id) OR fn_is_church_admin(church_b_id));

CREATE POLICY "Super admins can delete collaborations"
  ON active_collaborations FOR DELETE
  USING (fn_current_user_is_super_admin());

-- ============================================
-- STEP 6: Ministry area overlap calculation
-- ============================================

CREATE OR REPLACE FUNCTION fn_calculate_ministry_area_overlap(
  p_church_a_id UUID,
  p_church_b_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_area_a GEOGRAPHY;
  v_area_b GEOGRAPHY;
  v_intersection_area FLOAT;
  v_union_area FLOAT;
  v_overlap_pct NUMERIC;
BEGIN
  SELECT primary_ministry_area::geography INTO v_area_a
  FROM churches WHERE id = p_church_a_id;
  
  SELECT primary_ministry_area::geography INTO v_area_b
  FROM churches WHERE id = p_church_b_id;
  
  IF v_area_a IS NULL OR v_area_b IS NULL THEN
    RETURN 0;
  END IF;
  
  v_intersection_area := ST_Area(
    ST_Intersection(v_area_a::geometry, v_area_b::geometry)::geography
  );
  
  v_union_area := ST_Area(
    ST_Union(v_area_a::geometry, v_area_b::geometry)::geography
  );
  
  IF v_union_area > 0 THEN
    v_overlap_pct := (v_intersection_area / v_union_area) * 100;
  ELSE
    v_overlap_pct := 0;
  END IF;
  
  RETURN ROUND(v_overlap_pct, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- STEP 7: Distance calculation
-- ============================================

CREATE OR REPLACE FUNCTION fn_calculate_church_distance(
  p_church_a_id UUID,
  p_church_b_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_point_a GEOGRAPHY;
  v_point_b GEOGRAPHY;
  v_distance_meters FLOAT;
BEGIN
  SELECT location INTO v_point_a
  FROM churches WHERE id = p_church_a_id;
  
  SELECT location INTO v_point_b
  FROM churches WHERE id = p_church_b_id;
  
  IF v_point_a IS NULL OR v_point_b IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_distance_meters := ST_Distance(v_point_a, v_point_b);
  
  RETURN ROUND((v_distance_meters / 1609.34)::NUMERIC, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- STEP 8: Collaboration opportunities scoring
-- ============================================

CREATE OR REPLACE FUNCTION fn_get_collaboration_opportunities(
  p_church_id UUID,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  partner_id UUID,
  partner_name TEXT,
  partner_city TEXT,
  partner_profile_photo_url TEXT,
  area_overlap_pct NUMERIC,
  shared_callings_count INTEGER,
  collab_matches_count INTEGER,
  distance_miles NUMERIC,
  total_score NUMERIC,
  score_breakdown JSONB
) AS $$
DECLARE
  v_church_callings TEXT[];
  v_church_have TEXT[];
  v_church_need TEXT[];
  v_has_ministry_area BOOLEAN;
BEGIN
  SELECT ARRAY_AGG(c.type) INTO v_church_callings
  FROM church_calling cc
  JOIN callings c ON c.id = cc.calling_id
  WHERE cc.church_id = p_church_id;
  
  SELECT 
    COALESCE(collaboration_have, ARRAY[]::TEXT[]),
    COALESCE(collaboration_need, ARRAY[]::TEXT[]),
    primary_ministry_area IS NOT NULL
  INTO v_church_have, v_church_need, v_has_ministry_area
  FROM churches WHERE id = p_church_id;
  
  RETURN QUERY
  WITH partner_data AS (
    SELECT 
      ch.id AS p_id,
      ch.name AS p_name,
      ch.city AS p_city,
      ch.profile_photo_url AS p_photo,
      ch.collaboration_have AS p_have,
      ch.collaboration_need AS p_need,
      ch.primary_ministry_area IS NOT NULL AS p_has_area,
      CASE 
        WHEN v_has_ministry_area AND ch.primary_ministry_area IS NOT NULL 
        THEN fn_calculate_ministry_area_overlap(p_church_id, ch.id)
        ELSE 0
      END AS overlap_pct,
      fn_calculate_church_distance(p_church_id, ch.id) AS dist_miles,
      (
        SELECT ARRAY_AGG(c.type)
        FROM church_calling cc
        JOIN callings c ON c.id = cc.calling_id
        WHERE cc.church_id = ch.id
      ) AS p_callings
    FROM churches ch
    WHERE ch.id != p_church_id
      AND NOT EXISTS (
        SELECT 1 FROM active_collaborations ac
        WHERE ac.status IN ('pending', 'active')
        AND (
          (ac.church_a_id = p_church_id AND ac.church_b_id = ch.id)
          OR (ac.church_a_id = ch.id AND ac.church_b_id = p_church_id)
        )
      )
  ),
  scored_partners AS (
    SELECT 
      pd.*,
      COALESCE(
        (SELECT COUNT(*) FROM unnest(v_church_callings) vc 
         WHERE vc = ANY(pd.p_callings)),
        0
      )::INTEGER AS shared_callings,
      (
        COALESCE(
          (SELECT COUNT(*) FROM unnest(COALESCE(pd.p_have, ARRAY[]::TEXT[])) ph 
           WHERE ph = ANY(v_church_need)),
          0
        ) +
        COALESCE(
          (SELECT COUNT(*) FROM unnest(COALESCE(pd.p_need, ARRAY[]::TEXT[])) pn 
           WHERE pn = ANY(v_church_have)),
          0
        )
      )::INTEGER AS collab_matches
    FROM partner_data pd
  ),
  final_scores AS (
    SELECT 
      sp.*,
      (
        (sp.overlap_pct * 0.40) +
        (LEAST(sp.shared_callings * 25, 100) * 0.25) +
        (LEAST(sp.collab_matches * 25, 100) * 0.20) +
        (CASE 
          WHEN sp.dist_miles IS NULL THEN 0
          WHEN sp.dist_miles <= 0 THEN 100
          WHEN sp.dist_miles >= 10 THEN 0
          ELSE (10 - sp.dist_miles) * 10
        END * 0.15)
      ) AS raw_score
    FROM scored_partners sp
    WHERE sp.overlap_pct > 0 
       OR sp.dist_miles IS NULL 
       OR sp.dist_miles <= 3
  )
  SELECT 
    fs.p_id,
    fs.p_name,
    fs.p_city,
    fs.p_photo,
    fs.overlap_pct,
    fs.shared_callings,
    fs.collab_matches,
    fs.dist_miles,
    ROUND(fs.raw_score, 1) AS total,
    jsonb_build_object(
      'area_overlap', ROUND(fs.overlap_pct * 0.40, 1),
      'callings', ROUND(LEAST(fs.shared_callings * 25, 100) * 0.25, 1),
      'have_need', ROUND(LEAST(fs.collab_matches * 25, 100) * 0.20, 1),
      'distance', ROUND(
        CASE 
          WHEN fs.dist_miles IS NULL THEN 0
          WHEN fs.dist_miles <= 0 THEN 100
          WHEN fs.dist_miles >= 10 THEN 0
          ELSE (10 - fs.dist_miles) * 10
        END * 0.15, 1
      )
    ) AS breakdown
  FROM final_scores fs
  WHERE fs.raw_score > 0 OR fs.shared_callings > 0 OR fs.collab_matches > 0
  ORDER BY fs.raw_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- STEP 9: Grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION fn_calculate_ministry_area_overlap TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_calculate_church_distance TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_get_collaboration_opportunities TO authenticated, anon;

-- Done!
SELECT 'Collaboration opportunities system installed successfully!' AS status;
