-- Add DELETE policy for areas table
-- Allow deletes when using service role (bypasses RLS) or when user owns the area
CREATE POLICY areas_delete_owner
  ON public.areas
  FOR DELETE USING (
    -- Allow service role to delete anything
    auth.jwt() ->> 'role' = 'service_role'
    OR 
    -- Allow users to delete their own areas
    created_by = auth.uid()
  );
