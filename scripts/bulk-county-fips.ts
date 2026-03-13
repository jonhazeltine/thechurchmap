/**
 * Bulk County FIPS Assignment via PostGIS
 * 
 * PROBLEM: The OSM ingestion script was making ~24K RPC calls per state for county FIPS assignment,
 * causing timeouts for states with >10K churches (like Georgia).
 * 
 * SOLUTION: This script runs a single PostGIS UPDATE statement that assigns county_fips
 * to all churches in a state at once, using spatial indexes for fast performance.
 * 
 * Usage:
 *   npx tsx scripts/bulk-county-fips.ts --state GA     # Single state
 *   npx tsx scripts/bulk-county-fips.ts                # All states with NULL county_fips
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Args {
  singleState?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--state' && args[i + 1]) {
      result.singleState = args[i + 1].toUpperCase();
      i++;
    }
  }
  return result;
}

async function assignCountyFipsForState(stateCode: string): Promise<{ updated: number; error?: string }> {
  console.log(`  Assigning county FIPS for ${stateCode}...`);
  
  // Use PostGIS RPC to do bulk spatial join
  const { data, error } = await supabase.rpc('fn_assign_county_fips_bulk', {
    p_state_code: stateCode
  });
  
  if (error) {
    return { updated: 0, error: error.message };
  }
  
  return { updated: data || 0 };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Bulk County FIPS Assignment Script                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const args = parseArgs();
  
  if (args.singleState) {
    console.log(`Processing single state: ${args.singleState}`);
    const result = await assignCountyFipsForState(args.singleState);
    if (result.error) {
      console.error(`  Error: ${result.error}`);
    } else {
      console.log(`  Updated ${result.updated} churches with county FIPS`);
    }
  } else {
    // Get all states with churches missing county_fips
    const { data: statesData } = await supabase
      .from('churches')
      .select('state')
      .is('county_fips', null)
      .limit(1000);
    
    const states = [...new Set((statesData || []).map(r => r.state))].filter(Boolean);
    console.log(`Found ${states.length} states with NULL county_fips`);
    
    for (const state of states) {
      const result = await assignCountyFipsForState(state);
      if (result.error) {
        console.error(`  ${state}: Error - ${result.error}`);
      } else {
        console.log(`  ${state}: Updated ${result.updated} churches`);
      }
    }
  }
  
  console.log('');
  console.log('Done!');
}

main().catch(console.error);
