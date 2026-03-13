const API_BASE = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

async function verifyImport() {
  console.log('Verifying Census Places Import...\n');
  
  const response = await fetch(`${API_BASE}/api/boundaries?source=census_2025`);
  const boundaries = await response.json();
  
  console.log(`Total Census 2025 boundaries: ${boundaries.length}`);
  
  const placeResponse = await fetch(`${API_BASE}/api/boundaries?type=place&limit=10`);
  const places = await placeResponse.json();
  
  console.log(`\nSample place boundaries (first 10):`);
  places.forEach((place: any, idx: number) => {
    console.log(`  ${idx + 1}. ${place.name} (ID: ${place.external_id})`);
  });
  
  const typeCounts: Record<string, number> = {};
  boundaries.forEach((b: any) => {
    typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
  });
  
  console.log(`\nBoundaries by type:`);
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  console.log('\n✓ Import verification complete!');
}

verifyImport();
