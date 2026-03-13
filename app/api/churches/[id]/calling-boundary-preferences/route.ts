import { Request, Response } from 'express';
import { supabaseServer, supabaseUserClient } from '../../../../../lib/supabaseServer';
import { z } from 'zod';

// Validation schema for toggle request
const toggleCallingBoundarySchema = z.object({
  calling_id: z.string().uuid(),
  custom_boundary_enabled: z.boolean(),
});

export async function PATCH(req: Request, res: Response) {
  try {
    const { id: churchId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    // Validate request body
    const { calling_id, custom_boundary_enabled } = toggleCallingBoundarySchema.parse(req.body);

    // Step 1: JWT verification - validate user session
    const userClient = supabaseUserClient(token);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    
    if (userError || !userData.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Step 2: Check if user is platform admin OR church owner
    const adminClient = supabaseServer();
    
    // Check platform admin status using adminClient to bypass RLS
    console.log('🔍 Checking platform admin status for user:', userData.user.id);
    const { data: platformRoles, error: rolesError } = await adminClient
      .from('platform_roles')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('is_active', true);
    
    console.log('📋 Platform roles query result:', { platformRoles, rolesError });
    
    const isPlatformAdmin = (platformRoles || []).some(
      (role: any) => role.role === 'platform_admin' && role.is_active
    );
    
    console.log('🔐 isPlatformAdmin:', isPlatformAdmin);

    // Get church to check ownership
    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select('claimed_by')
      .eq('id', churchId)
      .single();

    if (churchError || !church) {
      console.log('❌ Church not found:', churchError);
      return res.status(404).json({ error: 'Church not found' });
    }

    // Allow if user is platform admin OR church owner
    const isOwner = church.claimed_by === userData.user.id;
    console.log('👤 Ownership check:', { isOwner, claimed_by: church.claimed_by, user_id: userData.user.id });
    
    if (!isPlatformAdmin && !isOwner) {
      console.log('🚫 Permission denied - not admin and not owner');
      return res.status(403).json({ error: 'You do not have permission to modify this church' });
    }
    
    console.log('✅ Permission granted:', isPlatformAdmin ? 'Platform Admin' : 'Church Owner');

    // Step 3: Verify the calling belongs to this church
    const { data: existingCalling, error: callingError } = await adminClient
      .from('church_calling')
      .select('id')
      .eq('church_id', churchId)
      .eq('calling_id', calling_id)
      .single();

    if (callingError || !existingCalling) {
      return res.status(404).json({ error: 'Calling not associated with this church' });
    }

    // Step 4: Update the custom_boundary_enabled flag using service role client
    const { error: updateError } = await adminClient
      .from('church_calling')
      .update({ custom_boundary_enabled })
      .eq('church_id', churchId)
      .eq('calling_id', calling_id);

    if (updateError) {
      throw updateError;
    }

    console.log('✅ Successfully toggled boundary preference:', { calling_id, custom_boundary_enabled });
    res.json({ success: true, calling_id, custom_boundary_enabled });
  } catch (error: any) {
    console.error('❌ Error updating calling boundary preference:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    res.status(400).json({ error: error.message });
  }
}
