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

    const { data: applications, error: applicationsError } = await adminClient
      .from('city_platform_applications')
      .select('*')
      .eq('applicant_user_id', user.id)
      .order('created_at', { ascending: false });

    if (applicationsError) {
      console.error('Error fetching user applications:', applicationsError);
      return res.status(500).json({ error: 'Failed to fetch applications' });
    }

    if (!applications || applications.length === 0) {
      return res.status(200).json([]);
    }

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

    let createdPlatformMap = new Map();
    const createdPlatformIds = applications
      .filter(app => app.created_platform_id)
      .map(app => app.created_platform_id);

    if (createdPlatformIds.length > 0) {
      const { data: platforms } = await adminClient
        .from('city_platforms')
        .select('id, name, slug, is_active')
        .in('id', createdPlatformIds);

      createdPlatformMap = new Map(platforms?.map(p => [p.id, p]) || []);
    }

    const enrichedApplications = applications.map(application => ({
      ...application,
      boundaries: (application.boundary_ids || [])
        .map((id: string) => boundaryMap.get(id))
        .filter(Boolean),
      created_platform: application.created_platform_id 
        ? createdPlatformMap.get(application.created_platform_id) || null 
        : null,
    }));

    return res.status(200).json(enrichedApplications);

  } catch (error) {
    console.error('Error in GET /api/platform-applications/my:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
