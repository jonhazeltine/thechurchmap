# Crime Data Sources Reference

**Last Updated:** December 1, 2025  
**Purpose:** Comprehensive registry of all US cities with available crime data APIs for the Kingdom Map Platform.

---

## Summary

| Status | Count | Records |
|--------|-------|---------|
| **Ingested in Supabase** | 36 cities | 10.1M records |
| **Configured, Not Ingested** | 17 cities | ~3-4M estimated |
| **Needs CKAN Script** | 4 cities | Boston, Milwaukee, Phoenix, Pittsburgh |
| **No Public API** | 3 cities | Tampa FL, Portland OR, Salt Lake City UT |

---

## INGESTED DATA (Verified from Supabase - Dec 1, 2025)

### Tier 1: Major Cities (500K+ records)

| City | State | Records | Platform | Status |
|------|-------|--------:|----------|--------|
| Oakland | CA | 1,230,068 | Socrata | ✅ Complete |
| San Francisco | CA | 1,218,421 | Socrata | ✅ Complete |
| Memphis | TN | 783,569 | Socrata | ✅ Complete |
| New York City | NY | 723,088 | Socrata | ✅ Complete |
| Denver | CO | 584,810 | ArcGIS | ✅ Complete |
| Virginia Beach | VA | 524,037 | ArcGIS | ✅ Complete |
| Chicago | IL | 517,672 | Socrata | ✅ Complete |

### Tier 2: Large Cities (200K-500K records)

| City | State | Records | Platform | Status |
|------|-------|--------:|----------|--------|
| Las Vegas | NV | 423,683 | ArcGIS | ✅ Complete |
| Tucson | AZ | 405,383 | ArcGIS | ✅ Complete |
| Los Angeles | CA | 382,701 | Socrata | ✅ Complete |
| Dallas | TX | 369,444 | Socrata | ✅ Complete |
| Tempe | AZ | 349,673 | ArcGIS | ✅ Complete |
| Charlotte | NC | 347,000 | ArcGIS | ✅ Complete |
| New Orleans | LA | 328,182 | Socrata | ✅ Complete |
| Cincinnati | OH | 254,573 | Socrata | ✅ Complete |
| Cleveland | OH | 209,000 | ArcGIS | ✅ Complete |

### Tier 3: Medium Cities (50K-200K records)

| City | State | Records | Platform | Status |
|------|-------|--------:|----------|--------|
| Kansas City | MO | 199,020 | Socrata | ✅ Complete |
| Philadelphia | PA | 178,388 | Carto | 🔄 In Progress (3.4M target) |
| Seattle | WA | 163,918 | Socrata | ✅ Complete |
| Nashville | TN | 134,000 | ArcGIS | ✅ Complete |
| Norfolk | VA | 128,082 | Socrata | ✅ Complete |
| Grand Rapids | MI | 122,000 | ArcGIS | ✅ Complete |
| Sacramento | CA | 120,660 | ArcGIS | ✅ Complete |
| Detroit | MI | 88,569 | ArcGIS | ✅ Complete |
| San Diego | CA | 80,472 | Socrata | 🔄 In Progress (682K target) |
| Chattanooga | TN | 78,277 | Socrata | ✅ Complete |
| Louisville | KY | 62,248 | ArcGIS | ✅ Complete |
| Boise | ID | 59,124 | ArcGIS | ✅ Complete |
| Baltimore | MD | 53,334 | ArcGIS | ✅ Complete |
| Montgomery County | MD | 50,048 | Socrata | ✅ Complete |

### Tier 4: Smaller Cities (<50K records)

| City | State | Records | Platform | Status |
|------|-------|--------:|----------|--------|
| Minneapolis | MN | 25,619 | ArcGIS | ✅ Complete |
| Baton Rouge | LA | 20,836 | Socrata | ✅ Complete |
| Honolulu | HI | 14,580 | Socrata | ✅ Complete |
| Buffalo | NY | 14,096 | Socrata | ✅ Complete |
| Providence | RI | 6,035 | Socrata | ✅ Complete |
| Atlanta | GA | 3,640 | ArcGIS | ✅ Partial |
| Washington DC | DC | 3,000 | ArcGIS | ✅ 30-day rolling |

---

## NOT YET INGESTED (17 cities configured)

### High Priority - Large Datasets

| City | State | Est. Records | Platform | Notes |
|------|-------|-------------:|----------|-------|
| **Albuquerque** | NM | 1,400,000 | ArcGIS | Needs chunked ingestion |
| **Raleigh** | NC | 500,000 | ArcGIS | Police_Incidents_NIBRS |
| **Houston** | TX | 300,000 | Socrata | data.houstontx.gov |
| **Philadelphia** | PA | 3,298,546 | Carto | Remaining (178K ingested) |
| **San Diego** | CA | 601,872 | Socrata | Remaining (80K ingested) |

