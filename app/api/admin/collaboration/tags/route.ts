import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { insertCollaborationTagSchema } from "../../../../../shared/schema";
import { z } from "zod";

// GET /api/admin/collaboration/tags - Get all tags with usage count
export async function GET(req: Request, res: Response) {
  console.log('🎯 GET /api/admin/collaboration/tags called');
  try {
    // Verify JWT and check for super admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log('❌ No auth header');
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      console.log('❌ Auth error:', authError);
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!user.user_metadata?.super_admin) {
      console.log('❌ Not super admin');
      return res.status(403).json({ error: "Forbidden: Super admin access required" });
    }
    
    console.log('✅ User authenticated as super admin');

    // Get all tags (PostgREST schema cache has been refreshed)
    console.log('🔍 Fetching collaboration tags...');
    const { data: tags, error: tagsError } = await adminClient
      .from('collaboration_tags')
      .select('*')
      .order('sort_order', { ascending: true });

    if (tagsError) {
      console.error('Error fetching tags:', tagsError);
      throw tagsError;
    }

    console.log(`✅ Fetched ${tags?.length || 0} tags from database`);

    // Calculate usage counts for all tags
    const { data: churches, error: churchesError } = await adminClient
      .from('churches')
      .select('id, collaboration_have, collaboration_need');
    
    if (churchesError) {
      console.error('Error fetching churches:', churchesError);
      throw churchesError;
    }

    // Count unique churches per tag slug
    const tagUsage = new Map<string, Set<string>>();
    (churches || []).forEach(church => {
      const allTags = [...(church.collaboration_have || []), ...(church.collaboration_need || [])];
      allTags.forEach(slug => {
        if (!tagUsage.has(slug)) {
          tagUsage.set(slug, new Set());
        }
        tagUsage.get(slug)!.add(church.id);
      });
    });

    // Add usage counts to tags
    const tagsWithUsage = (tags || []).map(tag => ({
      ...tag,
      usage_count: tagUsage.get(tag.slug)?.size || 0,
    }));

    console.log(`📊 Returning ${tagsWithUsage.length} tags to admin`);
    res.json(tagsWithUsage);
  } catch (error: any) {
    console.error('GET /api/admin/collaboration/tags error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// POST /api/admin/collaboration/tags - Create a new tag
export async function POST(req: Request, res: Response) {
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

    // Validate request body
    const validatedData = insertCollaborationTagSchema.parse(req.body);

    // Check if slug already exists
    const { data: existing, error: existingError } = await adminClient
      .from('collaboration_tags')
      .select('id')
      .eq('slug', validatedData.slug)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing tag:', existingError);
      throw existingError;
    }

    if (existing) {
      return res.status(400).json({ error: "A tag with this slug already exists" });
    }

    // Insert new tag
    const { data: newTag, error } = await adminClient
      .from('collaboration_tags')
      .insert([{
        slug: validatedData.slug,
        label: validatedData.label,
        description: validatedData.description || null,
        sort_order: validatedData.sort_order,
        is_active: true,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating tag:', error);
      throw error;
    }

    res.status(201).json({
      ...newTag,
      usage_count: 0,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('POST /api/admin/collaboration/tags error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
