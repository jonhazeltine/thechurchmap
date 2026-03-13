import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkChurchPlatform() {
  const churchId = '6cc6bb67-0b58-4bd1-bbed-4a494d1da0c8';
  const platformId = '5a0cdce4-8618-4eb2-836f-86dfb2160819';
  
  console.log('Checking if New Life Grand Rapids is linked to the platform...');
  
  const { data, error } = await supabase
    .from('city_platform_churches')
    .select('*')
    .eq('church_id', churchId);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ Church is NOT linked to any platform!');
  } else {
    console.log('✅ Church is linked to platform(s):');
    for (const link of data) {
      console.log(`  Platform: ${link.city_platform_id}, Status: ${link.status}`);
    }
  }

  // Also fix the prayer post
  console.log('\nUpdating prayer post with correct platform ID...');
  const { error: updateError } = await supabase
    .from('posts')
    .update({ city_platform_id: platformId })
    .eq('linked_church_id', churchId)
    .eq('post_type', 'prayer_post');

  if (updateError) {
    console.error('Update error:', updateError.message);
  } else {
    console.log('✅ Updated prayer post with platform ID!');
  }
}

checkChurchPlatform();
