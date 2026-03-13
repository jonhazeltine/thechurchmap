-- Migration 0053: Add banner_image_url to churches table
-- Allows churches to have a separate banner/cover image distinct from their logo

-- Step 1: Add the column
ALTER TABLE public.churches
ADD COLUMN IF NOT EXISTS banner_image_url text;

-- Step 2: Drop existing functions (required when changing return type)
DROP FUNCTION IF EXISTS fn_get_churches_simple();
DROP FUNCTION IF EXISTS fn_get_churches_simple(uuid, text[], text[], text[]);
DROP FUNCTION IF EXISTS fn_get_church_by_id(uuid);

-- Step 3: Recreate fn_get_churches_simple with banner_image_url
CREATE OR REPLACE FUNCTION fn_get_churches_simple(
  p_boundary_id uuid DEFAULT NULL,
  p_collab_have text[] DEFAULT NULL,
  p_collab_need text[] DEFAULT NULL,
  p_calling_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  state text,
  zip text,
  denomination text,
  website text,
  email text,
  phone text,
  location jsonb,
  primary_ministry_area jsonb,
  place_calling_id uuid,
  collaboration_have text[],
  collaboration_need text[],
  profile_photo_url text,
  banner_image_url text,
  description text,
  approved boolean,
  claimed_by uuid,
  boundary_ids uuid[],
  prayer_auto_approve boolean,
  prayer_name_display_mode text,
  created_at timestamptz,
  updated_at timestamptz
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
    c.denomination,
    c.website,
    c.email,
    c.phone,
    CASE 
      WHEN c.location IS NOT NULL THEN ST_AsGeoJSON(c.location)::jsonb
      ELSE NULL
    END as location,
    CASE 
      WHEN c.primary_ministry_area IS NOT NULL THEN ST_AsGeoJSON(c.primary_ministry_area)::jsonb
      ELSE NULL
    END as primary_ministry_area,
    c.place_calling_id,
    c.collaboration_have,
    c.collaboration_need,
    c.profile_photo_url,
    c.banner_image_url,
    c.description,
    c.approved,
    c.claimed_by,
    c.boundary_ids,
    c.prayer_auto_approve,
    c.prayer_name_display_mode,
    c.created_at,
    c.updated_at
  FROM public.churches c
  LEFT JOIN public.church_calling cc ON c.id = cc.church_id
  LEFT JOIN public.callings cal ON cc.calling_id = cal.id
  WHERE c.approved = true
    AND (p_boundary_id IS NULL OR p_boundary_id = ANY(c.boundary_ids))
    AND (p_collab_have IS NULL OR c.collaboration_have && p_collab_have)
    AND (p_collab_need IS NULL OR c.collaboration_need && p_collab_need)
    AND (p_calling_types IS NULL OR cal.type = ANY(p_calling_types))
  GROUP BY c.id
  ORDER BY c.name;
END;
$$;

-- Step 4: Recreate fn_get_church_by_id with banner_image_url
-- IMPORTANT: Uses 'church_uuid' as parameter name to match existing app code
CREATE OR REPLACE FUNCTION fn_get_church_by_id(church_uuid uuid)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  state text,
  zip text,
  denomination text,
  website text,
  email text,
  phone text,
  location jsonb,
  primary_ministry_area jsonb,
  place_calling_id uuid,
  collaboration_have text[],
  collaboration_need text[],
  profile_photo_url text,
  banner_image_url text,
  description text,
  approved boolean,
  claimed_by uuid,
  boundary_ids uuid[],
  prayer_auto_approve boolean,
  prayer_name_display_mode text,
  created_at timestamptz,
  updated_at timestamptz
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
    c.denomination,
    c.website,
    c.email,
    c.phone,
    CASE 
      WHEN c.location IS NOT NULL THEN ST_AsGeoJSON(c.location)::jsonb
      ELSE NULL
    END as location,
    CASE 
      WHEN c.primary_ministry_area IS NOT NULL THEN ST_AsGeoJSON(c.primary_ministry_area)::jsonb
      ELSE NULL
    END as primary_ministry_area,
    c.place_calling_id,
    c.collaboration_have,
    c.collaboration_need,
    c.profile_photo_url,
    c.banner_image_url,
    c.description,
    c.approved,
    c.claimed_by,
    c.boundary_ids,
    c.prayer_auto_approve,
    c.prayer_name_display_mode,
    c.created_at,
    c.updated_at
  FROM public.churches c
  WHERE c.id = church_uuid;
END;
$$;

COMMENT ON COLUMN public.churches.banner_image_url IS 'URL of the church banner/cover image, separate from the logo';
