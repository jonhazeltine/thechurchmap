-- Migration 0049: Collaboration Taxonomy RPC Functions
-- These RPC functions bypass PostgREST schema cache issues for newly created tables

-- Get all collaboration categories
CREATE OR REPLACE FUNCTION get_collaboration_categories()
RETURNS SETOF collaboration_categories
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM collaboration_categories ORDER BY sort_order ASC;
$$;

-- Get collaboration category by key
CREATE OR REPLACE FUNCTION get_collaboration_category_by_key(category_key_param text)
RETURNS SETOF collaboration_categories
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM collaboration_categories WHERE key = category_key_param;
$$;

-- Insert collaboration category
CREATE OR REPLACE FUNCTION insert_collaboration_category(
  key_param text,
  label_param text,
  description_param text DEFAULT NULL,
  sort_order_param integer DEFAULT 0
)
RETURNS SETOF collaboration_categories
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO collaboration_categories (key, label, description, sort_order)
  VALUES (key_param, label_param, description_param, sort_order_param)
  RETURNING *;
$$;

-- Update collaboration category
CREATE OR REPLACE FUNCTION update_collaboration_category(
  key_param text,
  label_param text DEFAULT NULL,
  description_param text DEFAULT NULL,
  sort_order_param integer DEFAULT NULL
)
RETURNS SETOF collaboration_categories
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE collaboration_categories
  SET
    label = COALESCE(label_param, label),
    description = COALESCE(description_param, description),
    sort_order = COALESCE(sort_order_param, sort_order)
  WHERE key = key_param
  RETURNING *;
END;
$$;

-- Delete collaboration category
CREATE OR REPLACE FUNCTION delete_collaboration_category(key_param text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM collaboration_categories WHERE key = key_param;
  RETURN FOUND;
END;
$$;

-- Get all collaboration tags
CREATE OR REPLACE FUNCTION get_collaboration_tags()
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM collaboration_tags ORDER BY category_key ASC, sort_order ASC;
$$;

-- Get collaboration tag by id
CREATE OR REPLACE FUNCTION get_collaboration_tag_by_id(id_param uuid)
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM collaboration_tags WHERE id = id_param;
$$;

-- Get collaboration tags by category
CREATE OR REPLACE FUNCTION get_collaboration_tags_by_category(category_key_param text)
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM collaboration_tags 
  WHERE category_key = category_key_param 
  ORDER BY sort_order ASC;
$$;

-- Insert collaboration tag
CREATE OR REPLACE FUNCTION insert_collaboration_tag(
  category_key_param text,
  slug_param text,
  label_param text,
  description_param text DEFAULT NULL,
  is_active_param boolean DEFAULT true,
  sort_order_param integer DEFAULT 0
)
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO collaboration_tags (category_key, slug, label, description, is_active, sort_order)
  VALUES (category_key_param, slug_param, label_param, description_param, is_active_param, sort_order_param)
  RETURNING *;
$$;

-- Update collaboration tag
CREATE OR REPLACE FUNCTION update_collaboration_tag(
  id_param uuid,
  category_key_param text DEFAULT NULL,
  slug_param text DEFAULT NULL,
  label_param text DEFAULT NULL,
  description_param text DEFAULT NULL,
  is_active_param boolean DEFAULT NULL,
  sort_order_param integer DEFAULT NULL
)
RETURNS SETOF collaboration_tags
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE collaboration_tags
  SET
    category_key = COALESCE(category_key_param, category_key),
    slug = COALESCE(slug_param, slug),
    label = COALESCE(label_param, label),
    description = COALESCE(description_param, description),
    is_active = COALESCE(is_active_param, is_active),
    sort_order = COALESCE(sort_order_param, sort_order)
  WHERE id = id_param
  RETURNING *;
END;
$$;

-- Deactivate collaboration tag (soft delete)
CREATE OR REPLACE FUNCTION deactivate_collaboration_tag(id_param uuid)
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE collaboration_tags
  SET is_active = false
  WHERE id = id_param
  RETURNING *;
$$;

-- Check if category key exists
CREATE OR REPLACE FUNCTION category_key_exists(key_param text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS(SELECT 1 FROM collaboration_categories WHERE key = key_param);
$$;

-- Check if tag slug exists in category
CREATE OR REPLACE FUNCTION tag_slug_exists_in_category(category_key_param text, slug_param text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM collaboration_tags 
    WHERE category_key = category_key_param AND slug = slug_param
  );
$$;

COMMENT ON FUNCTION get_collaboration_categories() IS 'Get all collaboration categories ordered by sort_order';
COMMENT ON FUNCTION get_collaboration_category_by_key(text) IS 'Get a specific collaboration category by key';
COMMENT ON FUNCTION insert_collaboration_category(text, text, text, integer) IS 'Insert a new collaboration category';
COMMENT ON FUNCTION update_collaboration_category(text, text, text, integer) IS 'Update an existing collaboration category';
COMMENT ON FUNCTION delete_collaboration_category(text) IS 'Delete a collaboration category by key';
COMMENT ON FUNCTION get_collaboration_tags() IS 'Get all collaboration tags ordered by category_key and sort_order';
COMMENT ON FUNCTION get_collaboration_tag_by_id(uuid) IS 'Get a specific collaboration tag by id';
COMMENT ON FUNCTION get_collaboration_tags_by_category(text) IS 'Get all tags for a specific category';
COMMENT ON FUNCTION insert_collaboration_tag(text, text, text, text, boolean, integer) IS 'Insert a new collaboration tag';
COMMENT ON FUNCTION update_collaboration_tag(uuid, text, text, text, text, boolean, integer) IS 'Update an existing collaboration tag';
COMMENT ON FUNCTION deactivate_collaboration_tag(uuid) IS 'Deactivate (soft delete) a collaboration tag';
COMMENT ON FUNCTION category_key_exists(text) IS 'Check if a category key exists';
COMMENT ON FUNCTION tag_slug_exists_in_category(text, text) IS 'Check if a tag slug exists within a category';
