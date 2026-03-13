#!/bin/bash
# Final Crime Data Ingestion Script
# December 2025 - Remaining cities after endpoint verification
#
# WORKING ENDPOINTS:
#   - Fort Worth, TX (ArcGIS) - 590,119 records available
#
# TEMPORARILY UNAVAILABLE:
#   - Houston, TX (ArcGIS) - Service not started on city server, check back later
#
# RETIRED DATASETS (no replacement found):
#   - Little Rock, AR (Socrata) - Dataset 8mii-3cm3 removed from portal
#   - Orlando, FL (Socrata) - Dataset 69ge-5wp8 removed from portal
#   - San Antonio, TX (Socrata → CKAN) - Only CSV download available (needs custom script)
#
# Usage: ./scripts/ingest-final-cities.sh

set -e

echo "=============================================="
echo "Crime Data Ingestion - Final Cities"
echo "=============================================="
echo ""

# Fort Worth - ArcGIS (590K records)
echo "[1/1] Ingesting Fort Worth, TX (ArcGIS)..."
echo "      Estimated records: ~590,000"
echo ""
npx tsx scripts/ingest-arcgis-crime-unified.ts --city "Fort Worth"

echo ""
echo "=============================================="
echo "Ingestion Complete!"
echo "=============================================="
echo ""
echo "Summary:"
echo "  ✓ Fort Worth, TX - Ingested from ArcGIS"
echo ""
echo "Skipped (temporarily unavailable):"
echo "  ⏳ Houston, TX - City ArcGIS service not started"
echo ""
echo "Skipped (datasets retired):"
echo "  ✗ Little Rock, AR - Socrata dataset removed"
echo "  ✗ Orlando, FL - Socrata dataset removed"
echo "  ✗ San Antonio, TX - Needs custom CSV ingestion"
echo ""
echo "To retry Houston later:"
echo "  curl -s 'https://mycity2.houstontx.gov/geocloud02/rest/services/HPD/NIBRS_Recent_Crime_30days/FeatureServer/0?f=json'"
echo "  # If returns JSON (not error), run:"
echo "  npx tsx scripts/ingest-arcgis-crime-unified.ts --city Houston"
