-- Migration: Create function to attach boundaries to churches via spatial join
-- This function finds matching boundaries for each church based on Point-in-Polygon
-- and updates the church's boundary_ids array

CREATE OR REPLACE FUNCTION attach_boundaries_to_churches()
RETURNS TABLE(matched_count integer) AS $$
DECLARE
  church_record RECORD;
  matching_boundary_id UUID;
  updated_count INTEGER := 0;
BEGIN
  -- Loop through all churches
  FOR church_record IN 
    SELECT id, location FROM churches WHERE location IS NOT NULL
  LOOP
    -- Find the boundary that contains this church's location
    SELECT b.id INTO matching_boundary_id
    FROM boundaries b
    WHERE ST_Within(church_record.location::geometry, b.geometry)
    LIMIT 1;
    
    -- If a match was found, update the church's boundary_ids
    IF matching_boundary_id IS NOT NULL THEN
      UPDATE churches
      SET boundary_ids = ARRAY[matching_boundary_id]
      WHERE id = church_record.id;
      
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT updated_count;
END;
$$ LANGUAGE plpgsql;
