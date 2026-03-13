-- Add 'place' to the allowed boundary types
-- Census TIGER place files contain incorporated cities, towns, and villages

ALTER TABLE public.boundaries DROP CONSTRAINT IF EXISTS boundaries_type_check;

ALTER TABLE public.boundaries
  ADD CONSTRAINT boundaries_type_check
  CHECK (type IN ('county','city','zip','neighborhood','school_district','place','other'));
