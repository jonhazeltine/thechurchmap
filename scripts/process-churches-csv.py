#!/usr/bin/env python3
"""
Process church CSV data for import into Kingdom Map Platform.
Extracts denominations, cleans tags, and performs spatial join with boundaries.
"""

import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
import json

# Known denominations to extract
DENOMINATIONS = [
    'Baptist', 'Catholic', 'Methodist', 'Reformed', 'Lutheran', 
    'Pentecostal', 'Episcopal', 'Nazarene', 'Protestant', 
    'Presbyterian', 'Non-Denominational', 'Assemblies of God',
    'Church of Christ', 'Wesleyan', 'Evangelical'
]

# Tags to exclude
EXCLUDE_TAGS = [
    'all churches', 'city churches', 'michigan', 'potential strategic partner',
    'bridge churches', 'gr township', 'kentwood', 'grand rapids'
]

def extract_denomination(categories):
    """Extract denomination from semicolon-separated categories."""
    if pd.isna(categories):
        return None
    
    cats = [c.strip() for c in str(categories).split(';')]
    
    # Check each category against known denominations
    for cat in cats:
        for denom in DENOMINATIONS:
            if denom.lower() in cat.lower():
                return denom
    
    return None

def clean_tags(categories):
    """Extract and clean tags from categories."""
    if pd.isna(categories):
        return []
    
    cats = [c.strip() for c in str(categories).split(';')]
    
    # Filter out unwanted tags
    clean = []
    for cat in cats:
        cat_lower = cat.lower()
        
        # Skip if it's a denomination (already extracted)
        is_denom = any(d.lower() in cat_lower for d in DENOMINATIONS)
        if is_denom:
            continue
            
        # Skip if it's in exclude list
        if cat_lower in EXCLUDE_TAGS:
            continue
            
        # Skip if it contains "churches in"
        if 'churches in' in cat_lower:
            continue
            
        # Skip if it's just a city name (single word, capitalized)
        if cat and cat[0].isupper() and ' ' not in cat and cat not in ['Bama (Byron Area Ministerial Association)']:
            continue
        
        # Keep it if it passed all filters
        if cat:
            clean.append(cat)
    
    return clean

def main():
    print("Loading church CSV...")
    churches_df = pd.read_csv("attached_assets/manual mapme_1763830120559.csv")
    
    print(f"Loaded {len(churches_df)} churches")
    
    # Create geometry from lat/lon
    print("Creating geometry points...")
    churches_df["geometry"] = churches_df.apply(
        lambda row: Point(row["longitude"], row["latitude"]), 
        axis=1
    )
    churches_gdf = gpd.GeoDataFrame(churches_df, geometry="geometry", crs="EPSG:4326")
    
    # Load Michigan PLACE boundaries (already imported)
    print("Loading boundary GeoJSON...")
    boundaries_gdf = gpd.read_file("tl_2025_26_place.json")
    
    # Spatial join to find matching boundary
    print("Performing spatial join...")
    churches_with_boundary = gpd.sjoin(
        churches_gdf, 
        boundaries_gdf, 
        how="left", 
        predicate="within"
    )
    
    # Extract denomination and clean tags
    print("Processing categories...")
    churches_with_boundary["denomination"] = churches_with_boundary["categories"].apply(extract_denomination)
    churches_with_boundary["tags"] = churches_with_boundary["categories"].apply(clean_tags)
    
    # Prepare final data structure
    print("Preparing output...")
    output_data = []
    
    for idx, row in churches_with_boundary.iterrows():
        church = {
            "name": row["name"],
            "address": row["address"] if pd.notna(row["address"]) else None,
            "phone": None,
            "email": None,
            "website": row["Url"] if pd.notna(row["Url"]) else None,
            "denomination": row["denomination"],
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "tags": row["tags"],
            "boundary_geoid": row["GEOID"] if pd.notna(row.get("GEOID")) else None,
            "boundary_name": row["NAME"] if pd.notna(row.get("NAME")) else None
        }
        output_data.append(church)
    
    # Save to JSON
    print("Saving to JSON...")
    with open("scripts/churches_processed.json", "w") as f:
        json.dump(output_data, f, indent=2)
    
    print(f"\n✅ Successfully processed {len(output_data)} churches")
    print(f"   - {sum(1 for c in output_data if c['denomination'])} have denominations")
    print(f"   - {sum(1 for c in output_data if c['boundary_geoid'])} matched to boundaries")
    print(f"   - Output saved to: scripts/churches_processed.json")
    
    # Print sample
    print("\nSample output:")
    print(json.dumps(output_data[0], indent=2))

if __name__ == "__main__":
    main()
