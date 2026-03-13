-- Function to get churches with properly converted coordinates for verification
CREATE OR REPLACE FUNCTION fn_get_churches_for_verification(p_church_ids uuid[])
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  website text,
  email text,
  denomination text,
  description text,
  profile_photo_url text,
  place_calling_id uuid,
  verification_status text,
  google_place_id text,
  source text,
  location json
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.address,
    c.city,
    c.state,
    c.zip,
    c.phone,
    c.website,
    c.email,
    c.denomination,
    c.description,
    c.profile_photo_url,
    c.place_calling_id,
    c.verification_status,
    c.google_place_id,
    c.source,
    CASE 
      WHEN c.location IS NOT NULL 
      THEN ST_AsGeoJSON(c.location::geometry)::json 
      ELSE NULL 
    END as location
  FROM churches c
  WHERE c.id = ANY(p_church_ids);
END;
$$;
