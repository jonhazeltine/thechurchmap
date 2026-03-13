#!/bin/bash
REPO="jonhazeltine/thechurchmap"
TAG="v1.0-data"
BASE_URL="https://github.com/$REPO/releases/download/$TAG"

echo "Downloading data files and assets from GitHub Release ($TAG)..."
echo ""

mkdir -p public client/public attached_assets/generated_images

echo "=== Data Files ==="

echo "[1/4] Downloading public/all-churches-sampled.geojson (48 MB)..."
curl -L -o public/all-churches-sampled.geojson "$BASE_URL/public-all-churches-sampled.geojson"

echo "[2/4] Downloading public/all-churches.mbtiles (71 MB)..."
curl -L -o public/all-churches.mbtiles "$BASE_URL/public-all-churches.mbtiles"

echo "[3/4] Downloading client/public/all-churches-sampled.geojson (3 MB)..."
curl -L -o client/public/all-churches-sampled.geojson "$BASE_URL/client-public-all-churches-sampled.geojson"

echo "[4/4] Downloading all-churches-v8.mbtiles (180 MB)..."
curl -L -o all-churches-v8.mbtiles "$BASE_URL/all-churches-v8.mbtiles"

echo ""
echo "=== Branding & UI Images ==="

echo "[1/8] Downloading logo (light mode)..."
curl -L -o attached_assets/5_1764205464663.png "$BASE_URL/logo-light.png"

echo "[2/8] Downloading logo (dark mode)..."
curl -sL -o "attached_assets/The Churches White on Black (Presentation)_1764205730044.png" "$BASE_URL/logo-dark.png"

echo "[3/8] Downloading empty search illustration..."
curl -L -o attached_assets/generated_images/empty_search_results_illustration.png "$BASE_URL/empty_search_results_illustration.png"

echo "[4/8] Downloading draw larger polygon suggestion..."
curl -L -o attached_assets/generated_images/draw_larger_polygon_suggestion.png "$BASE_URL/draw_larger_polygon_suggestion.png"

echo "[5/8] Downloading church placeholder icon..."
curl -L -o attached_assets/generated_images/church_placeholder_icon.png "$BASE_URL/church_placeholder_icon.png"

echo "[6/8] Downloading mountain cross hero image..."
curl -L -o attached_assets/generated_images/mountain_cross_on_right_side.png "$BASE_URL/mountain_cross_on_right_side.png"

echo "[7/8] Downloading prayer focus graphic..."
curl -L -o attached_assets/generated_images/prayer_focus_default_graphic.png "$BASE_URL/prayer_focus_default_graphic.png"

echo "[8/8] Downloading favicon..."
curl -L -o client/public/favicon.png "$BASE_URL/favicon.png"

echo ""
echo "Done! All data files and branding assets downloaded."
