import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function deleteOrphanedAreas() {
  // Find the areas by name
  const { data: areas, error: findError } = await supabase
    .from('areas')
    .select('id, name, church_id')
    .or('name.ilike.%unity map%,name.ilike.%NE Grand Rapids%');
  
  if (findError) {
    console.error('Error finding areas:', findError);
    return;
  }
  
  console.log('Found ministry areas to delete:');
  areas?.forEach(a => {
    console.log(`  - "${a.name}" (ID: ${a.id}, Church: ${a.church_id || 'none'})`);
  });
  
  if (!areas || areas.length === 0) {
    console.log('No matching areas found.');
    return;
  }
  
  // Delete them
  const ids = areas.map(a => a.id);
  const { error: deleteError } = await supabase
    .from('areas')
    .delete()
    .in('id', ids);
  
  if (deleteError) {
    console.error('Error deleting:', deleteError);
    return;
  }
  
  console.log(`\n✅ Successfully deleted ${areas.length} orphaned ministry areas`);
}

deleteOrphanedAreas().catch(console.error);