### Medium Priority - Texas Cities

| City | State | Est. Records | Platform | Domain |
|------|-------|-------------:|----------|--------|
| Austin | TX | 80,000+ | Socrata | data.austintexas.gov |
| San Antonio | TX | 150,000+ | Socrata | data.sanantonio.gov |
| Fort Worth | TX | 100,000+ | Socrata | data.fortworthtexas.gov |

### Standard Priority - Other Cities

| City | State | Est. Records | Platform | Notes |
|------|-------|-------------:|----------|-------|
| Columbus | OH | 100,000+ | ArcGIS | Dispatched Calls |
| Indianapolis | IN | 80,000+ | ArcGIS | IMPD_Public_Data |
| Orlando | FL | 50,000+ | Socrata | data.cityoforlando.net |
| Fort Lauderdale | FL | varies | Socrata | fortlauderdale.data.socrata.com |
| Hartford | CT | 50,000+ | ArcGIS | Police_Crime_Data |
| Charleston | SC | varies | ArcGIS | Needs verification |
| Omaha | NE | varies | ArcGIS | Needs verification |
| Anchorage | AK | varies | ArcGIS | Needs verification |

### Data Issues

| City | State | Issue |
|------|-------|-------|
| Little Rock | AR | Socrata dataset returns empty records |
| Tulsa | OK | All fields return null values |

---

## NEEDS SCRIPT DEVELOPMENT

### CKAN Script Required (4 cities)

| City | State | Portal | Resource ID | Est. Records |
|------|-------|--------|-------------|-------------:|
| Boston | MA | data.boston.gov | `12cb3883-56f5-47de-afa5-3b1cf61b257b` | 500,000+ |
| Milwaukee | WI | data.milwaukee.gov | `87843297-a6fa-46d4-ba5d-cb342fb2d3bb` | varies |
| Phoenix | AZ | phoenixopendata.com | `0ce3411a-2fc6-4302-a33f-167f68608a20` | 605,000 |
| Pittsburgh | PA | data.wprdc.org | TBD | varies |

---

## Platform Types

| Platform | Ingested | Not Ingested | Description |
|----------|:--------:|:------------:|-------------|
| **Socrata** | 17 cities | 8 cities | SODA REST API with SoQL |
| **ArcGIS** | 17 cities | 7 cities | FeatureServer REST endpoints |
| **Carto** | 1 city (partial) | 0 | SQL API |
| **CKAN** | 0 | 4 cities | Requires custom script |

---

## Configuration Reference

### Socrata Endpoints (25 configured)

| City | State | Domain | Dataset ID | Status |
|------|-------|--------|------------|--------|
| Los Angeles | CA | data.lacity.org | `2nrs-mtv8` | ✅ Ingested |
| San Francisco | CA | data.sfgov.org | `wg3w-h783` | ✅ Ingested |
| Oakland | CA | data.oaklandca.gov | `ppgh-7dqv` | ✅ Ingested |
| San Diego | CA | opendata.sandag.org | `pr74-d3tr` | 🔄 In Progress |
| Dallas | TX | www.dallasopendata.com | `qv6i-rri7` | ✅ Ingested |
| Houston | TX | data.houstontx.gov | `djdz-rf3k` | ❌ Not Started |
| Austin | TX | data.austintexas.gov | `fdj4-gpfu` | ❌ Not Started |
| San Antonio | TX | data.sanantonio.gov | `qarm-s7re` | ❌ Not Started |
| Fort Worth | TX | data.fortworthtexas.gov | `k6ic-7kp7` | ❌ Not Started |
| Chicago | IL | data.cityofchicago.org | `ijzp-q8t2` | ✅ Ingested |
| New York City | NY | data.cityofnewyork.us | `5uac-w243` | ✅ Ingested |
| Buffalo | NY | data.buffalony.gov | `d6g9-xbgu` | ✅ Ingested |
| Seattle | WA | data.seattle.gov | `tazs-3rd5` | ✅ Ingested |
| New Orleans | LA | data.nola.gov | `pc5d-tvaw` | ✅ Ingested |
| Baton Rouge | LA | data.brla.gov | `pbin-pcm7` | ✅ Ingested |
| Memphis | TN | data.memphistn.gov | `puh4-eea4` | ✅ Ingested |
| Chattanooga | TN | www.chattadata.org | `jvkg-79ss` | ✅ Ingested |
| Kansas City | MO | data.kcmo.org | `isbe-v4d8` | ✅ Ingested |
| Honolulu | HI | data.honolulu.gov | `vg88-5rn5` | ✅ Ingested |
| Cincinnati | OH | data.cincinnati-oh.gov | `k59e-2pvf` | ✅ Ingested |
| Providence | RI | data.providenceri.gov | `rz3y-pz8v` | ✅ Ingested |
| Norfolk | VA | data.norfolk.gov | `r7bn-2egr` | ✅ Ingested |
| Orlando | FL | data.cityoforlando.net | `69ge-5wp8` | ❌ Not Started |
| Fort Lauderdale | FL | fortlauderdale.data.socrata.com | `4gb7-f88q` | ❌ Not Started |
| Montgomery County | MD | data.montgomerycountymd.gov | `icn6-v9z3` | ✅ Ingested |

