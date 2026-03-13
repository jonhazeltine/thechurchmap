import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { insertInternalTagSchema } from "@shared/schema";
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
  
  // Check for super_admin in user_metadata OR platform_admin role
  const isSuperAdmin = user.user_metadata?.super_admin === true;
  
  // Also check platform_roles table
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

// GET /api/admin/internal-tags - Get all internal tags with usage count
export async function GET(req: Request, res: Response) {
  try {
    const { user, error } = await checkPlatformAdminAccess(req);
    if (error) {
      return res.status(error === "Unauthorized" ? 401 : 403).json({ error });
    }

    const supabase = supabaseServer();

    // Get all internal tags with usage count
    const { data: tags, error: fetchError } = await supabase
      .from('internal_tags')
      .select(`
        id,
        name,
        slug,
        description,
        color_hex,
        icon_key,
        is_active,
        sort_order,
        created_by,
        created_at,
        updated_at,
        internal_church_tags (count)
      `)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (fetchError) {
      console.error('Error fetching internal tags:', fetchError);
      throw fetchError;
    }

    // Transform the data to include usage_count
    const tagsWithUsage = (tags || []).map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      description: tag.description,
      color_hex: tag.color_hex,
      icon_key: tag.icon_key,
      is_active: tag.is_active,
      sort_order: tag.sort_order,
      created_by: tag.created_by,
      created_at: tag.created_at,
      updated_at: tag.updated_at,
      usage_count: tag.internal_church_tags?.[0]?.count || 0,
    }));

    res.json(tagsWithUsage);
  } catch (error: any) {
    console.error('GET /api/admin/internal-tags error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// POST /api/admin/internal-tags - Create a new internal tag
export async function POST(req: Request, res: Response) {
  try {
    const { user, error } = await checkPlatformAdminAccess(req);
    if (error) {
      return res.status(error === "Unauthorized" ? 401 : 403).json({ error });
    }

    // Validate request body
    const validatedData = insertInternalTagSchema.parse(req.body);

    const supabase = supabaseServer();

    // Insert new internal tag
    const { data: newTag, error: insertError } = await supabase
      .from('internal_tags')
      .insert([{
        name: validatedData.name,
        slug: validatedData.slug,
        description: validatedData.description || null,
        color_hex: validatedData.color_hex,
        icon_key: validatedData.icon_key,
        is_active: validatedData.is_active ?? true,
        sort_order: validatedData.sort_order ?? 0,
        created_by: user.id,
      }])
      .select()
      .single();

    if (insertError) {
      // Handle unique constraint violation
      if (insertError.code === '23505') {
        return res.status(409).json({ error: "A tag with this slug already exists" });
      }
      console.error('Error creating internal tag:', insertError);
      throw insertError;
    }

    res.status(201).json(newTag);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('POST /api/admin/internal-tags error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
