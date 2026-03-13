#!/bin/bash
# Resume Crime Ingestion Script
# Runs NYC (re-ingest), San Diego (new Socrata), Philadelphia sequentially
# With aggressive rate limiting to prevent Supabase overload

echo "=== Starting Crime Data Resume Ingestion ==="
echo "Started at: $(date)"
echo ""

cd /home/runner/workspace

# Run all cities - the script handles the order and rate limiting
npx tsx scripts/resume-crime-ingestion.ts 2>&1 | tee /tmp/crime-resume-$(date +%Y%m%d-%H%M%S).log

echo ""
echo "=== Completed at: $(date) ==="
