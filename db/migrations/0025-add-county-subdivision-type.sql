-- Add 'county subdivision' to the allowed boundary types
-- Census TIGER COUSUB files contain county subdivisions (townships, civil divisions, etc.)

ALTER TABLE public.boundaries DROP CONSTRAINT IF EXISTS boundaries_type_check;

ALTER TABLE public.boundaries
  ADD CONSTRAINT boundaries_type_check
  CHECK (type IN ('county','city','zip','neighborhood','school_district','place','county subdivision','other'));
