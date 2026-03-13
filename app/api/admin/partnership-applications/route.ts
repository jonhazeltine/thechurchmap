import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
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

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      const { data: platformRoles } = await adminClient
        .from('platform_roles')
        .select('role, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);

      const isPlatformAdmin = (platformRoles || []).some(
        (role: any) => role.role === 'platform_admin' && role.is_active
      );

      if (!isPlatformAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    const { status, path, limit = '50', offset = '0' } = req.query;

    // Try to fetch with submissions first, fallback to without if table doesn't exist
    let applications: any[] = [];
    let applicationsError: any = null;
    
    // First attempt: with submissions join
    let query = adminClient
      .from('partnership_applications')
      .select(`
        *,
        church:church_id (
          id,
          name,
          city,
          state
        ),
        submissions:partnership_application_submissions (
          id,
          path,
          applicant_name,
          applicant_role,
          applicant_email,
          applicant_phone,
          has_authority_affirmation,
          notes,
          created_at
        )
      `)
      .order('created_at', { ascending: false })
      .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (path) {
      query = query.eq('path', path);
    }

    const result = await query;
    
    // Check if submissions table doesn't exist (PGRST200 error)
    if (result.error && result.error.code === 'PGRST200') {
      // Fallback: query without submissions
      let fallbackQuery = adminClient
        .from('partnership_applications')
        .select(`
          *,
          church:church_id (
            id,
            name,
            city,
            state
          )
        `)
        .order('created_at', { ascending: false })
        .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

      if (status) {
        fallbackQuery = fallbackQuery.eq('status', status);
      }
      if (path) {
        fallbackQuery = fallbackQuery.eq('path', path);
      }

      const fallbackResult = await fallbackQuery;
      applications = fallbackResult.data || [];
      applicationsError = fallbackResult.error;
    } else {
      applications = result.data || [];
      applicationsError = result.error;
    }

    if (applicationsError) {
      console.error('Error fetching partnership applications:', applicationsError);
      return res.status(500).json({ error: 'Failed to fetch applications' });
    }

    const processedApps = (applications || []).map(app => {
      const submissions = app.submissions || (app as any).partnership_application_submissions || [];
      return {
        ...app,
        submissions: Array.isArray(submissions) 
          ? submissions.sort((a: any, b: any) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
          : []
      };
    });

    const { count } = await adminClient
      .from('partnership_applications')
      .select('*', { count: 'exact', head: true });

    return res.json({
      applications: processedApps,
      total: count || 0,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/partnership-applications:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
