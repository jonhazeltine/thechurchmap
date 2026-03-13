import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import type { ReactionType, ReactionCounts } from "@shared/schema";

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supabase = supabaseServer();
    
    const authHeader = req.headers.authorization;
    let userId: string | null = null;
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { data: reactionData, error: reactionsError } = await supabase
      .from('comment_reactions')
      .select('reaction_type, user_id')
      .eq('comment_id', id);

    if (reactionsError) throw reactionsError;

    const counts: ReactionCounts = {
      like: 0,
      pray: 0,
      celebrate: 0,
      support: 0,
    };

    const userReactions: ReactionType[] = [];

    if (reactionData) {
      for (const reaction of reactionData) {
        const type = reaction.reaction_type as ReactionType;
        counts[type] = (counts[type] || 0) + 1;
        
        if (userId && reaction.user_id === userId) {
          userReactions.push(type);
        }
      }
    }

    res.json({
      counts,
      user_reactions: userReactions,
    });
  } catch (error: any) {
    console.error('GET /api/comments/:id/reactions error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { reaction_type } = req.body;
    
    if (!['like', 'celebrate'].includes(reaction_type)) {
      return res.status(400).json({ error: 'Invalid reaction type. Only like and celebrate are allowed.' });
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    const supabase = supabaseServer();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: commentExists, error: commentError } = await supabase
      .from('post_comments')
      .select('id')
      .eq('id', id)
      .single();

    if (commentError || !commentExists) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('comment_reactions')
      .select('id')
      .eq('comment_id', id)
      .eq('user_id', user.id)
      .eq('reaction_type', reaction_type)
      .maybeSingle();

    if (existingError) throw existingError;

    let added = false;

    if (existing) {
      const { error: deleteError } = await supabase
        .from('comment_reactions')
        .delete()
        .eq('id', existing.id);
      
      if (deleteError) throw deleteError;
      added = false;
    } else {
      const { error: insertError } = await supabase
        .from('comment_reactions')
        .insert({
          comment_id: id,
          user_id: user.id,
          reaction_type,
        });
      
      if (insertError) throw insertError;
      added = true;
    }

    const { data: reactionData, error: reactionsError } = await supabase
      .from('comment_reactions')
      .select('reaction_type, user_id')
      .eq('comment_id', id);

    if (reactionsError) throw reactionsError;

    const counts: ReactionCounts = {
      like: 0,
      pray: 0,
      celebrate: 0,
      support: 0,
    };

    const userReactions: ReactionType[] = [];

    if (reactionData) {
      for (const reaction of reactionData) {
        const type = reaction.reaction_type as ReactionType;
        counts[type] = (counts[type] || 0) + 1;
        
        if (reaction.user_id === user.id) {
          userReactions.push(type);
        }
      }
    }

    res.json({
      added,
      counts,
      user_reactions: userReactions,
    });
  } catch (error: any) {
    console.error('POST /api/comments/:id/reactions error:', error);
    res.status(500).json({ error: error.message });
  }
}
