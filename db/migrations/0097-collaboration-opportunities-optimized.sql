-- Collaboration Opportunities - FIXED SRID VERSION
-- Fixes: Explicitly sets SRID 4326 when casting geography to geometry for intersection

-- Drop existing function
DROP FUNCTION IF EXISTS fn_get_collaboration_opportunities(UUID, INTEGER);

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
  v_church_location GEOGRAPHY;
  v_church_area_geom GEOMETRY;
BEGIN
  -- Get the requesting church's location and ministry area
  -- Cast to geometry with explicit SRID for intersection calculations
  SELECT 
    location,
    ST_SetSRID(primary_ministry_area::geometry, 4326),
    primary_ministry_area IS NOT NULL
  INTO v_church_location, v_church_area_geom, v_has_ministry_area
  FROM churches WHERE id = p_church_id;

  -- Get the requesting church's callings
  SELECT ARRAY_AGG(c.type) INTO v_church_callings
  FROM church_calling cc
  JOIN callings c ON c.id = cc.calling_id
  WHERE cc.church_id = p_church_id;
  
  -- Get the requesting church's collaboration tags
  SELECT 
    COALESCE(collaboration_have, ARRAY[]::TEXT[]),
    COALESCE(collaboration_need, ARRAY[]::TEXT[])
  INTO v_church_have, v_church_need
  FROM churches WHERE id = p_church_id;
  
  RETURN QUERY
  WITH nearby_churches AS (
    -- STEP 1: Filter to churches within 10 miles FIRST
    SELECT 
      ch.id AS p_id,
      ch.name AS p_name,
      ch.city AS p_city,
      ch.profile_photo_url AS p_photo,
      ch.collaboration_have AS p_have,
      ch.collaboration_need AS p_need,
      ST_SetSRID(ch.primary_ministry_area::geometry, 4326) AS p_area_geom,
      ch.primary_ministry_area IS NOT NULL AS p_has_area,
      ROUND((ST_Distance(v_church_location, ch.location) / 1609.34)::NUMERIC, 2) AS dist_miles
    FROM churches ch
    WHERE ch.id != p_church_id
      AND ch.location IS NOT NULL
      AND ST_DWithin(v_church_location, ch.location, 16093)
      AND NOT EXISTS (
        SELECT 1 FROM active_collaborations ac
        WHERE ac.status IN ('pending', 'active')
        AND (
          (ac.church_a_id = p_church_id AND ac.church_b_id = ch.id)
          OR (ac.church_a_id = ch.id AND ac.church_b_id = p_church_id)
        )
      )
  ),
  with_overlap AS (
    -- STEP 2: Calculate overlap with matching SRIDs
    SELECT 
      nc.*,
      CASE 
        WHEN v_has_ministry_area AND nc.p_has_area 
             AND nc.p_area_geom IS NOT NULL AND v_church_area_geom IS NOT NULL
             AND ST_Intersects(v_church_area_geom, nc.p_area_geom)
        THEN ROUND(
          (ST_Area(ST_Intersection(v_church_area_geom, nc.p_area_geom)::geography) / 
           NULLIF(ST_Area(ST_Union(v_church_area_geom, nc.p_area_geom)::geography), 0)) * 100
        , 2)
        ELSE 0
      END AS overlap_pct,
      (
        SELECT ARRAY_AGG(c.type)
        FROM church_calling cc
        JOIN callings c ON c.id = cc.calling_id
        WHERE cc.church_id = nc.p_id
      ) AS p_callings
    FROM nearby_churches nc
  ),
  scored_partners AS (
    SELECT 
      wo.*,
      COALESCE(
        (SELECT COUNT(*) FROM unnest(v_church_callings) vc 
         WHERE vc = ANY(wo.p_callings)),
        0
      )::INTEGER AS shared_callings,
      (
        COALESCE(
          (SELECT COUNT(*) FROM unnest(COALESCE(wo.p_have, ARRAY[]::TEXT[])) ph 
           WHERE ph = ANY(v_church_need)),
          0
        ) +
        COALESCE(
          (SELECT COUNT(*) FROM unnest(COALESCE(wo.p_need, ARRAY[]::TEXT[])) pn 
           WHERE pn = ANY(v_church_have)),
          0
        )
      )::INTEGER AS collab_matches
    FROM with_overlap wo
  ),
  final_scores AS (
    SELECT 
      sp.*,
      (
        (COALESCE(sp.overlap_pct, 0) * 0.40) +
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
    WHERE COALESCE(sp.overlap_pct, 0) > 0 
       OR sp.dist_miles IS NULL 
       OR sp.dist_miles <= 3
  )
  SELECT 
    fs.p_id,
    fs.p_name,
    fs.p_city,
    fs.p_photo,
    COALESCE(fs.overlap_pct, 0),
    fs.shared_callings,
    fs.collab_matches,
    fs.dist_miles,
    ROUND(fs.raw_score, 1) AS total,
    jsonb_build_object(
      'area_overlap', ROUND(COALESCE(fs.overlap_pct, 0) * 0.40, 1),
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

GRANT EXECUTE ON FUNCTION fn_get_collaboration_opportunities TO authenticated, anon;

SELECT 'Fixed SRID collaboration opportunities function installed!' AS status;
