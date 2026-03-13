import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

// Known denominations to extract
const DENOMINATIONS = [
  'Baptist', 'Catholic', 'Methodist', 'Reformed', 'Lutheran',
  'Pentecostal', 'Episcopal', 'Nazarene', 'Protestant',
  'Presbyterian', 'Non-Denominational', 'Assemblies of God',
  'Church of Christ', 'Wesleyan', 'Evangelical'
];

// Tags to exclude
const EXCLUDE_TAGS = [
  'all churches', 'city churches', 'michigan', 'potential strategic partner',
  'bridge churches', 'gr township', 'kentwood', 'grand rapids'
];

function extractDenomination(categories: string | undefined): string | null {
  if (!categories) return null;
  
  const cats = categories.split(';').map(c => c.trim());
  
  for (const cat of cats) {
    for (const denom of DENOMINATIONS) {
      if (cat.toLowerCase().includes(denom.toLowerCase())) {
        return denom;
      }
    }
  }
  
  return null;
}

function cleanTags(categories: string | undefined): string[] {
  if (!categories) return [];
  
  const cats = categories.split(';').map(c => c.trim());
  const clean: string[] = [];
  
  for (const cat of cats) {
    const catLower = cat.toLowerCase();
    
    // Skip if it's a denomination
    const isDenom = DENOMINATIONS.some(d => catLower.includes(d.toLowerCase()));
    if (isDenom) continue;
    
    // Skip if in exclude list
    if (EXCLUDE_TAGS.includes(catLower)) continue;
    
    // Skip if contains "churches in"
    if (catLower.includes('churches in')) continue;
    
    // Skip single-word city names (but keep special tags)
    if (cat && cat[0] === cat[0].toUpperCase() && !cat.includes(' ') && 
        cat !== 'Bama (Byron Area Ministerial Association)') {
      continue;
    }
    
    if (cat) {
      clean.push(cat);
    }
  }
  
  return clean;
}

async function main() {
  console.log('Loading church CSV...');
  const csvContent = fs.readFileSync('attached_assets/manual mapme_1763830120559.csv', 'utf-8');
  
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  
  console.log(`Loaded ${records.length} churches`);
  
  // Process each church
  console.log('Processing churches...');
  const output: any[] = [];
  let denomCount = 0;
  let tagCount = 0;
  
  for (const row of records) {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    
    if (isNaN(lat) || isNaN(lon)) {
      console.warn(`Skipping church with invalid coords: ${row.name}`);
      continue;
    }
    
    const denomination = extractDenomination(row.categories);
    if (denomination) denomCount++;
    
    const tags = cleanTags(row.categories);
    if (tags.length > 0) tagCount++;
    
    output.push({
      name: row.name || 'Unnamed Church',
      address: row.address || null,
      phone: null,
      email: null,
      website: row.Url || null,
      denomination,
      latitude: lat,
      longitude: lon,
      tags
    });
  }
  
  // Save output
  console.log('Saving processed data...');
  fs.writeFileSync(
    'scripts/churches_processed.json',
    JSON.stringify(output, null, 2)
  );
  
  console.log(`\n✅ Successfully processed ${output.length} churches`);
  console.log(`   - ${denomCount} have denominations`);
  console.log(`   - ${tagCount} have tags`);
  console.log(`   - Output saved to: scripts/churches_processed.json`);
  console.log(`   - Spatial join with boundaries will happen during import via PostGIS`);
  
  console.log('\nSample output:');
  console.log(JSON.stringify(output[0], null, 2));
  console.log('\nDenominations found:');
  const denoms = new Set(output.map(c => c.denomination).filter(Boolean));
  console.log(Array.from(denoms).sort().join(', '));
}

main().catch(console.error);
