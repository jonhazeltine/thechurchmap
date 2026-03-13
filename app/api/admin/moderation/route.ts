import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

interface ModerationItem {
  id: string;
  type: 'prayer' | 'comment';
  title?: string;
  body: string;
  status: string;
  created_at: string;
  guest_name?: string | null;
  is_anonymous?: boolean;
  display_first_name?: string | null;
  display_last_initial?: string | null;
  answered_at?: string | null;
  answered_note?: string | null;
  source: {
    type: 'church' | 'post';
    id: string;
    name: string;
  };
}

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const itemType = (req.query.type as string) || 'all';
    const status = (req.query.status as string) || 'pending';
    const cityPlatformId = req.query.city_platform_id as string | undefined;
    
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check admin access - super admin, platform admin, or church admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    // Check platform admin roles
    const { data: platformRoles } = await adminClient
      .from('platform_roles')
      .select('city_platform_id')
      .eq('user_id', user.id)
      .eq('is_active', true);
    
    const isPlatformAdmin = (platformRoles || []).length > 0;
    const adminPlatformIds = (platformRoles || []).map(r => r.city_platform_id).filter(Boolean);
    
    // Check church admin roles
    const { data: churchAdminRoles } = await adminClient
      .from('church_user_roles')
      .select('church_id')
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_approved', true);
    
    const isChurchAdmin = (churchAdminRoles || []).length > 0;
    const adminChurchIds = (churchAdminRoles || []).map(r => r.church_id);
    
    // Must have some admin role
    if (!isSuperAdmin && !isPlatformAdmin && !isChurchAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const items: ModerationItem[] = [];
    let prayerCount = 0;
    let commentCount = 0;

    if (itemType === 'all' || itemType === 'prayers') {
      let prayersQuery = adminClient
        .from('prayers')
        .select(`
          *,
          church:churches(id, name, city, state)
        `)
        .order('created_at', { ascending: false });

      if (status === 'answered') {
        prayersQuery = prayersQuery.not('answered_at', 'is', null);
      } else {
        const prayerStatus = status === 'published' ? 'approved' : status;
        prayersQuery = prayersQuery.eq('status', prayerStatus);
      }
      
      // Apply scoping based on admin type
      if (cityPlatformId) {
        // Explicit platform filter takes precedence
        prayersQuery = prayersQuery.eq('city_platform_id', cityPlatformId);
      } else if (!isSuperAdmin) {
        // Non-super admins can only see items in their platforms or churches
        if (isPlatformAdmin && adminPlatformIds.length > 0) {
          prayersQuery = prayersQuery.in('city_platform_id', adminPlatformIds);
        } else if (isChurchAdmin && adminChurchIds.length > 0) {
          prayersQuery = prayersQuery.in('church_id', adminChurchIds);
        }
      }

      const { data: prayers, error: prayersError } = await prayersQuery;

      if (prayersError) {
        console.error('Error fetching prayers:', prayersError);
      } else if (prayers) {
        prayerCount = prayers.length;
        for (const prayer of prayers) {
          items.push({
            id: prayer.id,
            type: 'prayer',
            title: prayer.title,
            body: prayer.body,
            status: prayer.status,
            created_at: prayer.created_at,
            is_anonymous: prayer.is_anonymous,
            display_first_name: prayer.display_first_name,
            display_last_initial: prayer.display_last_initial,
            answered_at: prayer.answered_at,
            answered_note: prayer.answered_note,
            source: {
              type: 'church',
              id: prayer.church?.id || '',
              name: prayer.church?.name || 'Unknown Church',
            },
          });
        }
      }
    }

    if (itemType === 'all' || itemType === 'comments') {
      if (status !== 'answered') {
        let commentsQuery = adminClient
          .from('post_comments')
          .select(`
            *,
            post:posts!post_id(id, title, city_platform_id)
          `)
          .not('guest_name', 'is', null)
          .order('created_at', { ascending: false });

        commentsQuery = commentsQuery.eq('status', status);

        const { data: comments, error: commentsError } = await commentsQuery;

        if (commentsError) {
          console.error('Error fetching comments:', commentsError);
        } else if (comments) {
          // Filter comments based on admin scope
          let filteredComments = comments.filter((c: any) => c.post);
          
          // Apply platform scoping for non-super admins
          if (!isSuperAdmin) {
            if (cityPlatformId) {
              // Explicit platform filter
              filteredComments = filteredComments.filter((c: any) => 
                c.post?.city_platform_id === cityPlatformId
              );
            } else if (isPlatformAdmin && adminPlatformIds.length > 0) {
              // Filter to admin's platforms
              filteredComments = filteredComments.filter((c: any) => 
                adminPlatformIds.includes(c.post?.city_platform_id)
              );
            }
            // Note: Church admins see all comments (community posts are platform-level, not church-level)
          } else if (cityPlatformId) {
            // Super admin with explicit platform filter
            filteredComments = filteredComments.filter((c: any) => 
              c.post?.city_platform_id === cityPlatformId
            );
          }
          
          commentCount = filteredComments.length;
          for (const comment of filteredComments) {
            items.push({
              id: comment.id,
              type: 'comment',
              body: comment.body,
              status: comment.status || 'pending',
              created_at: comment.created_at,
              guest_name: comment.guest_name,
              source: {
                type: 'post',
                id: comment.post?.id || '',
                name: comment.post?.title || 'Unknown Post',
              },
            });
          }
        }
      }
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.status(200).json({
      items,
      counts: {
        prayers: prayerCount,
        comments: commentCount,
        total: items.length,
      },
    });

  } catch (error) {
    console.error('Error in admin moderation:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
