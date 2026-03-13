-- Update boundaries table to accept both Polygon and MultiPolygon geometries
-- This fixes the issue where 61 MultiPolygon places failed to import

-- Change geometry column to accept any geometry type (Polygon or MultiPolygon)
ALTER TABLE public.boundaries 
  ALTER COLUMN geometry 
  TYPE geography(GEOMETRY, 4326) 
  USING geometry::geography(GEOMETRY, 4326);

-- The GIST index will continue to work with the new geometry type
-- No need to recreate it
