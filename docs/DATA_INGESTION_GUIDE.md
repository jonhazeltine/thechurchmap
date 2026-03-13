# Data Ingestion Guide

This document defines the rules and standards for importing boundary and church data into the Kingdom Map Platform.

## Table of Contents
1. [Boundary Types](#boundary-types)
2. [Church-Boundary Linking Rules](#church-boundary-linking-rules)
3. [Deduplication Rules](#deduplication-rules)
4. [Ingestion Scripts](#ingestion-scripts)
5. [Parallel Processing](#parallel-processing)
6. [Validation Checklist](#validation-checklist)

---

## Boundary Types

The platform supports the following boundary types in the `boundaries` table:

| Type | Description | Link to Churches? | Source |
|------|-------------|-------------------|--------|
| `place` | Census-designated places (cities, villages, CDPs) | **YES** (preferred) | TIGERweb, Census |
| `county_subdivision` | Townships, city divisions | **NO** (duplicates places) | TIGERweb |
| `county` | County boundaries | NO | TIGERweb |
| `census_tract` | Census tract boundaries | **NO** (too granular) | TIGERweb |
| `zip` | ZIP code tabulation areas | NO | TIGERweb |

### Key Rules

1. **Only `place` boundaries should be linked to churches** via the `boundary_ids` column
2. **Never link `census_tract` boundaries to churches** - they're used only for health data overlay
3. **County subdivisions are not linked** - they typically duplicate `place` boundaries

---

## Church-Boundary Linking Rules

When linking churches to geographic boundaries:

### DO Link:
- `place` boundaries (cities, villages, CDPs)

### DO NOT Link:
- `census_tract` - Too granular, only used for health metrics
- `county_subdivision` - Duplicates place boundaries in most cases
- `county` - Too broad for church location context
- `zip` - Not relevant for church geographic context

### Linking Logic

**IMPORTANT:** All linking scripts MUST use the `fn_get_boundaries_for_church` RPC function.
This ensures consistent enforcement of boundary type rules at the database level.

The RPC function (defined in `db/migrations/0071-fix-boundary-linking-rules.sql`):
- Returns ONLY `place` boundaries
- Excludes `census_tract` and `county_subdivision` types
- Uses PostGIS `ST_Covers` for accurate spatial containment checks

```typescript
// In link-churches-fast.ts - ALWAYS use the RPC, never query boundaries directly
const { data: boundaries } = await supabase.rpc('fn_get_boundaries_for_church', {
  church_lat: church.latitude,
  church_lon: church.longitude
});

// The RPC already filters to only 'place' boundaries
// DO NOT query the boundaries table directly - this bypasses the enforced rules
```

**Why use the RPC?**
1. **Single source of truth** - Rules are enforced in the database
2. **Prevents regressions** - Future scripts automatically get correct filtering
3. **Spatial efficiency** - Uses PostGIS GIST indexes for fast lookups

---

## Deduplication Rules

### 1. Boundary Name Normalization

When comparing boundary names for deduplication:

```typescript
function normalizeForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(city|township|charter township|village|cdp)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

This ensures "Wyoming", "Wyoming city", and "Wyoming City" all normalize to "wyoming".

### 2. Place vs County Subdivision Deduplication

When both a `place` and `county_subdivision` exist for the same geographic area:
- **Keep the `place` boundary** (official Census designation)
- **Remove the `county_subdivision`** from church links

### 3. Area-Based Deduplication

For boundaries with similar areas (within 5% difference):
- Treat as duplicates
- Keep the boundary with the cleaner/shorter name
- Used in `link-churches-to-boundaries-v2.ts`

### 4. OSM Church Deduplication

For OpenStreetMap church imports:
- Churches within 50 meters with similar names are duplicates
- Prefer `way` > `relation` > `node` (buildings over points)
- Keep the record with more complete data (address, phone, etc.)

---

## Ingestion Scripts

### Boundary Import Scripts

| Script | Purpose | Output Type |
|--------|---------|-------------|
| `ingest-tigerweb-boundaries.ts` | Import MI census tracts, places from TIGERweb | Multiple types |
| `import-census-places.ts` | Import place boundaries from GeoJSON | `place` |
| `import-census-cousub.ts` | Import county subdivisions | `county_subdivision` |

### Church Import Scripts

| Script | Purpose |
|--------|---------|
| `ingest-osm-michigan-churches.ts` | Import OSM churches statewide |
| `import-churches.ts` | Import from processed JSON |

### Linking Scripts

| Script | Purpose |
|--------|---------|
| `link-churches-fast.ts` | Link churches to place boundaries |
| `link-churches-to-boundaries-v2.ts` | Legacy linking with area deduplication |

### Cleanup Scripts

| Script | Purpose |
|--------|---------|
| `remove-census-tracts-from-churches.ts` | Remove census_tract links |
| `remove-duplicate-county-subdivisions.ts` | Remove duplicate county_subdivision links |

---

## Parallel Processing

All ingestion scripts MUST use parallel batch processing for performance. Processing records one at a time is too slow for large datasets (6,000+ churches, 3,000+ tracts).

### Standard Pattern

```typescript
const BATCH_SIZE = 50;  // Adjust based on operation complexity

async function processItem(item: Item): Promise<Result> {
  // Process single item
}

async function main() {
  const items = await fetchAllItems();
  
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel
    const results = await Promise.all(batch.map(item => processItem(item)));
    
    // Log progress
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, items.length)}/${items.length}`);
  }
}
```

### Recommended Batch Sizes

| Operation Type | Batch Size | Rationale |
|----------------|------------|-----------|
| RPC calls (spatial queries) | 20-50 | PostGIS queries are CPU-intensive |
| Simple database reads | 100 | Low overhead, can parallelize more |
| Database writes/updates | 50 | Balance throughput vs connection limits |
| External API calls | 10-20 | Respect rate limits |

### Progress Reporting

Always include progress logging for long-running operations:

```typescript
const startTime = Date.now();

for (let i = 0; i < items.length; i += BATCH_SIZE) {
  // ... process batch ...
  
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = (i + BATCH_SIZE) / elapsed;
  const remaining = (items.length - i - BATCH_SIZE) / rate;
  
  console.log(`Progress: ${i + BATCH_SIZE}/${items.length} | Rate: ${rate.toFixed(1)}/s | ETA: ${remaining.toFixed(0)}s`);
}
```

### Error Handling in Batches

Handle errors gracefully without stopping the entire import:

```typescript
const results = await Promise.all(
  batch.map(async (item) => {
    try {
      return { success: true, data: await processItem(item) };
    } catch (error) {
      console.error(`Failed to process ${item.id}:`, error);
      return { success: false, id: item.id };
    }
  })
);

const failed = results.filter(r => !r.success);
if (failed.length > 0) {
  console.log(`Batch had ${failed.length} failures`);
}
```

---

## Validation Checklist

Before and after any data import, verify:

### Pre-Import
- [ ] Script only links `place` boundaries to churches (not census_tract or county_subdivision)
- [ ] Deduplication logic uses normalized name comparison
- [ ] OSM imports check for existing churches within 50m

### Post-Import
- [ ] No churches have `census_tract` in their `boundary_ids`
- [ ] No duplicate place/county_subdivision pairs on same church
- [ ] All linked boundaries have valid geometry

### Verification Queries

```sql
-- Check for census tracts linked to churches (should be 0)
SELECT COUNT(*) FROM churches c
JOIN boundaries b ON b.id = ANY(c.boundary_ids)
WHERE b.type = 'census_tract';

-- Check for duplicate boundary patterns
SELECT c.name, array_agg(b.name || ' (' || b.type || ')') as boundaries
FROM churches c
JOIN boundaries b ON b.id = ANY(c.boundary_ids)
GROUP BY c.id, c.name
HAVING COUNT(*) > 1;
```

---

## Future Import Considerations

1. **New boundary types**: If adding new boundary types, update this guide and the linking scripts
2. **External data sources**: Document the API endpoint, data format, and transformation logic
3. **Region expansion**: When enabling new counties, ensure OSM churches are imported and linked properly

---

## Related Files

- `scripts/link-churches-fast.ts` - Primary church-boundary linking (uses RPC)
- `scripts/ingest-osm-michigan-churches.ts` - OSM church import with deduplication
- `db/migrations/0071-fix-boundary-linking-rules.sql` - RPC for finding boundaries (**enforces place-only rule**)
- `scripts/remove-census-tracts-from-churches.ts` - Cleanup script for census tract links
- `scripts/remove-duplicate-county-subdivisions.ts` - Cleanup script for duplicate county subdivisions
- `replit.md` - Platform overview and architecture
