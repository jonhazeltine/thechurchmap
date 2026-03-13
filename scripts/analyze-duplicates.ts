import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function analyzeDuplicates() {
  // Load the 83 churches from missing-churches.json
  const missingPath = path.join(__dirname, 'missing-churches.json');
  const missingChurches = JSON.parse(fs.readFileSync(missingPath, 'utf-8'));
  
  console.log('Analyzing 83 imported churches for potential duplicates...\n');
  console.log('='.repeat(80));
  
  // Get all churches from database
  const { data: allChurches } = await supabase
    .from('churches')
    .select('id, name, city, address, source, latitude:location')
    .limit(10000);
  
  if (!allChurches) {
    console.error('Could not fetch churches');
    return;
  }
  
  // For each of the 83 churches, find potential duplicates
  let duplicateCount = 0;
  const duplicates: any[] = [];
  
  for (const imported of missingChurches) {
    // Find churches with similar names
    const similarByName = allChurches.filter(c => {
      if (c.name === imported.name) return false; // Skip exact match (itself)
      const nameA = c.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      const nameB = imported.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      // Check if names are very similar
      return nameA.includes(nameB) || nameB.includes(nameA) || 
             levenshteinSimilarity(nameA, nameB) > 0.8;
    });
    
    if (similarByName.length > 0) {
      duplicateCount++;
      duplicates.push({
        imported: imported.name,
        similar: similarByName.map(s => ({ name: s.name, source: s.source, city: s.city }))
      });
    }
  }
  
  console.log(`\nFound ${duplicateCount} churches with potential duplicates:\n`);
  
  duplicates.forEach((d, i) => {
    console.log(`${i + 1}. IMPORTED: "${d.imported}"`);
    d.similar.forEach((s: any) => {
      console.log(`   SIMILAR:  "${s.name}" (${s.source || 'manual'}) - ${s.city || 'N/A'}`);
    });
    console.log('');
  });
  
  // Also show count of exact name matches (true duplicates)
  console.log('='.repeat(80));
  console.log('\nChecking for EXACT name matches (true duplicates):');
  
  const names = missingChurches.map((c: any) => c.name);
  const exactDupes = allChurches.filter(c => {
    const matchCount = allChurches.filter(o => o.name === c.name).length;
    return names.includes(c.name) && matchCount > 1;
  });
  
  // Group by name
  const dupesByName: Record<string, any[]> = {};
  exactDupes.forEach(c => {
    if (!dupesByName[c.name]) dupesByName[c.name] = [];
    dupesByName[c.name].push(c);
  });
  
  const exactDupeNames = Object.keys(dupesByName);
  console.log(`\nFound ${exactDupeNames.length} exact duplicate names:\n`);
  
  exactDupeNames.forEach(name => {
    console.log(`"${name}" appears ${dupesByName[name].length} times:`);
    dupesByName[name].forEach(c => {
      console.log(`  - ID: ${c.id}, Source: ${c.source || 'manual'}, City: ${c.city || 'N/A'}`);
    });
    console.log('');
  });
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  if (b.length === 0) return 0;
  
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const maxLen = Math.max(a.length, b.length);
  return 1 - matrix[b.length][a.length] / maxLen;
}

analyzeDuplicates().catch(console.error);
