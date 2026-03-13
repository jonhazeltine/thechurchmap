import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value');

    if (error) {
      if (error.message?.includes('does not exist')) {
        return res.json({
          defaultPinColor: '#2563EB',
          defaultPinIcon: '',
          mapBaseStyle: 'streets-v12',
        });
      }
      throw error;
    }

    const settings = (data || []).reduce((acc: Record<string, string>, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    res.json({
      defaultPinColor: settings.defaultPinColor || '#2563EB',
      defaultPinIcon: settings.defaultPinIcon || '',
      mapBaseStyle: settings.mapBaseStyle || 'streets-v12',
      defaultPrayerPostImage: settings.defaultPrayerPostImage || null,
      prayerPromptStyle: settings.prayerPromptStyle || 'context',
    });
  } catch (error: any) {
    console.error('GET /api/platform/settings error:', error);
    res.json({
      defaultPinColor: '#2563EB',
      defaultPinIcon: '',
      mapBaseStyle: 'streets-v12',
      prayerPromptStyle: 'context',
    });
  }
}
