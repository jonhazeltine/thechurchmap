import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { insertMembershipRequestSchema } from "@shared/schema";

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: platformId } = req.params;

    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select('id, name, is_active, is_public')
      .eq('id', platformId)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    if (!platform.is_active || !platform.is_public) {
      return res.status(400).json({ error: 'This platform is not accepting new members' });
    }

    const { data: existingMember } = await adminClient
      .from('city_platform_users')
      .select('id, is_active, role')
      .eq('city_platform_id', platformId)
      .eq('user_id', user.id)
      .single();

    if (existingMember?.is_active) {
      return res.status(409).json({ error: 'You are already a member of this platform' });
    }

    const { data: existingRequest } = await adminClient
      .from('platform_membership_requests')
      .select('id, status')
      .eq('platform_id', platformId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return res.status(409).json({ error: 'You already have a pending request for this platform' });
    }

    const parseResult = insertMembershipRequestSchema.safeParse({
      platform_id: platformId,
      message: req.body?.message || null,
    });

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { data: newRequest, error: insertError } = await adminClient
      .from('platform_membership_requests')
      .insert({
        platform_id: platformId,
        user_id: user.id,
        status: 'pending',
        message: parseResult.data.message,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating membership request:', insertError);
      return res.status(500).json({ error: 'Failed to submit join request' });
    }

    return res.status(201).json({
      message: 'Join request submitted successfully',
      request: newRequest,
    });

  } catch (error) {
    console.error('Error in POST /api/platforms/:id/join:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
