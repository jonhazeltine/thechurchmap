import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { updatePostStatusSchema } from "@shared/schema";

export async function PATCH(request: Request, { params }: { params: { postId: string } }) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.substring(7);
    const { postId } = params;
    const body = await request.json();
    
    // Validate request body - admin status update only
    const validation = updatePostStatusSchema.safeParse(body);
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid request body', details: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Verify JWT with user client (for auth)
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user is platform admin (RLS enforced)
    const { data: platformRoles } = await userClient
      .from('platform_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!platformRoles || platformRoles.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden - Platform admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update post with service role client (bypasses RLS)
    const adminClient = supabaseServer();
    const { data, error } = await adminClient
      .from('posts')
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .select()
      .single();

    if (error) {
      console.error('Error updating post:', error);
      return new Response(JSON.stringify({ error: 'Failed to update post' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in update post:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
