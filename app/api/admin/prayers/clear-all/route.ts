import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

export async function DELETE(req: Request, res: Response) {
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

    const { data: platformRoles } = await adminClient
      .from('city_platform_users')
      .select('*')
      .eq('user_id', user.id)
      .in('role', ['super_admin'])
      .eq('is_active', true);

    const isSuperAdmin = (platformRoles || []).length > 0;

    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Only super admins can clear all prayers' });
    }

    console.log('🗑️ Clearing all prayers - requested by:', user.email);

    const { error: interactionsError } = await adminClient
      .from('prayer_interactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (interactionsError) {
      console.error('Error deleting prayer interactions:', interactionsError);
    } else {
      console.log('✅ Deleted all prayer interactions');
    }

    const { error: prayersError } = await adminClient
      .from('prayers')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (prayersError) {
      console.error('Error deleting prayers:', prayersError);
      return res.status(500).json({ error: 'Failed to delete prayers', details: prayersError.message });
    }

    console.log('✅ Deleted all prayers');

    return res.status(200).json({ 
      success: true, 
      message: 'All prayers and interactions have been deleted',
    });

  } catch (error) {
    console.error('Error clearing prayers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
