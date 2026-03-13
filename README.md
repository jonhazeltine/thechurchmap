# Kingdom Map Platform

A geospatial church collaboration platform built with React, Express, Supabase (PostgreSQL + PostGIS), and Mapbox GL. Discover churches and ministry callings in your area, connect with faith communities, and strengthen kingdom impact through interactive mapping.

## Features

- **Interactive Map Interface** - Browse churches on a Mapbox-powered map with custom markers
- **Ministry Callings** - Filter and discover churches by ministry focus (Place, People, Problem, Purpose)
- **Polygon Search** - Draw custom areas on the map to find churches within specific regions
- **Church Profiles** - Detailed church information with collaboration opportunities
- **Real-time Filtering** - Search and filter by denomination, location, and ministry callings
- **Responsive Design** - Professional UI optimized for desktop and mobile

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Wouter for routing
- TanStack Query for data fetching
- Shadcn UI + Tailwind CSS for styling
- Mapbox GL for interactive maps

### Backend
- Express.js API server
- Supabase (PostgreSQL with PostGIS extension)
- Row Level Security (RLS) policies
- Zod for validation

## Setup Instructions

### Prerequisites
1. Node.js 20+ installed
2. A Supabase account ([supabase.com](https://supabase.com))
3. A Mapbox account ([mapbox.com](https://mapbox.com))

### 1. Clone and Install

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** and copy:
   - `Project URL` (your SUPABASE_URL)
   - `anon public` key (your SUPABASE_ANON_KEY)
   - `service_role` key (your SUPABASE_SERVICE_ROLE_KEY) - **Keep this secret!**

3. Run the migrations in the **SQL Editor** in order:
   - `db/migrations/0001-init.sql`
   - `db/migrations/0002-postgis.sql`
   - `db/migrations/0003-tables.sql`
   - `db/migrations/0004-rls.sql`
   - `db/migrations/0005-seed.sql`
   - `db/migrations/0006-fn-churches-in-polygon.sql`

### 3. Get Mapbox Token

1. Sign up at [mapbox.com](https://mapbox.com)
2. Go to **Account → Access Tokens**
3. Copy your default public token or create a new one

### 4. Configure Environment Variables

In Replit Secrets (or create a `.env` file locally), add:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
VITE_MAPBOX_TOKEN=your_mapbox_access_token
```

### 5. Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5000`

## Database Schema

### Tables

- **callings** - Ministry calling categories (Place, People, Problem, Purpose)
- **churches** - Church profiles with location and contact information
- **church_calling** - Many-to-many relationship between churches and callings
- **areas** - Custom geographic areas drawn by users
- **profiles_pending** - Pending church profile submissions

### Key Features

- **PostGIS Geography Types** - Efficient geospatial queries for location-based search
- **GIST Indexes** - Fast spatial lookups on church locations and area geometries
- **Trigram Indexes** - Fuzzy text search on church names
- **RLS Policies** - Public read access, authenticated write access with ownership checks
- **RPC Function** - `fn_churches_in_polygon` for polygon-based church search using PostGIS `ST_Within`

## API Endpoints

### Churches
- `GET /api/churches` - List all approved churches
- `POST /api/churches` - Submit a new church (pending approval)
- `GET /api/churches/:id` - Get church details
- `PATCH /api/churches/:id` - Update church (owner only)
- `DELETE /api/churches/:id` - Delete church (owner only)
- `POST /api/churches/by-polygon` - Search churches within a polygon

### Callings
- `GET /api/callings` - List all ministry callings
- `POST /api/callings` - Create a new calling

### Areas
- `GET /api/areas` - List all geographic areas
- `POST /api/areas` - Create a new area

## Project Structure

```
├── app/
│   └── api/           # API route handlers
├── client/
│   └── src/
│       ├── components/  # React components
│       ├── lib/         # Utilities and clients
│       └── pages/       # Page components
├── db/
│   └── migrations/    # SQL migration files
├── lib/               # Server-side utilities
├── server/            # Express server
└── shared/            # Shared TypeScript schemas
```

## Development Guidelines

- All data models are defined in `shared/schema.ts`
- Frontend uses Supabase client for direct database access
- Backend API routes use Supabase service role for admin operations
- Forms use React Hook Form with Zod validation
- Map interactions use Mapbox GL JS with custom drawing tools

## License

MIT
