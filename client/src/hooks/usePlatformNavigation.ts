import { useCallback } from "react";
import { useLocation } from "wouter";
import { usePlatformContext } from "@/contexts/PlatformContext";

/**
 * Hook for platform-aware navigation throughout the application.
 * 
 * This hook ensures the platform context is preserved using path-based URLs
 * (e.g., /grand-rapids/community instead of /community?platform=grand-rapids)
 * when navigating between pages, keeping users within their city platform.
 * 
 * INTENTIONAL EXCEPTIONS (DO NOT use this hook for these):
 * - Login/signup flows: Users start fresh
 * - Onboarding: User is joining a new platform or going national
 * - Platform selection clicks: User is switching platforms
 * - National View button: User intentionally leaves platform
 */
export function usePlatformNavigation() {
  const { platformId, platform } = usePlatformContext();
  const [, setLocation] = useLocation();

  /**
   * Builds a platform-aware URL using path-based structure.
   * e.g., /community becomes /grand-rapids/community when in platform context
   */
  const buildPlatformUrl = useCallback((path: string, preservePlatform: boolean = true): string => {
    if (!preservePlatform || !platformId) {
      return path;
    }

    // Reserved routes that should NOT be prefixed with platform slug
    // These are static routes that exist only at root level
    const reservedPrefixes = [
      '/admin',
      '/about',
      '/methodology', 
      '/facility-sharing',
      '/prayers',
      '/signatures',
      '/agent-program',
      '/login',
      '/signup',
      '/auth',
      '/onboarding',
      '/profile',
      '/apply-for-platform',
      '/platforms',
      '/platform/',
      '/explore',
      '/api',
    ];
    
    if (reservedPrefixes.some(prefix => path.startsWith(prefix))) {
      return path;
    }

    // Use slug if available, otherwise use ID
    const platformSlug = platform?.slug || platformId;

    // Parse the path to separate pathname, query string, and hash
    const queryIndex = path.indexOf('?');
    const hashIndex = path.indexOf('#');
    
    let pathname = path;
    let queryString = '';
    let hash = '';
    
    if (hashIndex !== -1) {
      hash = path.slice(hashIndex);
      pathname = path.slice(0, hashIndex);
    }
    
    if (queryIndex !== -1 && (hashIndex === -1 || queryIndex < hashIndex)) {
      queryString = hashIndex !== -1 ? path.slice(queryIndex, hashIndex) : path.slice(queryIndex);
      pathname = path.slice(0, queryIndex);
    }
    
    // Remove any existing ?platform= param (backward compat cleanup)
    if (queryString.includes('platform=')) {
      const params = new URLSearchParams(queryString.slice(1));
      params.delete('platform');
      queryString = params.toString() ? `?${params.toString()}` : '';
    }
    
    // Build path-based URL: /{platform}/{rest-of-path}
    // Handle root path specially
    if (pathname === '/' || pathname === '') {
      return `/${platformSlug}${queryString}${hash}`;
    }
    
    return `/${platformSlug}${pathname}${queryString}${hash}`;
  }, [platformId, platform?.slug]);

  const navigateWithPlatform = useCallback((path: string, preservePlatform: boolean = true) => {
    const url = buildPlatformUrl(path, preservePlatform);
    setLocation(url);
  }, [buildPlatformUrl, setLocation]);

  const getMapUrl = useCallback((params?: { 
    church?: string; 
    metric?: string; 
    showArea?: string; 
    prayerMode?: boolean; 
    drawPrimary?: string;
    calling?: string;
    action?: 'view' | 'draw';
    panel?: 'open' | 'closed';
    allocate?: boolean;
  }) => {
    const platformSlug = platform?.slug || platformId;
    const searchParams = new URLSearchParams();
    
    // Add optional params (NOT platform - that goes in path)
    if (params?.church) {
      searchParams.set('church', params.church);
    }
    if (params?.metric) {
      searchParams.set('metric', params.metric);
    }
    if (params?.showArea) {
      searchParams.set('showArea', params.showArea);
    }
    if (params?.prayerMode) {
      searchParams.set('prayerMode', 'true');
    }
    if (params?.drawPrimary) {
      searchParams.set('drawPrimary', 'true');
    }
    if (params?.calling) {
      searchParams.set('calling', params.calling);
    }
    if (params?.action) {
      searchParams.set('action', params.action);
    }
    if (params?.panel) {
      searchParams.set('panel', params.panel);
    }
    if (params?.allocate) {
      searchParams.set('allocate', 'true');
    }
    
    const queryString = searchParams.toString();
    
    // Use path-based platform URL - map is now at /:platform/map
    if (platformSlug) {
      return queryString ? `/${platformSlug}/map?${queryString}` : `/${platformSlug}/map`;
    }
    
    return queryString ? `/?${queryString}` : '/';
  }, [platformId, platform?.slug]);

  const getChurchUrl = useCallback((churchId: string) => {
    return buildPlatformUrl(`/church/${churchId}`);
  }, [buildPlatformUrl]);

  const getCommunityUrl = useCallback((postId?: string) => {
    if (postId) {
      return buildPlatformUrl(`/community/${postId}`);
    }
    // Community is now the default platform landing page
    const platformSlug = platform?.slug || platformId;
    return platformSlug ? `/${platformSlug}` : '/community';
  }, [buildPlatformUrl, platformId, platform?.slug]);

  const getMinistryAreaUrl = useCallback((areaId: string) => {
    return buildPlatformUrl(`/ministry-area/${areaId}`);
  }, [buildPlatformUrl]);

  return {
    platformId,
    buildPlatformUrl,
    navigateWithPlatform,
    getMapUrl,
    getChurchUrl,
    getCommunityUrl,
    getMinistryAreaUrl,
  };
}

