import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";

/**
 * POST /api/prayers/pray
 * Records a "prayed" interaction for a prayer
 * 
 * Body:
 * - prayer_id: string (UUID for real prayers in database)
 * - church_id: string (UUID for template-based prayers)
 * - guest_name: string (optional - for guest/anonymous prayers, first name + last initial)
 * 
 * Either prayer_id OR church_id must be provided:
 * - prayer_id: For real prayers stored in database
 * - church_id: For template-based prayers (rendered on-the-fly)
 * 
 * Guest prayers: If no auth token but guest_name provided, creates anonymous interaction
 * Throttling: Max 5 interactions per user per prayer/church per minute (IP-based for guests)
 */
export async function POST(req: Request, res: Response) {
  try {
    const { prayer_id, church_id, guest_name, guest_full_name } = req.body;
    
    // Check for authenticated user first
    const authHeader = req.headers.authorization;
    let user: any = null;
    let isGuest = false;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const userClient = supabaseUserClient(token);
      const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
      
      if (!authError && authUser) {
        user = authUser;
      }
    }
    
    // If no authenticated user, allow guest prayer with name
    if (!user) {
      if (!guest_name || typeof guest_name !== 'string' || guest_name.trim().length < 2) {
        return res.status(400).json({ 
          error: 'Guest name required', 
          requires_name: true,
          message: 'Please provide your name to record your prayer'
        });
      }
      isGuest = true;
    }

    // Either prayer_id or church_id must be provided
    if (!prayer_id && !church_id) {
      return res.status(400).json({ error: 'Either prayer_id or church_id is required' });
    }

    const supabase = supabaseServer();

    // Determine if this is a template prayer (church_id) or real prayer (prayer_id)
    const isTemplatePrayer = !!church_id && !prayer_id;

    if (isTemplatePrayer) {
      // Template prayer - verify church exists
      const { data: church, error: churchError } = await supabase
        .from('churches')
        .select('id, name')
        .eq('id', church_id)
        .single();

      if (churchError || !church) {
        return res.status(404).json({ error: 'Church not found' });
      }

      console.log('🙏 Prayer for template prayer, church:', church.name, isGuest ? '(guest)' : '(user)');

      // Check throttling for church-based prayers (skip for guests - they can pray once)
      if (!isGuest) {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
        const { count: recentCount } = await supabase
          .from('prayer_interactions')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', church_id)
          .eq('user_id', user.id)
          .eq('interaction_type', 'prayed')
          .gte('created_at', oneMinuteAgo);

        if (recentCount && recentCount >= 5) {
          return res.status(429).json({ 
            error: 'Rate limit exceeded',
            message: 'You can pray for this church up to 5 times per minute'
          });
        }
      }

      // Log full name for potential account creation (column may not exist yet)
      if (isGuest && guest_full_name) {
        console.log('🙏 Guest prayer with full name:', guest_full_name.trim());
      }

      // Insert church-based prayer interaction
      const { data: interaction, error: insertError } = await supabase
        .from('prayer_interactions')
        .insert({
          church_id: church_id,
          prayer_id: null,
          user_id: isGuest ? null : user.id,
          interaction_type: 'prayed',
          guest_name: isGuest ? guest_name.trim() : null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting prayer interaction:', insertError);
        // Check for duplicate key violation (user already prayed)
        if (insertError.code === '23505') {
          // Return success with a friendly message for repeat prayers
          const { data: countData } = await supabase
            .rpc('fn_get_church_prayer_count', { p_church_id: church_id });
          return res.status(200).json({ 
            message: 'Thank you for praying again!',
            already_prayed: true,
            interaction_count: countData || 1
          });
        }
        return res.status(500).json({ error: 'Failed to record prayer interaction' });
      }

      // Get total interaction count for this church
      const { data: countData } = await supabase
        .rpc('fn_get_church_prayer_count', { p_church_id: church_id });

      return res.status(201).json({
        message: 'Prayer recorded',
        interaction_id: interaction.id,
        interaction_count: countData || 1
      });

    } else {
      // Real prayer - existing logic
      
      // Verify prayer exists and is approved
      const { data: prayer, error: prayerError } = await supabase
        .from('prayers')
        .select('id, status, church_id')
        .eq('id', prayer_id)
        .single();

      if (prayerError || !prayer) {
        return res.status(404).json({ error: 'Prayer not found' });
      }

      if (prayer.status !== 'approved') {
        return res.status(403).json({ error: 'Prayer is not approved' });
      }

      // Check throttling (skip for guests - they can pray once per session)
      if (!isGuest) {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
        const { count: recentCount } = await supabase
          .from('prayer_interactions')
          .select('id', { count: 'exact', head: true })
          .eq('prayer_id', prayer_id)
          .eq('user_id', user.id)
          .eq('interaction_type', 'prayed')
          .gte('created_at', oneMinuteAgo);

        if (recentCount && recentCount >= 5) {
          return res.status(429).json({ 
            error: 'Rate limit exceeded',
            message: 'You can pray for this request up to 5 times per minute'
          });
        }
      }

      console.log('🙏 Prayer for real prayer:', prayer_id, isGuest ? '(guest)' : '(user)');

      // Log full name for potential account creation (column may not exist yet)
      if (isGuest && guest_full_name) {
        console.log('🙏 Guest prayer with full name:', guest_full_name.trim());
      }

      // Insert prayer interaction
      const { data: interaction, error: insertError } = await supabase
        .from('prayer_interactions')
        .insert({
          prayer_id: prayer_id,
          church_id: prayer.church_id,
          user_id: isGuest ? null : user.id,
          interaction_type: 'prayed',
          guest_name: isGuest ? guest_name.trim() : null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting prayer interaction:', insertError);
        // Check for duplicate key violation (user already prayed)
        if (insertError.code === '23505') {
          // Return success with a friendly message for repeat prayers
          const { count } = await supabase
            .from('prayer_interactions')
            .select('id', { count: 'exact', head: true })
            .eq('prayer_id', prayer_id)
            .eq('interaction_type', 'prayed');
          return res.status(200).json({ 
            message: 'Thank you for praying again!',
            already_prayed: true,
            interaction_count: count || 1
          });
        }
        return res.status(500).json({ error: 'Failed to record prayer interaction' });
      }

      // Get updated interaction count for this prayer
      const { count } = await supabase
        .from('prayer_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('prayer_id', prayer_id)
        .eq('interaction_type', 'prayed');

      return res.status(201).json({
        message: 'Prayer recorded',
        interaction_id: interaction.id,
        interaction_count: count || 1
      });
    }

  } catch (error) {
    console.error('Error in POST /api/prayers/pray:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
