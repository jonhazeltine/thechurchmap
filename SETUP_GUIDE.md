# Kingdom Map Platform - Complete Setup Guide

## ⚠️ Important: You Must Run Database Migrations

The app **will not work** until you run the SQL migrations in your Supabase project. This creates all the necessary tables and functions.

## Step-by-Step Setup

### 1. Run Migrations in Supabase

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste each migration file below **in order**
5. Click **Run** after pasting each one

#### Migration 1: Initialization
```sql
-- db/migrations/0001-init.sql
-- Basic initialization
-- This migration initializes the database
```

#### Migration 2: PostGIS Extensions
```sql
-- db/migrations/0002-postgis.sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

#### Migration 3: Core Tables
```sql
-- db/migrations/0003-tables.sql
-- Core tables
CREATE TABLE IF NOT EXISTS public.callings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('place','people','problem','purpose')),
  description text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.churches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  denomination text,
  website text,
  email text,
  phone text,
  location geography(Point, 4326),
  place_calling_id uuid REFERENCES public.callings(id),
  collaboration_have text[] DEFAULT '{}',
  collaboration_need text[] DEFAULT '{}',
  profile_photo_url text,
  description text,
  approved boolean NOT NULL DEFAULT false,
  claimed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.church_calling (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  calling_id uuid NOT NULL REFERENCES public.callings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (church_id, calling_id)
);

CREATE TABLE IF NOT EXISTS public.profiles_pending (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  submitted_data jsonb NOT NULL,
  submitted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.areas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('church','neighborhood','corridor','custom')),
  church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL,
  geometry geography(Polygon, 4326) NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_churches_location
  ON public.churches USING GIST ((location));

CREATE INDEX IF NOT EXISTS idx_areas_geometry
  ON public.areas USING GIST ((geometry));

CREATE INDEX IF NOT EXISTS idx_churches_name_trgm
  ON public.churches USING GIN (name gin_trgm_ops);
```

#### Migration 4: Row Level Security
```sql
-- db/migrations/0004-rls.sql
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
```

#### Migration 5: Seed Data with Locations
```sql
-- db/migrations/0005-seed.sql
-- Insert ministry callings
INSERT INTO public.callings (name, type, description, color)
VALUES
  ('Youth & Students', 'people', 'Ministering to young people and students', '#ff9900'),
  ('Refugees & Immigrants', 'people', 'Supporting refugee and immigrant communities', '#ff6600'),
  ('Addiction & Recovery', 'problem', 'Helping those struggling with addiction', '#cc0000'),
  ('Marketplace & Business', 'purpose', 'Faith in business and professional settings', '#009999'),
  ('Homelessness', 'problem', 'Serving the homeless population', '#e74c3c'),
  ('Single Parents', 'people', 'Supporting single parent families', '#f39c12'),
  ('Seniors & Elderly', 'people', 'Ministry to senior citizens', '#9b59b6'),
  ('Arts & Culture', 'purpose', 'Expressing faith through arts and creativity', '#3498db'),
  ('Downtown Revitalization', 'place', 'Urban renewal and community development', '#2ecc71'),
  ('Suburban Families', 'place', 'Ministering in suburban contexts', '#16a085')
ON CONFLICT DO NOTHING;

