import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";
import { z } from "zod";

const updateSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().nullable(),
});

async function verifyAdminAccess(req: Request): Promise<{ authorized: boolean; userId?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { authorized: false };
  }

  const token = authHeader.substring(7);
  const userClient = supabaseUserClient(token);
  const { data: { user } } = await userClient.auth.getUser();

  if (!user) {
    return { authorized: false };
  }

  const supabase = supabaseServer();
  
  const { data: platformRole } = await supabase
    .from('platform_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'platform_admin'])
    .single();

  if (!platformRole) {
    return { authorized: false };
  }

  return { authorized: true, userId: user.id };
}

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    const key = req.query.key as string | undefined;

    if (key) {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .eq('key', key)
        .single();

      if (error && error.code !== 'PGRST116') {
        if (error.message?.includes('does not exist')) {
          return res.json({ value: null });
        }
        throw error;
      }

      return res.json({ value: data?.value || null });
    }

    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value');

    if (error) {
      if (error.message?.includes('does not exist')) {
        return res.json({ settings: {} });
      }
      throw error;
    }

    const settings = (data || []).reduce((acc: Record<string, string>, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    return res.json({ settings });
  } catch (error: any) {
    console.error('GET /api/admin/settings error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const auth = await verifyAdminAccess(req);
    if (!auth.authorized) {
      return res.status(401).json({ error: 'Unauthorized - admin access required' });
    }

    const parseResult = updateSettingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request body',
        details: parseResult.error.issues 
      });
    }

    const { key, value } = parseResult.data;
    const supabase = supabaseServer();

    if (value === null) {
      await supabase
        .from('platform_settings')
        .delete()
        .eq('key', key);
    } else {
      const { error } = await supabase
        .from('platform_settings')
        .upsert({ key, value }, { onConflict: 'key' });

      if (error) {
        if (error.message?.includes('does not exist')) {
          return res.status(500).json({ 
            error: 'Platform settings table not found. Please run migration 0060-platform-settings.sql' 
          });
        }
        throw error;
      }
    }

    return res.json({ success: true, key, value });
  } catch (error: any) {
    console.error('PATCH /api/admin/settings error:', error);
    res.status(500).json({ error: error.message });
  }
}
