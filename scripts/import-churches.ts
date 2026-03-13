import * as fs from 'fs';

async function importChurches() {
  // Load processed church data
  console.log('Loading processed church data...');
  const churches = JSON.parse(fs.readFileSync('scripts/churches_processed.json', 'utf-8'));
  
  console.log(`Loaded ${churches.length} churches for import`);
  console.log('\n🚨 THIS WILL DELETE ALL EXISTING CHURCHES AND AREAS! 🚨\n');
  
  // Call bulk import API
  console.log('Calling bulk import API...');
  const response = await fetch('http://localhost:5000/api/churches/bulk-import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ churches })
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Import failed:', error);
    process.exit(1);
  }
  
  const result = await response.json();
  console.log('\n✅ Import completed successfully!');
  console.log(`   - Imported: ${result.imported} churches`);
  console.log(`   - Boundaries attached: ${result.boundaries_attached} churches`);
  console.log(`   - Deleted: ${result.deleted}`);
}

importChurches().catch(console.error);
