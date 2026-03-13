-- =====================================================================
-- INTERNAL ADMIN TAGS (Platform Admin Only)
-- Hidden tags for internal church labeling, invisible to regular users
-- =====================================================================

-- Internal tags table - defines available tags with colors and icons
CREATE TABLE IF NOT EXISTS internal_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color_hex text NOT NULL DEFAULT '#6B7280', -- Gray default
  icon_key text DEFAULT 'tag', -- Lucide icon name
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Junction table for church-tag assignments
CREATE TABLE IF NOT EXISTS internal_church_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES internal_tags(id) ON DELETE CASCADE,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  notes text, -- Optional notes about why this tag was applied
  UNIQUE(church_id, tag_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_internal_tags_active ON internal_tags(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internal_tags_slug ON internal_tags(slug);
CREATE INDEX IF NOT EXISTS idx_internal_church_tags_church ON internal_church_tags(church_id);
CREATE INDEX IF NOT EXISTS idx_internal_church_tags_tag ON internal_church_tags(tag_id);

-- =====================================================================
-- RLS POLICIES - Only platform_admin and super_admin can access
-- =====================================================================

ALTER TABLE internal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_church_tags ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is platform admin or super admin
CREATE OR REPLACE FUNCTION is_platform_admin_or_above(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = user_id 
    AND role IN ('platform_admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Internal Tags policies
CREATE POLICY "internal_tags_select_admin_only" ON internal_tags
  FOR SELECT
  USING (is_platform_admin_or_above(auth.uid()));

CREATE POLICY "internal_tags_insert_admin_only" ON internal_tags
  FOR INSERT
  WITH CHECK (is_platform_admin_or_above(auth.uid()));

CREATE POLICY "internal_tags_update_admin_only" ON internal_tags
  FOR UPDATE
  USING (is_platform_admin_or_above(auth.uid()))
  WITH CHECK (is_platform_admin_or_above(auth.uid()));

CREATE POLICY "internal_tags_delete_admin_only" ON internal_tags
  FOR DELETE
  USING (is_platform_admin_or_above(auth.uid()));

-- Internal Church Tags policies  
CREATE POLICY "internal_church_tags_select_admin_only" ON internal_church_tags
  FOR SELECT
  USING (is_platform_admin_or_above(auth.uid()));

CREATE POLICY "internal_church_tags_insert_admin_only" ON internal_church_tags
  FOR INSERT
  WITH CHECK (is_platform_admin_or_above(auth.uid()));

CREATE POLICY "internal_church_tags_update_admin_only" ON internal_church_tags
  FOR UPDATE
  USING (is_platform_admin_or_above(auth.uid()))
  WITH CHECK (is_platform_admin_or_above(auth.uid()));

CREATE POLICY "internal_church_tags_delete_admin_only" ON internal_church_tags
  FOR DELETE
  USING (is_platform_admin_or_above(auth.uid()));

-- =====================================================================
-- RPC FUNCTIONS for admin access
-- =====================================================================

-- Get all internal tags (admin only)
CREATE OR REPLACE FUNCTION fn_get_internal_tags()
RETURNS SETOF internal_tags AS $$
BEGIN
  IF NOT is_platform_admin_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Platform admin required';
  END IF;
  
  RETURN QUERY 
  SELECT * FROM internal_tags 
  ORDER BY sort_order, name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get internal tags for a specific church (admin only)
CREATE OR REPLACE FUNCTION fn_get_church_internal_tags(p_church_id uuid)
RETURNS TABLE (
  tag_id uuid,
  tag_name text,
  tag_slug text,
  tag_description text,
  color_hex text,
  icon_key text,
  applied_at timestamptz,
  applied_by uuid,
  notes text
) AS $$
BEGIN
  IF NOT is_platform_admin_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Platform admin required';
  END IF;
  
  RETURN QUERY 
  SELECT 
    t.id as tag_id,
    t.name as tag_name,
    t.slug as tag_slug,
    t.description as tag_description,
    t.color_hex,
    t.icon_key,
    ct.applied_at,
    ct.applied_by,
    ct.notes
  FROM internal_church_tags ct
  JOIN internal_tags t ON t.id = ct.tag_id
  WHERE ct.church_id = p_church_id
  AND t.is_active = true
  ORDER BY t.sort_order, t.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get churches by internal tag IDs (admin only) - for map filtering
CREATE OR REPLACE FUNCTION fn_get_churches_by_internal_tags(p_tag_ids uuid[])
RETURNS TABLE (
  church_id uuid,
  tag_id uuid,
  color_hex text,
  icon_key text
) AS $$
BEGIN
  IF NOT is_platform_admin_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Platform admin required';
  END IF;
  
  RETURN QUERY 
  SELECT DISTINCT
    ct.church_id,
    t.id as tag_id,
    t.color_hex,
    t.icon_key
  FROM internal_church_tags ct
  JOIN internal_tags t ON t.id = ct.tag_id
  WHERE ct.tag_id = ANY(p_tag_ids)
  AND t.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Assign tag to church (admin only)
CREATE OR REPLACE FUNCTION fn_assign_internal_tag(
  p_church_id uuid,
  p_tag_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS internal_church_tags AS $$
DECLARE
  result internal_church_tags;
BEGIN
  IF NOT is_platform_admin_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Platform admin required';
  END IF;
  
  INSERT INTO internal_church_tags (church_id, tag_id, applied_by, notes)
  VALUES (p_church_id, p_tag_id, auth.uid(), p_notes)
  ON CONFLICT (church_id, tag_id) 
  DO UPDATE SET notes = COALESCE(p_notes, internal_church_tags.notes)
  RETURNING * INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove tag from church (admin only)
CREATE OR REPLACE FUNCTION fn_remove_internal_tag(
  p_church_id uuid,
  p_tag_id uuid
)
RETURNS boolean AS $$
BEGIN
  IF NOT is_platform_admin_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Platform admin required';
  END IF;
  
  DELETE FROM internal_church_tags 
  WHERE church_id = p_church_id AND tag_id = p_tag_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get internal tag usage counts (admin only)
CREATE OR REPLACE FUNCTION fn_get_internal_tags_with_usage()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  description text,
  color_hex text,
  icon_key text,
  is_active boolean,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz,
  usage_count bigint
) AS $$
BEGIN
  IF NOT is_platform_admin_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Platform admin required';
  END IF;
  
  RETURN QUERY 
  SELECT 
    t.id,
    t.name,
    t.slug,
    t.description,
    t.color_hex,
    t.icon_key,
    t.is_active,
    t.sort_order,
    t.created_at,
    t.updated_at,
    COUNT(ct.id)::bigint as usage_count
  FROM internal_tags t
  LEFT JOIN internal_church_tags ct ON ct.tag_id = t.id
  GROUP BY t.id
  ORDER BY t.sort_order, t.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
