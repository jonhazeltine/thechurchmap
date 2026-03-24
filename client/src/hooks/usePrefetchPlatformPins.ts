import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformContext } from "@/contexts/PlatformContext";

/**
 * Prefetch platform pin GeoJSON when a user logs in.
 *
 * Flow:
 * 1. User logs in → AuthContext provides `user`
 * 2. We fetch /api/admin/my-churches to find their church's platform
 * 3. If we have a platform (from context or from their church), prefetch the pin GeoJSON
 *
 * By the time the user navigates to the map, the pins are already in React Query cache.
 */
export function usePrefetchPlatformPins() {
  const { user, getAccessToken } = useAuth();
  const { platformId, platform } = usePlatformContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const prefetch = async () => {
      // Determine which platform to prefetch for
      let targetPlatformId = platformId;

      // If no platform context yet, look up the user's church platform
      if (!targetPlatformId) {
        try {
          const token = getAccessToken();
          if (!token) return;

          const res = await fetch("/api/admin/my-churches", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;

          const churches = await res.json();
          if (churches?.[0]?.platform?.id) {
            targetPlatformId = churches[0].platform.id;
          }
        } catch {
          // Silently fail — this is just a prefetch optimization
          return;
        }
      }

      if (!targetPlatformId) return;

      // Prefetch the platform pins GeoJSON into React Query cache
      queryClient.prefetchQuery({
        queryKey: ["/api/churches/pins", targetPlatformId],
        queryFn: async () => {
          const res = await fetch(`/api/churches/pins/${targetPlatformId}`);
          if (!res.ok) throw new Error("Failed to prefetch pins");
          return res.json();
        },
        staleTime: 60 * 60 * 1000, // 1 hour — matches server cache
      });
    };

    prefetch();
  }, [user, platformId, queryClient, getAccessToken]);
}
