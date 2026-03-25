import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabaseClient";

// DEV BYPASS: Set to true to use mock token when Supabase auth is down
const DEV_BYPASS_AUTH = false;
const DEV_BYPASS_TOKEN = "dev-bypass-token";

// Session storage key to track redirect in progress (persists across page loads)
const SESSION_CONFLICT_KEY = 'session_conflict_handling';

/**
 * Handle session conflict when server returns 401 but client sent an auth token.
 * This happens when:
 * - Multiple browser tabs with different users share cookies
 * - Session expired on server but client has stale state
 * - Auth token became invalid
 */
// Track if session conflict handling is in progress (in-memory flag for current page load)
let sessionConflictInProgress = false;

async function handleSessionConflict() {
  // In-memory check for current page load (faster than sessionStorage)
  if (sessionConflictInProgress) {
    return;
  }
  
  // Check sessionStorage for cross-page-load persistence
  const conflictTimestamp = sessionStorage.getItem(SESSION_CONFLICT_KEY);
  if (conflictTimestamp) {
    const elapsed = Date.now() - parseInt(conflictTimestamp, 10);
    // Only honor flag for 30 seconds to avoid permanent lockout
    if (elapsed < 30000) {
      return;
    }
    sessionStorage.removeItem(SESSION_CONFLICT_KEY);
  }
  
  // Set both flags to prevent re-entry
  sessionConflictInProgress = true;
  sessionStorage.setItem(SESSION_CONFLICT_KEY, Date.now().toString());
  
  console.warn("🔐 Session conflict detected - signing out and redirecting");
  
  try {
    await supabase.auth.signOut();
  } catch (error) {
    // Session may already be gone - that's fine
  }
  
  try {
    queryClient.clear();
  } catch (error) {
    // Ignore cache clear errors
  }
  
  // Set a flag for the login page to detect
  sessionStorage.setItem('session_expired_redirect', 'true');
  
  // Use setTimeout to escape the current execution context and any HMR interference
  setTimeout(() => {
    window.location.href = "/login?reason=session_expired";
  }, 100);
}

// Export function to clear the session conflict flag (called from login page)
export function clearSessionConflictFlag() {
  sessionStorage.removeItem(SESSION_CONFLICT_KEY);
}

async function getAuthToken(): Promise<string | null> {
  // DEV BYPASS: Return mock token when Supabase is down
  if (DEV_BYPASS_AUTH) {
    return DEV_BYPASS_TOKEN;
  }
  
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[getAuthToken] Error getting session:', error);
    return null;
  }
  if (!session) {
    console.warn('[getAuthToken] No session available');
    return null;
  }
  return session.access_token || null;
}

async function throwIfResNotOk(res: Response, isProtectedRoute: boolean = false) {
  if (!res.ok) {
    // Detect session conflict: 401 on a route that should be authenticated
    if (res.status === 401 && isProtectedRoute) {
      // Check if we thought we were authenticated
      const session = await supabase.auth.getSession();
      if (session.data.session) {
        // We have a local session but server rejected - session conflict!
        handleSessionConflict();
        throw new Error("Session expired - please log in again");
      }
    }
    
    const text = (await res.text()) || res.statusText;
    
    // Try to parse as JSON to extract error message
    let errorMessage = text;
    try {
      const json = JSON.parse(text);
      if (json.error) {
        errorMessage = json.error;
      } else if (json.message) {
        errorMessage = json.message;
      }
    } catch {
      // Not JSON, use raw text
    }
    
    throw new Error(errorMessage);
  }
}

// Check if a URL is a strongly protected admin route that should trigger session conflict detection
// We need to be very conservative here to avoid false positives
function isStrictlyProtectedUrl(_url: string): boolean {
  // Session conflict detection is DISABLED to prevent false positives
  // A 401 on admin routes may mean "not an admin", not "session invalid"
  // Individual components should handle 401s gracefully instead
  return false;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<any> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  // Add auth token if available
  const token = await getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    console.warn(`[apiRequest] No auth token available for ${method} ${url}`);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // Check for session conflict on protected routes
  await throwIfResNotOk(res, isStrictlyProtectedUrl(url) && !!token);
  
  const text = await res.text();
  if (!text || text.length === 0) {
    return null;
  }
  
  return JSON.parse(text);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    
    // Add auth token if available
    const token = await getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const fetchOptions: RequestInit = {
      credentials: "include",
    };
    
    // Only add headers if we have any (avoid sending empty headers object)
    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    const url = queryKey[0] as string;
    const res = await fetch(url, fetchOptions);

    // Handle 401 based on configuration
    if (res.status === 401) {
      // Check for session conflict on protected routes
      if (isStrictlyProtectedUrl(url) && token) {
        const session = await supabase.auth.getSession();
        if (session.data.session) {
          // We have a local session but server rejected - session conflict!
          handleSessionConflict();
          throw new Error("Session expired - please log in again");
        }
      }
      
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    await throwIfResNotOk(res, isStrictlyProtectedUrl(url) && !!token);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes — prevents stale data on navigation
      retry: (failureCount, error) => {
        // Don't retry auth errors or 4xx
        if (error instanceof Error && /401|403|404|422/.test(error.message)) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      retry: false,
    },
  },
});
