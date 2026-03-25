import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CityPlatform } from "@shared/schema";
import { RESERVED_PLATFORM_SLUGS } from "@shared/schema";
import { supabase } from "../../../lib/supabaseClient";

const PLATFORM_STORAGE_KEY = 'active_platform_id';

// Check if a string is a UUID
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// Extract platform slug from URL path
// e.g., "/grand-rapids-city-network" or "/grand-rapids-city-network/community" -> "grand-rapids-city-network"
function extractPlatformFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  
  const pathname = window.location.pathname;
  // Get the first path segment
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  
  const firstSegment = segments[0].toLowerCase();
  
  // Check if it's a reserved route (not a platform slug)
  if (RESERVED_PLATFORM_SLUGS.includes(firstSegment as any)) {
    return null;
  }
  
  return firstSegment;
}

interface PlatformContextType {
  platformId: string | null;
  platform: CityPlatform | null;
  isLoading: boolean;
  error: Error | null;
  setPlatformId: (id: string | null, slug?: string) => void;
  clearPlatform: () => void;
  hasPlatformContext: boolean;
}

const PlatformContext = createContext<PlatformContextType | undefined>(undefined);

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  
  // Get initial platform identifier from URL path or localStorage
  const [platformId, setPlatformIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      // First check URL path (new style: /platform-slug or /platform-slug/community)
      const pathPlatform = extractPlatformFromPath();
      if (pathPlatform) {
        return pathPlatform;
      }
      
      // Backward compatibility: check query param (old style: ?platform=slug)
      const urlParams = new URLSearchParams(window.location.search);
      const urlPlatform = urlParams.get('platform');
      if (urlPlatform) {
        return urlPlatform;
      }
      
      // NEVER restore from localStorage on certain pages
      // This ensures new users start at national view
      const pathname = window.location.pathname;
      const skipPlatformPaths = ['/', '', '/login', '/signup', '/onboarding', '/auth/callback'];
      if (!skipPlatformPaths.includes(pathname)) {
        return localStorage.getItem(PLATFORM_STORAGE_KEY);
      }
    }
    return null;
  });

  const { data: platform, isLoading, error } = useQuery<CityPlatform>({
    queryKey: ['/api/platforms', platformId],
    queryFn: async () => {
      if (!platformId) throw new Error('No platform ID');
      
      // Get auth token to access non-public platforms
      const headers: Record<string, string> = {};
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      // API handles both slug and ID lookups
      const response = await fetch(`/api/platforms/${platformId}`, {
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch platform: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!platformId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Update URL to use slug in path when platform data is loaded
  const lastSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (platform?.slug && typeof window !== 'undefined') {
      const currentPathPlatform = extractPlatformFromPath();
      const urlParams = new URLSearchParams(window.location.search);
      const currentQueryPlatform = urlParams.get('platform');
      
      // If URL used query param (old style) or ID in path, redirect to slug path
      if (currentQueryPlatform || (currentPathPlatform && isUUID(currentPathPlatform))) {
        if (platform.slug !== lastSlugRef.current) {
          lastSlugRef.current = platform.slug;
          
          // Get the rest of the path after the platform segment
          const segments = window.location.pathname.split('/').filter(Boolean);
          const restPath = segments.length > 1 ? '/' + segments.slice(1).join('/') : '';
          
          // Build new URL with slug in path (remove query param)
          const url = new URL(window.location.href);
          url.pathname = `/${platform.slug}${restPath}`;
          url.searchParams.delete('platform');
          window.history.replaceState({}, '', url.toString());
        }
      }
      
      // Also ensure localStorage has the actual ID for persistence
      if (platform.id) {
        localStorage.setItem(PLATFORM_STORAGE_KEY, platform.id);
      }
    }
  }, [platform?.slug, platform?.id]);

  const setPlatformId = useCallback((id: string | null, slug?: string) => {
    setPlatformIdState(id);
    
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem(PLATFORM_STORAGE_KEY, id);
        // Navigate to platform path using slug
        const platformSlug = slug || id;
        
        // Get current path segments after the potential platform segment
        const currentPathPlatform = extractPlatformFromPath();
        const segments = window.location.pathname.split('/').filter(Boolean);
        let restPath: string;
        if (currentPathPlatform && segments.length > 1) {
          // Already has a platform prefix — strip it, keep the rest
          restPath = '/' + segments.slice(1).join('/');
        } else if (!currentPathPlatform && segments.length > 0) {
          // No platform prefix — preserve the entire current path (e.g., /church/xxx)
          restPath = '/' + segments.join('/');
        } else {
          restPath = '';
        }
        
        const url = new URL(window.location.href);
        url.pathname = `/${platformSlug}${restPath}`;
        url.searchParams.delete('platform'); // Remove old query param if present
        window.history.replaceState({}, '', url.toString());
      } else {
        localStorage.removeItem(PLATFORM_STORAGE_KEY);
        // Navigate to root (national view)
        const url = new URL(window.location.href);
        url.pathname = '/';
        url.searchParams.delete('platform');
        window.history.replaceState({}, '', url.toString());
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['/api/churches'] });
  }, [queryClient]);

  const clearPlatform = useCallback(() => {
    setPlatformId(null);
  }, [setPlatformId]);

  // Track last known URL to detect changes
  const lastUrlRef = useRef(typeof window !== 'undefined' ? window.location.href : '');

  // Listen for URL changes via popstate and MutationObserver (no polling)
  useEffect(() => {
    const syncFromUrl = () => {
      const currentUrl = window.location.href;
      if (currentUrl === lastUrlRef.current) return;
      lastUrlRef.current = currentUrl;

      const pathPlatform = extractPlatformFromPath();
      const urlParams = new URLSearchParams(window.location.search);
      const queryPlatform = urlParams.get('platform');
      const urlPlatformId = pathPlatform || queryPlatform;

      if (urlPlatformId && urlPlatformId !== platformId) {
        setPlatformIdState(urlPlatformId);
        localStorage.setItem(PLATFORM_STORAGE_KEY, urlPlatformId);
      }
    };

    // Handle browser back/forward
    window.addEventListener('popstate', syncFromUrl);

    // Detect programmatic navigation (replaceState/pushState) via patching
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    history.pushState = (...args) => { origPushState(...args); syncFromUrl(); };
    history.replaceState = (...args) => { origReplaceState(...args); syncFromUrl(); };

    syncFromUrl();

    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
    };
  }, [platformId]);

  const hasPlatformContext = useMemo(() => !!platformId, [platformId]);

  const value = useMemo(() => ({
    platformId,
    platform: platform ?? null,
    isLoading: !!platformId && isLoading,
    error: error as Error | null,
    setPlatformId,
    clearPlatform,
    hasPlatformContext,
  }), [platformId, platform, isLoading, error, setPlatformId, clearPlatform, hasPlatformContext]);

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatformContext(): PlatformContextType {
  const context = useContext(PlatformContext);
  if (context === undefined) {
    throw new Error('usePlatformContext must be used within a PlatformProvider');
  }
  return context;
}

// Safe version that returns null values if not within provider (for components used in admin contexts)
export function useSafePlatformContext(): PlatformContextType {
  const context = useContext(PlatformContext);
  if (context === undefined) {
    return {
      platformId: null,
      platform: null,
      isLoading: false,
      error: null,
      setPlatformId: () => {},
      clearPlatform: () => {},
      hasPlatformContext: false,
    };
  }
  return context;
}

export function buildPlatformQueryParams(
  platformId: string | null | undefined,
  additionalParams?: Record<string, string | string[] | undefined>
): URLSearchParams {
  const params = new URLSearchParams();
  
  if (platformId) {
    params.set('city_platform_id', platformId);
  }
  
  if (additionalParams) {
    Object.entries(additionalParams).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          params.set(key, value.join(','));
        } else {
          params.set(key, value);
        }
      }
    });
  }
  
  return params;
}

export function platformQueryKey(baseKey: string | string[], platformId: string | null): (string | null)[] {
  const keys = Array.isArray(baseKey) ? baseKey : [baseKey];
  return [...keys, platformId];
}
