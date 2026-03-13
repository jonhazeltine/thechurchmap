import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";

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

const assignTagSchema = z.object({
  church_id: z.string().uuid("Invalid church ID"),
  notes: z.string().max(500, "Notes too long").optional(),
});

// POST /api/admin/internal-tags/:id/churches - Assign tag to a church
export async function POST(req: Request, res: Response) {
  try {
    const { user, error } = await checkPlatformAdminAccess(req);
    if (error) {
      return res.status(error === "Unauthorized" ? 401 : 403).json({ error });
    }

    const tagId = req.params.id;
    if (!tagId) {
      return res.status(400).json({ error: "Tag ID is required" });
    }

    // Validate request body
    const validatedData = assignTagSchema.parse(req.body);

    const supabase = supabaseServer();

    // Check if tag exists
    const { data: tag, error: tagError } = await supabase
      .from('internal_tags')
      .select('id')
      .eq('id', tagId)
      .single();

    if (tagError || !tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    // Check if church exists
    const { data: church, error: churchError } = await supabase
      .from('churches')
      .select('id')
      .eq('id', validatedData.church_id)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: "Church not found" });
    }

    // Assign tag to church (upsert to handle re-assignment)
    const { data: assignment, error: assignError } = await supabase
      .from('internal_church_tags')
      .upsert({
        church_id: validatedData.church_id,
        tag_id: tagId,
        applied_by: user.id,
        notes: validatedData.notes || null,
        applied_at: new Date().toISOString(),
      }, {
        onConflict: 'church_id,tag_id',
      })
      .select()
      .single();

    if (assignError) {
      console.error('Error assigning tag to church:', assignError);
      throw assignError;
    }

    res.status(201).json(assignment);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('POST /api/admin/internal-tags/:id/churches error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// DELETE /api/admin/internal-tags/:id/churches - Remove tag from a church
export async function DELETE(req: Request, res: Response) {
  try {
    const { error } = await checkPlatformAdminAccess(req);
    if (error) {
      return res.status(error === "Unauthorized" ? 401 : 403).json({ error });
    }

    const tagId = req.params.id;
    const churchId = req.query.church_id as string;
    
    if (!tagId) {
      return res.status(400).json({ error: "Tag ID is required" });
    }
    if (!churchId) {
      return res.status(400).json({ error: "Church ID is required (query param: church_id)" });
    }

    const supabase = supabaseServer();

    // Remove tag assignment
    const { error: deleteError } = await supabase
      .from('internal_church_tags')
      .delete()
      .eq('tag_id', tagId)
      .eq('church_id', churchId);

    if (deleteError) {
      console.error('Error removing tag from church:', deleteError);
      throw deleteError;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/admin/internal-tags/:id/churches error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
