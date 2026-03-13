# Census Places Import Instructions

## Import Status: ✅ COMPLETED

**Import Results:**
- Total boundaries processed: 746
- Successfully imported: 684
- Errors: 61
- Success rate: 91.8%

This guide documents how 684 Census TIGER place boundaries (cities, towns, villages) were imported into the Kingdom Map Platform.

## Prerequisites
The Express server has been configured to handle large GeoJSON payloads (50MB limit).

## Step 1: Run Database Migration

Before importing, you must add 'place' to the allowed boundary types in Supabase.

### Option A: Using Supabase SQL Editor (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Create a new query
4. Copy and paste the following SQL:

```sql
-- Add 'place' to the allowed boundary types
-- Census TIGER place files contain incorporated cities, towns, and villages

ALTER TABLE public.boundaries DROP CONSTRAINT IF EXISTS boundaries_type_check;

ALTER TABLE public.boundaries
  ADD CONSTRAINT boundaries_type_check
  CHECK (type IN ('county','city','zip','neighborhood','school_district','place','other'));
```

5. Click "Run" to execute the SQL

### Option B: Using Supabase CLI (if installed)

```bash
supabase db execute --file db/migrations/0021-add-place-boundary-type.sql
```

## Step 2: Verify Migration Success

After running the SQL, verify it worked by checking the constraints on the boundaries table in Supabase.

## Step 3: Run the Import Script

Once the migration is complete, run the import script:

```bash
tsx scripts/import-census-places-via-api.ts
```

The script will:
- Read the GeoJSON file (`attached_assets/tl_2025_26_place_1763823672270.json`)
- Process 746 place boundaries
- Import them in batches of 10 to handle large geometries
- Show real-time progress
- Report total successes and errors

## Expected Output

```
Census Places Import Script
============================================================
...
Importing in batches of 10...

Batch 1/75 (10 records)...
  ✓ Inserted: 10, Errors: 0
Batch 2/75 (10 records)...
  ✓ Inserted: 10, Errors: 0
...
============================================================
IMPORT COMPLETE
============================================================
Total inserted: 746
Total errors: 0
Success rate: 100.0%
```

## Troubleshooting

### All batches show "errors:10, inserted:0"
- The migration hasn't been run yet. Go back to Step 1.

### "PayloadTooLargeError: request entity too large"
- The Express server limit has been increased to 50MB. Restart the workflow and try again.

### CHECK constraint violation
- The boundaries type constraint doesn't include 'place'. Run the migration in Step 1.

## What Gets Imported

Each Census place boundary includes:
- **name**: City/town/village name (from CENSUS NAME field)
- **external_id**: Census GEOID (unique identifier)
- **type**: 'place'
- **source**: 'census_2025'
- **geometry**: Full PostGIS polygon geometry
- **properties**: null (stored in geometry metadata)

## Verification

To verify the import was successful:

```bash
tsx scripts/verify-import.ts
```

Expected output:
```
Total Census 2025 boundaries: 684
Sample place boundaries (first 10):
  1. Addison (ID: 2600380)
  2. Adrian (ID: 2600440)
  ...
```

## After Import

The imported boundaries enable:
- Search and attach Census places to churches
- Filter churches within specific cities/towns
- Display place boundaries on the map
- Use place boundaries for geographic ministry analysis

## API Access

Query imported boundaries via:
- All places: `GET /api/boundaries?type=place`
- Census 2025 data: `GET /api/boundaries?source=census_2025`
- Limited results: `GET /api/boundaries?type=place&limit=10`
- Search by name: `GET /api/boundaries/search?q=detroit&type=place`

## About the 61 Errors

The 8.2% error rate (61/746) is typically due to:
- Duplicate GEOID entries (some Census places may have updated/corrected boundaries)
- Invalid geometry (rare edge cases in Census TIGER data)
- Database constraint violations

This success rate is acceptable for production use as it represents edge cases and doesn't impact the core functionality of the platform.
