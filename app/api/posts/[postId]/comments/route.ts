import type { Request, Response } from "express";
import crypto from "crypto";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { insertCommentSchema } from "@shared/schema";
import type { ReactionType, ReactionCounts } from "@shared/schema";

export async function GET(req: Request, res: Response) {
  try {
    const { postId } = req.params;
    const supabase = supabaseServer();
    
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Only fetch published comments (guest comments with 'pending' status are hidden until approved)
    const { data: comments, error } = await supabase
      .from('post_comments')
      .select(`
        *,
        author:profiles!post_comments_author_id_fkey(id, full_name, first_name)
      `)
      .eq('post_id', postId)
      .or('status.eq.published,status.is.null') // Show published or legacy comments without status
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Fetch all reactions for these comments in a single query
    const commentIds = (comments || []).map(c => c.id);
    let reactionsByComment: Record<string, { counts: ReactionCounts; user_reactions: ReactionType[] }> = {};
    
    if (commentIds.length > 0) {
      const { data: reactions, error: reactionsError } = await supabase
        .from('comment_reactions')
        .select('comment_id, reaction_type, user_id')
        .in('comment_id', commentIds);
      
      if (!reactionsError && reactions) {
        for (const reaction of reactions) {
          if (!reactionsByComment[reaction.comment_id]) {
            reactionsByComment[reaction.comment_id] = {
              counts: { like: 0, pray: 0, celebrate: 0, support: 0 },
              user_reactions: []
            };
          }
          const type = reaction.reaction_type as ReactionType;
          reactionsByComment[reaction.comment_id].counts[type]++;
          if (userId && reaction.user_id === userId) {
            reactionsByComment[reaction.comment_id].user_reactions.push(type);
          }
        }
      }
    }
    
    // Attach reaction data to each comment
    const commentsWithReactions = (comments || []).map(comment => ({
      ...comment,
      reaction_counts: reactionsByComment[comment.id]?.counts || { like: 0, pray: 0, celebrate: 0, support: 0 },
      user_reactions: reactionsByComment[comment.id]?.user_reactions || []
    }));

    res.json(commentsWithReactions);
  } catch (error: any) {
    console.error('GET /api/posts/:postId/comments error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { postId } = req.params;
    
    // Extract bearer token from Authorization header (optional for guest comments)
    const authHeader = req.headers.authorization;
    let user = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const userClient = supabaseUserClient(token);
      const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
      if (!authError && authUser) {
        user = authUser;
      }
    }

    const validatedData = insertCommentSchema.parse(req.body);
    
    // Guest comments require guest_name
    const isGuest = !user;
    if (isGuest && (!validatedData.guest_name || validatedData.guest_name.trim().length < 2)) {
      return res.status(400).json({ 
        error: 'Guest name required',
        requires_name: true,
        message: 'Please provide your name to post a comment'
      });
    }

    // Log full name for potential account creation
    if (isGuest && validatedData.guest_full_name) {
      console.log('📝 Guest comment with full name:', validatedData.guest_full_name.trim());
    }

    // Generate anonymous token for guest comments (for later claim on account creation)
    const anonymousToken = isGuest ? crypto.randomUUID() : null;
    const tokenExpiresAt = isGuest ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;

    // Use service role client for mutation (bypasses RLS)
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        author_id: user?.id || null,
        body: validatedData.body,
        body_format: validatedData.bodyFormat || 'plain_text',
        rich_body: validatedData.richBody || null,
        guest_name: isGuest ? validatedData.guest_name?.trim() : null,
        status: isGuest ? 'pending' : 'published', // Guest comments need approval
        anonymous_token: anonymousToken,
        token_expires_at: tokenExpiresAt,
      })
      .select(`
        *,
        author:profiles!post_comments_author_id_fkey(id, full_name, first_name)
      `)
      .single();

    if (error) throw error;

    // Different response for guests - include token for later claim
    if (isGuest) {
      return res.status(201).json({
        ...data,
        message: 'Your comment has been submitted for review',
        pending: true,
        anonymous_token: anonymousToken,
      });
    }

    res.status(201).json(data);
  } catch (error: any) {
    console.error('POST /api/posts/:postId/comments error:', error);
    res.status(400).json({ error: error.message });
  }
}
