import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is super admin (bypass RLS recursion)
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch all churches for search functionality
    const { data: churches, error: churchesError } = await adminClient
      .from('churches')
      .select('*')
      .order('name');

    if (churchesError) {
      console.error('Error fetching churches:', churchesError);
      return res.status(500).json({ error: 'Failed to fetch churches' });
    }

    // Get admin counts separately using RPC or manual counting
    // For now, let's get all admin roles and count them in JS
    const { data: adminRoles } = await adminClient
      .from('church_user_roles')
      .select('church_id')
      .eq('role', 'church_admin')
      .eq('is_approved', true);

    // Create a map of church_id -> count
    const adminCountMap = new Map<string, number>();
    if (adminRoles) {
      adminRoles.forEach((role) => {
        const currentCount = adminCountMap.get(role.church_id) || 0;
        adminCountMap.set(role.church_id, currentCount + 1);
      });
    }

    // Add admin counts to churches
    const churchesWithCounts = (churches || []).map((church) => ({
      ...church,
      admin_count: adminCountMap.get(church.id) || 0,
    }));

    return res.status(200).json(churchesWithCounts);

  } catch (error) {
    console.error('Error in admin churches:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
