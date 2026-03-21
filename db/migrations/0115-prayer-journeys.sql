-- Prayer Journeys: Admin-curated guided prayer experiences
CREATE TABLE prayer_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,

  -- Ownership
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  church_id UUID REFERENCES churches(id),
  city_platform_id UUID REFERENCES city_platforms(id),

  -- Geographic scope (census tract geoids)
  tract_ids TEXT[] NOT NULL DEFAULT '{}',

  -- Status & publishing
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,

  -- Share token for public/unauthenticated access
  share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prayer_journeys_church ON prayer_journeys(church_id) WHERE church_id IS NOT NULL;
CREATE INDEX idx_prayer_journeys_platform ON prayer_journeys(city_platform_id) WHERE city_platform_id IS NOT NULL;
CREATE INDEX idx_prayer_journeys_share ON prayer_journeys(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_prayer_journeys_status ON prayer_journeys(status) WHERE status = 'published';

-- Prayer Journey Steps: Ordered slides within a journey
CREATE TABLE prayer_journey_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES prayer_journeys(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Step type determines rendering
  step_type TEXT NOT NULL CHECK (step_type IN (
    'church', 'community_need', 'custom', 'scripture',
    'user_prayer', 'thanksgiving', 'prayer_request'
  )),

  -- Content (varies by step_type)
  title TEXT,
  body TEXT,
  scripture_ref TEXT,
  scripture_text TEXT,

  -- Foreign key references (nullable, depend on step_type)
  church_id UUID REFERENCES churches(id),
  metric_key TEXT,

  -- AI generation tracking
  ai_generated BOOLEAN NOT NULL DEFAULT false,

  -- Admin can toggle steps off without deleting
  is_excluded BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journey_steps_journey ON prayer_journey_steps(journey_id, sort_order);

-- Add journey reference columns to existing prayers table
ALTER TABLE prayers ADD COLUMN journey_id UUID REFERENCES prayer_journeys(id);
ALTER TABLE prayers ADD COLUMN journey_step_id UUID REFERENCES prayer_journey_steps(id);
CREATE INDEX idx_prayers_journey ON prayers(journey_id) WHERE journey_id IS NOT NULL;

-- RLS policies for prayer_journeys
ALTER TABLE prayer_journeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prayer_journeys_select_published" ON prayer_journeys
  FOR SELECT USING (status = 'published');

CREATE POLICY "prayer_journeys_select_own" ON prayer_journeys
  FOR SELECT USING (auth.uid() = created_by_user_id);

CREATE POLICY "prayer_journeys_insert" ON prayer_journeys
  FOR INSERT WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "prayer_journeys_update" ON prayer_journeys
  FOR UPDATE USING (auth.uid() = created_by_user_id);

CREATE POLICY "prayer_journeys_delete" ON prayer_journeys
  FOR DELETE USING (auth.uid() = created_by_user_id);

-- RLS policies for prayer_journey_steps
ALTER TABLE prayer_journey_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prayer_journey_steps_select" ON prayer_journey_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM prayer_journeys
      WHERE prayer_journeys.id = prayer_journey_steps.journey_id
        AND (prayer_journeys.status = 'published' OR prayer_journeys.created_by_user_id = auth.uid())
    )
  );

CREATE POLICY "prayer_journey_steps_insert" ON prayer_journey_steps
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM prayer_journeys
      WHERE prayer_journeys.id = prayer_journey_steps.journey_id
        AND prayer_journeys.created_by_user_id = auth.uid()
    )
  );

CREATE POLICY "prayer_journey_steps_update" ON prayer_journey_steps
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM prayer_journeys
      WHERE prayer_journeys.id = prayer_journey_steps.journey_id
        AND prayer_journeys.created_by_user_id = auth.uid()
    )
  );

CREATE POLICY "prayer_journey_steps_delete" ON prayer_journey_steps
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM prayer_journeys
      WHERE prayer_journeys.id = prayer_journey_steps.journey_id
        AND prayer_journeys.created_by_user_id = auth.uid()
    )
  );
