import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteReimportedChurches() {
  console.log('Loading missing churches list...');
  const missingPath = path.join(__dirname, 'missing-churches.json');
  
  if (!fs.existsSync(missingPath)) {
    console.error('Missing churches file not found.');
    return;
  }
  
  const missingChurches = JSON.parse(fs.readFileSync(missingPath, 'utf-8'));
  const names = missingChurches.map((c: any) => c.name);
  
  console.log(`Found ${names.length} church names to delete`);

  // Delete churches matching these names that are manual source
  const { data: toDelete, error: findError } = await supabase
    .from('churches')
    .select('id, name')
    .in('name', names)
    .eq('source', 'manual');

  if (findError) {
    console.error('Error finding churches:', findError);
    return;
  }

  console.log(`Found ${toDelete?.length || 0} matching churches in database`);
  
  if (!toDelete || toDelete.length === 0) {
    console.log('No churches to delete.');
    return;
  }

  // Show what we're deleting
  console.log('\nChurches to delete:');
  toDelete.forEach(c => console.log(`  - ${c.name}`));

  // Delete them
  const ids = toDelete.map(c => c.id);
  const { error: deleteError } = await supabase
    .from('churches')
    .delete()
    .in('id', ids);

  if (deleteError) {
    console.error('Error deleting churches:', deleteError);
    return;
  }

  console.log(`\n✅ Successfully deleted ${toDelete.length} reimported churches`);
}

deleteReimportedChurches().catch(console.error);
