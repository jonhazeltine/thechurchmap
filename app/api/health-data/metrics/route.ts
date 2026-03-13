import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request, res: Response) {
  try {
    const { category } = req.query;

    let query = supabase
      .from('health_metrics')
      .select(`
        *,
        category:health_metric_categories (
          id,
          name,
          display_name,
          color,
          sort_order
        )
      `)
      .order('display_name');

    if (category) {
      query = query.eq('category.name', category as string);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching health metrics:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (error) {
    console.error('Health metrics GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const metric = req.body;

    if (!metric.metric_key || !metric.display_name) {
      return res.status(400).json({ error: 'metric_key and display_name are required' });
    }

    const { data, error } = await supabase
      .from('health_metrics')
      .upsert(metric, { onConflict: 'metric_key' })
      .select()
      .single();

    if (error) {
      console.error('Error creating health metric:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (error) {
    console.error('Health metrics POST error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
