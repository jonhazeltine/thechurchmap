-- Platform Membership Requests Migration
-- This table stores user requests to join city platforms
-- Platform admins can approve/reject these requests

CREATE TABLE IF NOT EXISTS public.platform_membership_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_id uuid NOT NULL REFERENCES public.city_platforms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message text,
  reviewer_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_membership_requests_unique_pending 
ON public.platform_membership_requests(platform_id, user_id) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_platform_membership_requests_platform 
ON public.platform_membership_requests(platform_id);

CREATE INDEX IF NOT EXISTS idx_platform_membership_requests_user 
ON public.platform_membership_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_platform_membership_requests_status 
ON public.platform_membership_requests(status);

ALTER TABLE public.platform_membership_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own membership requests" ON public.platform_membership_requests;
CREATE POLICY "Users can view their own membership requests"
  ON public.platform_membership_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own membership requests" ON public.platform_membership_requests;
CREATE POLICY "Users can create their own membership requests"
  ON public.platform_membership_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Platform admins can view all requests for their platform" ON public.platform_membership_requests;
CREATE POLICY "Platform admins can view all requests for their platform"
  ON public.platform_membership_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.city_platform_users cpu
      WHERE cpu.city_platform_id = platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
  );

DROP POLICY IF EXISTS "Super admins can view all membership requests" ON public.platform_membership_requests;
CREATE POLICY "Super admins can view all membership requests"
  ON public.platform_membership_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

DROP POLICY IF EXISTS "Platform admins can update requests for their platform" ON public.platform_membership_requests;
CREATE POLICY "Platform admins can update requests for their platform"
  ON public.platform_membership_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.city_platform_users cpu
      WHERE cpu.city_platform_id = platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.city_platform_users cpu
      WHERE cpu.city_platform_id = platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
  );

DROP POLICY IF EXISTS "Super admins can update all membership requests" ON public.platform_membership_requests;
CREATE POLICY "Super admins can update all membership requests"
  ON public.platform_membership_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION update_platform_membership_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_platform_membership_requests_updated_at 
ON public.platform_membership_requests;

CREATE TRIGGER trigger_update_platform_membership_requests_updated_at
  BEFORE UPDATE ON public.platform_membership_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_membership_requests_updated_at();