### ArcGIS Endpoints (26 configured)

| City | State | Status | Notes |
|------|-------|--------|-------|
| Sacramento | CA | ✅ Ingested | 120K records |
| Denver | CO | ✅ Ingested | 584K records |
| Charlotte | NC | ✅ Ingested | 347K records |
| Raleigh | NC | ❌ Not Started | 500K+ expected |
| Detroit | MI | ✅ Ingested | 88K records |
| Grand Rapids | MI | ✅ Ingested | 122K records |
| Indianapolis | IN | ❌ Not Started | 80K+ expected |
| Nashville | TN | ✅ Ingested | 134K records |
| Louisville | KY | ✅ Ingested | 62K records |
| Minneapolis | MN | ✅ Ingested | 25K records |
| Las Vegas | NV | ✅ Ingested | 423K records |
| Washington DC | DC | ✅ Ingested | 3K (30-day rolling) |
| Baltimore | MD | ✅ Ingested | 53K records |
| Albuquerque | NM | ❌ Not Started | 1.4M+ expected |
| Atlanta | GA | ✅ Partial | 3.6K records |
| Cleveland | OH | ✅ Ingested | 209K records |
| Columbus | OH | ❌ Not Started | 100K+ expected |
| Tucson | AZ | ✅ Ingested | 405K records |
| Tempe | AZ | ✅ Ingested | 349K records |
| Virginia Beach | VA | ✅ Ingested | 524K records |
| Hartford | CT | ❌ Not Started | 50K+ expected |
| Boise | ID | ✅ Ingested | 59K records |
| Charleston | SC | ❌ Not Started | Needs verification |
| Omaha | NE | ❌ Not Started | Needs verification |
| Anchorage | AK | ❌ Not Started | Needs verification |

### Carto Endpoints (1 configured)

| City | State | Table | Status |
|------|-------|-------|--------|
| Philadelphia | PA | incidents_part1_part2 | 🔄 178K/3.4M |

---

## Scripts Reference

| Script | Platform | Notes |
|--------|----------|-------|
| `scripts/ingest-socrata-crime.ts` | Socrata | SODA API |
| `scripts/ingest-arcgis-crime-unified.ts` | ArcGIS | FeatureServer |
| `scripts/resume-crime-ingestion.ts` | Multi | NYC, San Diego, Philadelphia |
| `scripts/config/crime-sources.ts` | All | Configuration registry |

### Commands

```bash
# Check status
npx tsx scripts/resume-crime-ingestion.ts --check-only

# List available cities
npx tsx scripts/ingest-socrata-crime.ts --list
npx tsx scripts/ingest-arcgis-crime-unified.ts --list

# Ingest specific city
npx tsx scripts/ingest-socrata-crime.ts --city "Chicago"
npx tsx scripts/ingest-arcgis-crime-unified.ts --city "Denver"

# Run with limit for testing
npx tsx scripts/ingest-socrata-crime.ts --city "Houston" --limit 10000
```

---

## States Without Public Crime API (8)

| State | Notes |
|-------|-------|
| Maine | No statewide or city-level API |
| Mississippi | State portals exist but no crime API |
| Montana | Limited data, no API access |
| North Dakota | No public API |
| New Hampshire | No public API |
| Oklahoma | Only Tulsa has API, but data is empty |
| West Virginia | No public API |
| Wyoming | No public API |

---

## Recent Changes (Dec 2025)

| Date | Change |
|------|--------|
| Dec 1 | Verified 36 cities ingested (10.1M records) |
| Dec 1 | NYC re-ingested with correct dataset (723K) |
| Dec 1 | San Diego migrated from ArcGIS to SANDAG Socrata |
| Dec 1 | Updated field mappings for Indianapolis, Baltimore, Albuquerque |
| Dec 1 | Added Atlanta, Cleveland, Columbus to ArcGIS config |
