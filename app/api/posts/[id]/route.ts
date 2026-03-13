import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";
import { updatePostSchema } from "@shared/schema";

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supabase = supabaseServer();

    // First fetch the post without status filter to check if it exists
    const { data: post, error } = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, full_name, first_name, avatar_url),
        church:churches!posts_church_id_fkey(id, name, city, state, denomination, location),
        linked_church:churches!posts_linked_church_id_fkey(id, name, city, state),
        platform:city_platforms!posts_city_platform_id_fkey(id, name, logo_url)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('GET /api/posts/:id - Post not found:', id);
        return res.status(404).json({ error: 'Post not found' });
      }
      throw error;
    }

    // Only allow viewing published posts (or allow admins to view drafts in the future)
    if (post.status !== 'published') {
      console.log('GET /api/posts/:id - Post not published:', id, post.status);
      return res.status(404).json({ error: 'Post not found' });
    }

    const { data: comments, error: commentsError } = await supabase
      .from('post_comments')
      .select('id')
      .eq('post_id', id);

    if (commentsError) throw commentsError;

    // For prayer posts without an author, ensure proper fallback display
    // Prayer posts are attributed to the platform, not a specific user
    const postWithDetails = {
      ...post,
      comment_count: comments?.length || 0,
    };

    console.log('GET /api/posts/:id - Returning post:', {
      id: post.id,
      post_type: post.post_type,
      has_author: !!post.author,
      has_platform: !!post.platform,
      has_linked_church: !!post.linked_church,
      status: post.status,
      body_length: post.body?.length || 0,
    });

    res.json(postWithDetails);
  } catch (error: any) {
    console.error('GET /api/posts/:id error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    // Extract bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    // Validate JWT
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch the post to check ownership
    const { data: existingPost, error: fetchError } = await adminClient
      .from('posts')
      .select('author_id')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Post not found' });
      }
      throw fetchError;
    }

    // Check authorization: user must be author, super admin, or platform admin
    const isAuthor = existingPost.author_id === user.id;
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    // Check platform admin role (platform owners and platform admins can edit posts)
    let isPlatformAdmin = false;
    if (!isSuperAdmin && !isAuthor) {
      const { data: platformRole } = await adminClient
        .from('city_platform_users')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['platform_admin', 'platform_owner'])
        .eq('is_active', true)
        .maybeSingle();
      isPlatformAdmin = !!platformRole;
    }
    
    if (!isAuthor && !isSuperAdmin && !isPlatformAdmin) {
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    const validatedData = updatePostSchema.parse(req.body);

    const { data, error } = await adminClient
      .from('posts')
      .update({
        title: validatedData.title,
        body: validatedData.body,
        body_format: validatedData.bodyFormat,
        rich_body: validatedData.richBody,
        status: validatedData.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, full_name, first_name),
        church:churches!posts_church_id_fkey(id, name, city, state, denomination),
        linked_church:churches!posts_linked_church_id_fkey(id, name, city, state),
        platform:city_platforms!posts_city_platform_id_fkey(id, name, logo_url)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Post not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error: any) {
    console.error('PATCH /api/posts/:id error:', error);
    res.status(400).json({ error: error.message });
  }
}

export async function DELETE(req: Request, res: Response) {
  try {
    const { id } = req.params;
    
    // Extract bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    // Validate JWT
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch the post to check ownership
    const { data: existingPost, error: fetchError } = await adminClient
      .from('posts')
      .select('author_id')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Post not found' });
      }
      throw fetchError;
    }

    // Check authorization: user must be author, super admin, or platform admin
    const isAuthor = existingPost.author_id === user.id;
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    // Check platform admin role (platform owners and platform admins can delete posts)
    let isPlatformAdmin = false;
    if (!isSuperAdmin && !isAuthor) {
      const { data: platformRole } = await adminClient
        .from('city_platform_users')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['platform_admin', 'platform_owner'])
        .eq('is_active', true)
        .maybeSingle();
      isPlatformAdmin = !!platformRole;
    }
    
    if (!isAuthor && !isSuperAdmin && !isPlatformAdmin) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    const { error } = await adminClient
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error: any) {
    console.error('DELETE /api/posts/:id error:', error);
    res.status(500).json({ error: error.message });
  }
}
