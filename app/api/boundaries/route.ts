import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request, res: Response) {
  try {
    const { type, source, limit } = req.query;
    
    let query = supabase
      .from('boundaries')
      .select('*')
      .order('name');
    
    if (type) {
      query = query.eq('type', type);
    }
    
    if (source) {
      query = query.eq('source', source);
    }
    
    if (limit) {
      query = query.limit(parseInt(limit as string, 10));
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching boundaries:', error);
      return res.status(500).json({ error: error.message });
    }
    
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error in GET /api/boundaries:', error);
    return res.status(500).json({ error: error.message });
  }
}
