import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import type { RecentPrayerInteraction } from "../../../../../shared/schema";

/**
 * GET /api/prayers/interactions/recent
 * Returns the last 20 prayer interactions for live ticker display
 * 
 * Response format:
 * {
 *   interactions: RecentPrayerInteraction[]
 * }
 */
export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();

    // Get recent prayer interactions with related data
    const { data: interactions, error } = await supabase
      .from('prayer_interactions')
      .select(`
        id,
        prayer_id,
        user_id,
        created_at,
        prayers (
          id,
          title,
          church_id,
          region_type,
          churches (name)
        ),
        profiles (
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching recent interactions:', error);
      return res.status(500).json({ error: 'Failed to fetch recent interactions' });
    }

    // Format interactions for the ticker
    const formattedInteractions: RecentPrayerInteraction[] = (interactions || []).map((interaction: any) => {
      const prayer = interaction.prayers;
      const profile = interaction.profiles;
      const church = prayer?.churches;

      return {
        id: interaction.id,
        prayer_id: interaction.prayer_id,
        prayer_title: prayer?.title || 'Unknown Prayer',
        church_name: church?.name || null,
        region_type: prayer?.region_type || null,
        user_first_name: profile?.first_name || null,
        user_last_initial: profile?.last_name?.charAt(0) || null,
        created_at: interaction.created_at
      };
    });

    return res.json({
      interactions: formattedInteractions
    });

  } catch (error) {
    console.error('Error in GET /api/prayers/interactions/recent:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
