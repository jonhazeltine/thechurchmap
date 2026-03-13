-- Function to get the centroid of ministry area intersection between two churches
-- Returns the centroid point for drawing collaboration lines to overlapping areas

CREATE OR REPLACE FUNCTION fn_get_ministry_intersection_centroid(
  p_church_a_id UUID,
  p_church_b_id UUID
) RETURNS TABLE (
  has_overlap BOOLEAN,
  centroid_lng FLOAT,
  centroid_lat FLOAT,
  overlap_area_sqm FLOAT
) AS $$
DECLARE
  v_area_a GEOMETRY;
  v_area_b GEOMETRY;
  v_intersection GEOMETRY;
  v_centroid GEOMETRY;
  v_area FLOAT;
BEGIN
  -- Get primary ministry areas as geometry (not geography) for intersection
  SELECT ST_SetSRID(primary_ministry_area::geometry, 4326) INTO v_area_a
  FROM churches WHERE id = p_church_a_id;
  
  SELECT ST_SetSRID(primary_ministry_area::geometry, 4326) INTO v_area_b
  FROM churches WHERE id = p_church_b_id;
  
  -- If either church has no ministry area, return no overlap
  IF v_area_a IS NULL OR v_area_b IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::FLOAT, NULL::FLOAT, 0::FLOAT;
    RETURN;
  END IF;
  
  -- Check if areas intersect
  IF NOT ST_Intersects(v_area_a, v_area_b) THEN
    RETURN QUERY SELECT FALSE, NULL::FLOAT, NULL::FLOAT, 0::FLOAT;
    RETURN;
  END IF;
  
  -- Calculate intersection
  v_intersection := ST_Intersection(v_area_a, v_area_b);
  
  -- Get centroid of intersection
  v_centroid := ST_Centroid(v_intersection);
  
  -- Calculate area in square meters
  v_area := ST_Area(v_intersection::geography);
  
  RETURN QUERY SELECT 
    TRUE,
    ST_X(v_centroid)::FLOAT,
    ST_Y(v_centroid)::FLOAT,
    v_area;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_ministry_intersection_centroid TO authenticated, anon;
