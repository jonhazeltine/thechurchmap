-- Formation Prayer Exchange Integration
-- Adds columns to prayers table for bidirectional sync with The Formation App

ALTER TABLE prayers ADD COLUMN IF NOT EXISTS formation_prayer_id TEXT;
ALTER TABLE prayers ADD COLUMN IF NOT EXISTS formation_synced_at TIMESTAMPTZ;
ALTER TABLE prayers ADD COLUMN IF NOT EXISTS formation_source BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_prayers_formation_prayer_id ON prayers(formation_prayer_id) WHERE formation_prayer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prayers_formation_source ON prayers(formation_source) WHERE formation_source = TRUE;

-- Formation Church ID manual pairing: link Church Map churches to Formation App churches
ALTER TABLE churches ADD COLUMN IF NOT EXISTS formation_church_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_churches_formation_church_id ON churches(formation_church_id) WHERE formation_church_id IS NOT NULL;

-- Church-specific Formation API key (each church gets their own key from Formation)
ALTER TABLE churches ADD COLUMN IF NOT EXISTS formation_api_key TEXT;
