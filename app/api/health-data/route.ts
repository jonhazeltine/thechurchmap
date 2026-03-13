import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request, res: Response) {
  try {
    const { geo_fips, geo_level = 'city', metric_key, category } = req.query;

    let query = supabase
      .from('health_metric_data')
      .select(`
        *,
        metric:health_metrics!inner (
          metric_key,
          display_name,
          unit,
          is_percentage,
          higher_is_better,
          category:health_metric_categories (
            name,
            display_name,
            color
          )
        )
      `)
      .eq('geo_level', geo_level as string)
      .eq('group_name', 'Total')
      .order('data_period', { ascending: false });

    if (geo_fips) {
      query = query.eq('geo_fips', geo_fips as string);
    }

    if (metric_key) {
      query = query.eq('metric.metric_key', metric_key as string);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching health data:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (error) {
    console.error('Health data GET error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { metrics } = req.body;

    if (!Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: 'metrics array is required' });
    }

    const { data, error } = await supabase
      .from('health_metric_data')
      .upsert(metrics, { 
        onConflict: 'metric_id,geo_fips,data_period,group_name',
        ignoreDuplicates: false 
      })
      .select();

    if (error) {
      console.error('Error upserting health data:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ inserted: data?.length || 0 });
  } catch (error) {
    console.error('Health data POST error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
