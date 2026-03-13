import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
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

    const supabase = supabaseServer();

    // Get user profile with church info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        first_name,
        primary_church_id
      `)
      .eq('id', user.id)
      .single();

    if (profileError) {
      // Profile might not exist yet
      return res.json({
        onboarding_completed: false,
        church_id: null,
        church: null,
        pending_church: null,
        platform: null,
      });
    }

    // Get church details if linked
    let church: any = null;
    let platform: any = null;

    if (profile.primary_church_id) {
      const { data: churchData } = await supabase
        .from('churches')
        .select('id, name, address, city, state')
        .eq('id', profile.primary_church_id)
        .single();

      church = churchData;

      // Get platform info
      const { data: platformLink } = await supabase
        .from('city_platform_churches')
        .select(`
          city_platforms!inner (
            id,
            name,
            slug
          )
        `)
        .eq('church_id', profile.primary_church_id)
        .eq('status', 'visible')
        .single();

      const cityPlatforms = (platformLink as any)?.city_platforms;
      if (cityPlatforms) {
        platform = cityPlatforms;
      }
    }

    // Check for pending church submission
    const { data: pendingChurch } = await supabase
      .from('pending_churches')
      .select('id, name, status, created_at')
      .eq('submitted_by_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Determine if onboarding is completed based on whether user has a church or pending submission
    const onboarding_completed = !!(profile.primary_church_id || pendingChurch);

    res.json({
      onboarding_completed,
      church_id: profile.primary_church_id,
      church,
      pending_church: pendingChurch,
      platform,
    });
  } catch (error: any) {
    console.error('Error getting onboarding status:', error);
    res.status(500).json({ error: error.message });
  }
}