/**
 * Standalone utility to build platform-aware URL using path-based structure.
 * Use when you don't have access to the hook (e.g., in non-component code).
 * 
 * @param path - The base path (e.g., '/community', '/church/123')
 * @param platformSlug - The platform slug or ID to prepend
 * @returns Path-based URL (e.g., '/grand-rapids/community')
 */
export function getPlatformUrlFromId(path: string, platformSlug: string | null): string {
  if (!platformSlug) {
    return path;
  }

  // Reserved routes that should NOT be prefixed with platform slug
  const reservedPrefixes = [
    '/admin',
    '/about',
    '/methodology', 
    '/facility-sharing',
    '/prayers',
    '/signatures',
    '/agent-program',
    '/login',
    '/signup',
    '/auth',
    '/onboarding',
    '/profile',
    '/apply-for-platform',
    '/platforms',
    '/platform/',
    '/explore',
    '/api',
  ];
  
  if (reservedPrefixes.some(prefix => path.startsWith(prefix))) {
    return path;
  }

  // Parse the path to separate pathname, query string, and hash
  const queryIndex = path.indexOf('?');
  const hashIndex = path.indexOf('#');
  
  let pathname = path;
  let queryString = '';
  let hash = '';
  
  if (hashIndex !== -1) {
    hash = path.slice(hashIndex);
    pathname = path.slice(0, hashIndex);
  }
  
  if (queryIndex !== -1 && (hashIndex === -1 || queryIndex < hashIndex)) {
    queryString = hashIndex !== -1 ? path.slice(queryIndex, hashIndex) : path.slice(queryIndex);
    pathname = path.slice(0, queryIndex);
  }
  
  // Remove any existing ?platform= param (backward compat cleanup)
  if (queryString.includes('platform=')) {
    const params = new URLSearchParams(queryString.slice(1));
    params.delete('platform');
    queryString = params.toString() ? `?${params.toString()}` : '';
  }
  
  // Build path-based URL: /{platform}/{rest-of-path}
  if (pathname === '/' || pathname === '') {
    return `/${platformSlug}${queryString}${hash}`;
  }
  
  return `/${platformSlug}${pathname}${queryString}${hash}`;
}
