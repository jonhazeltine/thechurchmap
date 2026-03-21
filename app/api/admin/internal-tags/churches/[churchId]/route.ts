import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

// Helper to check platform admin or super admin
async function checkPlatformAdminAccess(req: Request): Promise<{ user: any; error?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { user: null, error: "Unauthorized" };
  }

  const token = authHeader.substring(7);
  const adminClient = supabaseServer();
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  
  if (authError || !user) {
    return { user: null, error: "Unauthorized" };
  }
  
  const isSuperAdmin = user.user_metadata?.super_admin === true;
  
  const { data: platformRoles } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
    .eq('is_active', true);

  const hasPlatformAdminRole = (platformRoles || []).length > 0;
  
  if (!isSuperAdmin && !hasPlatformAdminRole) {
    return { user: null, error: "Forbidden: Platform admin access required" };
  }
  
  return { user };
}

// GET /api/admin/internal-tags/churches/:churchId - Get all tags for a specific church
export async function GET(req: Request, res: Response) {
  try {
    const { error } = await checkPlatformAdminAccess(req);
    if (error) {
      return res.status(error === "Unauthorized" ? 401 : 403).json({ error });
    }

    const churchId = req.params.churchId;
    if (!churchId) {
      return res.status(400).json({ error: "Church ID is required" });
    }

    const supabase = supabaseServer();

    // Get all tags assigned to this church with tag details
    const { data: assignments, error: fetchError } = await supabase
      .from('internal_church_tags')
      .select(`
        id,
        church_id,
        tag_id,
        applied_by,
        applied_at,
        notes,
        internal_tags (
          id,
          name,
          slug,
          description,
          color_hex,
          icon_key,
          is_active
        )
      `)
      .eq('church_id', churchId);

    if (fetchError) {
      console.error('Error fetching church internal tags:', fetchError);
      throw fetchError;
    }

    // Transform to ChurchInternalTag format
    const churchTags = (assignments || [])
      .filter((a: any) => a.internal_tags?.is_active)
      .map((a: any) => ({
        tag_id: a.tag_id,
        tag_name: a.internal_tags.name,
        tag_slug: a.internal_tags.slug,
        tag_description: a.internal_tags.description,
        color_hex: a.internal_tags.color_hex,
        icon_key: a.internal_tags.icon_key,
        applied_at: a.applied_at,
        applied_by: a.applied_by,
        notes: a.notes,
      }));

    res.json(churchTags);
  } catch (error: any) {
    console.error('GET /api/admin/internal-tags/churches/:churchId error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
