#!/bin/bash
# =============================================================================
# Complete Crime Data Ingestion Script
# =============================================================================
# This script ingests all remaining cities that haven't been processed yet.
# Uses aggressive rate limiting to prevent Supabase overload.
#
# Current Status (Dec 2, 2025 - Updated):
# - 42 cities already ingested (22.2M records)
# - 12 cities remaining
# - Houston uses 30-day rolling endpoint (cumulative ingestion mode)
#
# Usage:
#   ./scripts/ingest-remaining-cities.sh           # Run all remaining
#   ./scripts/ingest-remaining-cities.sh socrata   # Run Socrata only
#   ./scripts/ingest-remaining-cities.sh arcgis    # Run ArcGIS only
#   ./scripts/ingest-remaining-cities.sh --check   # Check status only
#   ./scripts/ingest-remaining-cities.sh --city "Houston"  # Run specific city
# =============================================================================

set -e

LOG_DIR="/tmp/crime-ingestion"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
MAIN_LOG="$LOG_DIR/ingestion-$TIMESTAMP.log"

echo "=== Crime Data Ingestion Started ===" | tee "$MAIN_LOG"
echo "Started at: $(date)" | tee -a "$MAIN_LOG"
echo "Log file: $MAIN_LOG" | tee -a "$MAIN_LOG"
echo "" | tee -a "$MAIN_LOG"

cd /home/runner/workspace

# Rate limiting settings
DELAY_BETWEEN_CITIES=30  # seconds between cities

# =============================================================================
# SOCRATA CITIES - NONE REMAINING
# =============================================================================
# San Antonio, Little Rock, Orlando - Endpoints no longer available (404/moved)
# Fort Worth - Moved to ArcGIS (see below)
SOCRATA_CITIES=()

# =============================================================================
# ARCGIS CITIES (Not yet ingested - 9 cities)
# =============================================================================
ARCGIS_CITIES=(
  "Houston"          # 30-day rolling, cumulative ingestion
  "Fort Worth"       # 590K records - moved from Socrata to ArcGIS
  "Indianapolis"
  "Raleigh"
  "Charleston"
  "Phoenix"
  "Omaha"
  "Tulsa"
  "Anchorage"
)

# =============================================================================
# COMPLETED CITIES (42 cities, 22.2M records)
# =============================================================================
# Austin (6M), Philadelphia (4.3M), Oakland (1.2M), San Francisco (1.2M),
# Memphis (783K), Fort Lauderdale (781K), NYC (723K), San Diego (682K),
# Denver (585K), Virginia Beach (524K), Chicago (518K), Las Vegas (424K),
# Tucson (405K), Los Angeles (383K), Dallas (369K), Tempe (350K),
# Charlotte (347K), Pittsburgh (341K), New Orleans (328K), Cincinnati (255K),
# Cleveland (209K), Kansas City (199K), Seattle (164K), Nashville (134K),
# Norfolk (128K), Grand Rapids (122K), Sacramento (121K), Detroit (89K),
# Chattanooga (78K), Louisville (62K), Milwaukee (60K), Boise (59K),
# Albuquerque (55K), Baltimore (53K), Montgomery County (50K), Minneapolis (26K),
# Baton Rouge (21K), Honolulu (15K), Buffalo (14K), Providence (6K),
# Atlanta (4K), Washington DC (3K)

# =============================================================================
# Helper Functions
# =============================================================================

run_socrata() {
  local city="$1"
  echo "" | tee -a "$MAIN_LOG"
  echo "============================================================" | tee -a "$MAIN_LOG"
  echo "SOCRATA: $city" | tee -a "$MAIN_LOG"
  echo "Started at: $(date)" | tee -a "$MAIN_LOG"
  echo "============================================================" | tee -a "$MAIN_LOG"
  
  local city_log="$LOG_DIR/socrata-$(echo $city | tr ' ' '_' | tr '[:upper:]' '[:lower:]')-$TIMESTAMP.log"
  
  npx tsx scripts/ingest-socrata-crime.ts --city "$city" 2>&1 | tee "$city_log" | tee -a "$MAIN_LOG"
  
  echo "Completed: $city at $(date)" | tee -a "$MAIN_LOG"
  echo "Waiting ${DELAY_BETWEEN_CITIES}s before next city..." | tee -a "$MAIN_LOG"
  sleep $DELAY_BETWEEN_CITIES
}

