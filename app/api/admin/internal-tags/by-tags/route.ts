import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

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
    .from('platform_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true);
  
  const hasPlatformAdminRole = platformRoles?.some(r => r.role === 'platform_admin') || false;
  
  if (!isSuperAdmin && !hasPlatformAdminRole) {
    return { user: null, error: "Forbidden: Platform admin access required" };
  }
  
  return { user };
}

// GET /api/admin/internal-tags/by-tags?tag_ids=id1,id2,id3 - Get all church IDs that have any of the specified tags
// Returns a map of church_id -> { tag_id, color_hex, icon_key } for map styling
export async function GET(req: Request, res: Response) {
  try {
    const { error } = await checkPlatformAdminAccess(req);
    if (error) {
      return res.status(error === "Unauthorized" ? 401 : 403).json({ error });
    }

    const tagIdsParam = req.query.tag_ids as string;
    if (!tagIdsParam) {
      return res.status(400).json({ error: "tag_ids query parameter is required" });
    }

    const tagIds = tagIdsParam.split(',').filter(id => id.trim());
    if (tagIds.length === 0) {
      return res.json({ churches: {} });
    }

    const supabase = supabaseServer();

    // Get all church-tag assignments for the specified tags
    const { data: assignments, error: fetchError } = await supabase
      .from('internal_church_tags')
      .select(`
        church_id,
        tag_id,
        internal_tags (
          color_hex,
          icon_key
        )
      `)
      .in('tag_id', tagIds);

    if (fetchError) {
      console.error('Error fetching churches by tags:', fetchError);
      throw fetchError;
    }

    // Build a map: church_id -> first matching tag's style info
    // If a church has multiple matching tags, use the first one found
    const churchStyleMap: Record<string, { tag_id: string; color_hex: string; icon_key: string }> = {};

    for (const assignment of assignments || []) {
      const churchId = assignment.church_id;
      if (!churchStyleMap[churchId]) {
        churchStyleMap[churchId] = {
          tag_id: assignment.tag_id,
          color_hex: (assignment as any).internal_tags?.color_hex || '#6B7280',
          icon_key: (assignment as any).internal_tags?.icon_key || 'Lu:Tag',
        };
      }
    }

    res.json({ churches: churchStyleMap });
  } catch (error: any) {
    console.error('GET /api/admin/internal-tags/by-tags error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
