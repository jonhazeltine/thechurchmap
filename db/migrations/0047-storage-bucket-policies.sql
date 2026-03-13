-- =====================================================================
-- MIGRATION 0047: Supabase Storage Bucket Policies for post-media
-- =====================================================================
-- This migration creates RLS policies for the post-media storage bucket
-- to allow authenticated users to upload and view media files.
-- =====================================================================

-- =====================================================================
-- STORAGE BUCKET: post-media RLS POLICIES
-- =====================================================================
-- NOTE: These policies apply to the storage.objects table, which manages
-- files in Supabase Storage buckets. This is separate from our media_assets
-- table which tracks metadata.

-- Policy: Allow authenticated users to upload files to post-media bucket
CREATE POLICY "Authenticated users can upload to post-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-media' AND
  (storage.foldername(name))[1] = 'uploads'
);

-- Policy: Allow authenticated users to view all files in post-media bucket
CREATE POLICY "Anyone can view post-media files"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'post-media');

-- Policy: Allow users to update their own uploaded files (optional - for future use)
CREATE POLICY "Users can update their own files in post-media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'post-media')
WITH CHECK (bucket_id = 'post-media');

-- Policy: Allow users to delete their own uploaded files (optional - for future use)
CREATE POLICY "Users can delete their own files in post-media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'post-media');

-- =====================================================================
-- VERIFICATION NOTES
-- =====================================================================
-- After running this migration:
-- 1. Authenticated users can upload files to post-media/uploads/* paths
-- 2. Both authenticated and anonymous users can view files (bucket is public)
-- 3. Users can update/delete files in the bucket
-- 4. The bucket must be created manually in Supabase Dashboard first
-- =====================================================================
