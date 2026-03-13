import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPosts() {
  console.log('Checking recent posts...');
  
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, title, post_type, linked_church_id, city_platform_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('Recent posts:');
  for (const post of posts || []) {
    console.log(`- ${post.title}`);
    console.log(`  ID: ${post.id}`);
    console.log(`  Type: ${post.post_type}`);
    console.log(`  Linked Church: ${post.linked_church_id}`);
    console.log(`  Platform ID: ${post.city_platform_id}`);
    console.log(`  Created: ${post.created_at}`);
    console.log('');
  }
}

checkPosts();
