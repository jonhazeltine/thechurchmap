-- Migration: Add custom_boundary_enabled to church_calling
-- Purpose: Allow churches to flag which callings should have custom boundary drawing enabled
-- The toggle lives on the profile page, and when enabled, the calling appears in the map sidebar's "Ready to Draw" section

-- Add the column with default false
ALTER TABLE church_calling
ADD COLUMN IF NOT EXISTS custom_boundary_enabled boolean DEFAULT false NOT NULL;

-- Add index for efficient filtering of enabled callings
CREATE INDEX IF NOT EXISTS idx_church_calling_custom_boundary 
ON church_calling(church_id, custom_boundary_enabled) 
WHERE custom_boundary_enabled = true;

-- Update the fn_get_church_by_id function to include the new field
CREATE OR REPLACE FUNCTION fn_get_church_by_id(church_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id', c.id,
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'state', c.state,
    'zip', c.zip,
    'denomination', c.denomination,
    'website', c.website,
    'email', c.email,
    'phone', c.phone,
    'location', CASE
      WHEN c.location IS NOT NULL THEN
        ST_AsGeoJSON(c.location)::JSON
      ELSE NULL
    END,
    'primary_ministry_area', CASE
      WHEN c.primary_ministry_area IS NOT NULL THEN
        ST_AsGeoJSON(c.primary_ministry_area)::JSON
      ELSE NULL
    END,
    'place_calling_id', c.place_calling_id,
    'collaboration_have', c.collaboration_have,
    'collaboration_need', c.collaboration_need,
    'profile_photo_url', c.profile_photo_url,
    'description', c.description,
    'approved', c.approved,
    'claimed_by', c.claimed_by,
    'boundary_ids', c.boundary_ids,
    'prayer_auto_approve', COALESCE(c.prayer_auto_approve, false),
    'prayer_name_display_mode', COALESCE(c.prayer_name_display_mode, 'first_name_last_initial'),
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'callings', COALESCE((
      SELECT json_agg(json_build_object(
        'id', cal.id,
        'name', cal.name,
        'type', cal.type,
        'description', cal.description,
        'color', cal.color,
        'custom_boundary_enabled', cc.custom_boundary_enabled,
        'created_at', cal.created_at
      ))
      FROM church_calling cc
      INNER JOIN callings cal ON cc.calling_id = cal.id
      WHERE cc.church_id = c.id
    ), '[]'::json)
  ) INTO result
  FROM churches c
  WHERE c.id = church_uuid;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update the fn_get_churches_simple function to include the new field
CREATE OR REPLACE FUNCTION fn_get_churches_simple()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'id', c.id,
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'state', c.state,
    'zip', c.zip,
    'denomination', c.denomination,
    'website', c.website,
    'email', c.email,
    'phone', c.phone,
    'location', CASE
      WHEN c.location IS NOT NULL THEN
        ST_AsGeoJSON(c.location)::JSON
      ELSE NULL
    END,
    'primary_ministry_area', CASE
      WHEN c.primary_ministry_area IS NOT NULL THEN
        ST_AsGeoJSON(c.primary_ministry_area)::JSON
      ELSE NULL
    END,
    'place_calling_id', c.place_calling_id,
    'collaboration_have', c.collaboration_have,
    'collaboration_need', c.collaboration_need,
    'profile_photo_url', c.profile_photo_url,
    'description', c.description,
    'approved', c.approved,
    'claimed_by', c.claimed_by,
    'boundary_ids', c.boundary_ids,
    'prayer_auto_approve', COALESCE(c.prayer_auto_approve, false),
    'prayer_name_display_mode', COALESCE(c.prayer_name_display_mode, 'first_name_last_initial'),
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'callings', COALESCE((
      SELECT json_agg(json_build_object(
        'id', cal.id,
        'name', cal.name,
        'type', cal.type,
        'description', cal.description,
        'color', cal.color,
        'custom_boundary_enabled', cc.custom_boundary_enabled,
        'created_at', cal.created_at
      ))
      FROM church_calling cc
      INNER JOIN callings cal ON cc.calling_id = cal.id
      WHERE cc.church_id = c.id
    ), '[]'::json)
  )) INTO result
  FROM churches c
  WHERE c.approved = true
  ORDER BY c.name;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
