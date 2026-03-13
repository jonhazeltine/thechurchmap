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
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { status } = req.query;

    let query = adminClient
      .from('city_platform_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data: applications, error: applicationsError } = await query;

    if (applicationsError) {
      console.error('Error fetching applications:', applicationsError);
      return res.status(500).json({ error: 'Failed to fetch applications' });
    }

    if (!applications || applications.length === 0) {
      return res.status(200).json([]);
    }

    const applicantIds = Array.from(new Set(applications.map(a => a.applicant_user_id)));
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, full_name, first_name, last_name, avatar_url')
      .in('id', applicantIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const allBoundaryIds = applications.flatMap(app => app.boundary_ids || []);
    const uniqueBoundaryIds = Array.from(new Set(allBoundaryIds));

    let boundaryMap = new Map();
    if (uniqueBoundaryIds.length > 0) {
      const { data: boundaries } = await adminClient
        .from('geographic_boundaries')
        .select('id, name, type, external_id')
        .in('id', uniqueBoundaryIds);

      boundaryMap = new Map(boundaries?.map(b => [b.id, b]) || []);
    }

    const enrichedApplications = applications.map(application => ({
      ...application,
      applicant: profileMap.get(application.applicant_user_id) || null,
      boundaries: (application.boundary_ids || [])
        .map((id: string) => boundaryMap.get(id))
        .filter(Boolean),
    }));

    return res.status(200).json(enrichedApplications);

  } catch (error) {
    console.error('Error in GET /api/admin/platform-applications:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
