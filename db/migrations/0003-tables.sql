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
