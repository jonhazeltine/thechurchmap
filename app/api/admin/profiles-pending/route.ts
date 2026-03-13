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

    // Get pending profile submissions
    const { data: submissions, error: submissionsError } = await adminClient
      .from('profiles_pending')
      .select(`
        id,
        church_id,
        submitted_data,
        submitted_by,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (submissionsError) {
      console.error('Error fetching pending profiles:', submissionsError);
      return res.status(500).json({ error: 'Failed to fetch pending profiles' });
    }

    if (!submissions || submissions.length === 0) {
      return res.status(200).json([]);
    }

    // Get church details for each submission
    const churchIds = Array.from(new Set(submissions.map(s => s.church_id)));
    const { data: churches } = await adminClient
      .from('churches')
      .select('id, name, city, state, address')
      .in('id', churchIds);

    const churchMap = new Map(churches?.map(c => [c.id, c]) || []);

    // Get submitter profiles
    const submitterIds = Array.from(new Set(submissions.filter(s => s.submitted_by).map(s => s.submitted_by)));
    let submitterMap = new Map();
    
    if (submitterIds.length > 0) {
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, full_name, first_name, avatar_url')
        .in('id', submitterIds);
      
      submitterMap = new Map(profiles?.map(p => [p.id, p]) || []);
    }

    // If not super admin, filter to only show submissions for churches the user can admin
    let filteredSubmissions = submissions;
    
    if (!isSuperAdmin) {
      // Get platforms where user is platform_owner or platform_admin
      const { data: userPlatforms } = await adminClient
        .from('city_platform_users')
        .select('city_platform_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .in('role', ['platform_owner', 'platform_admin']);

      if (!userPlatforms || userPlatforms.length === 0) {
        return res.status(200).json([]);
      }

      const platformIds = userPlatforms.map(p => p.city_platform_id);

      // Get churches in those platforms
      const { data: platformChurches } = await adminClient
        .from('city_platform_churches')
        .select('church_id')
        .in('city_platform_id', platformIds);

      const allowedChurchIds = new Set(platformChurches?.map(pc => pc.church_id) || []);
      filteredSubmissions = submissions.filter(s => allowedChurchIds.has(s.church_id));
    }

    // Enrich submissions with church and submitter info
    const enrichedSubmissions = filteredSubmissions.map(submission => ({
      ...submission,
      church: churchMap.get(submission.church_id) || null,
      submitter: submission.submitted_by ? submitterMap.get(submission.submitted_by) || null : null,
    }));

    return res.status(200).json(enrichedSubmissions);

  } catch (error) {
    console.error('Error in GET /api/admin/profiles-pending:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
