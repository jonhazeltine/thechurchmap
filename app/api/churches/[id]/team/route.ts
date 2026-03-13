import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    // Verify user
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has permission to view team (super admin, platform admin, or church admin of this church)
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    // Check if user is platform admin (bypass RLS recursion by checking metadata)
    let isPlatformAdmin = false;
    if (!isSuperAdmin) {
      // Only check platform_roles if not super admin (to avoid RLS recursion)
      const { data: platformRole } = await adminClient
        .from('platform_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'platform_admin')
        .maybeSingle();
      isPlatformAdmin = !!platformRole;
    }
    
    // Check if user is church admin of THIS church - check both legacy and new tables
    const { data: churchRole } = await adminClient
      .from('church_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('church_id', id)
      .eq('role', 'church_admin')
      .eq('is_approved', true)
      .maybeSingle();
    
    // Also check city_platform_users for church_admin role
    const { data: cpuRole } = await adminClient
      .from('city_platform_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('church_id', id)
      .eq('role', 'church_admin')
      .eq('is_active', true)
      .maybeSingle();
    
    const isChurchAdmin = !!churchRole || !!cpuRole;
    
    if (!isSuperAdmin && !isPlatformAdmin && !isChurchAdmin) {
      return res.status(403).json({ error: 'Forbidden - must be admin of this church' });
    }

    // Fetch team members from church_user_roles (legacy)
    const { data: legacyMembers, error: legacyError } = await adminClient
      .from('church_user_roles')
      .select(`
        id,
        user_id,
        church_id,
        role,
        is_approved,
        created_at,
        updated_at,
        profiles:user_id (
          id,
          full_name,
          first_name,
          last_initial
        )
      `)
      .eq('church_id', id)
      .eq('is_approved', true)
      .order('created_at', { ascending: false });

    if (legacyError) {
      console.error('Error fetching legacy team members:', legacyError);
    }

    // Also fetch from city_platform_users where role = 'church_admin'
    // Note: No direct FK to profiles, so we fetch separately
    const { data: cpuMembers, error: cpuError } = await adminClient
      .from('city_platform_users')
      .select(`
        id,
        user_id,
        church_id,
        city_platform_id,
        role,
        is_active,
        created_at,
        updated_at
      `)
      .eq('church_id', id)
      .eq('role', 'church_admin')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (cpuError) {
      console.error('Error fetching cpu team members:', cpuError);
    }

    // Fetch profiles for CPU members separately
    const cpuUserIds = cpuMembers?.map(m => m.user_id) || [];
    const cpuProfiles: Record<string, any> = {};
    if (cpuUserIds.length > 0) {
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, full_name, first_name, last_initial')
        .in('id', cpuUserIds);
      
      for (const p of (profiles || [])) {
        cpuProfiles[p.id] = p;
      }
    }

    // Also check if church has a claimer via city_platform_churches
    const { data: platformChurch } = await adminClient
      .from('city_platform_churches')
      .select('claimed_by_user_id, is_claimed, city_platform_id')
      .eq('church_id', id)
      .eq('is_claimed', true)
      .maybeSingle();

    const claimerId = platformChurch?.claimed_by_user_id;

    // Merge both sources, deduplicating by user_id
    const seenUserIds = new Set<string>();
    const teamMembers: any[] = [];

    // Add legacy members first
    for (const m of (legacyMembers || [])) {
      if (!seenUserIds.has(m.user_id)) {
        seenUserIds.add(m.user_id);
        teamMembers.push(m);
      }
    }

    // Add CPU members, converting format and attaching fetched profiles
    for (const m of (cpuMembers || [])) {
      if (!seenUserIds.has(m.user_id)) {
        seenUserIds.add(m.user_id);
        teamMembers.push({
          id: m.id,
          user_id: m.user_id,
          church_id: m.church_id,
          role: m.role,
          is_approved: m.is_active,
          created_at: m.created_at,
          updated_at: m.updated_at,
          profiles: cpuProfiles[m.user_id] || null,
          city_platform_id: m.city_platform_id,
        });
      }
    }

    // If church has a claimer who isn't in the team yet, add them
    if (claimerId && !seenUserIds.has(claimerId)) {
      seenUserIds.add(claimerId);
      // Fetch claimer's profile
      const { data: claimerProfile } = await adminClient
        .from('profiles')
        .select('id, full_name, first_name, last_initial')
        .eq('id', claimerId)
        .maybeSingle();
      
      teamMembers.push({
        id: `claimer-${claimerId}`,
        user_id: claimerId,
        church_id: id,
        role: 'church_admin',
        is_approved: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profiles: claimerProfile || null,
        city_platform_id: platformChurch?.city_platform_id || null,
      });
    }

    // Get user emails from auth.users (requires admin client)
    const userIds = teamMembers?.map(tm => tm.user_id) || [];
    const usersWithEmails = await Promise.all(
      userIds.map(async (userId) => {
        const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(userId);
        return {
          id: userId,
          email: authUser?.email || null,
        };
      })
    );

    // Combine the data, adding is_claim_holder flag and city_platform_id
    const teamWithEmails = teamMembers?.map(tm => ({
      id: tm.id,
      user_id: tm.user_id,
      church_id: tm.church_id,
      role: tm.role,
      is_approved: tm.is_approved,
      is_claim_holder: tm.user_id === claimerId,
      city_platform_id: tm.city_platform_id || null,
      created_at: tm.created_at,
      updated_at: tm.updated_at,
      profile: tm.profiles,
      email: usersWithEmails.find(u => u.id === tm.user_id)?.email || null,
    })) || [];

    return res.status(200).json(teamWithEmails);

  } catch (error) {
    console.error('Error in team endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
