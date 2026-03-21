import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";

// DEV BYPASS: Set to true to bypass Supabase auth when it's down
const DEV_BYPASS_AUTH = false;
const DEV_MOCK_USER_ID = "b28081ee-f57c-446b-8190-6abc44f14baa";

// GET /api/admin/users - List all users (super admin only)
export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    
    // DEV BYPASS: Skip auth check when Supabase is down
    if (DEV_BYPASS_AUTH && token === "dev-bypass-token") {
      console.log("🔓 DEV BYPASS: Granting super admin access to users list");
      // Continue with the request using admin client
      const adminClient = supabaseServer();
      
      // Fetch all users from auth.users (using admin client)
      const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers();

      if (usersError) {
        console.error('Error fetching users:', usersError);
        return res.status(500).json({ error: 'Failed to fetch users' });
      }

      // Fetch profiles and church relationships for each user
      const usersWithData = await Promise.all(
        (users || []).map(async (authUser) => {
          const { data: profile } = await adminClient
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .single();

          const { data: platformRoles } = await adminClient
            .from('city_platform_users')
            .select('*')
            .eq('user_id', authUser.id)
            .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
            .eq('is_active', true);

          const { data: churchRoles } = await adminClient
            .from('church_user_roles')
            .select(`
              *,
              church:churches(name)
            `)
            .eq('user_id', authUser.id)
            .eq('is_approved', true);

          return {
            id: authUser.id,
            email: authUser.email,
            full_name: profile?.full_name || authUser.user_metadata?.full_name || null,
            created_at: authUser.created_at,
            last_sign_in_at: authUser.last_sign_in_at,
            is_super_admin: authUser.user_metadata?.super_admin === true,
            profile: profile || null,
            platform_roles: platformRoles || [],
            church_roles: churchRoles || [],
          };
        })
      );

      return res.status(200).json({ users: usersWithData });
    }
    
    // Verify JWT
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is super admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    // Fetch all users from auth.users (using admin client)
    const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers();

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Fetch profiles and church relationships for each user
    const usersWithData = await Promise.all(
      (users || []).map(async (authUser) => {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        const { data: platformRoles } = await adminClient
          .from('city_platform_users')
          .select('*')
          .eq('user_id', authUser.id)
          .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
          .eq('is_active', true);

        const { data: churchRoles } = await adminClient
          .from('church_user_roles')
          .select(`
            *,
            church:churches(name)
          `)
          .eq('user_id', authUser.id)
          .eq('is_approved', true);

        return {
          id: authUser.id,
          email: authUser.email,
          full_name: profile?.full_name || authUser.user_metadata?.full_name || null,
          created_at: authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          is_super_admin: authUser.user_metadata?.super_admin === true,
          profile: profile || null,
          platform_roles: platformRoles || [],
          church_roles: churchRoles || [],
        };
      })
    );

    return res.status(200).json({ users: usersWithData });

  } catch (error) {
    console.error('Error in admin users list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
