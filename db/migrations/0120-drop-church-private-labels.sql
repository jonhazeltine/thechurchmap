-- Migration: Drop church_private_labels table
-- This table implemented a fixed-label system (bridge/anchor/catalyst) that has been
-- fully replaced by the flexible internal_tags + internal_church_tags system.
-- No active UI or API code references this table anymore.

-- Drop RLS policies first
DROP POLICY IF EXISTS church_private_labels_select_admin ON public.church_private_labels;
DROP POLICY IF EXISTS church_private_labels_all_admin ON public.church_private_labels;

-- Drop indexes
DROP INDEX IF EXISTS idx_church_private_labels_church;
DROP INDEX IF EXISTS idx_church_private_labels_key;

-- Drop the table
DROP TABLE IF EXISTS public.church_private_labels;
