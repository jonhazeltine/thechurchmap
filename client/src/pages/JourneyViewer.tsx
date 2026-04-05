import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  X, ChevronLeft, ChevronRight, Church, Heart, BookOpen,
  PenLine, Share2, HandHeart, Sparkles, Send, Check, MapPin, Eye, EyeOff
} from "lucide-react";
import type { PrayerJourney, PrayerJourneyStep } from "@shared/schema";
import JourneyMap from "@/components/journey/JourneyMap";

// ─── Step type badges ────────────────────────────────────────────────
const STEP_BADGES: Record<string, { label: string; icon: any; color: string }> = {
  boundary: { label: "Location", icon: MapPin, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  church: { label: "Church", icon: Church, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  community_need: { label: "Community Need", icon: Heart, color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  custom: { label: "Custom", icon: PenLine, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  scripture: { label: "Scripture", icon: BookOpen, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  user_prayer: { label: "Your Prayer", icon: PenLine, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  thanksgiving: { label: "Thanksgiving", icon: HandHeart, color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  prayer_request: { label: "Prayer Request", icon: HandHeart, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
};

function StepBadge({ stepType }: { stepType: string }) {
  const badge = STEP_BADGES[stepType] || STEP_BADGES.custom;
  const Icon = badge.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>
      <Icon className="w-3 h-3" />
      {badge.label}
    </span>
  );
}

// ─── Coordinate helpers ──────────────────────────────────────────────

function getStepCoords(step: any): { lng: number; lat: number } | null {
  if (!step) return null;

  // Boundary step: use centroid from metadata
  if (step.step_type === "boundary") {
    const meta = typeof step.metadata === "string" ? JSON.parse(step.metadata) : step.metadata;
    if (meta?.centroid_lat && meta?.centroid_lng) {
      return { lng: Number(meta.centroid_lng), lat: Number(meta.centroid_lat) };
    }
  }

  // Church step: use church_data coordinates
  if (step.step_type === "church") {
    const cd = step.church_data;
    if (cd) {
      const lat = cd.display_lat || cd.latitude;
      const lng = cd.display_lng || cd.longitude;
      if (lat && lng) return { lng: Number(lng), lat: Number(lat) };
    }
  }

  // Custom step with metadata coordinates
  if (step.metadata) {
    const meta = typeof step.metadata === "string" ? JSON.parse(step.metadata) : step.metadata;
    if (meta.latitude && meta.longitude) {
      return { lng: Number(meta.longitude), lat: Number(meta.latitude) };
    }
  }

  return null;
}

// ─── Main component ──────────────────────────────────────────────────

export default function JourneyViewer() {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const [location] = useLocation();
  const pathParts = location.split("/").filter(Boolean);
  const journeyIndex = pathParts.indexOf("journey");
  const rawParam = journeyIndex >= 0 ? pathParts[journeyIndex + 1] : undefined;
  const isUUID = rawParam && UUID_REGEX.test(rawParam);

  const id = isUUID ? rawParam : undefined;
  const shareToken = rawParam && !isUUID ? rawParam : undefined;

  const { session, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState(0);

  const isShareMode = !!shareToken && !id;

  const { data: journey, isLoading, error } = useQuery<PrayerJourney & { steps: PrayerJourneyStep[] }>({
    queryKey: ["journey-view", id || shareToken],
    queryFn: async () => {
      const url = isShareMode
        ? `/api/journeys/share/${shareToken}`
        : `/api/journeys/${id}`;
      const headers: Record<string, string> = {};
      if (session?.access_token && !isShareMode) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Journey not found");
      return res.json();
    },
    enabled: !!(id || shareToken),
    retry: 1,
  });

  const activeSteps = (journey?.steps || []).filter((s) => !s.is_excluded);
  const currentStep = activeSteps[currentSlide];
  const isLastSlide = currentSlide === activeSteps.length - 1;
  const isFirstSlide = currentSlide === 0;

  // Check if returning from login/signup with completed state
  const urlParams = new URLSearchParams(window.location.search);
  const returnedCompleted = urlParams.get("completed") === "true";
  const [showCompletion, setShowCompletion] = useState(returnedCompleted);
  const [showNameCapture, setShowNameCapture] = useState(false);
  const [guestName, setGuestName] = useState<{ first: string; last: string; display: string } | null>(null);

  // Bottom sheet snap state: auto-pop to half (1) when arriving at new destination
  const [sheetSnap, setSheetSnap] = useState(1); // kept for nav logic compatibility
  // Non-map steps (scripture, prayer_request, thanksgiving) start expanded
  const isNonMapStep = currentStep && !getStepCoords(currentStep);
  const [contentExpanded, setContentExpanded] = useState(false);

  // Auto-expand for non-map steps
  useEffect(() => {
    if (isNonMapStep) {
      setContentExpanded(true);
    }
  }, [isNonMapStep, currentSlide]);

  // Find the prayer_request slide index — we insert name capture right before it
  const prayerRequestIndex = activeSteps.findIndex(s => s.step_type === "prayer_request");

  const handleNext = () => {
    if (isLastSlide) {
      setShowCompletion(true);
    } else {
      const nextIndex = currentSlide + 1;
      if (!session && !guestName && prayerRequestIndex >= 0 && nextIndex === prayerRequestIndex) {
        setShowNameCapture(true);
      } else {
        setCurrentSlide(nextIndex);
        setContentExpanded(false); // Start collapsed on new step
        setSheetSnap(0);
      }
    }
  };

  const handlePrev = () => {
    if (showCompletion) {
      setShowCompletion(false);
    } else if (showNameCapture) {
      setShowNameCapture(false);
    } else {
      setCurrentSlide((prev) => Math.max(prev - 1, 0));
      setContentExpanded(false);
      setSheetSnap(0);
    }
  };

  const handleClose = () => {
    if (isShareMode) {
      setLocation("/");
    } else {
      setLocation("/journeys");
    }
  };

  // Map target coordinates
  const mapTarget = useMemo(() => getStepCoords(currentStep), [currentStep]);
  const nextStep = activeSteps[currentSlide + 1] || null;
  const nextMapTarget = useMemo(() => getStepCoords(nextStep), [nextStep]);

  // Boundary step: extract geometry and fetch context pins
  const isBoundaryStep = currentStep?.step_type === "boundary";
  const boundaryGeometry = useMemo(() => {
    if (!isBoundaryStep) return null;
    const meta = typeof currentStep?.metadata === "string" ? JSON.parse(currentStep.metadata) : currentStep?.metadata;
    return meta?.boundary_geometry || null;
  }, [isBoundaryStep, currentStep]);

  // Extract bbox for custom steps with large areas (states, countries)
  const viewBbox = useMemo(() => {
    if (isBoundaryStep) return null; // boundary steps use boundaryGeometry for fitBounds
    const meta = typeof currentStep?.metadata === "string" ? JSON.parse(currentStep?.metadata || "{}") : currentStep?.metadata;
    return meta?.bbox || null;
  }, [currentStep, isBoundaryStep]);

  const [showContextPins, setShowContextPins] = useState(true);

  // Fetch churches within boundary bbox for context pins
  const { data: contextChurches } = useQuery<any[]>({
    queryKey: ["journey-context-churches", currentStep?.id],
    queryFn: async () => {
      if (!boundaryGeometry) return [];
      let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
      const extractCoords = (coords: any) => {
        if (typeof coords[0] === "number") {
          minLng = Math.min(minLng, coords[0]);
          minLat = Math.min(minLat, coords[1]);
          maxLng = Math.max(maxLng, coords[0]);
          maxLat = Math.max(maxLat, coords[1]);
        } else {
          for (const c of coords) extractCoords(c);
        }
      };
      extractCoords(boundaryGeometry.coordinates);
      const res = await fetch(`/api/churches/in-viewport?minLng=${minLng}&minLat=${minLat}&maxLng=${maxLng}&maxLat=${maxLat}&limit=200`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isBoundaryStep && !!boundaryGeometry,
    staleTime: 60000,
  });

  const contextPins = useMemo(() => {
    if (!showContextPins || !contextChurches || contextChurches.length === 0) return null;
    const meta = typeof currentStep?.metadata === "string" ? JSON.parse(currentStep.metadata) : currentStep?.metadata;
    const excludedIds = new Set(meta?.excluded_church_ids || []);
    return contextChurches
      .filter((c: any) => !excludedIds.has(c.id))
      .map((c: any) => ({
        lng: Number(c.display_lng || c.longitude),
        lat: Number(c.display_lat || c.latitude),
        name: c.name,
      })).filter((p: any) => p.lng && p.lat);
  }, [contextChurches, showContextPins, currentStep]);

  // When the map finishes flying, pop the sheet up
  const handleMapArrived = () => {
    setSheetSnap(1);
  };

  // Also pop sheet up on initial load or for non-map steps
  useEffect(() => {
    if (!mapTarget && currentStep) {
      // Non-map step: immediately show sheet expanded
      setSheetSnap(1);
    }
  }, [mapTarget, currentStep]);

  // ─── Loading / Error / Completion / Name Capture screens ───────────
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Journey not found</h2>
          <Button onClick={handleClose}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (showCompletion) {
    return (
      <CompletionScreen
        journey={journey}
        steps={activeSteps}
        onBack={handlePrev}
        onClose={handleClose}
        session={session}
      />
    );
  }

  if (showNameCapture) {
    return (
      <NameCaptureScreen
        onSubmit={(name) => {
          setGuestName(name);
          setShowNameCapture(false);
          if (prayerRequestIndex >= 0) {
            setCurrentSlide(prayerRequestIndex);
          }
        }}
        onLogin={() => setLocation(`/login?redirect=${encodeURIComponent(window.location.pathname + "?completed=true")}`)}
        onSignup={() => setLocation(`/signup?redirect=${encodeURIComponent(window.location.pathname + "?completed=true")}`)}
        onBack={handlePrev}
      />
    );
  }

  // Get banner/image for current step
  const stepBanner = getStepBanner(currentStep);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Header — full on desktop, minimal on mobile ──────── */}
      <div className="hidden md:flex relative items-center justify-between px-4 py-2.5 border-b bg-background z-30 shrink-0" style={{ height: 56 }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-medium truncate">{journey.title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground font-medium tabular-nums">
            {currentSlide + 1}/{activeSteps.length}
          </span>
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${((currentSlide + 1) / activeSteps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
      {/* Mobile: just an X button floating on the map (right side to avoid logos) */}
      <div className="md:hidden absolute top-3 right-3 z-50">
        <button
          onClick={handleClose}
          className="bg-background/70 backdrop-blur-sm rounded-full p-2 shadow-lg border border-border/30"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Map + Bottom Sheet area ────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Map fills the space */}
        <JourneyMap
          target={mapTarget}
          nextTarget={nextMapTarget}
          slideIndex={currentSlide}
          onArrived={handleMapArrived}
          boundaryGeometry={boundaryGeometry}
          contextPins={contextPins}
          viewBbox={viewBbox}
        />

        {/* Non-map overlay for steps without coordinates */}
        {!mapTarget && (
          <div className="absolute inset-0 bg-gradient-to-b from-muted/80 to-muted/50 z-10" />
        )}

        {/* Context pins toggle for boundary steps */}
        {isBoundaryStep && contextChurches && contextChurches.length > 0 && (
          <button
            onClick={() => setShowContextPins(prev => !prev)}
            className="absolute top-3 left-3 z-30 bg-background/70 backdrop-blur-sm rounded-full p-2 shadow-lg border border-border/30"
            title={showContextPins ? "Hide church pins" : "Show church pins"}
          >
            {showContextPins ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        )}

        {/* Floating header card */}
        <div className="absolute top-3 left-3 right-3 md:left-auto md:right-3 md:w-96 z-20">
          <div className="bg-background/70 backdrop-blur-lg rounded-xl shadow-lg border border-border/30 px-4 py-3">
            <div className="flex items-center gap-3">
              {/* Church image — small square thumbnail */}
              {(stepBanner?.avatar || stepBanner?.url) && (
                <img
                  src={stepBanner.avatar || stepBanner.url}
                  alt=""
                  className="w-11 h-11 rounded-lg object-cover shadow shrink-0 border border-border/30"
                />
              )}
              <div className="min-w-0 flex-1">
                <StepBadge stepType={currentStep?.step_type || "custom"} />
                <h2 className="text-sm font-bold leading-tight mt-0.5 line-clamp-2">
                  {currentStep?.title || "Prayer Step"}
                </h2>
              </div>
            </div>
          </div>
        </div>

        {/* Prayer content — centered large card for non-map steps, floating card for map steps */}
        {isNonMapStep ? (
          /* Centered dialog for scripture/thanksgiving/prayer request */
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 pointer-events-none">
            <div className="pointer-events-auto bg-background/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-border/30 w-full max-w-lg max-h-[70vh] overflow-hidden">
              <div className="overflow-y-auto overscroll-contain px-6 py-5 max-h-[70vh]">
                <div className="mb-3">
                  <StepBadge stepType={currentStep?.step_type || "custom"} />
                  <h2 className="text-lg font-bold leading-tight mt-2">
                    {currentStep?.title || "Prayer Step"}
                  </h2>
                </div>
                {currentStep && (
                  <SlideContent
                    step={currentStep}
                    journeyId={journey.id}
                    session={session}
                    toast={toast}
                    allSteps={activeSteps}
                    guestName={guestName}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Floating collapsible card for map steps */
          <div className="absolute bottom-16 left-3 right-3 md:left-auto md:right-3 md:w-96 z-20">
            <div className="bg-background/70 backdrop-blur-lg rounded-xl shadow-lg border border-border/30 overflow-hidden">
              {/* Mobile: collapsible; Desktop: always expanded */}
              {!contentExpanded ? (
                <>
                  {/* Mobile collapsed view */}
                  <button
                    onClick={() => setContentExpanded(true)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between md:hidden"
                  >
                    <p className="text-sm line-clamp-2 text-foreground/90 flex-1 mr-2">
                      {currentStep?.body?.substring(0, 100) || "Tap to read prayer..."}
                    </p>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 rotate-90" />
                  </button>
                  {/* Desktop always-expanded view */}
                  <div className="hidden md:block max-h-[50vh] overflow-y-auto overscroll-contain px-4 py-3">
                    {currentStep && (
                      <SlideContent
                        step={currentStep}
                        journeyId={journey.id}
                        session={session}
                        toast={toast}
                        allSteps={activeSteps}
                        guestName={guestName}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="max-h-[40vh] md:max-h-[50vh] overflow-y-auto overscroll-contain px-4 py-3">
                  <button
                    onClick={() => setContentExpanded(false)}
                    className="text-xs text-muted-foreground mb-2 flex items-center gap-1 md:hidden"
                  >
                    <ChevronRight className="w-3 h-3 -rotate-90" /> Minimize
                  </button>
                  {currentStep && (
                    <SlideContent
                      step={currentStep}
                      journeyId={journey.id}
                      session={session}
                      toast={toast}
                      allSteps={activeSteps}
                      guestName={guestName}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation bar — fixed at bottom */}
        <div className="absolute bottom-3 left-3 right-3 z-40 flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrev}
            disabled={isFirstSlide}
            className="shadow-lg bg-background/70 backdrop-blur-sm"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          <div className="flex gap-1.5 bg-background/70 backdrop-blur-sm rounded-full px-3 py-1.5 shadow">
            {activeSteps.slice(0, 20).map((_, i) => (
              <button
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentSlide ? "bg-primary" : i < currentSlide ? "bg-primary/40" : "bg-muted-foreground/20"
                }`}
                onClick={() => setCurrentSlide(i)}
              />
            ))}
            {activeSteps.length > 20 && (
              <span className="text-[10px] text-muted-foreground">+{activeSteps.length - 20}</span>
            )}
          </div>

          <Button size="sm" onClick={handleNext} className="shadow-lg">
            {isLastSlide ? "Finish" : "Next"} <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Get banner info for the current step ────────────────────────────

function getStepBanner(step: any): { url: string; avatar?: string } | null {
  if (!step) return null;

  // Church step: use church banner
  if (step.step_type === "church" && step.church_data) {
    const cd = step.church_data;
    if (cd.banner_image_url) {
      return { url: cd.banner_image_url, avatar: cd.profile_photo_url || undefined };
    }
  }

  // Custom step with image_url in metadata
  if (step.metadata) {
    const meta = typeof step.metadata === "string" ? JSON.parse(step.metadata) : step.metadata;
    if (meta.image_url) {
      return { url: meta.image_url };
    }
  }

  return null;
}

// ─── Slide content (body, scripture, prayer input) ───────────────────
// This renders the BODY of each slide type — title and badge are handled by the sheet

function SlideContent({ step, journeyId, session, toast, allSteps, guestName }: {
  step: PrayerJourneyStep;
  journeyId: string;
  session: any;
  toast: any;
  allSteps: PrayerJourneyStep[];
  guestName?: { first: string; last: string; display: string } | null;
}) {
  switch (step.step_type) {
    case "church":
      return <ChurchContent step={step} journeyId={journeyId} session={session} toast={toast} guestName={guestName} />;
    case "community_need":
      return <CommunityNeedContent step={step} journeyId={journeyId} session={session} toast={toast} guestName={guestName} />;
    case "scripture":
      return <ScriptureContent step={step} />;
    case "custom":
      return <CustomContent step={step} />;
    case "user_prayer":
      return <UserPrayerContent step={step} journeyId={journeyId} session={session} toast={toast} />;
    case "thanksgiving":
      return <ThanksgivingContent step={step} />;
    case "prayer_request":
      return <PrayerRequestContent step={step} journeyId={journeyId} session={session} toast={toast} allSteps={allSteps} guestName={guestName} />;
    default:
      return <CustomContent step={step} />;
  }
}

// ─── Church content ──────────────────────────────────────────────────

function ChurchContent({ step, journeyId, session, toast, guestName }: {
  step: PrayerJourneyStep; journeyId: string; session: any; toast: any; guestName?: any;
}) {
  const churchData = (step as any).church_data;
  const denomination = churchData?.denomination;
  const [needsExpanded, setNeedsExpanded] = useState(false);

  const bodyParts = (step.body || "").split(/\n---\n/).map(s => s.trim()).filter(Boolean);
  const mainPrayer = bodyParts[0] || "";
  const prayerNeeds = bodyParts.slice(1).map(part => {
    const titleMatch = part.match(/^Prayer Need:\s*(.+?)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "";
    const body = titleMatch ? part.replace(titleMatch[0], "").trim() : part;
    return { title, body };
  }).filter(n => n.title || n.body);

  return (
    <div className="space-y-3">
      {denomination && (
        <p className="text-xs text-muted-foreground">{denomination}</p>
      )}

      {mainPrayer && (
        <p className="text-sm text-muted-foreground leading-relaxed">{mainPrayer}</p>
      )}

      {/* Scripture */}
      {step.scripture_ref && (
        <blockquote className="border-l-4 border-primary/30 pl-3 py-2 bg-primary/5 rounded-r-lg">
          <p className="text-sm italic text-foreground/80">{step.scripture_text}</p>
          <cite className="text-xs not-italic font-medium text-primary mt-1 block">— {step.scripture_ref}</cite>
        </blockquote>
      )}

      {/* Prayer needs — collapsible */}
      {prayerNeeds.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setNeedsExpanded(!needsExpanded)}
            className="w-full flex items-center justify-between p-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
          >
            <div className="flex items-center gap-2">
              <Heart className="w-3.5 h-3.5 text-red-500" />
              <span className="font-medium">Prayer Needs ({prayerNeeds.length})</span>
            </div>
            <ChevronRight className={`w-4 h-4 transition-transform ${needsExpanded ? "rotate-90" : ""}`} />
          </button>
          {needsExpanded && (
            <div className="p-3 space-y-2.5">
              {prayerNeeds.map((need, i) => (
                <div key={i} className="border-l-2 border-red-300/50 pl-3">
                  {need.title && <p className="text-sm font-medium">{need.title}</p>}
                  {need.body && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{need.body}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <InlinePrayerInput
        step={step}
        journeyId={journeyId}
        session={session}
        toast={toast}
        placeholder="Write your prayer for this church..."
        churchId={step.church_id}
        guestName={guestName}
      />
    </div>
  );
}

// ─── Community Need content ──────────────────────────────────────────

function CommunityNeedContent({ step, journeyId, session, toast, guestName }: {
  step: PrayerJourneyStep; journeyId: string; session: any; toast: any; guestName?: any;
}) {
  return (
    <div className="space-y-3">
      {step.body && (
        <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
      )}

      {step.scripture_ref && (
        <blockquote className="border-l-4 border-primary/30 pl-3 py-2 bg-primary/5 rounded-r-lg">
          <p className="text-sm italic text-foreground/80">{step.scripture_text}</p>
          <cite className="text-xs not-italic font-medium text-primary mt-1 block">— {step.scripture_ref}</cite>
        </blockquote>
      )}

      <InlinePrayerInput
        step={step}
        journeyId={journeyId}
        session={session}
        toast={toast}
        placeholder="Write your prayer for this community need..."
        guestName={guestName}
      />
    </div>
  );
}

// ─── Scripture content ───────────────────────────────────────────────

function ScriptureContent({ step }: { step: PrayerJourneyStep }) {
  return (
    <div className="space-y-4">
      {step.scripture_text && (
        <blockquote className="text-lg font-serif italic leading-relaxed text-foreground/80">
          "{step.scripture_text}"
        </blockquote>
      )}
      {step.scripture_ref && (
        <p className="text-sm font-semibold text-amber-600 tracking-wide uppercase">{step.scripture_ref}</p>
      )}
      {step.body && (
        <p className="text-sm text-muted-foreground border-t pt-3">{step.body}</p>
      )}
    </div>
  );
}

// ─── Custom content ──────────────────────────────────────────────────

function CustomContent({ step }: { step: PrayerJourneyStep }) {
  return (
    <div className="space-y-3">
      {step.body && (
        <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
      )}
      {step.scripture_ref && (
        <blockquote className="border-l-4 border-primary/30 pl-3 py-2 bg-primary/5 rounded-r-lg">
          <p className="text-sm italic text-foreground/80">{step.scripture_text}</p>
          <cite className="text-xs not-italic font-medium text-primary mt-1 block">— {step.scripture_ref}</cite>
        </blockquote>
      )}
    </div>
  );
}

// ─── Thanksgiving content ────────────────────────────────────────────

function ThanksgivingContent({ step }: { step: PrayerJourneyStep }) {
  return (
    <div className="space-y-3">
      {step.body && (
        <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
      )}
      {step.scripture_text && (
        <blockquote className="border-l-4 border-green-500/30 pl-3 py-2 bg-green-50/50 dark:bg-green-950/20 rounded-r-lg">
          <p className="text-sm italic text-foreground/80">{step.scripture_text}</p>
          <cite className="text-xs not-italic font-medium text-green-600 mt-1 block">— {step.scripture_ref}</cite>
        </blockquote>
      )}
    </div>
  );
}

// ─── User Prayer content ─────────────────────────────────────────────

function UserPrayerContent({ step, journeyId, session, toast }: {
  step: PrayerJourneyStep; journeyId: string; session: any; toast: any;
}) {
  const [prayerTitle, setPrayerTitle] = useState("");
  const [prayerBody, setPrayerBody] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Please sign in to submit a prayer");
      const res = await fetch("/api/prayers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          church_id: step.church_id || undefined,
          title: prayerTitle || step.title || "Prayer",
          body: prayerBody,
          journey_id: journeyId,
          journey_step_id: step.id,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit prayer");
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Prayer submitted", description: "Your prayer has been received." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (submitted) {
    return (
      <div className="text-center space-y-3 py-4">
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6 text-green-600" />
        </div>
        <p className="text-sm font-medium">Prayer Submitted</p>
        <p className="text-xs text-muted-foreground">Thank you for praying.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {step.body && (
        <p className="text-sm text-muted-foreground">{step.body}</p>
      )}
      <Input
        value={prayerTitle}
        onChange={(e) => setPrayerTitle(e.target.value)}
        placeholder="Prayer title (optional)"
        className="text-sm"
      />
      <Textarea
        value={prayerBody}
        onChange={(e) => setPrayerBody(e.target.value)}
        placeholder="Write your prayer here..."
        rows={3}
        className="resize-none text-sm"
      />
      <Button
        onClick={() => submitMutation.mutate()}
        disabled={!prayerBody.trim() || submitMutation.isPending || !session}
        className="w-full"
        size="sm"
      >
        <Send className="w-3.5 h-3.5 mr-1.5" />
        {submitMutation.isPending ? "Submitting..." : "Submit Prayer"}
      </Button>
      {!session && (
        <p className="text-xs text-muted-foreground text-center">Sign in to submit your prayer.</p>
      )}
    </div>
  );
}

// ─── Prayer Request content ──────────────────────────────────────────

function PrayerRequestContent({ step, journeyId, session, toast, allSteps, guestName }: {
  step: PrayerJourneyStep; journeyId: string; session: any; toast: any;
  allSteps: PrayerJourneyStep[];
  guestName?: { first: string; last: string; display: string } | null;
}) {
  const [, setLocation] = useLocation();
  const [requestTitle, setRequestTitle] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [selectedScope, setSelectedScope] = useState("area");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showGuestName, setShowGuestName] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");

  const churchSteps = allSteps.filter(s => s.step_type === "church" && s.church_id);

  const submitRequest = async (guestNameStr?: string) => {
    const payload: any = {
      title: requestTitle,
      body: requestBody || requestTitle,
      is_anonymous: isAnonymous,
    };
    if (selectedScope !== "area" && selectedScope) {
      payload.church_id = selectedScope;
    } else {
      payload.scope_type = "tract";
    }
    if (guestNameStr) {
      payload.guest_name = guestNameStr;
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    const res = await fetch("/api/prayers/public", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to submit request");
    const data = await res.json();
    if (data.anonymous_token) {
      try {
        const tokens = JSON.parse(localStorage.getItem("anonymous_prayer_tokens") || "[]");
        tokens.push(data.anonymous_token);
        localStorage.setItem("anonymous_prayer_tokens", JSON.stringify(tokens));
      } catch { /* ignore */ }
    }
    return data;
  };

  const submitMutation = useMutation({
    mutationFn: async () => submitRequest(),
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Request submitted", description: "Your prayer request is being reviewed." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleGuestSubmit = async () => {
    if (guestFirstName.trim().length < 2) return;
    const lastInitial = guestLastName.trim() ? guestLastName.trim().charAt(0).toUpperCase() + "." : "";
    const gName = `${guestFirstName.trim()} ${lastInitial}`.trim();
    try {
      await submitRequest(gName);
      setSubmitted(true);
      setShowGuestName(false);
      toast({ title: "Request submitted", description: "Your prayer request is being reviewed." });
    } catch {
      toast({ title: "Error", description: "Failed to submit request", variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="text-center space-y-3 py-4">
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6 text-green-600" />
        </div>
        <p className="text-sm font-medium">Request Submitted</p>
        <p className="text-xs text-muted-foreground">Others will be able to pray for you.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Share your prayer request and the community will lift you up in prayer.
      </p>

      <Input
        value={requestTitle}
        onChange={(e) => setRequestTitle(e.target.value)}
        placeholder="What would you like prayer for?"
        className="text-sm"
      />
      <Textarea
        value={requestBody}
        onChange={(e) => setRequestBody(e.target.value)}
        placeholder="Share more details (optional)"
        rows={2}
        className="resize-none text-sm"
      />

      {churchSteps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Where should this prayer request go?</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selectedScope === "area" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
              onClick={() => setSelectedScope("area")}
            >
              Community-wide
            </button>
            {churchSteps.map(cs => (
              <button
                key={cs.church_id}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selectedScope === cs.church_id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                }`}
                onClick={() => setSelectedScope(cs.church_id!)}
              >
                {(cs.title || "").replace("Pray for ", "")}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="rounded"
        />
        Submit anonymously
      </label>

      {showGuestName && !session && !guestName ? (
        <div className="space-y-2 p-3 bg-muted/50 rounded-md">
          <p className="text-xs text-muted-foreground">
            Enter your name to submit (or <a href="/login" className="text-primary underline">sign in</a>)
          </p>
          <div className="flex gap-2">
            <Input
              value={guestFirstName}
              onChange={(e) => setGuestFirstName(e.target.value)}
              placeholder="First name"
              className="text-sm h-8"
              autoFocus
            />
            <Input
              value={guestLastName}
              onChange={(e) => setGuestLastName(e.target.value)}
              placeholder="Last name"
              className="text-sm h-8"
            />
          </div>
          <p className="text-xs text-muted-foreground">Only your last initial will be shown publicly</p>
          <Button size="sm" onClick={handleGuestSubmit} disabled={guestFirstName.trim().length < 2} className="w-full">
            <Send className="w-3 h-3 mr-1" /> Submit Prayer Request
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            if (!session && !guestName) {
              setShowGuestName(true);
            } else if (!session && guestName) {
              submitRequest(guestName.display).then(() => {
                setSubmitted(true);
                toast({ title: "Request submitted", description: "Your prayer request is being reviewed." });
              }).catch(() => {
                toast({ title: "Error", description: "Failed to submit", variant: "destructive" });
              });
            } else {
              submitMutation.mutate();
            }
          }}
          disabled={!requestTitle.trim() || submitMutation.isPending}
        >
          <Send className="w-3.5 h-3.5 mr-1.5" />
          {submitMutation.isPending ? "Submitting..." : "Submit Prayer Request"}
          {!session && guestName && (
            <span className="ml-1 text-xs opacity-75">as {guestName.display}</span>
          )}
        </Button>
      )}
    </div>
  );
}

// ─── Inline Prayer Input (used by church & community need) ───────────

function InlinePrayerInput({ step, journeyId, session, toast, placeholder, churchId, guestName }: {
  step: PrayerJourneyStep;
  journeyId: string;
  session: any;
  toast: any;
  placeholder: string;
  churchId?: string | null;
  guestName?: { first: string; last: string; display: string } | null;
}) {
  const [prayerText, setPrayerText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showGuestName, setShowGuestName] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");

  const submitPrayer = async (guestNameStr?: string) => {
    const body: any = {
      title: step.title || "Prayer",
      body: prayerText,
      journey_id: journeyId,
    };
    if (churchId) {
      body.church_id = churchId;
    } else {
      body.scope_type = "tract";
    }
    if (guestNameStr) {
      body.guest_name = guestNameStr;
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    const res = await fetch("/api/prayers/public", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to submit prayer");
    const data = await res.json();
    if (data.anonymous_token) {
      try {
        const tokens = JSON.parse(localStorage.getItem("anonymous_prayer_tokens") || "[]");
        tokens.push(data.anonymous_token);
        localStorage.setItem("anonymous_prayer_tokens", JSON.stringify(tokens));
      } catch { /* ignore */ }
    }
    return data;
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!session?.access_token) {
        setShowGuestName(true);
        throw new Error("__show_guest__");
      }
      return submitPrayer();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Prayer submitted" });
    },
    onError: (e: Error) => {
      if (e.message === "__show_guest__") return;
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleGuestSubmit = async () => {
    if (guestFirstName.trim().length < 2) return;
    const lastInitial = guestLastName.trim() ? guestLastName.trim().charAt(0).toUpperCase() + "." : "";
    const gName = `${guestFirstName.trim()} ${lastInitial}`.trim();
    try {
      await submitPrayer(gName);
      setSubmitted(true);
      setShowGuestName(false);
      toast({ title: "Prayer submitted", description: "Your prayer is being reviewed." });
    } catch {
      toast({ title: "Error", description: "Failed to submit prayer", variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="mt-3 space-y-1.5 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-primary">
          <Check className="w-4 h-4" /> Prayer submitted
        </div>
        {!session && (
          <p className="text-xs text-muted-foreground">
            <a href={`/signup?redirect=${encodeURIComponent(window.location.pathname)}`} className="text-primary underline">Create an account</a> to track your prayers
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <Textarea
        value={prayerText}
        onChange={(e) => setPrayerText(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="resize-none text-sm"
      />

      {showGuestName && !session ? (
        <div className="space-y-2 p-3 bg-muted/50 rounded-md">
          <p className="text-xs text-muted-foreground">Enter your name to submit (or <a href="/login" className="text-primary underline">sign in</a>)</p>
          <div className="flex gap-2">
            <Input
              value={guestFirstName}
              onChange={(e) => setGuestFirstName(e.target.value)}
              placeholder="First name"
              className="text-sm h-8"
              autoFocus
            />
            <Input
              value={guestLastName}
              onChange={(e) => setGuestLastName(e.target.value)}
              placeholder="Last name"
              className="text-sm h-8"
            />
          </div>
          <p className="text-xs text-muted-foreground">Only your last initial will be shown publicly</p>
          <Button size="sm" onClick={handleGuestSubmit} disabled={guestFirstName.trim().length < 2}>
            <Send className="w-3 h-3 mr-1" /> Submit Prayer
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (!prayerText.trim()) return;
              if (!session && !guestName) {
                setShowGuestName(true);
              } else if (!session && guestName) {
                submitPrayer(guestName.display).then(() => {
                  setSubmitted(true);
                  toast({ title: "Prayer submitted", description: "Your prayer is being reviewed." });
                }).catch(() => {
                  toast({ title: "Error", description: "Failed to submit prayer", variant: "destructive" });
                });
              } else {
                submitMutation.mutate();
              }
            }}
            disabled={!prayerText.trim() || submitMutation.isPending}
          >
            <Send className="w-3 h-3 mr-1" />
            {submitMutation.isPending ? "Sending..." : "Pray"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Name Capture Screen ─────────────────────────────────────────────

function NameCaptureScreen({ onSubmit, onLogin, onSignup, onBack }: {
  onSubmit: (name: { first: string; last: string; display: string }) => void;
  onLogin: () => void;
  onSignup: () => void;
  onBack: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (trimmedFirst.length < 2) return;
    const lastInitial = trimmedLast ? trimmedLast.charAt(0).toUpperCase() + "." : "";
    onSubmit({
      first: trimmedFirst,
      last: trimmedLast,
      display: `${trimmedFirst} ${lastInitial}`.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Share Your Prayers</h2>
          <p className="text-muted-foreground mt-2">
            Enter your name to share your prayers with the community
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">First Name</label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Enter your first name"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Last Name</label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Enter your last name"
            />
            <p className="text-xs text-muted-foreground">
              Only your last initial will be displayed publicly
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={firstName.trim().length < 2}>
            <Heart className="w-4 h-4 mr-2" /> Submit Prayers
          </Button>
        </form>

        <div className="mt-6 text-center space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
          </div>
          <p className="text-sm text-muted-foreground">
            Sign in to post your prayers immediately
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={onLogin}>Sign In</Button>
            <Button variant="outline" size="sm" onClick={onSignup}>Create Account</Button>
          </div>
        </div>

        <button onClick={onBack} className="mt-6 text-sm text-muted-foreground hover:text-foreground block mx-auto">
          ← Go back
        </button>
      </div>
    </div>
  );
}

// ─── Completion Screen ───────────────────────────────────────────────

function CompletionScreen({ journey, steps, onBack, onClose, session }: {
  journey: PrayerJourney;
  steps: PrayerJourneyStep[];
  onBack: () => void;
  onClose: () => void;
  session: any;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const churchCount = steps.filter((s) => s.step_type === "church").length;
  const needsCount = steps.filter((s) => s.step_type === "community_need").length;

  const shareUrl = journey.share_token
    ? `${window.location.origin}/journey/${journey.share_token}`
    : window.location.href;

  // Generate QR code
  useEffect(() => {
    import("qrcode").then((QRCode) => {
      QRCode.toDataURL(shareUrl, {
        width: 200,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setQrDataUrl).catch(() => {});
    }).catch(() => {});
  }, [shareUrl]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied", description: "Share link copied to clipboard." });
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast({ title: "Link copied", description: "Share link copied to clipboard." });
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>

        <div>
          <h2 className="text-3xl font-bold mb-2">Journey Complete</h2>
          <p className="text-muted-foreground">
            {session && new URLSearchParams(window.location.search).get("completed") === "true"
              ? "Welcome back! Your prayers have been posted."
              : "Thank you for your faithfulness in prayer."}
          </p>
        </div>

        <div className="flex justify-center gap-8 text-center">
          {churchCount > 0 && (
            <div>
              <p className="text-3xl font-bold text-primary">{churchCount}</p>
              <p className="text-sm text-muted-foreground">Church{churchCount !== 1 ? "es" : ""}</p>
            </div>
          )}
          {needsCount > 0 && (
            <div>
              <p className="text-3xl font-bold text-red-500">{needsCount}</p>
              <p className="text-sm text-muted-foreground">Need{needsCount !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>

        {!session && (
          <div className="rounded-lg bg-muted/50 p-5 space-y-3">
            <Heart className="w-6 h-6 text-primary mx-auto" />
            <p className="text-sm font-medium">
              Create an account to track your prayers
            </p>
            <p className="text-xs text-muted-foreground">
              Get notified when others pray for you and connect with your community.
            </p>
            <Button
              onClick={() => setLocation(`/signup?redirect=${encodeURIComponent(window.location.pathname + "?completed=true")}`)}
              className="w-full"
            >
              Create Free Account
            </Button>
            <button
              onClick={() => setLocation(`/login?redirect=${encodeURIComponent(window.location.pathname + "?completed=true")}`)}
              className="text-xs text-primary underline"
            >
              Already have an account? Sign in
            </button>
          </div>
        )}

        {/* QR Code (opt-in via builder) */}
        {journey.show_qr_code && qrDataUrl && (
          <div className="flex flex-col items-center gap-2">
            <img src={qrDataUrl} alt="Scan to share this journey" className="w-40 h-40 rounded-lg border" />
            <p className="text-xs text-muted-foreground">Scan to share this journey</p>
          </div>
        )}

        <div className="space-y-3">
          <Button onClick={() => {
            const platformSlug = window.location.pathname.split("/")[1];
            const isplatformRoute = platformSlug && platformSlug !== "journey" && platformSlug !== "journeys";
            setLocation(isplatformRoute ? `/${platformSlug}/map` : "/");
          }} className="w-full">
            <MapPin className="w-4 h-4 mr-2" /> View Map
          </Button>
          <Button onClick={handleShare} className="w-full" variant="outline">
            <Share2 className="w-4 h-4 mr-2" /> Share This Journey
          </Button>
          <Button onClick={onClose} className="w-full" variant="ghost">
            Done
          </Button>
        </div>

        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← Go back
        </button>
      </div>
    </div>
  );
}
