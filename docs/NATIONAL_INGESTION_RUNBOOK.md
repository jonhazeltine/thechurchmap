# National Data Ingestion Runbook

This document provides step-by-step instructions for ingesting data for new states or refreshing existing data.

## Prerequisites

1. **Environment Variables** (in Replit Secrets):
   - `SUPABASE_URL` - Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin access
   - `FBI_CRIME_API_KEY` - From data.gov for FBI Crime Data API

2. **Database Setup**:
   - Run `db/migrations/0086-create-crime-tables.sql` in Supabase SQL Editor
   - Ensure `fn_import_boundaries` and `fn_get_boundaries_for_church` RPC functions exist

## Ingestion Order

For each state, follow this order:

```
1. Boundaries → 2. Churches → 3. Approve → 4. Relink → 5. Verify → 6. Crime (optional)
```

**⚠️ CRITICAL:** Churches are imported with `approved = false` by default. You MUST approve them or they won't appear in city platforms!

## Step 1: Ingest Boundaries

```bash
# Ingest all boundary types for a state
npx tsx scripts/ingest-tigerweb-national.ts --state MI --type state
npx tsx scripts/ingest-tigerweb-national.ts --state MI --type place
npx tsx scripts/ingest-tigerweb-national.ts --state MI --type county
npx tsx scripts/ingest-tigerweb-national.ts --state MI --type zip
npx tsx scripts/ingest-tigerweb-national.ts --state MI --type tract
```

**Validation:**
- Check Supabase for boundary counts by state
- Compare against Census metadata

## Step 2: Ingest Churches

```bash
# Dry run first
npx tsx scripts/ingest-churches-overpass.ts --state MI --dry-run

# Actual import
npx tsx scripts/ingest-churches-overpass.ts --state MI
```

**Expected Output:**
- Number of churches fetched from Overpass API
- Duplicates removed
- Churches upserted to database

## Step 3: Approve Churches

Newly imported churches have `approved = false` by default. This is a safety measure to allow review before churches appear in city platforms.

```bash
# Approve all churches for a state (run in Supabase SQL Editor or via script)
# Replace 'TX' with the state abbreviation

# Option A: Via Supabase SQL Editor
UPDATE churches SET approved = true WHERE state = 'TX' AND approved = false;

# Option B: Via inline script
npx tsx -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase.from('churches').update({ approved: true }).eq('state', 'TX').select('id');
  console.log('Approved', data?.length || 0, 'churches');
})();
"
```

**Why This Matters:**
- `fn_churches_within_boundaries` only returns churches where `approved = true`
- City platforms won't show church pins until churches are approved
- This step is required before platforms can auto-link churches

## Step 4: Relink Churches to Boundaries

```bash
npx tsx scripts/relink-all-churches-v2.ts
```

**Validation:**
- All churches should have `boundary_ids` populated
- Check for place vs county distribution
- Run `relink-churches-with-fallback.ts` for diagnostics if issues

## Step 5: Verification Checklist

- [ ] Boundaries imported for all types (state, place, county, zip, tract)
- [ ] Church count matches expected for state
- [ ] **All churches approved** (`approved = true`) ← Don't skip this!
- [ ] All churches have boundary_ids
- [ ] Place/county distribution looks reasonable (more urban = more places)
- [ ] No orphan churches (churches without boundaries)
- [ ] Test: Create a city platform and verify churches appear

## Step 6: Crime Data (Optional)

Crime data is ingested in three layers:
1. **FBI Crime Data API** - National baseline for all agencies
2. **Socrata City Data** - Incident-level data from cities using Socrata/Tyler platforms
3. **ArcGIS City Data** - Incident-level data from cities using ArcGIS Hub

### 6.1 List Available Crime Sources

```bash
# Shows all configured Socrata and ArcGIS endpoints
npx tsx scripts/ingest-socrata-crime.ts --list
```

**Current Coverage:**

| State | Socrata Cities | ArcGIS Cities |
|-------|----------------|---------------|
| MI | Detroit | Grand Rapids, Lansing, Ann Arbor |
| TX | Dallas, Houston, Austin, San Antonio, Fort Worth | El Paso |

### 6.2 FBI Crime Data (National Baseline)

Provides agency-level aggregate crime data for all states.

