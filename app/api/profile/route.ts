import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use admin client to avoid RLS policy issues (user is already authenticated)
    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    res.json(profile);
  } catch (error: any) {
    console.error('GET /api/profile error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { full_name, first_name, avatar_url, bio } = req.body;

    // Use admin client to avoid RLS policy issues (user is already authenticated)
    const { data: profile, error } = await adminClient
      .from('profiles')
      .update({
        full_name,
        first_name,
        avatar_url,
        bio,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;

    res.json(profile);
  } catch (error: any) {
    console.error('PATCH /api/profile error:', error);
    res.status(500).json({ error: error.message });
  }
}
