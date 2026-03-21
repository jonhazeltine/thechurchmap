import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { updateInternalTagSchema } from "@shared/schema";
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

// PATCH /api/admin/internal-tags/:id - Update an internal tag
export async function PATCH(req: Request, res: Response) {
  try {
    const { error } = await checkPlatformAdminAccess(req);
    if (error) {
      return res.status(error === "Unauthorized" ? 401 : 403).json({ error });
    }

    const tagId = req.params.id;
    if (!tagId) {
      return res.status(400).json({ error: "Tag ID is required" });
    }

    // Validate request body
    const validatedData = updateInternalTagSchema.parse(req.body);

    const supabase = supabaseServer();

    // Update the internal tag
    const { data: updatedTag, error: updateError } = await supabase
      .from('internal_tags')
      .update({
        ...validatedData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tagId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({ error: "Tag not found" });
      }
      if (updateError.code === '23505') {
        return res.status(409).json({ error: "A tag with this slug already exists" });
      }
      console.error('Error updating internal tag:', updateError);
      throw updateError;
    }

    res.json(updatedTag);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('PATCH /api/admin/internal-tags/:id error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// DELETE /api/admin/internal-tags/:id - Delete an internal tag
export async function DELETE(req: Request, res: Response) {
  try {
    const { error } = await checkPlatformAdminAccess(req);
    if (error) {
      return res.status(error === "Unauthorized" ? 401 : 403).json({ error });
    }

    const tagId = req.params.id;
    if (!tagId) {
      return res.status(400).json({ error: "Tag ID is required" });
    }

    const supabase = supabaseServer();

    // First check usage count
    const { data: usageData } = await supabase
      .from('internal_church_tags')
      .select('id', { count: 'exact' })
      .eq('tag_id', tagId);

    const usageCount = usageData?.length || 0;

    // Delete the tag (cascade will remove assignments)
    const { error: deleteError } = await supabase
      .from('internal_tags')
      .delete()
      .eq('id', tagId);

    if (deleteError) {
      console.error('Error deleting internal tag:', deleteError);
      throw deleteError;
    }

    res.json({ success: true, removedAssignments: usageCount });
  } catch (error: any) {
    console.error('DELETE /api/admin/internal-tags/:id error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
