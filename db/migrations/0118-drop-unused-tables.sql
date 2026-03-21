-- Drop tables with zero application code references
-- groups/group_members: Created in Sprint 4.0 as "Future expansion", never used
-- crime_tract_queue: Obsoleted by auto-tract assignment, no code references

DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;
DROP TABLE IF EXISTS public.crime_tract_queue CASCADE;
