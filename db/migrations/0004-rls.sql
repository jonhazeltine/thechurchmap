ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_calling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY churches_select_public
  ON public.churches
  FOR SELECT USING (true);

CREATE POLICY callings_select_public
  ON public.callings
  FOR SELECT USING (true);

CREATE POLICY areas_select_public
  ON public.areas
  FOR SELECT USING (true);

CREATE POLICY church_calling_select_public
  ON public.church_calling
  FOR SELECT USING (true);

CREATE POLICY churches_update_owner
  ON public.churches
  FOR UPDATE USING (auth.uid() = claimed_by)
  WITH CHECK (auth.uid() = claimed_by);

CREATE POLICY areas_insert_owner
  ON public.areas
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY areas_update_owner
  ON public.areas
  FOR UPDATE USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY profiles_pending_insert_owner
  ON public.profiles_pending
  FOR INSERT WITH CHECK (submitted_by = auth.uid());
