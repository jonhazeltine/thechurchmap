-- Search boundaries by name within a platform's geographic area
-- Uses SETOF boundaries to avoid column naming conflicts with PostgREST

DROP FUNCTION IF EXISTS fn_search_boundaries_in_platform(text, uuid, text, integer);

CREATE FUNCTION fn_search_boundaries_in_platform(p_query text, p_pid uuid, p_type text DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS SETOF boundaries
LANGUAGE sql SECURITY DEFINER AS
$$
  SELECT b.*
  FROM boundaries b,
       (SELECT COALESCE(
          cp.combined_geometry,
          (SELECT ST_Union(bb.geometry::geometry)::geography
           FROM city_platform_boundaries cpb
           JOIN boundaries bb ON bb.id = cpb.boundary_id
           WHERE cpb.city_platform_id = p_pid)
        ) AS geom
        FROM city_platforms cp WHERE cp.id = p_pid) AS pg
  WHERE b.name ILIKE ('%' || p_query || '%')
    AND pg.geom IS NOT NULL
    AND ST_Intersects(b.geometry, pg.geom)
    AND (p_type IS NULL OR b.type = p_type)
    AND b.type != 'census_tract'
  ORDER BY b.name
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION fn_search_boundaries_in_platform IS
'Searches boundaries by name within a platform''s geographic area.
Uses combined_geometry if set, otherwise unions the platform boundary geometries.
Excludes census tracts from user-facing search results.
Returns SETOF boundaries to avoid PostgREST column name conflicts.';
