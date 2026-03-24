# The Church Map

Interactive map platform helping churches collaborate and pray together across cities and regions. Originally built for Grand Rapids, MI and expanding nationally.

## Architecture

- **Server:** Express (TypeScript) — `server/` entry points, API routes in `app/api/`
- **Client:** React 18 + Vite — `client/src/`
- **Database:** Supabase (PostgreSQL + PostGIS) — project `tqxcauuaaipghxvwjyis`
- **Maps:** Mapbox GL JS v3
- **Deployment:** Railway via GitHub auto-deploy
- **CDN/DNS:** Cloudflare
- **DB Connection:** Supabase session pooler at `aws-0-us-west-2.pooler.supabase.com:5432`

### Build & Run

```bash
npm run dev       # Development server (tsx)
npm run build     # Vite build + esbuild server bundle
npm run start     # Production (node dist/index.js)
npm run check     # TypeScript check
npm run db:push   # Drizzle Kit push
```

## Key Conventions

### API Routes
- Pattern: `app/api/{resource}/route.ts` exporting Express handlers (`GET`, `POST`, `PATCH`, `DELETE`)
- Registered in `server/routes.ts` — all routes mounted under `/api/`
- Static routes like `/api/churches/search` must come BEFORE parameterized `/api/churches/:id` to avoid conflicts

### Database Access
- **Supabase JS client** (`@supabase/supabase-js`) for most DB operations via REST API
- **pg.Pool** via `@neondatabase/serverless` for PostGIS-heavy queries (ministry saturation, spatial joins)
- DATABASE_URL uses Supabase session pooler with dotted username format (`postgres.tqxcauuaaipghxvwjyis`)
- Use `RETURNS SETOF tablename` for Supabase RPC functions, NOT `RETURNS TABLE` (avoids PostgREST column conflicts)

### Frontend
- **React Query** (TanStack Query v5) for all data fetching with stale times
- **Wouter** for routing (not React Router) — see `client/src/App.tsx` for all routes
- **Tailwind CSS v3** + **shadcn/ui** components (Radix primitives)
- **Dark mode** via `next-themes` with Tailwind `dark:` classes — never hardcode colors
- **Tabler Icons** (`@tabler/icons-react`) as primary icon library, Lucide as secondary
- **Framer Motion** for animations
- **TipTap** for rich text editing (community posts)
- Contexts: `AuthContext` (Supabase auth), `PlatformContext` (city platform scoping)

### Routing Structure
- `/` — National map (Home)
- `/:platform` — Platform community feed (platform slug extracted by PlatformContext)
- `/:platform/map` — Platform map view
- `/:platform/church/:id` — Church detail within platform
- `/admin/*` — Admin dashboard (lazy loaded)
- `/journey/:shareToken` — Public prayer journey viewer
- `/:platform/journey/:id/builder` — Journey builder (platform-scoped)

## Database

### Key Tables
| Table | Description | ~Rows |
|-------|-------------|-------|
| `churches` | All church records with location, verification, partnerships | 241k |
| `boundaries` | Geographic boundaries (TIGER/Census shapefiles) | 227k |
| `boundaries_tracts` | Census tract geometries with demographic data | — |
| `profiles` | User profiles (linked to `auth.users`) | — |
| `prayers` | Prayer requests (church, regional, global scope) | — |
| `city_platforms` | City/region platform configurations | — |
| `city_platform_users` | Platform roles (super_admin, platform_owner, platform_admin, church_admin, member) | — |
| `prayer_journeys` | Curated guided prayer experiences | — |
| `prayer_journey_steps` | Steps within journeys (church, community_need, custom, scripture, etc.) | — |
| `posts` | Community feed posts | — |
| `post_comments` | Comments on posts | — |
| `church_claims` | Church ownership claims (pending/approved/rejected) | — |
| `import_jobs` | Google Places / OSM import tracking | — |
| `collaboration_tags` | Database-driven collaboration taxonomy | — |
| `internal_tags` | Admin-only internal church labels | — |

### Boundary Types
`place`, `county`, `zip`, `county_subdivision`, `census_tract`, `school_district` (unified/elementary/secondary subtypes)

### PostGIS
- `churches.location` — Point geometry for spatial queries
- `churches.display_lat` / `display_lng` — Visual pin offset (must be populated alongside `location`)
- `churches.primary_ministry_area` — Custom drawn polygon
- `boundaries.geometry` — Polygon/MultiPolygon for administrative regions
- Spatial functions: `fn_churches_in_polygon`, `fn_boundaries_in_viewport`, `fn_attach_boundaries`, etc.

### Admin Roles
All role checks go through `city_platform_users` table. The `platform_roles` table still exists but is **deprecated** — do not use it for new features.

Roles hierarchy: `super_admin` > `platform_owner` > `platform_admin` > `church_admin` > `member`

### Migrations
137 migration files in `db/migrations/` (0001 through 0122, some with duplicated numbers). Applied directly to Supabase, not via Drizzle migrations.

## Map Architecture

All map components live in `client/src/components/map/` (11 modules):

