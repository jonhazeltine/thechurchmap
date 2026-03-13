import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { createDataSourceConfigSchema } from "../../../../shared/schema";
import { z } from "zod";

// DEV BYPASS: Set to true to bypass Supabase auth when it's down
const DEV_BYPASS_AUTH = false;

// GET /api/admin/data-sources - List all data source configs with optional filtering
export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    // DEV BYPASS: Skip auth check when Supabase is down
    const isDevBypass = DEV_BYPASS_AUTH && token === "dev-bypass-token";
    
    if (!isDevBypass) {
      const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
      
      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const isSuperAdmin = user.user_metadata?.super_admin === true;
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Super admin access required' });
      }
    } else {
      console.log("🔓 DEV BYPASS: Granting super admin access to data sources");
    }

    const { type, enabled } = req.query;

    let query = adminClient
      .from('data_source_config')
      .select('*')
      .order('source_name', { ascending: true });

    if (type && typeof type === 'string') {
      query = query.eq('source_type', type);
    }

    if (enabled !== undefined) {
      query = query.eq('enabled', enabled === 'true');
    }

    const { data: dataSources, error } = await query;

    if (error) {
      console.error('Error fetching data sources:', error);
      return res.status(500).json({ error: 'Failed to fetch data sources' });
    }

    // For crime sources, fetch actual database record counts
    const enrichedSources = await Promise.all(
      (dataSources || []).map(async (source: any) => {
        if (source.source_type === 'crime' && source.source_key?.startsWith('crime_')) {
          // Extract city and state from source_name (e.g., "Grand Rapids, MI Crime Data")
          // or from source_key + metadata
          const nameMatch = source.source_name?.match(/^(.+?),\s*([A-Z]{2})\s+Crime/i);
          if (nameMatch) {
            const cityName = nameMatch[1].trim();
            const stateAbbr = nameMatch[2].toUpperCase();
            
            const { count, error: queryError } = await adminClient
              .from('crime_incidents')
              .select('*', { count: 'exact', head: true })
              .eq('city', cityName)
              .eq('state', stateAbbr);
            
            if (queryError) {
              console.error(`Error querying crime counts for ${cityName}, ${stateAbbr}:`, queryError.message);
              return source;
            }
            
            return {
              ...source,
              records_processed: count ?? source.records_processed ?? 0,
              db_records: count ?? 0,
            };
          }
        }
        return source;
      })
    );

    return res.status(200).json({ data_sources: enrichedSources });

  } catch (error) {
    console.error('Error in admin data sources list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/admin/data-sources - Create a new data source config (super_admin only)
export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const validation = createDataSourceConfigSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: validation.error.errors 
      });
    }

    const { data: existingSource } = await adminClient
      .from('data_source_config')
      .select('id')
      .eq('source_key', validation.data.source_key)
      .single();

    if (existingSource) {
      return res.status(409).json({ error: 'A data source with this key already exists' });
    }

    const { data: newSource, error } = await adminClient
      .from('data_source_config')
      .insert([validation.data])
      .select()
      .single();

    if (error) {
      console.error('Error creating data source:', error);
      return res.status(500).json({ error: 'Failed to create data source' });
    }

    return res.status(201).json(newSource);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error in admin data sources create:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