```bash
# Requires FBI_CRIME_API_KEY (get free at api.data.gov/signup)
npx tsx scripts/ingest-fbi-crime.ts --state MI --dry-run
npx tsx scripts/ingest-fbi-crime.ts --state MI

npx tsx scripts/ingest-fbi-crime.ts --state TX --dry-run
npx tsx scripts/ingest-fbi-crime.ts --state TX
```

**Note:** New API keys may take 5-10 minutes to activate.

### 6.3 Socrata Crime Data (City-Level)

For cities using Socrata/Tyler Data platforms (Dallas, Houston, Austin, San Antonio, Fort Worth, Detroit):

```bash
# Single city
npx tsx scripts/ingest-socrata-crime.ts --city "Fort Worth" --dry-run
npx tsx scripts/ingest-socrata-crime.ts --city "Fort Worth" --year 2024

# All cities in a state
npx tsx scripts/ingest-socrata-crime.ts --city all --state TX --year 2024

# Clear old data before inserting (for full refresh)
npx tsx scripts/ingest-socrata-crime.ts --city "Dallas" --clear
```

### 6.4 ArcGIS Crime Data (City-Level)

For cities using ArcGIS Hub (Grand Rapids, Lansing, Ann Arbor, El Paso):

```bash
# Single city
npx tsx scripts/ingest-arcgis-crime-unified.ts --city "Grand Rapids" --dry-run
npx tsx scripts/ingest-arcgis-crime-unified.ts --city "Grand Rapids"

# All cities in a state
npx tsx scripts/ingest-arcgis-crime-unified.ts --city all --state MI

# Clear old data before inserting
npx tsx scripts/ingest-arcgis-crime-unified.ts --city "Grand Rapids" --clear
```

### 6.5 Aggregate to Census Tracts

After ingesting city-level crime incidents, aggregate them to census tracts for map visualization:

```bash
# Single city aggregation
npx tsx scripts/aggregate-crime-to-tracts.ts --city "Grand Rapids" --dry-run
npx tsx scripts/aggregate-crime-to-tracts.ts --city "Grand Rapids"

# State-wide aggregation (all cities in state)
npx tsx scripts/aggregate-crime-to-tracts.ts --state MI --year 2024

# Filter to specific year
npx tsx scripts/aggregate-crime-to-tracts.ts --city "Dallas" --year 2024
```

This creates crime rate metrics (per 1,000 population) stored in `health_metric_data` table.

### 6.6 Complete Crime Ingestion Workflow

For a new state:
```bash
# 1. FBI baseline (optional, agency-level)
npx tsx scripts/ingest-fbi-crime.ts --state TX

# 2. City-level incidents
npx tsx scripts/ingest-socrata-crime.ts --city all --state TX --year 2024
npx tsx scripts/ingest-arcgis-crime-unified.ts --city all --state TX

# 3. Aggregate to tracts
npx tsx scripts/aggregate-crime-to-tracts.ts --state TX --year 2024
```

### Crime Type Normalization

All crime sources are normalized to 10 standard metrics:
- `assault_rate`, `robbery_rate`, `theft_rate`, `burglary_rate`, `vehicle_theft_rate`
- `vandalism_rate`, `fraud_rate`, `drug_offense_rate`, `weapons_offense_rate`, `sex_offense_rate`

Mapping rules are defined in `scripts/config/crime-sources.ts`.

## Health & Demographics Data

CDC PLACES and Census ACS data are already national and fetched on-demand via API. No ingestion scripts needed - the data is queried at runtime based on census tract boundaries.

## Expected Linking Statistics

After a successful import and relink, expect the following distribution:

| Metric | Typical Range | Notes |
|--------|---------------|-------|
| **Overall linking rate** | 70-100% | Varies by state density and OSM data quality |
| **Place-linked churches** | 60-80% | Urban areas with city/town boundaries |
| **County-linked churches** | 20-40% | Rural churches using county fallback |
| **Unlinked churches** | 0-30% | Usually OSM data quality issues (wrong state) |

**Texas Example (Nov 2025):**
- 16,052 linked (68.2%): 11,930 places + 4,122 counties
- 7,490 unlinked: Coordinates actually in OK/NM/AR despite "TX" tag

**Michigan Example (Nov 2025):**
- 6,684 linked (100%): All churches successfully linked

## Diagnostic Scripts

