import type { Request } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const PRAYER_RATE_LIMIT = 10;
const PRAYER_RATE_WINDOW_MS = 60 * 60 * 1000;

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return forwardedIp.trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

export function checkPrayerRateLimit(req: Request): { allowed: boolean; remaining: number; resetIn: number } {
  const ip = getClientIP(req);
  const key = `prayer:${ip}`;
  const now = Date.now();
  
  let entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + PRAYER_RATE_WINDOW_MS
    };
    rateLimitStore.set(key, entry);
  }
  
  const remaining = Math.max(0, PRAYER_RATE_LIMIT - entry.count);
  const resetIn = Math.max(0, Math.ceil((entry.resetTime - now) / 1000));
  
  if (entry.count >= PRAYER_RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetIn };
  }
  
  entry.count++;
  rateLimitStore.set(key, entry);
  
  return { allowed: true, remaining: remaining - 1, resetIn };
}

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (let i = 0; i < entries.length; i++) {
    const [key, entry] = entries[i];
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);
