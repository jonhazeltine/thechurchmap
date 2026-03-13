import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

export async function POST(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();

    const migrations = [
      `ALTER TABLE prayers ADD COLUMN IF NOT EXISTS scope_type text DEFAULT NULL`,
      `ALTER TABLE prayers ADD COLUMN IF NOT EXISTS tract_id text DEFAULT NULL`,
      `ALTER TABLE prayers ADD COLUMN IF NOT EXISTS click_lat double precision DEFAULT NULL`,
      `ALTER TABLE prayers ADD COLUMN IF NOT EXISTS click_lng double precision DEFAULT NULL`,
    ];

    const results: Array<{ sql: string; success: boolean; error?: string }> = [];

    for (const sql of migrations) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql });
        if (error) {
          results.push({ sql, success: false, error: error.message });
        } else {
          results.push({ sql, success: true });
        }
      } catch (err: any) {
        results.push({ sql, success: false, error: err.message || 'Unknown error' });
      }
    }

    const allSuccess = results.every(r => r.success);
    const anySuccess = results.some(r => r.success);

    if (allSuccess) {
      return res.json({
        message: 'All prayer scope columns added successfully',
        results
      });
    } else if (anySuccess) {
      return res.status(207).json({
        message: 'Some migrations succeeded, some failed. If exec_sql RPC is not available, run the SQL manually in the Supabase SQL Editor using migrations/prayer_scope_fields.sql',
        results
      });
    } else {
      return res.status(500).json({
        message: 'Migration failed. The exec_sql RPC function may not exist. Run the SQL manually in the Supabase SQL Editor using migrations/prayer_scope_fields.sql',
        results
      });
    }
  } catch (error: any) {
    console.error('Error in POST /api/admin/migrations/prayer-scope:', error);
    return res.status(500).json({
      error: 'Migration failed',
      message: error.message || 'Internal server error',
      hint: 'Run the SQL manually in the Supabase SQL Editor using migrations/prayer_scope_fields.sql'
    });
  }
}
