import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";
import { selectChurchSchema } from "../../../../shared/schema";

export async function POST(req: Request, res: Response) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    // Validate request
    const validation = selectChurchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { church_id } = validation.data;
    const supabase = supabaseServer();

    // Check if church exists
    const { data: church, error: churchError } = await supabase
      .from('churches')
      .select('id, name')
      .eq('id', church_id)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    // Update user profile with primary_church_id
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        primary_church_id: church_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileError) {
      throw profileError;
    }

    // Check if church is part of a platform
    const { data: platformLink } = await supabase
      .from('city_platform_churches')
      .select(`
        city_platform_id,
        city_platforms!inner (
          id,
          name,
          is_active,
          auto_approve_members
        )
      `)
      .eq('church_id', church_id)
      .eq('status', 'visible')
      .single();

    let joinedPlatform = false;
    let platformId: string | null = null;
    let platformName: string | null = null;

    const cityPlatform = platformLink?.city_platforms as any;
    if (cityPlatform?.is_active) {
      platformId = cityPlatform.id;
      platformName = cityPlatform.name;

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('platform_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('city_platform_id', platformId)
        .single();

      if (!existingMember) {
        // Auto-add as member (since they selected their church)
        const { error: memberError } = await supabase
          .from('platform_roles')
          .insert({
            user_id: user.id,
            city_platform_id: platformId,
            role: 'member',
            church_id: church_id,
            is_active: true,
          });

        if (!memberError) {
          joinedPlatform = true;
        } else {
          console.error('Error adding platform member:', memberError);
        }
      } else {
        joinedPlatform = true; // Already a member
      }
    }

    res.json({
      success: true,
      church_id,
      pending_church_id: null,
      platform_id: platformId,
      platform_name: platformName,
      joined_platform: joinedPlatform,
      message: joinedPlatform
        ? `Welcome! You've joined ${platformName} through ${church.name}.`
        : `You've been linked to ${church.name}.`,
    });
  } catch (error: any) {
    console.error('Error selecting church:', error);
    res.status(500).json({ error: error.message });
  }
}
