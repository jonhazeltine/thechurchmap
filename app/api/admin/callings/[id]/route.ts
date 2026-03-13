import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { z } from "zod";

const callingUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  type: z.enum(["place", "people", "problem", "purpose"]).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
});

// PATCH /api/admin/callings/:id - Update a calling
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
    const validatedData = callingUpdateSchema.parse(req.body);

    // Build update object (only include fields that were provided)
    const updateData: any = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.type !== undefined) updateData.type = validatedData.type;
    if (validatedData.description !== undefined) updateData.description = validatedData.description || null;
    if (validatedData.color !== undefined) updateData.color = validatedData.color || null;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const supabase = supabaseServer();

    // Check usage count before update
    const { count, error: countError } = await supabase
      .from('church_calling')
      .select('*', { count: 'exact', head: true })
      .eq('calling_id', id);

    if (countError) {
      console.error('Error checking usage:', countError);
      throw countError;
    }

    // Update the calling
    const { data: updatedCalling, error } = await supabase
      .from('callings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating calling:', error);
      throw error;
    }

    res.json({
      ...updatedCalling,
      usage_count: count || 0,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('PATCH /api/admin/callings/:id error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// DELETE /api/admin/callings/:id - Delete a calling
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

    const supabase = supabaseServer();

    // Check usage count before deletion
    const { count, error: countError } = await supabase
      .from('church_calling')
      .select('*', { count: 'exact', head: true })
      .eq('calling_id', id);

    if (countError) {
      console.error('Error checking usage:', countError);
      throw countError;
    }

    // If calling is in use, we'll still allow deletion but warn the user
    // The frontend should have already shown a warning dialog
    
    // Delete the calling (this will cascade delete church_callings if foreign key is set up)
    const { error } = await supabase
      .from('callings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting calling:', error);
      throw error;
    }

    res.json({ 
      success: true, 
      message: "Calling deleted successfully",
      affected_churches: count || 0,
    });
  } catch (error: any) {
    console.error('DELETE /api/admin/callings/:id error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
