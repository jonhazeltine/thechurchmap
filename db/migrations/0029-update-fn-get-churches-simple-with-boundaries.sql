-- Update function to include boundary_ids
CREATE OR REPLACE FUNCTION fn_get_churches_simple()
RETURNS TABLE (
  id uuid,
  name text,
  denomination text,
  address text,
  phone text,
  email text,
  website text,
  description text,
  collaboration_have text[],
  collaboration_need text[],
  approved boolean,
  created_at timestamptz,
  boundary_ids uuid[],
  location json
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.denomination,
    c.address,
    c.phone,
    c.email,
    c.website,
    c.description,
    c.collaboration_have,
    c.collaboration_need,
    c.approved,
    c.created_at,
    c.boundary_ids,
    ST_AsGeoJSON(c.location::geometry)::json as location
  FROM churches c
  WHERE c.approved = true
  ORDER BY c.name;
END;
$$;