| Script | Purpose |
|--------|---------|
| `scripts/check-church-status.ts` | Quick status by state |
| `scripts/check-tx-link-types.ts` | Place vs county breakdown |
| `scripts/sample-unlinked-tx.ts` | Verify unlinked coords are outside state |
| `scripts/generate-final-status.ts` | Full status report |
| `scripts/backfill-state-fips-bulk.ts` | Fix missing state_fips values |

## Database Architecture

**⚠️ IMPORTANT:** Two databases exist in this project:

| Database | Purpose | Access Method |
|----------|---------|---------------|
| **Local DATABASE_URL** | Empty scaffolding, Drizzle migrations | `execute_sql_tool`, direct psql |
| **Supabase** | Production data (boundaries, churches, etc.) | Supabase client, RPC functions |

**Always use the Supabase client for data queries.** The local database is only for schema management and doesn't contain production data.

## Troubleshooting

### Overpass API Timeout
- Try running during off-peak hours
- Reduce bbox size by running for specific counties

### Missing Boundaries
- Check TIGERweb API is accessible
- Verify layer IDs haven't changed (counties moved from Layer 84 to State_County/Layer 1 in 2024)

### Church Linking Failures
- Ensure boundaries were imported before churches
- Check `fn_get_boundaries_for_church` RPC function exists in Supabase
- Run diagnostic script: `npx tsx scripts/relink-churches-with-fallback.ts`

### state_fips Not Populated
If boundaries have NULL `state_fips` after import, the RPC function cache may be stale. Run the backfill:

```bash
npx tsx scripts/backfill-state-fips-bulk.ts
```

This derives `state_fips` from the first 2 characters of `external_id` (GEOID).

### Rate Limiting
- Overpass API: Wait 5 minutes between state runs
- FBI API: 100ms delay between requests (built into script)
- TIGERweb: 100ms delay between pages (built into script)

### Geometry Format Handling

Supabase returns PostGIS geography columns as GeoJSON objects, not WKT strings:

```javascript
// GeoJSON format (what Supabase returns):
{ "type": "Point", "coordinates": [-85.668, 42.963] }

// WKT format (NOT returned by Supabase):
"POINT(-85.668 42.963)"
```

The `parseLocation()` helper in `aggregate-crime-to-tracts.ts` handles both formats automatically. If you add new scripts that read geography columns, use this pattern:

```javascript
function parseLocation(location: any): { lat: number; lon: number } | null {
  if (typeof location === 'object' && location.type === 'Point') {
    const [lon, lat] = location.coordinates;
    return { lat, lon };
  }
  // Fallback for WKT strings if needed
  if (typeof location === 'string') {
    const match = location.match(/POINT\s*\(\s*([^\s]+)\s+([^\s)]+)\s*\)/i);
    if (match) return { lon: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }
  return null;
}
```

### OSM Data Quality Issues
Some churches in OpenStreetMap have incorrect state attribution - their coordinates are in one state but tagged with a neighboring state. For example, churches near the TX/OK border may be tagged "TX" but have coordinates in Oklahoma.

**Symptoms:** After full import and relink, some churches remain unlinked despite having valid coordinates.

**Diagnosis:** Run `npx tsx scripts/sample-unlinked-tx.ts` to check if unlinked churches have coordinates outside the state's actual boundaries.

**Resolution:** These are data quality issues in the source (OSM). Options:
1. Accept as-is (they won't affect platform functionality)
2. Submit corrections to OpenStreetMap
3. Create a cleanup script to reassign states based on actual coordinates

## State Rollout Tracking

Track progress in `ingestion_runs` table or maintain a checklist:

| State | Boundaries | Churches | Approved | Relinked | Crime | Notes |
|-------|------------|----------|----------|----------|-------|-------|
| MI | ✅ | ✅ | ✅ | ✅ | ✅ | Grand Rapids ArcGIS |
| TX | ✅ | ✅ | ✅ | ✅ | | Dallas, Houston, etc. |
| OH | | | | | | |
| IN | | | | | | |
| ... | | | | | | |

## Refresh Schedule

| Dataset | Frequency | Trigger |
|---------|-----------|---------|
| Boundaries | Annually | TIGER release (typically December) |
| Churches | Quarterly | Manual run |
| CDC PLACES | Annually | CDC release |
| Census ACS | Annually | ACS release (typically December) |
| FBI Crime | Annually | FBI release (typically September) |
| ArcGIS Crime | Varies | Per municipality |

## Quick Reference: State Codes

```
AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD 
MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC 
SD TN TX UT VT VA WA WV WI WY DC
```
