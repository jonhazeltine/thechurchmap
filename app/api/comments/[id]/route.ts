import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { insertCommentSchema } from "@shared/schema";

export async function PATCH(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supabase = supabaseServer();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = insertCommentSchema.parse(req.body);

    const { data, error } = await supabase
      .from('post_comments')
      .update({
        body: validatedData.body,
        body_format: validatedData.bodyFormat || 'plain_text',
        rich_body: validatedData.richBody || null,
      })
      .eq('id', id)
      .select(`
        *,
        author:profiles!post_comments_author_id_fkey(id, full_name, first_name)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Comment not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error: any) {
    console.error('PATCH /api/comments/:id error:', error);
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

    // Fetch the comment to check ownership
    const { data: existingComment, error: fetchError } = await adminClient
      .from('post_comments')
      .select('author_id')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Comment not found' });
      }
      throw fetchError;
    }

    // Check authorization: user must be author, super admin, or platform admin
    const isAuthor = existingComment.author_id === user.id;
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    // Check platform admin role
    let isPlatformAdmin = false;
    if (!isSuperAdmin && !isAuthor) {
      const { data: platformRole } = await adminClient
        .from('city_platform_users')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      isPlatformAdmin = !!platformRole;
    }
    
    if (!isAuthor && !isSuperAdmin && !isPlatformAdmin) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    const { error } = await adminClient
      .from('post_comments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error: any) {
    console.error('DELETE /api/comments/:id error:', error);
    res.status(500).json({ error: error.message });
  }
}