run_arcgis() {
  local city="$1"
  echo "" | tee -a "$MAIN_LOG"
  echo "============================================================" | tee -a "$MAIN_LOG"
  echo "ARCGIS: $city" | tee -a "$MAIN_LOG"
  echo "Started at: $(date)" | tee -a "$MAIN_LOG"
  echo "============================================================" | tee -a "$MAIN_LOG"
  
  local city_log="$LOG_DIR/arcgis-$(echo $city | tr ' ' '_' | tr '[:upper:]' '[:lower:]')-$TIMESTAMP.log"
  
  npx tsx scripts/ingest-arcgis-crime-unified.ts --city "$city" 2>&1 | tee "$city_log" | tee -a "$MAIN_LOG"
  
  echo "Completed: $city at $(date)" | tee -a "$MAIN_LOG"
  echo "Waiting ${DELAY_BETWEEN_CITIES}s before next city..." | tee -a "$MAIN_LOG"
  sleep $DELAY_BETWEEN_CITIES
}

check_status() {
  echo "Checking ingestion status..." | tee -a "$MAIN_LOG"
  npx tsx scripts/check-all-city-counts.ts 2>&1 | tee -a "$MAIN_LOG"
}

# Check if city is in Socrata list
is_socrata_city() {
  local city="$1"
  for c in "${SOCRATA_CITIES[@]}"; do
    if [[ "${c,,}" == "${city,,}" ]]; then
      return 0
    fi
  done
  return 1
}

# Check if city is in ArcGIS list
is_arcgis_city() {
  local city="$1"
  for c in "${ARCGIS_CITIES[@]}"; do
    if [[ "${c,,}" == "${city,,}" ]]; then
      return 0
    fi
  done
  return 1
}

# =============================================================================
# Main Execution
# =============================================================================

case "${1:-all}" in
  --check)
    check_status
    exit 0
    ;;
  
  --city)
    CITY_NAME="$2"
    if [ -z "$CITY_NAME" ]; then
      echo "Error: --city requires a city name" | tee -a "$MAIN_LOG"
      echo "Usage: $0 --city \"Houston\"" | tee -a "$MAIN_LOG"
      exit 1
    fi
    
    echo "=== Running Single City: $CITY_NAME ===" | tee -a "$MAIN_LOG"
    
    if is_socrata_city "$CITY_NAME"; then
      run_socrata "$CITY_NAME"
    elif is_arcgis_city "$CITY_NAME"; then
      run_arcgis "$CITY_NAME"
    else
      echo "City '$CITY_NAME' not found in pending lists. Try:" | tee -a "$MAIN_LOG"
      echo "  Socrata: ${SOCRATA_CITIES[*]}" | tee -a "$MAIN_LOG"
      echo "  ArcGIS: ${ARCGIS_CITIES[*]}" | tee -a "$MAIN_LOG"
      exit 1
    fi
    ;;
  
  socrata)
    echo "=== Running Socrata Cities Only (${#SOCRATA_CITIES[@]} cities) ===" | tee -a "$MAIN_LOG"
    for city in "${SOCRATA_CITIES[@]}"; do
      run_socrata "$city"
    done
    ;;
  
  arcgis)
    echo "=== Running ArcGIS Cities Only (${#ARCGIS_CITIES[@]} cities) ===" | tee -a "$MAIN_LOG"
    for city in "${ARCGIS_CITIES[@]}"; do
      run_arcgis "$city"
    done
    ;;
  
  all|*)
    echo "=== Running All Remaining Cities (12 cities) ===" | tee -a "$MAIN_LOG"
    echo "" | tee -a "$MAIN_LOG"
    
    echo "--- Socrata Cities (${#SOCRATA_CITIES[@]} cities) ---" | tee -a "$MAIN_LOG"
    for city in "${SOCRATA_CITIES[@]}"; do
      run_socrata "$city"
    done
    
    echo "" | tee -a "$MAIN_LOG"
    echo "--- ArcGIS Cities (${#ARCGIS_CITIES[@]} cities) ---" | tee -a "$MAIN_LOG"
    for city in "${ARCGIS_CITIES[@]}"; do
      run_arcgis "$city"
    done
    ;;
esac

echo "" | tee -a "$MAIN_LOG"
echo "=== Ingestion Complete ===" | tee -a "$MAIN_LOG"
echo "Finished at: $(date)" | tee -a "$MAIN_LOG"
echo "" | tee -a "$MAIN_LOG"

# Final status check
echo "--- Final Status ---" | tee -a "$MAIN_LOG"
check_status

echo "" | tee -a "$MAIN_LOG"
echo "Full log saved to: $MAIN_LOG" | tee -a "$MAIN_LOG"
