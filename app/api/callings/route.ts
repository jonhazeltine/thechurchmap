import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import { insertCallingSchema } from "@shared/schema";

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from('callings')
      .select('*')
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const validatedData = insertCallingSchema.parse(req.body);
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from('callings')
      .insert(validatedData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
