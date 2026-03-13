import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import type { RecentPrayerInteraction } from "@shared/schema";

interface LivePrayerTickerProps {
  variant?: 'sidebar' | 'bottom';
}

export function LivePrayerTicker({ variant = 'sidebar' }: LivePrayerTickerProps) {
  const [visibleIndex, setVisibleIndex] = useState(0);

  // Poll for recent interactions every 5 seconds
  const { data } = useQuery<{ interactions: RecentPrayerInteraction[] }>({
    queryKey: ['/api/prayers/interactions/recent'],
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Deduplicate by prayer_id - keep only the most recent interaction for each prayer
  const interactions = useMemo(() => {
    const rawInteractions = data?.interactions || [];
    const seen = new Set<string>();
    return rawInteractions.filter(interaction => {
      if (seen.has(interaction.prayer_id)) {
        return false;
      }
      seen.add(interaction.prayer_id);
      return true;
    });
  }, [data?.interactions]);

  // Auto-cycle through interactions every 4 seconds
  useEffect(() => {
    if (interactions.length === 0) return;

    const interval = setInterval(() => {
      setVisibleIndex((prev) => (prev + 1) % interactions.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [interactions.length]);

  if (interactions.length === 0) {
    return (
      <p className={`text-sm text-white/40 ${variant === 'sidebar' ? 'text-right' : 'text-center'}`}>
        No recent prayers yet
      </p>
    );
  }

  const currentInteraction = interactions[visibleIndex];

  // Sidebar variant - plain text, right-aligned, vertical list style
  if (variant === 'sidebar') {
    return (
      <div className="space-y-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentInteraction.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.4 }}
            className="text-right"
            data-testid={`ticker-item-${currentInteraction.id}`}
          >
            <div className="flex items-center justify-end gap-2">
              <div className="text-right">
                <p className="text-sm text-white/70">
                  {currentInteraction.user_first_name && currentInteraction.user_last_initial ? (
                    <>
                      <span className="text-white/90">
                        {currentInteraction.user_first_name} {currentInteraction.user_last_initial}.
                      </span>
                      {' prayed for '}
                    </>
                  ) : (
                    'Someone prayed for '
                  )}
                  <span className="text-white/90">"{currentInteraction.prayer_title}"</span>
                </p>
                {currentInteraction.church_name && (
                  <p className="text-xs text-white/50 mt-0.5">
                    at {currentInteraction.church_name}
                  </p>
                )}
              </div>
              <Heart className="w-3 h-3 text-pink-300/70 shrink-0" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // Bottom variant - centered, for mobile
  return (
    <div className="relative h-12 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentInteraction.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 flex items-center justify-center gap-2 px-4"
          data-testid={`ticker-item-${currentInteraction.id}`}
        >
          <Heart className="w-3 h-3 text-pink-300/70 shrink-0" />
          <div className="text-center">
            <p className="text-sm text-white/70">
              {currentInteraction.user_first_name && currentInteraction.user_last_initial ? (
                <>
                  <span className="text-white/90">
                    {currentInteraction.user_first_name} {currentInteraction.user_last_initial}.
                  </span>
                  {' prayed for '}
                </>
              ) : (
                'Someone prayed for '
              )}
              <span className="text-white/90">"{currentInteraction.prayer_title}"</span>
            </p>
            {currentInteraction.church_name && (
              <p className="text-xs text-white/50">
                at {currentInteraction.church_name}
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
