import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const { id: churchId } = req.params;
    const authHeader = req.headers.authorization;
    
    // Anonymous users can view approved prayers
    const adminClient = supabaseServer();
    let isAdmin = false;
    
    // Check if user is authenticated and is admin
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Use adminClient for JWT verification
      const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
      
      if (!authError && user) {
        // Check if user is super admin (from user metadata)
        const isSuperAdmin = user.user_metadata?.super_admin === true;
        
        // Check if user is platform admin (using adminClient to bypass RLS)
        let isPlatformAdmin = false;
        if (!isSuperAdmin) {
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
        
        // Use userClient for RLS-enabled church admin permission check
        const userClient = supabaseUserClient(token);
        const { data: churchRole } = await userClient
          .from('church_user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('church_id', churchId)
          .eq('role', 'church_admin')
          .eq('is_approved', true)
          .maybeSingle();
        
        isAdmin = isSuperAdmin || isPlatformAdmin || !!churchRole;
      }
    }

    // Fetch approved prayers using adminClient (everyone can see these)
    // EXCLUDE auto-generated prayers (those with submitted_by_user_id = null)
    const { data: allApprovedPrayers, error: approvedError } = await adminClient
      .from('prayers')
      .select('id, title, body, is_anonymous, created_at, submitted_by_user_id, status, is_church_request, formation_prayer_id')
      .eq('church_id', churchId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    
    if (approvedError) {
      console.error('Error fetching approved prayers:', approvedError);
      return res.status(500).json({ error: 'Failed to fetch prayers' });
    }

    // Filter out auto-generated prayers in JavaScript (cleaner than Supabase syntax)
    // Include both church requests and user-submitted prayers
    const approvedPrayers = (allApprovedPrayers || [])
      .filter(p => p.submitted_by_user_id !== null || p.is_church_request === true)
      .slice(0, 20);

    // Fetch pending count (admins only) using adminClient
    let pendingCount = 0;
    if (isAdmin) {
      const { count, error: countError } = await adminClient
        .from('prayers')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .eq('status', 'pending');

      if (!countError) {
        pendingCount = count || 0;
      }
    }

    return res.status(200).json({
      approved: approvedPrayers || [],
      prayers: approvedPrayers || [],
      pending_count: pendingCount,
      is_admin: isAdmin,
    });

  } catch (error) {
    console.error('Error in church prayers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
