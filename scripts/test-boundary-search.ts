const API_BASE = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

async function testBoundarySearch() {
  console.log('Testing boundary search...\n');
  
  const testQueries = ['detroit', 'ann arbor', 'grand rapids', 'lansing'];
  
  for (const query of testQueries) {
    console.log(`Searching for: "${query}"`);
    
    try {
      const response = await fetch(`${API_BASE}/api/boundaries/search?q=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        console.log(`  ✗ Error: HTTP ${response.status}`);
        const error = await response.text();
        console.log(`  ${error.substring(0, 100)}`);
        continue;
      }
      
      const results = await response.json();
      console.log(`  ✓ Found ${results.length} results`);
      
      if (results.length > 0) {
        results.slice(0, 3).forEach((r: any) => {
          console.log(`    - ${r.name} (${r.type})`);
        });
      }
      console.log();
      
    } catch (error: any) {
      console.log(`  ✗ Request failed: ${error.message}\n`);
    }
  }
}

testBoundarySearch();
