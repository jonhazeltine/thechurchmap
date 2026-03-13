import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { z } from "zod";

const callingSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["place", "people", "problem", "purpose"]),
  description: z.string().optional(),
  color: z.string().optional(),
});

// GET /api/admin/callings - Get all callings with usage count
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

    const supabase = supabaseServer();

    // Get all callings with usage count
    const { data: callings, error } = await supabase
      .from('callings')
      .select(`
        id,
        name,
        type,
        description,
        color,
        created_at,
        church_calling (count)
      `)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching callings:', error);
      throw error;
    }

    // Transform the data to include usage_count
    const callingsWithUsage = (callings || []).map((calling: any) => ({
      id: calling.id,
      name: calling.name,
      type: calling.type,
      description: calling.description,
      color: calling.color,
      created_at: calling.created_at,
      usage_count: calling.church_calling?.[0]?.count || 0,
    }));

    res.json(callingsWithUsage);
  } catch (error: any) {
    console.error('GET /api/admin/callings error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// POST /api/admin/callings - Create a new calling
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
    const validatedData = callingSchema.parse(req.body);

    const supabase = supabaseServer();

    // Insert new calling
    const { data: newCalling, error } = await supabase
      .from('callings')
      .insert([{
        name: validatedData.name,
        type: validatedData.type,
        description: validatedData.description || null,
        color: validatedData.color || null,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating calling:', error);
      throw error;
    }

    res.status(201).json(newCalling);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('POST /api/admin/callings error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
