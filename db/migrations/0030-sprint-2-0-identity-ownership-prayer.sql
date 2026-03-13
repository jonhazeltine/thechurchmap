-- =====================================================================
-- SPRINT 2.0 – IDENTITY, OWNERSHIP & PRAYER
-- Migration: 0030-sprint-2-0-identity-ownership-prayer.sql
-- =====================================================================
-- This migration creates all tables and columns needed for:
-- - User profiles linked to Supabase auth
-- - Church-user roles (member/church_admin)
-- - Platform admin roles
-- - Prayer system (church-specific prayers with auto-approve settings)
-- - Private church labels (Bridge/Anchor/Catalyst)
-- - Collaboration tags management
-- =====================================================================

-- =====================================================================
-- 1. PROFILES TABLE (linked to auth.users)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  first_name text,
  last_initial text,
  primary_church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles linked to Supabase auth.users';
COMMENT ON COLUMN public.profiles.id IS 'FK to auth.users.id';
COMMENT ON COLUMN public.profiles.last_initial IS 'One-letter last initial for prayer display';
COMMENT ON COLUMN public.profiles.primary_church_id IS 'User''s primary church attachment';

CREATE INDEX IF NOT EXISTS idx_profiles_primary_church
  ON public.profiles(primary_church_id);

-- =====================================================================
-- 2. CHURCH USER ROLES (member/church_admin per church)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.church_user_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('member', 'church_admin')),
  is_approved boolean NOT NULL DEFAULT false,
  approved_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, church_id)
);

COMMENT ON TABLE public.church_user_roles IS 'User roles within specific churches';
COMMENT ON COLUMN public.church_user_roles.role IS 'member or church_admin';
COMMENT ON COLUMN public.church_user_roles.is_approved IS 'Whether membership is approved by church admin';

CREATE INDEX IF NOT EXISTS idx_church_user_roles_user
  ON public.church_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_church_user_roles_church
  ON public.church_user_roles(church_id);
CREATE INDEX IF NOT EXISTS idx_church_user_roles_approved
  ON public.church_user_roles(church_id, is_approved);

-- =====================================================================
-- 3. PLATFORM ROLES (platform_admin)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('platform_admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

COMMENT ON TABLE public.platform_roles IS 'Platform-wide admin roles';
COMMENT ON COLUMN public.platform_roles.role IS 'Currently only platform_admin';
COMMENT ON COLUMN public.platform_roles.is_active IS 'Whether the admin role is currently active';

CREATE INDEX IF NOT EXISTS idx_platform_roles_user
  ON public.platform_roles(user_id);

-- =====================================================================
-- 4. EXTEND CHURCHES TABLE WITH PRAYER SETTINGS
-- =====================================================================
-- Add prayer auto-approve setting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'churches' 
    AND column_name = 'prayer_auto_approve'
  ) THEN
    ALTER TABLE public.churches 
    ADD COLUMN prayer_auto_approve boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Add prayer name display mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'churches' 
    AND column_name = 'prayer_name_display_mode'
  ) THEN
    ALTER TABLE public.churches 
    ADD COLUMN prayer_name_display_mode text NOT NULL DEFAULT 'first_name_last_initial'
    CHECK (prayer_name_display_mode IN ('first_name_last_initial'));
  END IF;
END $$;

COMMENT ON COLUMN public.churches.prayer_auto_approve IS 'Auto-approve new prayers vs. require moderation';
COMMENT ON COLUMN public.churches.prayer_name_display_mode IS 'How to display submitter names on prayers';

-- =====================================================================
-- 5. PRAYERS TABLE (church-specific prayer requests)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.prayers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  submitted_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'archived')) DEFAULT 'pending',
  is_anonymous boolean NOT NULL DEFAULT false,
  display_first_name text,
  display_last_initial text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.prayers IS 'Church-specific prayer requests';
COMMENT ON COLUMN public.prayers.status IS 'pending, approved, rejected, or archived';
COMMENT ON COLUMN public.prayers.is_anonymous IS 'Whether to hide submitter name';
COMMENT ON COLUMN public.prayers.display_first_name IS 'Snapshot of first name for display';
COMMENT ON COLUMN public.prayers.display_last_initial IS 'Snapshot of last initial for display';

CREATE INDEX IF NOT EXISTS idx_prayers_church
  ON public.prayers(church_id);
CREATE INDEX IF NOT EXISTS idx_prayers_status
  ON public.prayers(church_id, status);
CREATE INDEX IF NOT EXISTS idx_prayers_submitted_by
  ON public.prayers(submitted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_prayers_created_at
  ON public.prayers(church_id, created_at DESC);

-- =====================================================================
-- 6. PRAYER INTERACTIONS (prayed/amen)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.prayer_interactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  prayer_id uuid NOT NULL REFERENCES public.prayers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  interaction_type text NOT NULL CHECK (interaction_type IN ('prayed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prayer_id, user_id, interaction_type)
);

COMMENT ON TABLE public.prayer_interactions IS 'User interactions with prayers (prayed, etc.)';
COMMENT ON COLUMN public.prayer_interactions.user_id IS 'Null allowed for anonymous interactions';

CREATE INDEX IF NOT EXISTS idx_prayer_interactions_prayer
  ON public.prayer_interactions(prayer_id);
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_user
  ON public.prayer_interactions(user_id);

-- =====================================================================
-- 7. CHURCH PRIVATE LABELS (Bridge/Anchor/Catalyst)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.church_private_labels (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  label_key text NOT NULL CHECK (label_key IN ('bridge', 'anchor', 'catalyst')),
  label_value text,
  created_by_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (church_id, label_key)
);

COMMENT ON TABLE public.church_private_labels IS 'Private labels for churches (platform admin only)';
COMMENT ON COLUMN public.church_private_labels.label_key IS 'bridge, anchor, or catalyst';
COMMENT ON COLUMN public.church_private_labels.label_value IS 'Optional note or description';

CREATE INDEX IF NOT EXISTS idx_church_private_labels_church
  ON public.church_private_labels(church_id);
CREATE INDEX IF NOT EXISTS idx_church_private_labels_key
  ON public.church_private_labels(label_key);

-- =====================================================================
-- 8. COLLABORATION TAGS (manageable vocabulary)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.collaboration_tags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('have', 'need', 'both')),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.collaboration_tags IS 'Managed vocabulary for collaboration options';
COMMENT ON COLUMN public.collaboration_tags.category IS 'have, need, or both (shown in either dropdown)';
COMMENT ON COLUMN public.collaboration_tags.is_active IS 'Whether tag appears in UI selectors';

CREATE INDEX IF NOT EXISTS idx_collaboration_tags_active
  ON public.collaboration_tags(is_active);
CREATE INDEX IF NOT EXISTS idx_collaboration_tags_category
  ON public.collaboration_tags(category, is_active);

-- =====================================================================
-- SUCCESS MESSAGE
-- =====================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Sprint 2.0 tables created successfully!';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Run migration 0031 for RLS policies';
  RAISE NOTICE '   2. Seed platform_roles with your auth.users.id';
  RAISE NOTICE '   3. Seed collaboration_tags from existing options';
END $$;
