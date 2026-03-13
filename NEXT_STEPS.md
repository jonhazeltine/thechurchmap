# Next Steps - Kingdom Map Platform Setup

## ✅ What's Complete

- ✅ All React components built (Map, Church Cards, Filters, Forms)
- ✅ All API endpoints implemented (Churches, Callings, Areas)
- ✅ SQL migrations ready (6 files in `db/migrations/`)
- ✅ Environment variables configured
- ✅ Frontend loading successfully

## ⚠️ What You Need to Do

### Step 1: Run Database Migrations in Supabase

**The app won't work until you do this!**

1. Open your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. For each migration file below, create a **New Query** and paste the SQL:

#### Run these in ORDER:

**Migration 1 - Init** (Optional, just a comment)
```sql
-- Basic initialization
```

**Migration 2 - PostGIS Extensions** ⭐ IMPORTANT
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Migration 3 - Core Tables** ⭐ IMPORTANT
```sql
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

**Migration 4 - Row Level Security** ⭐ IMPORTANT
```sql
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

**Migration 5 - Seed Data with Real Locations** ⭐ IMPORTANT
```sql
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

**Migration 6 - Polygon Search Function** ⭐ IMPORTANT
```sql
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

### Step 2: Verify Migrations Worked

Run this query in Supabase SQL Editor:

```sql
-- Should return 5 churches
SELECT name, city, ST_AsText(location::geometry) as coordinates 
FROM public.churches;

-- Should return 10 callings
SELECT name, type FROM public.callings ORDER BY type, name;
```

### Step 3: Test the App

1. Refresh your Replit preview
2. You should see:
   - ✅ A map centered on Grand Rapids, MI
   - ✅ 5 church markers on the map
   - ✅ 10 ministry callings in the sidebar filters
   - ✅ Church cards in the right panel

3. Try these features:
   - Click on a church marker to see details
   - Filter by ministry callings
   - Click "Draw Area" and draw a polygon on the map
   - Search for churches by name
   - Click "Add Church" to submit a new church

## 🎯 Success Criteria

Your setup is complete when:
- ✅ Map loads with 5 church markers visible
- ✅ Sidebar shows 10 ministry calling filters
- ✅ Clicking markers shows church info
- ✅ Polygon search returns churches within drawn area
- ✅ No errors in browser console

## ❓ Troubleshooting

**Error: "Invalid API key"**
- Double-check you copied the correct **service_role** key from Supabase Settings → API
- Make sure it's the "service_role" key, NOT the "anon" key

**No churches on map**
- Run Migration 5 again to insert sample data
- Verify with: `SELECT COUNT(*) FROM churches WHERE location IS NOT NULL;`

**Polygon search doesn't work**
- Run Migration 6 to create the RPC function
- Verify with: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'fn_churches_in_polygon';`

## 📚 Additional Resources

- Full setup guide: `SETUP_GUIDE.md`
- README with architecture details: `README.md`
- Project notes: `replit.md`

---

**Once migrations are complete, your Kingdom Map Platform will be fully functional! 🎉**
