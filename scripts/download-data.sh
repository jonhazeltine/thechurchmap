#!/bin/bash
REPO="jonhazeltine/thechurchmap"
TAG="v1.0-data"
BASE_URL="https://github.com/$REPO/releases/download/$TAG"

echo "Downloading data files from GitHub Release ($TAG)..."

mkdir -p public client/public

echo "[1/4] Downloading public/all-churches-sampled.geojson (48 MB)..."
curl -L -o public/all-churches-sampled.geojson "$BASE_URL/public-all-churches-sampled.geojson"

echo "[2/4] Downloading public/all-churches.mbtiles (71 MB)..."
curl -L -o public/all-churches.mbtiles "$BASE_URL/public-all-churches.mbtiles"

echo "[3/4] Downloading client/public/all-churches-sampled.geojson (3 MB)..."
curl -L -o client/public/all-churches-sampled.geojson "$BASE_URL/client-public-all-churches-sampled.geojson"

echo "[4/4] Downloading all-churches-v8.mbtiles (180 MB)..."
curl -L -o all-churches-v8.mbtiles "$BASE_URL/all-churches-v8.mbtiles"

echo ""
echo "Done! All data files downloaded."
