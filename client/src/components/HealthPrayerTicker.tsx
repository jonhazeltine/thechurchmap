import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ResolvedPrayerPrompt, PrayerPromptsForAreaResponse } from "@shared/schema";

interface HealthPrayerTickerProps {
  bbox: string | null;
  variant?: 'sidebar' | 'bottom';
}

export function HealthPrayerTicker({ bbox, variant = 'sidebar' }: HealthPrayerTickerProps) {
  const [displayedPrompts, setDisplayedPrompts] = useState<ResolvedPrayerPrompt[]>([]);
  const [currentMobileIndex, setCurrentMobileIndex] = useState(0);
  const [selectedPrompt, setSelectedPrompt] = useState<ResolvedPrayerPrompt | null>(null);
  const [hasPrayed, setHasPrayed] = useState(false);
  const previousBboxRef = useRef<string | null>(null);
  
  // Session-based metric rotation: track which metrics have been shown
  // This ensures users exploring see diverse community needs
  const seenMetricsRef = useRef<Set<string>>(new Set());

  const { data, isLoading } = useQuery<PrayerPromptsForAreaResponse>({
    queryKey: ['/api/prayers/prompts-for-area', bbox],
    queryFn: async () => {
      if (!bbox) return { prompts: [], area_summary: { center: [0, 0], critical_count: 0, concerning_count: 0 } };
      
      // Pass seen metrics to API so it can prioritize unseen ones
      const seenMetrics = Array.from(seenMetricsRef.current).join(',');
      const url = seenMetrics 
        ? `/api/prayers/prompts-for-area?bbox=${bbox}&limit=6&seen_metrics=${encodeURIComponent(seenMetrics)}`
        : `/api/prayers/prompts-for-area?bbox=${bbox}&limit=6`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch prompts');
      return response.json();
    },
    enabled: !!bbox,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data?.prompts && data.prompts.length > 0) {
      if (bbox !== previousBboxRef.current) {
        // Track newly seen metrics for session-based rotation
        data.prompts.forEach(p => {
          seenMetricsRef.current.add(p.metric_key);
        });
        
        setDisplayedPrompts(prev => {
          const newPrompts = data.prompts.filter(
            p => !prev.some(existing => existing.id === p.id)
          );
          if (newPrompts.length > 0) {
            const combined = [...newPrompts, ...prev].slice(0, 6);
            return combined;
          }
          return prev.length > 0 ? prev : data.prompts;
        });
        previousBboxRef.current = bbox;
      } else if (displayedPrompts.length === 0) {
        setDisplayedPrompts(data.prompts);
        // Also track these metrics
        data.prompts.forEach(p => {
          seenMetricsRef.current.add(p.metric_key);
        });
      }
    }
  }, [data, bbox, displayedPrompts.length]);

  // Preserve mobile index position when prompts change (modulo new list length)
  useEffect(() => {
    if (displayedPrompts.length > 0 && currentMobileIndex >= displayedPrompts.length) {
      // Use modulo to preserve relative position instead of resetting to 0
      setCurrentMobileIndex(currentMobileIndex % displayedPrompts.length);
    }
  }, [displayedPrompts.length, currentMobileIndex]);

  // Handle prompt click to open prayer modal
  const handlePromptClick = (prompt: ResolvedPrayerPrompt) => {
    setSelectedPrompt(prompt);
    setHasPrayed(false);
  };

  // Handle pray action
  const handlePray = () => {
    setHasPrayed(true);
    setTimeout(() => {
      setSelectedPrompt(null);
      setHasPrayed(false);
    }, 1500);
  };

  if (isLoading && displayedPrompts.length === 0) {
    return (
      <p className="text-sm text-white/40 italic">
        Discovering community needs...
      </p>
    );
  }

  if (displayedPrompts.length === 0) {
    return (
      <p className="text-sm text-white/40 italic">
        Pan the map to discover needs
      </p>
    );
  }

  // Prayer modal component (used by both variants)
  const PrayerModal = () => (
    <Dialog open={!!selectedPrompt} onOpenChange={(open) => !open && setSelectedPrompt(null)}>
      <DialogContent 
        className="max-w-md bg-slate-900/95 border-white/20 text-white backdrop-blur-xl"
        data-testid="dialog-community-need-prayer"
      >
        <button
          onClick={() => setSelectedPrompt(null)}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity text-white"
          data-testid="button-close-prayer-modal"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-white/90">
            {selectedPrompt?.metric_display}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Prayer for community need
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-white/70 leading-relaxed" data-testid="text-need-description">
            {selectedPrompt?.need_description}
          </p>
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <p className="text-sm text-white/90 leading-relaxed italic" data-testid="text-prayer-content">
              {selectedPrompt?.prayer_text}
            </p>
          </div>
          {hasPrayed ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-2 text-amber-400 py-2"
            >
              <Heart className="w-5 h-5 fill-current" />
              <span className="font-medium">Prayer Offered</span>
            </motion.div>
          ) : (
            <Button
              onClick={handlePray}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-pray-for-need"
            >
              <Heart className="w-4 h-4 mr-2" />
              Pray for this Need
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  // Sidebar variant: vertical stack of text lines
  if (variant === 'sidebar') {
    return (
      <>
        <PrayerModal />
        <div className="flex flex-col gap-3 pointer-events-auto">
          <AnimatePresence mode="popLayout">
            {displayedPrompts.slice(0, 3).map((prompt, index) => (
              <motion.button
                key={prompt.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1 - (index * 0.15), x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                onClick={() => handlePromptClick(prompt)}
                className="text-sm text-white/90 leading-relaxed text-left hover:text-white cursor-pointer transition-colors"
                data-testid={`health-prompt-${prompt.id}`}
              >
                <span className={
                  prompt.severity === 'critical' || prompt.severity === 'very_critical'
                    ? 'text-red-300'
                    : prompt.severity === 'concerning'
                    ? 'text-yellow-300'
                    : 'text-white/70'
                }>
                  •
                </span>{' '}
                {prompt.need_description}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </>
    );
  }

  // Bottom variant for mobile: single item with navigation arrows
  const currentPrompt = displayedPrompts[currentMobileIndex];
  const hasPrev = currentMobileIndex > 0;
  const hasNext = currentMobileIndex < displayedPrompts.length - 1;
  
  const goToPrev = () => {
    if (hasPrev) setCurrentMobileIndex(i => i - 1);
  };
  
  const goToNext = () => {
    if (hasNext) setCurrentMobileIndex(i => i + 1);
  };
  
  return (
    <>
      <PrayerModal />
      <div className="flex items-center gap-2 pointer-events-auto">
        <button
          onClick={goToPrev}
          disabled={!hasPrev}
          className={`p-1 rounded-full transition-opacity ${hasPrev ? 'text-white/70 hover:text-white' : 'text-white/20'}`}
          aria-label="Previous need"
          data-testid="button-prev-need"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {currentPrompt && (
              <motion.button
                key={currentPrompt.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                onClick={() => handlePromptClick(currentPrompt)}
                className="text-xs text-white/80 text-center leading-relaxed w-full hover:text-white cursor-pointer transition-colors"
                data-testid={`health-prompt-mobile-${currentPrompt.id}`}
              >
                {currentPrompt.need_description}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        
        <button
          onClick={goToNext}
          disabled={!hasNext}
          className={`p-1 rounded-full transition-opacity ${hasNext ? 'text-white/70 hover:text-white' : 'text-white/20'}`}
          aria-label="Next need"
          data-testid="button-next-need"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