-- Insert sample churches in Grand Rapids, MI area with real coordinates
INSERT INTO public.churches (name, address, city, state, zip, denomination, website, email, phone, location, description, approved, collaboration_have, collaboration_need)
VALUES
  (
    'Grace Community Church',
    '1234 Division Ave S',
    'Grand Rapids',
    'MI',
    '49507',
    'Non-Denominational',
    'https://gracegr.org',
    'info@gracegr.org',
    '(616) 555-0100',
    ST_SetSRID(ST_MakePoint(-85.6681, 42.9634), 4326)::geography,
    'A vibrant community focused on serving downtown Grand Rapids through practical ministries and neighborhood engagement.',
    true,
    ARRAY['Food pantry', 'Youth programs', 'Community center'],
    ARRAY['Volunteers for homeless outreach', 'Spanish translators', 'IT support']
  ),
  (
    'New Hope Fellowship',
    '789 Michigan St NE',
    'Grand Rapids',
    'MI',
    '49503',
    'Baptist',
    'https://newhopegr.com',
    'connect@newhopegr.com',
    '(616) 555-0200',
    ST_SetSRID(ST_MakePoint(-85.6553, 42.9693), 4326)::geography,
    'Dedicated to addiction recovery and helping those in crisis find hope and healing.',
    true,
    ARRAY['Recovery groups', 'Counseling services', 'Job training'],
    ARRAY['Licensed counselors', 'Financial support', 'Housing assistance']
  ),
  (
    'City Bridge Church',
    '456 Wealthy St SE',
    'Grand Rapids',
    'MI',
    '49506',
    'Presbyterian',
    'https://citybridgegr.org',
    'hello@citybridgegr.org',
    '(616) 555-0300',
    ST_SetSRID(ST_MakePoint(-85.6410, 42.9563), 4326)::geography,
    'Building bridges across cultures with a focus on refugee resettlement and immigrant integration.',
    true,
    ARRAY['ESL classes', 'Legal aid clinic', 'Cultural events'],
    ARRAY['Immigration attorneys', 'Childcare workers', 'Donations for families']
  ),
  (
    'Marketplace Ministries',
    '321 Monroe Center NW',
    'Grand Rapids',
    'MI',
    '49503',
    'Non-Denominational',
    'https://marketplacegr.com',
    'contact@marketplacegr.com',
    '(616) 555-0400',
    ST_SetSRID(ST_MakePoint(-85.6689, 42.9634), 4326)::geography,
    'Equipping Christian business leaders to integrate faith and work, with networking and mentorship opportunities.',
    true,
    ARRAY['Business networking', 'Leadership training', 'Mentorship program'],
    ARRAY['Meeting space', 'Speakers for events', 'Small business grants']
  ),
  (
    'Riverside Family Church',
    '890 Lake Michigan Dr NW',
    'Grand Rapids',
    'MI',
    '49504',
    'Methodist',
    'https://riversidefamilygr.org',
    'info@riversidefamilygr.org',
    '(616) 555-0500',
    ST_SetSRID(ST_MakePoint(-85.6972, 42.9808), 4326)::geography,
    'A family-oriented church focused on youth development and suburban community building.',
    true,
    ARRAY['Kids programs', 'Family events', 'Sports leagues'],
    ARRAY['Youth leaders', 'Audio/visual team', 'Transportation for events']
  )
ON CONFLICT DO NOTHING;
```

#### Migration 6: Polygon Search Function
```sql
-- db/migrations/0006-fn-churches-in-polygon.sql
CREATE OR REPLACE FUNCTION public.fn_churches_in_polygon(polygon_geojson text)
RETURNS SETOF public.churches
LANGUAGE sql
AS $$
  SELECT c.*
  FROM public.churches c
  WHERE c.location IS NOT NULL
    AND ST_Within(
      c.location::geometry,
      ST_SetSRID(ST_GeomFromGeoJSON(polygon_geojson), 4326)
    );
$$;
```

### 2. Verify Installation

After running all migrations, verify the setup:

1. In Supabase SQL Editor, run:
```sql
-- Check that tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check that sample data was inserted
SELECT COUNT(*) as church_count FROM public.churches;
SELECT COUNT(*) as calling_count FROM public.callings;

-- Verify churches have locations
SELECT name, city, ST_AsText(location::geometry) as location 
FROM public.churches 
WHERE location IS NOT NULL;
```

You should see:
- 5 tables (callings, churches, church_calling, profiles_pending, areas)
- 5 churches
- 10 callings
- All churches should have valid coordinates

### 3. Test the Application

Once migrations are complete:

1. Refresh your Replit preview
2. You should see a map centered on Grand Rapids, MI
3. Five church markers should appear on the map
4. Click markers to see church details
5. Use the sidebar filters to search and filter churches
6. Click "Draw Area" to test polygon search

## Troubleshooting

**Issue: "supabaseUrl is required" error**
- Solution: Make sure environment variables are set with `VITE_` prefix in Replit Secrets

**Issue: No churches appearing on map**
- Solution: Run migrations 5 and 6 to add sample data with coordinates

**Issue: Polygon search not working**
- Solution: Verify migration 6 created the RPC function:
  ```sql
  SELECT routine_name FROM information_schema.routines 
  WHERE routine_schema = 'public' AND routine_name = 'fn_churches_in_polygon';
  ```

**Issue: Permission errors when viewing churches**
- Solution: Check RLS policies were created in migration 4

## Next Steps

After setup is complete:
1. Add more churches through the "Add Church" button
2. Test filtering by ministry callings
3. Draw custom areas and search within them
4. Explore church profiles and collaboration opportunities

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify all 6 migrations ran successfully
3. Confirm environment variables are set correctly
4. Review the README.md for additional troubleshooting
