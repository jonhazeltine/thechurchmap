import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Info, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PrayerCarousel } from "./PrayerCarousel";
import { LivePrayerTicker } from "./LivePrayerTicker";
import { HealthPrayerTicker } from "./HealthPrayerTicker";
import { SubmitPrayerDialog } from "./SubmitPrayerDialog";
import { MapPrayerPopover } from "./MapPrayerPopover";
import type { VisiblePrayer } from "@shared/schema";

interface MapClickLocation {
  lng: number;
  lat: number;
  label: string;
  tractId?: string;
  screenPosition: { x: number; y: number };
}

interface PrayerModeOverlayProps {
  visible: boolean;
  onClose: () => void;
  prayers: VisiblePrayer[];
  onPrayerUpdate: () => void;
  onChurchSelect?: (churchId: string) => void;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  leftSidebarWidth?: number;
  rightSidebarWidth?: number;
  mapBbox?: string | null;
  cityPlatformId?: string | null;
  mapClickLocation?: MapClickLocation | null;
  onClearMapClick?: () => void;
}

const LEFT_SIDEBAR_DEFAULT_WIDTH = 384; // w-96
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 420; // w-[420px]

export function PrayerModeOverlay({ 
  visible, 
  onClose, 
  prayers, 
  onPrayerUpdate, 
  onChurchSelect,
  leftSidebarOpen = false, 
  rightSidebarOpen = false,
  leftSidebarWidth = LEFT_SIDEBAR_DEFAULT_WIDTH,
  rightSidebarWidth = RIGHT_SIDEBAR_DEFAULT_WIDTH,
  mapBbox = null,
  cityPlatformId = null,
  mapClickLocation = null,
  onClearMapClick,
}: PrayerModeOverlayProps) {
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [dialogClickLocation, setDialogClickLocation] = useState<{ lng: number; lat: number; label?: string; tractId?: string } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  
  // Track viewport width changes for accurate gradient positioning
  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Calculate the center of the visible map area (accounting for sidebars)
  // On mobile (<768px), no sidebar offset needed
  const isMobile = viewportWidth < 768;
  
  // Calculate horizontal offset for the radial gradient center
  // Positive offset = shift right, Negative offset = shift left
  let horizontalOffset = 0;
  if (!isMobile) {
    const effectiveLeftWidth = leftSidebarOpen ? leftSidebarWidth : 0;
    const effectiveRightWidth = rightSidebarOpen ? rightSidebarWidth : 0;
    // The center of the visible map area relative to screen center
    // Math: (leftWidth - rightWidth) / 2
    horizontalOffset = (effectiveLeftWidth - effectiveRightWidth) / 2;
  }
  
  // Create gradient position string (default is "center center" which equals "50% 50%")
  // We offset from 50% based on the sidebar difference
  const gradientCenterX = `calc(50% + ${horizontalOffset}px)`;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Radial spotlight backdrop - SMALL CENTER SPOTLIGHT, strong dark edges */}
          {/* select-none prevents accidental text selection when dragging the map */}
          {/* On mobile, center spotlight (45%) between Recent Prayers at top and Community Needs at bottom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              background: `radial-gradient(circle at ${gradientCenterX} ${isMobile ? '45%' : '50%'}, transparent 0%, transparent 12%, rgba(255, 215, 0, 0.04) 15%, rgba(0, 0, 0, 0.5) 25%, rgba(0, 0, 0, 0.85) 50%, rgba(0, 0, 0, 0.95) 100%)`
            }}
            className="fixed inset-0 z-40 pointer-events-none select-none"
            data-testid="prayer-mode-backdrop"
          />

          {/* Top left - Submit Prayer button and View Answered Prayers (away from map zoom controls) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="fixed top-4 left-4 z-[100] flex flex-col gap-2"
            style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
          >
            <Button
              variant="ghost"
              onClick={() => setShowSubmitDialog(true)}
              onTouchEnd={(e) => {
                e.preventDefault();
                setShowSubmitDialog(true);
              }}
              className="rounded-full bg-white/20 hover:bg-white/30 border border-white/30 backdrop-blur-md text-white gap-2 px-4"
              style={{ touchAction: 'manipulation' }}
              data-testid="button-submit-prayer-mode"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Submit Prayer Request</span>
            </Button>
            <Link href="/prayers/answered">
              <Button
                variant="ghost"
                className="rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 backdrop-blur-md text-amber-200 gap-2 px-4 w-full"
                style={{ touchAction: 'manipulation' }}
                data-testid="button-view-answered-prayers"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">View Answered Prayers</span>
              </Button>
            </Link>
          </motion.div>

          {/* Top right - Close button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className="fixed top-4 right-4 z-[100]"
            style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              onTouchEnd={(e) => {
                e.preventDefault();
                onClose();
              }}
              className="rounded-full bg-white/20 hover:bg-white/30 border border-white/30 backdrop-blur-md"
              style={{ touchAction: 'manipulation' }}
              data-testid="button-close-prayer-mode"
            >
              <X className="w-5 h-5 text-white" />
            </Button>
          </motion.div>

          {/* Desktop: Recent Prayers on the RIGHT side - under Close button */}
          {!isMobile && (
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="fixed right-4 top-20 z-[100] max-w-xs pointer-events-none select-none"
              data-testid="recent-prayers-sidebar"
            >
              <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-3 text-right">
                Recent Prayers
              </p>
              <LivePrayerTicker variant="sidebar" />
            </motion.div>
          )}

          {/* Map click popover */}
          <AnimatePresence>
            {mapClickLocation && (
              <MapPrayerPopover
                position={mapClickLocation.screenPosition}
                label={mapClickLocation.label}
                onAddPrayer={() => {
                  setDialogClickLocation({
                    lng: mapClickLocation.lng,
                    lat: mapClickLocation.lat,
                    label: mapClickLocation.label,
                    tractId: mapClickLocation.tractId,
                  });
                  setShowSubmitDialog(true);
                  onClearMapClick?.();
                }}
                onViewPrayers={() => {
                  onClearMapClick?.();
                }}
                onDismiss={() => {
                  onClearMapClick?.();
                }}
              />
            )}
          </AnimatePresence>

          {/* Submit Prayer Dialog */}
          <SubmitPrayerDialog
            open={showSubmitDialog}
            onOpenChange={(open) => {
              setShowSubmitDialog(open);
              if (!open) {
                setDialogClickLocation(null);
              }
            }}
            onSuccess={onPrayerUpdate}
            cityPlatformId={cityPlatformId}
            clickLocation={dialogClickLocation}
          />

          {/* Desktop: Community Needs on the LEFT side - under Submit Prayer button */}
          {!isMobile && (
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="fixed left-4 top-32 z-[100] max-w-xs pointer-events-none select-none"
              data-testid="health-prompts-sidebar"
            >
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs text-white/50 font-medium uppercase tracking-wider">
                  Community Needs
                </p>
                <Link href="/methodology" onClick={(e) => e.stopPropagation()}>
                  <span className="pointer-events-auto inline-flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors cursor-pointer">
                    <Info className="w-3 h-3" />
                    <span className="hidden sm:inline">About data</span>
                  </span>
                </Link>
              </div>
              <HealthPrayerTicker bbox={mapBbox} variant="sidebar" />
            </motion.div>
          )}

          {/* Mobile: Recent Prayers at TOP - just under Prayer Mode title */}
          {isMobile && (
            <motion.div
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="fixed top-20 left-0 right-0 z-[100] px-4 pt-1 pointer-events-none"
            >
              <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-2 text-center">
                Recent Prayers
              </p>
              <LivePrayerTicker variant="bottom" />
            </motion.div>
          )}

          {/* Desktop: Prayer carousel at bottom */}
          {!isMobile && (
            <div className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none select-none">
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="max-w-4xl mx-auto px-4 pb-8 pointer-events-none"
              >
                <div className="pointer-events-auto">
                  <PrayerCarousel 
                    prayers={prayers} 
                    onPrayerUpdate={onPrayerUpdate}
                    onChurchSelect={onChurchSelect}
                  />
                </div>
              </motion.div>
            </div>
          )}

          {/* Mobile: Community Needs and Prayer requests at bottom */}
          {isMobile && (
            <div className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none select-none">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="px-4 pb-6"
              >
                <div className="px-2 mb-3">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <p className="text-xs text-white/50 font-medium uppercase tracking-wider text-center">
                      Community Needs
                    </p>
                    <Link href="/methodology" onClick={(e) => e.stopPropagation()}>
                      <span className="pointer-events-auto inline-flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors cursor-pointer">
                        <Info className="w-3 h-3" />
                      </span>
                    </Link>
                  </div>
                  <HealthPrayerTicker bbox={mapBbox} variant="bottom" />
                </div>
                
                <div className="pointer-events-auto">
                  <PrayerCarousel 
                    prayers={prayers} 
                    onPrayerUpdate={onPrayerUpdate}
                    onChurchSelect={onChurchSelect}
                  />
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
