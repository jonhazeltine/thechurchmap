import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

async function findOrphans() {
  console.log('=== Finding orphaned submissions ===\n');
  
  // 1. Find submissions without valid application_id
  const { data: allSubmissions, error: subError } = await supabase
    .from('partnership_application_submissions')
    .select('id, application_id, applicant_name, applicant_email, created_at');
  
  if (subError) {
    console.log('Submissions table error:', subError.message);
  } else {
    console.log('Total submissions:', allSubmissions?.length || 0);
    allSubmissions?.forEach(s => {
      console.log(`  - ${s.applicant_name} (${s.applicant_email}) -> app: ${s.application_id}`);
    });
  }
  
  // 2. Find all applications
  const { data: allApps, error: appError } = await supabase
    .from('partnership_applications')
    .select(`
      id,
      church_id,
      status,
      path,
      applicant_name,
      applicant_email,
      created_at,
      church:church_id (id, name)
    `);
  
  if (appError) {
    console.log('\nApplications table error:', appError.message);
  } else {
    console.log('\nTotal applications:', allApps?.length || 0);
    allApps?.forEach(a => {
      const churchName = (a.church as any)?.name || 'NO CHURCH LINKED';
      console.log(`  - ${a.applicant_name} for "${churchName}" (status: ${a.status}, church_id: ${a.church_id})`);
    });
  }
  
  // 3. Look for "test" in church names
  const { data: testChurches, error: testError } = await supabase
    .from('churches')
    .select('id, name, city, state')
    .ilike('name', '%test%');
  
  if (!testError && testChurches?.length) {
    console.log('\n=== Churches with "test" in name ===');
    testChurches.forEach(c => {
      console.log(`  - ${c.name} (${c.city}, ${c.state}) - ID: ${c.id}`);
    });
  }
  
  // 4. Find applications where church doesn't exist
  if (allApps?.length) {
    const churchIds = allApps.map(a => a.church_id).filter(Boolean);
    const { data: existingChurches } = await supabase
      .from('churches')
      .select('id')
      .in('id', churchIds);
    
    const existingIds = new Set(existingChurches?.map(c => c.id));
    const orphanApps = allApps.filter(a => a.church_id && !existingIds.has(a.church_id));
    
    if (orphanApps.length) {
      console.log('\n=== ORPHANED APPLICATIONS (church deleted) ===');
      orphanApps.forEach(a => {
        console.log(`  - ${a.applicant_name} (${a.applicant_email}) - church_id: ${a.church_id} MISSING`);
      });
    }
  }
}

findOrphans().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
