import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized - authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const adminClient = supabaseServer();
    
    const { data: { user: authUser }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const { user_id, email, full_name, first_name, last_name } = req.body;

    if (!user_id || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (authUser.id !== user_id) {
      return res.status(403).json({ error: 'Cannot create profile for another user' });
    }

    // Auto-generate full_name if not provided but first/last are
    let finalFullName = full_name;
    if (!finalFullName && (first_name || last_name)) {
      finalFullName = `${first_name || ''} ${last_name || ''}`.trim();
    }

    // Generate last_initial for privacy in displays
    const lastInitial = last_name ? last_name.charAt(0).toUpperCase() : null;

    // Note: email lives in auth.users, not profiles
    const { data: profile, error } = await adminClient
      .from('profiles')
      .insert({
        id: user_id,
        full_name: finalFullName || null,
        first_name: first_name || null,
        last_name: last_name || null,
        last_initial: lastInitial,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(200).json({ message: 'Profile already exists' });
      }
      throw error;
    }

    res.status(201).json(profile);
  } catch (error: any) {
    console.error('POST /api/auth/create-profile error:', error);
    res.status(500).json({ error: error.message });
  }
}
