import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { updateCollaborationTagSchema } from "../../../../../../shared/schema";
import { z } from "zod";

// GET /api/admin/collaboration/tags/:id - Get a single tag with usage count
export async function GET(req: Request, res: Response) {
  try {
    // Verify JWT and check for super admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!user.user_metadata?.super_admin) {
      return res.status(403).json({ error: "Forbidden: Super admin access required" });
    }

    const { id } = req.params;

    // Get tag
    const { data: tag, error: tagError } = await adminClient
      .from('collaboration_tags')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (tagError) {
      console.error('Error fetching tag:', tagError);
      throw tagError;
    }

    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    // Calculate usage count
    const { data: churches, error: churchesError } = await adminClient
      .from('churches')
      .select('id, collaboration_have, collaboration_need');
    
    if (churchesError) {
      console.error('Error fetching churches:', churchesError);
      throw churchesError;
    }

    // Count unique churches using this tag
    const churchIds = new Set<string>();
    (churches || []).forEach(church => {
      const allTags = [...(church.collaboration_have || []), ...(church.collaboration_need || [])];
      if (allTags.includes(tag.slug)) {
        churchIds.add(church.id);
      }
    });

    res.json({
      ...tag,
      usage_count: churchIds.size,
    });
  } catch (error: any) {
    console.error('GET /api/admin/collaboration/tags/:id error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// PATCH /api/admin/collaboration/tags/:id - Update a tag
export async function PATCH(req: Request, res: Response) {
  try {
    // Verify JWT and check for super admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!user.user_metadata?.super_admin) {
      return res.status(403).json({ error: "Forbidden: Super admin access required" });
    }

    const { id } = req.params;

    // Validate request body
    const validatedData = updateCollaborationTagSchema.parse(req.body);

    // Build update object (only include fields that were provided)
    const updateData: any = {};
    
    if (validatedData.slug !== undefined) {
      // Check if slug already exists (excluding current tag)
      const { data: duplicate, error: duplicateError } = await adminClient
        .from('collaboration_tags')
        .select('id')
        .eq('slug', validatedData.slug)
        .neq('id', id)
        .maybeSingle();

      if (duplicateError) {
        console.error('Error checking duplicate tag:', duplicateError);
        throw duplicateError;
      }

      if (duplicate) {
        return res.status(400).json({ error: "A tag with this slug already exists" });
      }
      updateData.slug = validatedData.slug;
    }
    
    if (validatedData.label !== undefined) updateData.label = validatedData.label;
    if (validatedData.description !== undefined) updateData.description = validatedData.description || null;
    if (validatedData.is_active !== undefined) updateData.is_active = validatedData.is_active;
    if (validatedData.sort_order !== undefined) updateData.sort_order = validatedData.sort_order;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Update the tag
    const { data: updatedTag, error } = await adminClient
      .from('collaboration_tags')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating tag:', error);
      throw error;
    }

    if (!updatedTag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    // Calculate usage count
    const { data: churches, error: churchesError } = await adminClient
      .from('churches')
      .select('id, collaboration_have, collaboration_need');
    
    if (churchesError) {
      console.error('Error fetching churches:', churchesError);
      throw churchesError;
    }

    const churchIds = new Set<string>();
    (churches || []).forEach(church => {
      const allTags = [...(church.collaboration_have || []), ...(church.collaboration_need || [])];
      if (allTags.includes(updatedTag.slug)) {
        churchIds.add(church.id);
      }
    });

    res.json({
      ...updatedTag,
      usage_count: churchIds.size,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('PATCH /api/admin/collaboration/tags/:id error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// DELETE /api/admin/collaboration/tags/:id - Soft delete a tag (set is_active = false)
export async function DELETE(req: Request, res: Response) {
  try {
    // Verify JWT and check for super admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!user.user_metadata?.super_admin) {
      return res.status(403).json({ error: "Forbidden: Super admin access required" });
    }

    const { id } = req.params;

    // Get tag first to check usage
    const { data: tag, error: tagError } = await adminClient
      .from('collaboration_tags')
      .select('slug')
      .eq('id', id)
      .maybeSingle();

    if (tagError) {
      console.error('Error fetching tag:', tagError);
      throw tagError;
    }

    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    // Calculate usage count before soft delete
    const { data: churches, error: churchesError } = await adminClient
      .from('churches')
      .select('id, collaboration_have, collaboration_need');
    
    if (churchesError) {
      console.error('Error fetching churches:', churchesError);
      throw churchesError;
    }

    const churchIds = new Set<string>();
    (churches || []).forEach(church => {
      const allTags = [...(church.collaboration_have || []), ...(church.collaboration_need || [])];
      if (allTags.includes(tag.slug)) {
        churchIds.add(church.id);
      }
    });

    const usageCount = churchIds.size;

    // Soft delete the tag (set is_active = false)
    const { error } = await adminClient
      .from('collaboration_tags')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error soft deleting tag:', error);
      throw error;
    }

    res.json({ 
      success: true, 
      message: "Tag deactivated successfully",
      affected_churches: usageCount,
      warning: usageCount > 0 ? `This tag is currently used by ${usageCount} church(es). It has been deactivated but existing uses remain.` : null,
    });
  } catch (error: any) {
    console.error('DELETE /api/admin/collaboration/tags/:id error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
