import type { Request, Response } from "express";

export async function POST(req: Request, res: Response) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: "Missing Supabase credentials" });
    }

    const sqlEndpoint = `${supabaseUrl}/rest/v1/rpc/`;

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      }
    });

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'public' }
    });

    const checkResult = await supabase
      .from('churches')
      .select('id')
      .limit(1);

    if (checkResult.error) {
      return res.status(500).json({ error: "Cannot access churches table", details: checkResult.error.message });
    }

    const testUpdate = await supabase
      .from('churches')
      .update({ formation_api_key: null })
      .eq('id', '00000000-0000-0000-0000-000000000000');

    if (testUpdate.error && testUpdate.error.message.includes("column")) {
      return res.status(200).json({ 
        status: "column_missing",
        message: "The 'formation_api_key' column does not exist yet. Please run the following SQL in your Supabase SQL Editor:",
        sql: "ALTER TABLE churches ADD COLUMN IF NOT EXISTS formation_api_key TEXT;"
      });
    }

    return res.status(200).json({ 
      status: "ready",
      message: "The 'formation_api_key' column already exists on the churches table."
    });
  } catch (error: any) {
    return res.status(500).json({ error: "Migration check failed", details: error.message });
  }
}
