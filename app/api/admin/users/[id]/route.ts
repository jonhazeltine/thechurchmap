import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { z } from "zod";

const updateUserSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
});

// GET /api/admin/users/:id - Get single user with all details (super admin only)
export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is super admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    // Get user ID from Express params
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Fetch user from auth.users (using admin client)
    const { data: { user: targetUser }, error: userError } = await adminClient.auth.admin.getUserById(userId);

    if (userError) {
      console.error('Error fetching user:', userError);
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch profile
    const { data: profile } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // Fetch platform roles
    const { data: platformRoles } = await adminClient
      .from('platform_roles')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    // Fetch church roles with church details
    const { data: churchRoles } = await adminClient
      .from('church_user_roles')
      .select(`
        id,
        user_id,
        church_id,
        role,
        is_approved,
        created_at,
        updated_at,
        church:churches(
          id,
          name,
          city,
          state,
          denomination
        )
      `)
      .eq('user_id', userId)
      .eq('is_approved', true);

    const userData = {
      id: targetUser.id,
      email: targetUser.email,
      created_at: targetUser.created_at,
      last_sign_in_at: targetUser.last_sign_in_at,
      is_super_admin: targetUser.user_metadata?.super_admin === true,
      profile: profile || null,
      platform_roles: platformRoles || [],
      church_roles: churchRoles || [],
    };

    return res.status(200).json(userData);

  } catch (error) {
    console.error('Error in get user details:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// PATCH /api/admin/users/:id - Update user info (super admin only)
export async function PATCH(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is super admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    // Get user ID from Express params
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Validate request body
    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: validation.error.errors 
      });
    }

    const { first_name, last_name, email } = validation.data;

    // Update email in auth.users if provided
    if (email) {
      const { error: emailError } = await adminClient.auth.admin.updateUserById(userId, {
        email,
      });

      if (emailError) {
        console.error('Error updating email:', emailError);
        return res.status(500).json({ error: 'Failed to update email' });
      }
    }

    // Update profile if first_name or last_name provided
    if (first_name !== undefined || last_name !== undefined) {
      const profileUpdates: any = {};
      
      if (first_name !== undefined) {
        profileUpdates.first_name = first_name;
      }
      
      if (last_name !== undefined) {
        profileUpdates.last_name = last_name;
      }

      // Calculate full_name
      if (first_name !== undefined || last_name !== undefined) {
        // Fetch current profile to get missing values
        const { data: currentProfile } = await adminClient
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', userId)
          .single();

        const finalFirstName = first_name !== undefined ? first_name : (currentProfile?.first_name || '');
        const finalLastName = last_name !== undefined ? last_name : (currentProfile?.last_name || '');
        
        profileUpdates.full_name = `${finalFirstName} ${finalLastName}`.trim();
        
        // Calculate last_initial
        if (finalLastName) {
          profileUpdates.last_initial = finalLastName.charAt(0).toUpperCase();
        }
      }

      const { error: profileError } = await adminClient
        .from('profiles')
        .update(profileUpdates)
        .eq('id', userId);

      if (profileError) {
        console.error('Error updating profile:', profileError);
        return res.status(500).json({ error: 'Failed to update profile' });
      }
    }

    const response = { 
      message: 'User updated successfully',
      updated: { first_name, last_name, email }
    };
    
    console.log('User update response:', JSON.stringify(response));
    return res.status(200).json(response);

  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/admin/users/:id - Delete a user (super admin or platform admin)
export async function DELETE(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user ID from Express params
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Prevent self-deletion
    if (userId === user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user is super admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    // Check if user is platform admin (for any platform)
    const { data: platformRoles } = await adminClient
      .from('platform_roles')
      .select('platform_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['platform_admin', 'platform_owner']);

    const isPlatformAdmin = platformRoles && platformRoles.length > 0;

    if (!isSuperAdmin && !isPlatformAdmin) {
      return res.status(403).json({ error: 'Admin access required to delete users' });
    }

    // Fetch target user to make sure they exist
    const { data: { user: targetUser }, error: userError } = await adminClient.auth.admin.getUserById(userId);

    if (userError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting super admins unless you are a super admin
    if (targetUser.user_metadata?.super_admin === true && !isSuperAdmin) {
      return res.status(403).json({ error: 'Cannot delete a super admin' });
    }

    // Delete in order to respect foreign key constraints
    // 1. Delete church user roles
    const { error: churchRolesError } = await adminClient
      .from('church_user_roles')
      .delete()
      .eq('user_id', userId);

    if (churchRolesError) {
      console.error('Error deleting church roles:', churchRolesError);
    }

    // 2. Delete platform roles
    const { error: platformRolesError } = await adminClient
      .from('platform_roles')
      .delete()
      .eq('user_id', userId);

    if (platformRolesError) {
      console.error('Error deleting platform roles:', platformRolesError);
    }

    // 3. Delete platform membership requests
    const { error: membershipError } = await adminClient
      .from('platform_membership_requests')
      .delete()
      .eq('user_id', userId);

    if (membershipError) {
      console.error('Error deleting membership requests:', membershipError);
    }

    // 4. Delete church claims
    const { error: claimsError } = await adminClient
      .from('church_claims')
      .delete()
      .eq('user_id', userId);

    if (claimsError) {
      console.error('Error deleting church claims:', claimsError);
    }

    // 5. Delete prayers authored by user
    const { error: prayersError } = await adminClient
      .from('prayers')
      .delete()
      .eq('created_by_user_id', userId);

    if (prayersError) {
      console.error('Error deleting prayers:', prayersError);
    }

    // 6. Delete posts authored by user
    const { error: postsError } = await adminClient
      .from('community_posts')
      .delete()
      .eq('author_user_id', userId);

    if (postsError) {
      console.error('Error deleting posts:', postsError);
    }

    // 7. Delete profile
    const { error: profileError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
    }

    // 8. Finally, delete the auth user
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError);
      return res.status(500).json({ error: 'Failed to delete user account' });
    }

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
