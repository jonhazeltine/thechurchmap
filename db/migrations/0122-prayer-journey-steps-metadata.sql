-- Add metadata JSONB column to prayer_journey_steps for storing
-- optional location data, image URLs, and other custom step metadata
ALTER TABLE prayer_journey_steps ADD COLUMN metadata JSONB DEFAULT '{}';
