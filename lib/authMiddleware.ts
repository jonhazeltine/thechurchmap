import type { Request, Response, NextFunction } from 'express';
import { supabaseServer, supabaseUserClient } from './supabaseServer';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  isPlatformAdmin?: boolean;
  isSuperAdmin?: boolean;
  churchAdminChurchIds?: string[];
}

export interface AuthResult {
  authenticated: boolean;
  user?: { id: string; email: string };
  isPlatformAdmin?: boolean;
  isSuperAdmin?: boolean;
  churchAdminChurchIds?: string[];
  error?: string;
}

export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing or invalid authorization header' };
  }

  const token = authHeader.substring(7);
  
  try {
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return { authenticated: false, error: 'Invalid or expired token' };
    }

    const adminClient = supabaseServer();

    const isSuperAdmin = user.user_metadata?.super_admin === true;

    // Query city_platform_users for all roles (matches /api/admin/access logic)
    const { data: cityPlatformRoles } = await adminClient
      .from('city_platform_users')
      .select('role, church_id, is_active, city_platform_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const roles = (cityPlatformRoles || []) as any[];
    
    // Check if user is super_admin in city_platform_users
    const isSuperAdminCPU = roles.some((r) => r.role === 'super_admin');
    const isSuperAdminFinal = isSuperAdmin || isSuperAdminCPU;
    
    // Check if user is platform owner or admin
    const isPlatformAdmin = isSuperAdminFinal || roles.some(
      (r: any) => r.role === 'platform_owner' || r.role === 'platform_admin'
    );

    // Get church admin roles from city_platform_users
    const churchAdminFromCPU = roles
      .filter((r: any) => r.role === 'church_admin' && r.church_id)
      .map((r: any) => r.church_id);
    
    // Also check legacy church_user_roles table for backwards compatibility
    const { data: legacyChurchRoles } = await adminClient
      .from('church_user_roles')
      .select('church_id, role, is_approved')
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_approved', true);

    const legacyChurchIds = (legacyChurchRoles || []).map((r: any) => r.church_id);
    
    // Combine both sources (matching /api/admin/access behavior)
    const churchAdminChurchIds = Array.from(new Set([...churchAdminFromCPU, ...legacyChurchIds]));

    return {
      authenticated: true,
      user: { id: user.id, email: user.email || '' },
      isPlatformAdmin,
      isSuperAdmin: isSuperAdminFinal,
      churchAdminChurchIds,
    };
  } catch (error: any) {
    return { authenticated: false, error: error.message };
  }
}

export async function canEditChurch(req: Request, churchId: string): Promise<{ allowed: boolean; reason?: string; authenticationFailed?: boolean }> {
  const auth = await verifyAuth(req);
  
  if (!auth.authenticated) {
    console.log(`🔐 canEditChurch: Not authenticated for church ${churchId}`);
    return { allowed: false, reason: 'Not authenticated', authenticationFailed: true };
  }

  console.log(`🔐 canEditChurch check for ${auth.user?.email}:`);
  console.log(`   Target church: ${churchId}`);
  console.log(`   isSuperAdmin: ${auth.isSuperAdmin}`);
  console.log(`   isPlatformAdmin: ${auth.isPlatformAdmin}`);
  console.log(`   churchAdminChurchIds: [${auth.churchAdminChurchIds?.join(', ') || 'none'}]`);

  if (auth.isPlatformAdmin || auth.isSuperAdmin) {
    console.log(`   ✅ Allowed: Platform/Super admin`);
    return { allowed: true };
  }

  if (auth.churchAdminChurchIds?.includes(churchId)) {
    console.log(`   ✅ Allowed: Church admin for this church`);
    return { allowed: true };
  }

  const adminClient = supabaseServer();
  const { data: church } = await adminClient
    .from('churches')
    .select('claimed_by')
    .eq('id', churchId)
    .single();

  if (church?.claimed_by === auth.user?.id) {
    console.log(`   ✅ Allowed: Church claimed by user`);
    return { allowed: true };
  }

  // Check if user has a pending claim for this church (provisional access)
  const { data: pendingClaim } = await adminClient
    .from('church_claims')
    .select('id')
    .eq('church_id', churchId)
    .eq('user_id', auth.user?.id)
    .eq('status', 'pending')
    .single();

  if (pendingClaim) {
    console.log(`   ✅ Allowed: User has pending claim for this church (provisional access)`);
    return { allowed: true };
  }

  console.log(`   ❌ Denied: No permission to edit church ${churchId}`);
  return { allowed: false, reason: 'You do not have permission to edit this church' };
}

export function requireAuth(handler: (req: AuthenticatedRequest, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error || 'Unauthorized' });
    }

    const authReq = req as AuthenticatedRequest;
    authReq.user = auth.user;
    authReq.isPlatformAdmin = auth.isPlatformAdmin;
    authReq.isSuperAdmin = auth.isSuperAdmin;
    authReq.churchAdminChurchIds = auth.churchAdminChurchIds;

    return handler(authReq, res);
  };
}

export function requireChurchAccess(handler: (req: AuthenticatedRequest, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    const churchId = req.params.id || req.params.churchId;
    
    if (!churchId) {
      return res.status(400).json({ error: 'Church ID is required' });
    }

    const access = await canEditChurch(req, churchId);
    
    if (!access.allowed) {
      const auth = await verifyAuth(req);
      if (!auth.authenticated) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.status(403).json({ error: access.reason || 'Permission denied' });
    }

    const auth = await verifyAuth(req);
    const authReq = req as AuthenticatedRequest;
    authReq.user = auth.user;
    authReq.isPlatformAdmin = auth.isPlatformAdmin;
    authReq.isSuperAdmin = auth.isSuperAdmin;
    authReq.churchAdminChurchIds = auth.churchAdminChurchIds;

    return handler(authReq, res);
  };
}

export function requirePlatformAdmin(handler: (req: AuthenticatedRequest, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    
    if (!auth.authenticated) {
      return res.status(401).json({ error: auth.error || 'Unauthorized' });
    }

    if (!auth.isPlatformAdmin && !auth.isSuperAdmin) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const authReq = req as AuthenticatedRequest;
    authReq.user = auth.user;
    authReq.isPlatformAdmin = auth.isPlatformAdmin;
    authReq.isSuperAdmin = auth.isSuperAdmin;
    authReq.churchAdminChurchIds = auth.churchAdminChurchIds;

    return handler(authReq, res);
  };
}

export interface AnyChurchAdminResult {
  authorized: boolean;
  user?: { id: string; email: string };
  error?: string;
}

export async function requireAnyChurchAdmin(req: Request, res: Response): Promise<AnyChurchAdminResult> {
  const auth = await verifyAuth(req);
  
  if (!auth.authenticated) {
    return { authorized: false, error: auth.error || 'Unauthorized' };
  }

  if (auth.isSuperAdmin || auth.isPlatformAdmin) {
    return { authorized: true, user: auth.user };
  }

  if (auth.churchAdminChurchIds && auth.churchAdminChurchIds.length > 0) {
    return { authorized: true, user: auth.user };
  }

  return { authorized: false, error: 'Church admin access required' };
}
