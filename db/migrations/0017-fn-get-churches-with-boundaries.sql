-- Migration: Update fn_get_churches to include boundary metadata
-- Sprint 1.6: Return boundary info for churches when needed

CREATE OR REPLACE FUNCTION fn_get_churches(
  search_name text DEFAULT NULL,
  filter_denomination text DEFAULT NULL,
  filter_calling_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(church_data)
  INTO result
  FROM (
    SELECT json_build_object(
      'id', c.id,
      'name', c.name,
      'address', c.address,
      'city', c.city,
      'state', c.state,
      'zip', c.zip,
      'phone', c.phone,
      'email', c.email,
      'website', c.website,
      'denomination', c.denomination,
      'pastor_name', c.pastor_name,
      'description', c.description,
      'location', CASE 
        WHEN c.location IS NOT NULL THEN 
          json_build_object(
            'type', 'Point',
            'coordinates', json_build_array(
              ST_X(c.location::geometry),
              ST_Y(c.location::geometry)
            )
          )
        ELSE NULL
      END,
      'callings', COALESCE((
        SELECT json_agg(json_build_object(
          'id', cl.id,
          'name', cl.name,
          'category', cl.category,
          'color', cl.color
        ))
        FROM callings cl
        INNER JOIN church_calling cc ON cc.calling_id = cl.id
        WHERE cc.church_id = c.id
      ), '[]'::json),
      'collaboration_have', c.collaboration_have,
      'collaboration_need', c.collaboration_need,
      'boundary_ids', c.boundary_ids
    ) AS church_data
    FROM churches c
    WHERE (search_name IS NULL OR c.name ILIKE '%' || search_name || '%')
      AND (filter_denomination IS NULL OR c.denomination = filter_denomination)
      AND (
        filter_calling_ids IS NULL 
        OR EXISTS (
          SELECT 1 
          FROM church_calling cc 
          WHERE cc.church_id = c.id 
            AND cc.calling_id = ANY(filter_calling_ids)
        )
      )
    ORDER BY c.name
  ) churches;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_churches(text, text, uuid[]) TO anon, authenticated;
