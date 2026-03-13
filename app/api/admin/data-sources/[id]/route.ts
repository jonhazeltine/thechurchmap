import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { updateDataSourceConfigSchema } from "../../../../../shared/schema";

// DEV BYPASS: Set to true to bypass Supabase auth when it's down
const DEV_BYPASS_AUTH = false;

// GET /api/admin/data-sources/:id - Get single data source config by ID
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
      console.log("🔓 DEV BYPASS: Granting super admin access to data source [id] GET");
    }

    const dataSourceId = req.params.id;
    if (!dataSourceId) {
      return res.status(400).json({ error: 'Data source ID required' });
    }

    const { data: dataSource, error } = await adminClient
      .from('data_source_config')
      .select('*')
      .eq('id', dataSourceId)
      .single();

    if (error || !dataSource) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    return res.status(200).json(dataSource);

  } catch (error) {
    console.error('Error in get data source:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// PATCH /api/admin/data-sources/:id - Update data source config
export async function PATCH(req: Request, res: Response) {
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
      console.log("🔓 DEV BYPASS: Granting super admin access to data source [id] PATCH");
    }

    const dataSourceId = req.params.id;
    if (!dataSourceId) {
      return res.status(400).json({ error: 'Data source ID required' });
    }

    const validation = updateDataSourceConfigSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: validation.error.errors 
      });
    }

    const { data: existingSource } = await adminClient
      .from('data_source_config')
      .select('id')
      .eq('id', dataSourceId)
      .single();

    if (!existingSource) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    const { data: updatedSource, error } = await adminClient
      .from('data_source_config')
      .update({
        ...validation.data,
        updated_at: new Date().toISOString()
      })
      .eq('id', dataSourceId)
      .select()
      .single();

    if (error) {
      console.error('Error updating data source:', error);
      return res.status(500).json({ error: 'Failed to update data source' });
    }

    return res.status(200).json(updatedSource);

  } catch (error) {
    console.error('Error in update data source:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/admin/data-sources/:id - Delete data source config
export async function DELETE(req: Request, res: Response) {
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
      console.log("🔓 DEV BYPASS: Granting super admin access to data source [id] DELETE");
    }

    const dataSourceId = req.params.id;
    if (!dataSourceId) {
      return res.status(400).json({ error: 'Data source ID required' });
    }

    const { data: existingSource } = await adminClient
      .from('data_source_config')
      .select('id, source_key')
      .eq('id', dataSourceId)
      .single();

    if (!existingSource) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    const { error } = await adminClient
      .from('data_source_config')
      .delete()
      .eq('id', dataSourceId);

    if (error) {
      console.error('Error deleting data source:', error);
      return res.status(500).json({ error: 'Failed to delete data source' });
    }

    return res.status(200).json({ 
      message: 'Data source deleted successfully',
      deleted_source_key: existingSource.source_key
    });

  } catch (error) {
    console.error('Error in delete data source:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
