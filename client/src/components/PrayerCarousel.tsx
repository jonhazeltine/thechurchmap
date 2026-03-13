import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { VisiblePrayer } from "@shared/schema";
import { GuestPrayerModal } from "./GuestPrayerModal";

interface PrayerCarouselProps {
  prayers: VisiblePrayer[];
  onPrayerUpdate: () => void;
  onChurchSelect?: (churchId: string) => void;
}

export function PrayerCarousel({ prayers, onPrayerUpdate, onChurchSelect }: PrayerCarouselProps) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [praying, setPraying] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  
  // Guest prayer modal state
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pendingPrayer, setPendingPrayer] = useState<VisiblePrayer | null>(null);

  // Track viewport width for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const addAnnouncement = (message: string) => {
    setAnnouncements(prev => [...prev, message]);
    setTimeout(() => {
      setAnnouncements(prev => prev.slice(1));
    }, 3000);
  };

  // Auto-scroll through prayers every 8 seconds
  useEffect(() => {
    if (prayers.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % prayers.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [prayers.length]);

  // Display 1 prayer on mobile, 2 on desktop
  const displayCount = Math.min(prayers.length, isMobile ? 1 : 2);
  const visiblePrayers = Array.from({ length: displayCount }, (_, i) => {
    const index = (currentIndex + i) % Math.max(prayers.length, 1);
    return prayers[index];
  }).filter(Boolean);

  const handlePray = async (prayer: VisiblePrayer, guestName?: string) => {
    setPraying(prayer.id);

    // Check if this is a template prayer (auto-generated)
    const isTemplate = prayer.isTemplate || prayer.id.startsWith('template-');
    
    // For template prayers, just show the thank you animation without API call
    // Template prayers don't have real prayer IDs to record against
    if (isTemplate) {
      addAnnouncement("Thank you for praying!");
      setTimeout(() => {
        setPraying(null);
      }, 1000);
      return;
    }

    try {
      // Real prayers use prayer_id
      const payload: any = { prayer_id: prayer.id };
      
      if (guestName) {
        payload.guest_name = guestName;
      }
      
      await apiRequest('POST', '/api/prayers/pray', payload);

      // Add announcement to queue
      addAnnouncement("Prayer recorded. Thank you for praying!");

      // Trigger sparkle animation (handled by framer-motion)
      setTimeout(() => {
        setPraying(null);
        onPrayerUpdate();
      }, 1000);

    } catch (error: any) {
      console.error('Error recording prayer:', error);

      // Check if guest needs to provide name
      if (error.message?.includes('400') || error.message?.includes('Guest name required')) {
        setPendingPrayer(prayer);
        setShowGuestModal(true);
        setPraying(null);
        return;
      }

      if (error.message?.includes('429')) {
        // Silent rate limit - prayer was already counted
        setPraying(null);
      } else if (error.message?.includes('409')) {
        // Silently ignore - user already prayed, no need for a toast
        setPraying(null);
      } else {
        setPraying(null);
        addAnnouncement("Error. Failed to record your prayer. Please try again.");
        toast({
          title: "Error",
          description: "Failed to record your prayer. Please try again.",
          variant: "destructive",
        });
      }
    }
  };
  
  const handleGuestPrayerSubmit = async (guestName: string, _fullName: string) => {
    if (!pendingPrayer) return;
    await handlePray(pendingPrayer, guestName);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Screen reader announcements with message queue */}
      <div 
        className="sr-only" 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        data-testid="prayer-announcement"
      >
        {announcements[0] || ''}
      </div>

      {/* Ultra-compact stacked layout for mobile - max 25% screen height */}
      <div className="flex flex-col gap-1.5">
        <AnimatePresence mode="popLayout">
          {visiblePrayers.map((prayer, index) => (
            <motion.div
              key={`${prayer.id}-${index}`}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ 
                opacity: 1, 
                scale: praying === prayer.id ? 1.01 : 1
              }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card 
                className={`bg-white/10 border-white/20 backdrop-blur-md px-2.5 py-2 hover:bg-white/15 transition-colors ${prayer.church_id && onChurchSelect ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (prayer.church_id && onChurchSelect) {
                    onChurchSelect(prayer.church_id);
                  }
                }}
                data-testid={`card-prayer-${prayer.id}`}
              >
                {/* Title row with pray button */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Prayer title - allow wrapping on mobile */}
                    <p className={`text-xs font-medium text-white leading-relaxed ${isMobile ? '' : 'truncate'}`} data-testid={`text-prayer-title-${prayer.id}`}>
                      {prayer.title}
                    </p>
                    
                    {/* Church name - hide on mobile for cleaner UI */}
                    {!isMobile && prayer.church_name && (
                      <span className="text-[9px] text-white/50 truncate block" data-testid={`text-prayer-church-${prayer.id}`}>
                        {prayer.church_name}
                      </span>
                    )}
                    
                    {/* Prayer count inline - different text for template vs real prayers */}
                    {prayer.interaction_count > 0 && (
                      <span className="text-[9px] text-white/40" data-testid={`text-prayer-count-${prayer.id}`}>
                        {prayer.interaction_count} {prayer.interaction_count === 1 ? 'prayer' : 'prayers'}
                        {(prayer.isTemplate || prayer.id.startsWith('template-')) ? ' for this church' : ''}
                      </span>
                    )}
                  </div>

                  {/* Pray button */}
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePray(prayer);
                    }}
                    disabled={praying === prayer.id}
                    variant="outline"
                    size="sm"
                    className="shrink-0 bg-white/20 hover:bg-white/30 border-white/30 text-white h-6 w-6 p-0"
                    aria-label={`Pray for: ${prayer.title}`}
                    data-testid={`button-pray-${prayer.id}`}
                  >
                    <motion.div
                      animate={praying === prayer.id ? {
                        rotate: [0, -10, 10, -10, 10, 0],
                        scale: [1, 1.2, 1],
                      } : {}}
                      transition={{ duration: 0.6 }}
                    >
                      <Hand className="w-3 h-3" />
                    </motion.div>
                  </Button>
                </div>

                {/* Sparkle effect when praying */}
                {praying === prayer.id && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1 }}
                  >
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 bg-yellow-300 rounded-full"
                        initial={{
                          x: "50%",
                          y: "50%",
                        }}
                        animate={{
                          x: `${50 + (Math.cos(i * 60 * Math.PI / 180) * 100)}%`,
                          y: `${50 + (Math.sin(i * 60 * Math.PI / 180) * 100)}%`,
                          opacity: [1, 0],
                          scale: [0, 1.5],
                        }}
                        transition={{
                          duration: 0.8,
                          ease: "easeOut",
                        }}
                      />
                    ))}
                  </motion.div>
                )}
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
      </div>
      
      <GuestPrayerModal
        open={showGuestModal}
        onClose={() => {
          setShowGuestModal(false);
          setPendingPrayer(null);
        }}
        onSubmit={handleGuestPrayerSubmit}
        prayerTitle={pendingPrayer?.title}
        churchName={pendingPrayer?.church_name || undefined}
      />
    </div>
  );
}
