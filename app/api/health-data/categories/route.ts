import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request, res: Response) {
  try {
    const { data, error } = await supabase
      .from('health_metric_categories')
      .select('*')
      .order('sort_order');

    if (error) {
      console.error('Error fetching health categories:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (error) {
    console.error('Health categories GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
