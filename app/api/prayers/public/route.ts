import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";
import { z } from "zod";
import { checkPrayerRateLimit } from "../../../../lib/rateLimiter";
import crypto from "crypto";
import { storage } from "../../../../server/storage";

const publicPrayerSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(2000),
  is_anonymous: z.boolean().default(false),
  guest_name: z.string().optional(),
  guest_email: z.string().optional().transform(v => v === "" ? undefined : v).pipe(z.string().email().optional()),
  church_id: z.string().optional().transform(v => v === "" ? undefined : v),
  city_platform_id: z.string().uuid().optional(),
  scope_type: z.enum(['church', 'tract']).optional(),
  tract_id: z.string().optional().transform(v => v === "" ? undefined : v),
  click_lat: z.number().optional(),
  click_lng: z.number().optional(),
});

export async function POST(req: Request, res: Response) {
  try {
    let userId: string | null = null;
    let userProfile: { first_name: string | null; last_name: string | null } | null = null;
    let isAuthenticated = false;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const userClient = supabaseUserClient(token);
      const { data: { user }, error: authError } = await userClient.auth.getUser();

      if (!authError && user) {
        userId = user.id;
        isAuthenticated = true;

        const { data: profile } = await supabaseServer()
          .from('profiles')
          .select('first_name, last_name')
          .eq('user_id', user.id)
          .single();
        
        userProfile = profile;
      }
    }

    if (!isAuthenticated) {
      const rateCheck = checkPrayerRateLimit(req);
      if (!rateCheck.allowed) {
        const minutes = Math.ceil(rateCheck.resetIn / 60);
        return res.status(429).json({
          error: `You've reached the prayer submission limit. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
          resetIn: rateCheck.resetIn,
          remaining: 0
        });
      }
      res.setHeader('X-RateLimit-Remaining', rateCheck.remaining.toString());
      res.setHeader('X-RateLimit-Reset', rateCheck.resetIn.toString());
    }

    const validationResult = publicPrayerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { title, body, is_anonymous, guest_name, guest_email, church_id, city_platform_id, scope_type, tract_id, click_lat, click_lng } = validationResult.data;

    if (!isAuthenticated) {
      if (!guest_email) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: [{ path: ['guest_email'], message: 'Email is required for guest submissions' }]
        });
      }
      const trimmedEmail = guest_email.trim();
      if (!trimmedEmail) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: [{ path: ['guest_email'], message: 'Email is required for guest submissions' }]
        });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: [{ path: ['guest_email'], message: 'Please enter a valid email address' }]
        });
      }
    }

    let resolvedChurchId = church_id;

    if (isAuthenticated && !church_id && userId) {
      const { data: profile } = await supabaseServer()
        .from('profiles')
        .select('primary_church_id')
        .eq('user_id', userId)
        .single();

      if (profile?.primary_church_id) {
        resolvedChurchId = profile.primary_church_id;
      } else {
        const { data: membership } = await supabaseServer()
          .from('church_user_roles')
          .select('church_id')
          .eq('user_id', userId)
          .eq('is_approved', true)
          .limit(1)
          .single();

        if (membership?.church_id) {
          resolvedChurchId = membership.church_id;
        }
      }
    }

    if (isAuthenticated && !resolvedChurchId && scope_type !== 'tract') {
      return res.status(400).json({ error: 'Please select a church' });
    }

    let churchData: { id: string; name: string; prayer_auto_approve: boolean } | null = null;
    if (resolvedChurchId) {
      const { data: church, error: churchError } = await supabaseServer()
        .from('churches')
        .select('id, name, prayer_auto_approve')
        .eq('id', resolvedChurchId)
        .single();

      if (churchError || !church) {
        return res.status(404).json({ error: 'Church not found' });
      }
      churchData = church;
    }

    let autoApprove = false;
    
    if (is_anonymous) {
      autoApprove = false;
    } else if (!isAuthenticated) {
      autoApprove = false;
    } else if (isAuthenticated && userId && churchData) {
      if (churchData.prayer_auto_approve) {
        const { data: membership } = await supabaseServer()
          .from('church_user_roles')
          .select('id, is_approved')
          .eq('user_id', userId)
          .eq('church_id', churchData.id)
          .eq('is_approved', true)
          .single();

        if (membership) {
          autoApprove = true;
        } else {
          const { data: profile } = await supabaseServer()
            .from('profiles')
            .select('primary_church_id')
            .eq('user_id', userId)
            .single();

          if (profile?.primary_church_id === churchData.id) {
            autoApprove = true;
          }
        }
      }
    }

    const prayerData: Record<string, any> = {
      title,
      body,
      is_anonymous,
      status: autoApprove ? 'approved' : 'pending',
      city_platform_id: city_platform_id || null,
    };

    if (scope_type) prayerData.scope_type = scope_type;
    if (scope_type === 'tract' && tract_id) prayerData.tract_id = tract_id;
    if (click_lat !== undefined) prayerData.click_lat = click_lat;
    if (click_lng !== undefined) prayerData.click_lng = click_lng;

    if (resolvedChurchId) {
      prayerData.church_id = resolvedChurchId;
    }

    if (isAuthenticated && userId) {
      prayerData.submitted_by_user_id = userId;
      
      if (!is_anonymous && userProfile) {
        prayerData.display_first_name = userProfile.first_name;
        prayerData.display_last_initial = userProfile.last_name?.charAt(0) || '';
      }
    } else {
      prayerData.guest_email = guest_email?.trim();
      
      if (guest_name && guest_name.trim()) {
        prayerData.guest_name = guest_name.trim();
        
        if (!is_anonymous) {
          const nameParts = guest_name.trim().split(' ');
          prayerData.display_first_name = nameParts[0];
          prayerData.display_last_initial = nameParts.length > 1 ? nameParts[nameParts.length - 1].charAt(0) : '';
        }
      }
    }

    if (autoApprove) {
      prayerData.approved_at = new Date().toISOString();
      if (userId) {
        prayerData.approved_by_user_id = userId;
      }
    }

    // Generate anonymous token for guest submissions (for later account claiming)
    let anonymousToken: string | null = null;
    if (!isAuthenticated) {
      anonymousToken = crypto.randomUUID();
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + 24); // 24-hour expiration
      prayerData.anonymous_token = anonymousToken;
      prayerData.token_expires_at = tokenExpiry.toISOString();
    }

    console.log('Creating prayer with data:', {
      ...prayerData,
      guest_email: prayerData.guest_email ? '[REDACTED]' : undefined,
    });

    let prayer: any;
    let prayerError: any;

    ({ data: prayer, error: prayerError } = await supabaseServer()
      .from('prayers')
      .insert(prayerData)
      .select()
      .single());

    if (prayerError && prayerError.code === 'PGRST204') {
      const missingCol = prayerError.message?.match(/Could not find the '(\w+)' column/)?.[1];
      console.warn('Prayer insert failed due to missing column:', missingCol, '- retrying with only core columns');
      const coreFields = ['title', 'body', 'is_anonymous', 'status', 'city_platform_id', 'church_id',
        'submitted_by_user_id', 'guest_email', 'guest_name', 'display_first_name', 'display_last_initial',
        'approved_at', 'approved_by_user_id'];
      const fallbackData: Record<string, any> = {};
      for (const key of coreFields) {
        if (prayerData[key] !== undefined) fallbackData[key] = prayerData[key];
      }
      if (!fallbackData.church_id) {
        fallbackData.global = true;
      }
      ({ data: prayer, error: prayerError } = await supabaseServer()
        .from('prayers')
        .insert(fallbackData)
        .select()
        .single());
    }

    if (prayerError) {
      console.error('Error creating prayer:', prayerError);
      return res.status(500).json({ error: 'Failed to create prayer request' });
    }

    if (isAuthenticated && resolvedChurchId) {
      try {
        await storage.recordChurchActivity(resolvedChurchId, 'prayer_submitted');
      } catch (engagementError) {
        console.error('Non-critical: failed to record engagement activity:', engagementError);
      }
    }

    const message = autoApprove
      ? 'Prayer request submitted and approved!'
      : 'Prayer request submitted for review';

    return res.status(201).json({
      prayer: { id: prayer.id, status: prayer.status },
      message,
      autoApproved: autoApprove,
      anonymous_token: anonymousToken,
    });
  } catch (error) {
    console.error('Error in POST /api/prayers/public:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