| Component | Purpose |
|-----------|---------|
| `MapView.tsx` (~1,479 lines) | Main orchestrator — manages all layers, popups, interactions |
| `ChurchPinLayer.tsx` | Church pin rendering (vector tileset + GeoJSON sources) |
| `HealthChoropleth.tsx` | CDC PLACES health metrics choropleth on census tracts |
| `SaturationLayer.tsx` | Ministry saturation heatmap (churches per capita by tract) |
| `PrayerCoverageLayer.tsx` | Prayer coverage visualization |
| `EmberParticles.tsx` | Animated ember particles for prayer mode |
| `BoundaryLayer.tsx` | Administrative boundary polygons |
| `AreaLayer.tsx` | Ministry areas / calling areas |
| `CollaborationLines.tsx` | Lines connecting collaborating churches |
| `AllocationMode.tsx` | Prayer budget allocation UI |
| `MapControls.tsx` | Zoom, locate, layer toggles |

### Mapbox Tileset
- National church pins use vector tileset `jonhazeltine.all-churches-v8`
- Platform-specific pins use static GeoJSON cache files per platform (generated via admin endpoint)
- Tileset regenerated via Mapbox Uploads API (`server/services/tileset-generator.ts`)

## Prayer Journeys

- **Builder:** `client/src/pages/JourneyBuilder.tsx` — wizard with steps: location, churches, needs, custom, refine
- **Viewer:** `client/src/pages/JourneyViewer.tsx` — satellite fly-to animations, 3D building highlights, bottom sheet
- **AI:** `server/services/journey-ai.ts` — OpenAI-powered step suggestions
- **Step types:** `church`, `community_need`, `custom`, `scripture`, `user_prayer`, `thanksgiving`, `prayer_request`
- **Metadata:** Steps store extra data in `metadata` JSONB field (custom locations, images, etc.)
- **Sharing:** Published journeys get a `share_token` for public access at `/journey/:shareToken`

## Server Services

Key services in `server/services/`:

| Service | Purpose |
|---------|---------|
| `google-places.ts` | Google Places import with boundary checking and location-based dedup |
| `ministry-saturation.ts` | Churches-per-capita calculations using pg.Pool + PostGIS |
| `tileset-generator.ts` | Mapbox tileset generation via Uploads API |
| `platform-pin-cache.ts` | Static GeoJSON generation for platform pins |
| `journey-ai.ts` | OpenAI integration for prayer journey step suggestions |
| `formation-prayer-exchange.ts` | Bidirectional prayer sync with Formation App |
| `cdc-places.ts` | CDC PLACES health data import |
| `census-acs.ts` | American Community Survey demographic data |
| `tigerweb.ts` | Census TIGER/Line boundary imports |
| `og-image.ts` | Dynamic OG image generation (Satori + Resvg) |
| `resend-email.ts` | Transactional email via Resend |
| `contract-pdf-generator.ts` | PDF generation for church partnership contracts |

## Import System

- Google Places import with boundary checking and location-based dedup
- OSM import for baseline church data
- Import jobs saved incrementally to `import_jobs` table (progress saved after each boundary, not just at end)
- Tileset generation via Mapbox Uploads API after imports

## Environment Variables

```
# Supabase
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL              # Session pooler connection string

# Mapbox
VITE_MAPBOX_TOKEN
MAPBOX_TOKEN
MAPBOX_SECRET_TOKEN       # For tileset uploads

# External APIs
OPENAI_API_KEY            # Journey AI suggestions
GOOGLE_PLACES_API_KEY     # Church import/verification

# Note: VITE_ prefixed vars are exposed to the client via Vite
```

## Common Gotchas

1. **pg library splits dotted usernames** — use `@neondatabase/serverless` Pool or pass the full connection string. The standard `pg` library misparses `postgres.projectref` as user `postgres` with database `projectref`.

2. **BoundarySearch dedup must be by ID only** — never deduplicate by normalized name. This caused Grand Rapids to be hidden behind Grand Rapids Charter Township.

3. **Census tracts** are `census_tract` type in boundaries table (not just "tract").

4. **School districts** are `school_district` type with subtypes (unified/elementary/secondary).

5. **`display_lat`/`display_lng`** must be populated alongside PostGIS `location` field — some code reads coordinates from display fields for pin rendering.

6. **Import boundary check progress** must be saved incrementally (per boundary, not just at end) to avoid data loss on timeout.

7. **`platform_roles` table is deprecated** — all role checks use `city_platform_users`. Do not add new queries against `platform_roles`.

8. **Route ordering matters** — static routes like `/api/churches/search` must be registered before `/api/churches/:id` in `server/routes.ts`.

9. **Supabase RPC functions** — always use `RETURNS SETOF tablename`, never `RETURNS TABLE(...)`. PostgREST has column name conflicts with `RETURNS TABLE`.

10. **Shared schema** — Types are defined in `shared/schema.ts` and imported by both server and client. Keep this file as the single source of truth for interfaces.

## Project Structure

```
app/api/                  # API route handlers (Express)
client/src/
  components/
    map/                  # Map visualization components
    ui/                   # shadcn/ui primitives
  contexts/               # AuthContext, PlatformContext
  hooks/                  # Custom hooks
  lib/                    # queryClient, utils, upload helpers
  pages/                  # Route pages
    admin/                # Admin dashboard pages (lazy loaded)
db/migrations/            # SQL migrations (applied to Supabase directly)
public/                   # Static assets, GeoJSON cache files
server/
  routes.ts               # Route registration
  storage.ts              # Storage interface
  services/               # Business logic services
  app.ts                  # Express app setup
shared/
  schema.ts               # Shared TypeScript types and Zod schemas
```
