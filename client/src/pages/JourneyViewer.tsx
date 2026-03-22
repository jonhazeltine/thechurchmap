import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  X, ChevronLeft, ChevronRight, Church, Heart, BookOpen,
  PenLine, Share2, HandHeart, Sparkles, Send, Check, MapPin
} from "lucide-react";
import type { PrayerJourney, PrayerJourneyStep } from "@shared/schema";

export default function JourneyViewer() {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Use wouter's location for client-side routing (updates before window.location)
  const [location] = useLocation();
  const pathParts = location.split('/').filter(Boolean);
  // Patterns: /journey/:token OR /:platform/journey/:id
  const journeyIndex = pathParts.indexOf('journey');
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

  // Find the prayer_request slide index — we insert name capture right before it
  const prayerRequestIndex = activeSteps.findIndex(s => s.step_type === "prayer_request");

  const handleNext = () => {
    if (isLastSlide) {
      setShowCompletion(true);
    } else {
      const nextIndex = currentSlide + 1;
      // If next slide is prayer_request and user is not logged in and hasn't given name yet
      if (!session && !guestName && prayerRequestIndex >= 0 && nextIndex === prayerRequestIndex) {
        setShowNameCapture(true);
      } else {
        setCurrentSlide(nextIndex);
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
    }
  };

  const handleClose = () => {
    if (isShareMode) {
      setLocation("/");
    } else {
      setLocation("/journeys");
    }
  };

  // Get coordinates for current step — churches zoom in, community needs zoom out
  const getStepCoords = (step: any, defCenter: any): { lng: number; lat: number; zoom: number } | null => {
    if (!step) return null;
    const churchData = step.church_data;
    if (step.step_type === 'church' && churchData) {
      const lat = churchData.display_lat || churchData.latitude;
      const lng = churchData.display_lng || churchData.longitude;
      if (lat && lng) return { lng, lat, zoom: 14.5 };
    }
    if (step.step_type === 'community_need') {
      return defCenter ? { ...defCenter, zoom: 11 } : null;
    }
    if (step.step_type === 'scripture' || step.step_type === 'thanksgiving' || step.step_type === 'prayer_request') {
      return defCenter ? { ...defCenter, zoom: 10 } : null;
    }
    return null;
  };

  // Background map — all hooks must be before early returns
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const firstChurchStep = activeSteps.find(s => s.step_type === 'church' && (s as any).church_data);
  const defaultCenter = firstChurchStep ? getStepCoords(firstChurchStep, null) : null;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN || '';
    if (!token) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: defaultCenter ? [defaultCenter.lng, defaultCenter.lat] : [-85.67, 42.96],
      zoom: defaultCenter?.zoom || 11,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [journey, defaultCenter?.lat]);

  useEffect(() => {
    if (!mapRef.current || !currentStep) return;
    const coords = getStepCoords(currentStep, defaultCenter);
    if (coords) {
      mapRef.current.flyTo({
        center: [coords.lng, coords.lat],
        zoom: coords.zoom,
        speed: 0.8,
        curve: 1.2,
      });
    }
  }, [currentSlide, currentStep]);

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Background map */}
      <div ref={mapContainerRef} className="absolute inset-0" style={{ filter: 'blur(1px) saturate(0.5)', opacity: 0.6 }} />
      {/* Overlay to ensure readability */}
      <div className="absolute inset-0 bg-background/50" />

      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b bg-card/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-medium truncate">{journey.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {currentSlide + 1} / {activeSteps.length}
          </span>
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${((currentSlide + 1) / activeSteps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Slide Content */}
      <div className="relative flex-1 overflow-y-auto flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          {currentStep && (
            <SlideRenderer
              key={currentStep.id}
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

      {/* Navigation */}
      <div className="relative flex items-center justify-between px-6 py-4 border-t bg-card/90 backdrop-blur-sm">
        <Button
          variant="ghost"
          onClick={handlePrev}
          disabled={isFirstSlide}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>

        <div className="flex gap-1.5 max-w-[200px] overflow-hidden">
          {activeSteps.map((_, i) => (
            <button
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentSlide ? "bg-primary" : i < currentSlide ? "bg-primary/40" : "bg-muted"
              }`}
              onClick={() => setCurrentSlide(i)}
            />
          ))}
        </div>

        <Button onClick={handleNext}>
          {isLastSlide ? "Finish" : "Next"} <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function SlideRenderer({ step, journeyId, session, toast, allSteps, guestName }: {
  step: PrayerJourneyStep;
  journeyId: string;
  session: any;
  toast: any;
  allSteps: PrayerJourneyStep[];
  guestName?: { first: string; last: string; display: string } | null;
}) {
  switch (step.step_type) {
    case "church":
      return <ChurchSlide step={step} journeyId={journeyId} session={session} toast={toast} guestName={guestName} />;
    case "community_need":
      return <CommunityNeedSlide step={step} journeyId={journeyId} session={session} toast={toast} guestName={guestName} />;
    case "scripture":
      return <ScriptureSlide step={step} />;
    case "custom":
      return <CustomSlide step={step} />;
    case "user_prayer":
      return <UserPrayerSlide step={step} journeyId={journeyId} session={session} toast={toast} />;
    case "thanksgiving":
      return <ThanksgivingSlide step={step} />;
    case "prayer_request":
      return <PrayerRequestSlide step={step} journeyId={journeyId} session={session} toast={toast} allSteps={allSteps} guestName={guestName} />;
    default:
      return <CustomSlide step={step} />;
  }
}

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

  const submitPrayer = async (guestName?: string) => {
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
    if (guestName) {
      body.guest_name = guestName;
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
    // Store anonymous token for auto-claim on account creation
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
        // Guest flow — show name input
        setShowGuestName(true);
        throw new Error("__show_guest__"); // Signal to not show error toast
      }
      return submitPrayer();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Prayer submitted" });
    },
    onError: (e: Error) => {
      if (e.message === "__show_guest__") return; // Don't toast, just show guest form
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleGuestSubmit = async () => {
    if (guestFirstName.trim().length < 2) return;
    const lastInitial = guestLastName.trim() ? guestLastName.trim().charAt(0).toUpperCase() + "." : "";
    const guestName = `${guestFirstName.trim()} ${lastInitial}`.trim();
    try {
      await submitPrayer(guestName);
      setSubmitted(true);
      setShowGuestName(false);
      toast({ title: "Prayer submitted", description: "Your prayer is being reviewed." });
    } catch {
      toast({ title: "Error", description: "Failed to submit prayer", variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="mt-4 space-y-2 text-center">
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
    <div className="mt-6 space-y-2 text-left">
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
                // Use the captured guest name directly
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

function ChurchSlide({ step, journeyId, session, toast, guestName }: { step: PrayerJourneyStep; journeyId: string; session: any; toast: any; guestName?: any }) {
  const churchData = (step as any).church_data;
  const bannerUrl = churchData?.banner_image_url;
  const photoUrl = churchData?.profile_photo_url;
  const denomination = churchData?.denomination;
  const [needsExpanded, setNeedsExpanded] = useState(false);

  // Parse body: split on --- to separate main prayer from church prayer needs
  const bodyParts = (step.body || '').split(/\n---\n/).map(s => s.trim()).filter(Boolean);
  const mainPrayer = bodyParts[0] || '';
  const prayerNeeds = bodyParts.slice(1).map(part => {
    const titleMatch = part.match(/^Prayer Need:\s*(.+?)$/m);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const body = titleMatch ? part.replace(titleMatch[0], '').trim() : part;
    return { title, body };
  }).filter(n => n.title || n.body);

  return (
    <div className="space-y-4">
      {/* Church header with banner */}
      <div className="relative rounded-xl overflow-hidden">
        {bannerUrl ? (
          <div className="relative h-40">
            <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
              {photoUrl && (
                <img src={photoUrl} alt="" className="w-12 h-12 rounded-full border-2 border-white object-cover shrink-0" />
              )}
              <div className="text-white">
                <h2 className="text-xl font-bold leading-tight">{step.title}</h2>
                {denomination && (
                  <p className="text-xs text-white/70 mt-0.5">{denomination}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="relative rounded-xl bg-gradient-to-br from-indigo-500/20 via-primary/10 to-blue-500/20 p-6 text-center">
            {photoUrl && (
              <img src={photoUrl} alt="" className="w-14 h-14 rounded-full border-2 border-white/50 object-cover mx-auto mb-3" />
            )}
            <h2 className="text-xl font-bold">{step.title}</h2>
            {denomination && (
              <p className="text-xs text-muted-foreground mt-1">{denomination}</p>
            )}
          </div>
        )}
      </div>

      {/* Main prayer text */}
      {mainPrayer && (
        <p className="text-base text-muted-foreground leading-relaxed">{mainPrayer}</p>
      )}

      {/* Scripture */}
      {step.scripture_ref && (
        <blockquote className="border-l-4 border-primary/30 pl-4 py-2 bg-primary/5 rounded-r-lg">
          <p className="text-sm italic text-foreground/80">{step.scripture_text}</p>
          <cite className="text-xs not-italic font-medium text-primary mt-1 block">— {step.scripture_ref}</cite>
        </blockquote>
      )}

      {/* Prayer needs — collapsible */}
      {prayerNeeds.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setNeedsExpanded(!needsExpanded)}
            className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
          >
            <div className="flex items-center gap-2">
              <Heart className="w-3.5 h-3.5 text-red-500" />
              <span className="font-medium">Prayer Needs ({prayerNeeds.length})</span>
            </div>
            <ChevronRight className={`w-4 h-4 transition-transform ${needsExpanded ? "rotate-90" : ""}`} />
          </button>
          {needsExpanded && (
            <div className="p-3 space-y-3">
              {prayerNeeds.map((need, i) => (
                <div key={i} className="border-l-2 border-red-300/50 pl-3">
                  {need.title && <p className="text-sm font-medium">{need.title}</p>}
                  {need.body && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{need.body}</p>}
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

function CommunityNeedSlide({ step, journeyId, session, toast, guestName }: { step: PrayerJourneyStep; journeyId: string; session: any; toast: any; guestName?: any }) {
  // Gradient based on metric category
  const metricKey = step.metric_key || '';
  const isHealth = ['depression', 'obesity', 'diabetes', 'frequent_mental_distress', 'general_health', 'high_blood_pressure', 'any_disability'].some(k => metricKey.includes(k));
  const isSafety = metricKey.includes('rate') || metricKey.includes('assault') || metricKey.includes('theft');
  const isFamily = ['children', 'single_parent', 'child_poverty'].some(k => metricKey.includes(k));
  const isEconomic = ['poverty', 'unemployment', 'housing', 'food', 'uninsured', 'utility'].some(k => metricKey.includes(k));

  const gradientClass = isSafety ? 'from-amber-500/15 to-red-500/10'
    : isHealth ? 'from-blue-500/15 to-teal-500/10'
    : isFamily ? 'from-purple-500/15 to-pink-500/10'
    : isEconomic ? 'from-orange-500/15 to-yellow-500/10'
    : 'from-slate-500/15 to-gray-500/10';

  const iconColor = isSafety ? 'text-amber-500' : isHealth ? 'text-blue-500' : isFamily ? 'text-purple-500' : isEconomic ? 'text-orange-500' : 'text-slate-500';

  return (
    <div className="space-y-6">
      <div className={`rounded-xl bg-gradient-to-br ${gradientClass} p-6 text-center`}>
        <Heart className={`w-10 h-10 ${iconColor} mx-auto`} />
        <h2 className="text-2xl font-bold mt-3">{step.title}</h2>
      </div>

      {step.body && (
        <p className="text-base text-muted-foreground leading-relaxed">{step.body}</p>
      )}

      {step.scripture_ref && (
        <blockquote className="border-l-4 border-primary/30 pl-4 py-2 bg-primary/5 rounded-r-lg">
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

function ScriptureSlide({ step }: { step: PrayerJourneyStep }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
      <div className="max-w-md space-y-6">
        <BookOpen className="w-8 h-8 text-amber-500/60 mx-auto" />
        {step.scripture_text && (
          <blockquote className="text-2xl font-serif italic leading-relaxed text-foreground/80">
            "{step.scripture_text}"
          </blockquote>
        )}
        {step.scripture_ref && (
          <p className="text-sm font-semibold text-amber-600 tracking-wide uppercase">{step.scripture_ref}</p>
        )}
        {step.body && (
          <p className="text-sm text-muted-foreground mt-4 border-t pt-4">{step.body}</p>
        )}
      </div>
    </div>
  );
}

function CustomSlide({ step }: { step: PrayerJourneyStep }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 p-6 text-center">
        <PenLine className="w-8 h-8 text-blue-500 mx-auto" />
        <h2 className="text-2xl font-bold mt-3">{step.title}</h2>
      </div>
      {step.body && (
        <p className="text-base text-muted-foreground leading-relaxed">{step.body}</p>
      )}
      {step.scripture_ref && (
        <blockquote className="border-l-4 border-primary/30 pl-4 py-2 bg-primary/5 rounded-r-lg">
          <p className="text-sm italic text-foreground/80">{step.scripture_text}</p>
          <cite className="text-xs not-italic font-medium text-primary mt-1 block">— {step.scripture_ref}</cite>
        </blockquote>
      )}
    </div>
  );
}

function ThanksgivingSlide({ step }: { step: PrayerJourneyStep }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-br from-green-500/15 to-emerald-500/10 p-8 text-center">
        <HandHeart className="w-12 h-12 text-green-600 mx-auto" />
        <h2 className="text-2xl font-bold mt-3">{step.title}</h2>
      </div>
      {step.body && (
        <p className="text-base text-muted-foreground leading-relaxed">{step.body}</p>
      )}
      {step.scripture_text && (
        <blockquote className="border-l-4 border-green-500/30 pl-4 py-2 bg-green-50/50 dark:bg-green-950/20 rounded-r-lg">
          <p className="text-sm italic text-foreground/80">{step.scripture_text}</p>
          <cite className="text-xs not-italic font-medium text-green-600 mt-1 block">— {step.scripture_ref}</cite>
        </blockquote>
      )}
    </div>
  );
}

function UserPrayerSlide({ step, journeyId, session, toast }: {
  step: PrayerJourneyStep;
  journeyId: string;
  session: any;
  toast: any;
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
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Prayer Submitted</h2>
        <p className="text-muted-foreground">Thank you for praying. Your prayer has been received.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <PenLine className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">{step.title || "Write Your Prayer"}</h2>
        {step.body && (
          <p className="text-muted-foreground mt-2">{step.body}</p>
        )}
      </div>

      <div className="space-y-3">
        <Input
          value={prayerTitle}
          onChange={(e) => setPrayerTitle(e.target.value)}
          placeholder="Prayer title (optional)"
        />
        <Textarea
          value={prayerBody}
          onChange={(e) => setPrayerBody(e.target.value)}
          placeholder="Write your prayer here..."
          rows={5}
          className="resize-none"
        />
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={!prayerBody.trim() || submitMutation.isPending || !session}
          className="w-full"
        >
          <Send className="w-4 h-4 mr-2" />
          {submitMutation.isPending ? "Submitting..." : "Submit Prayer"}
        </Button>
        {!session && (
          <p className="text-xs text-muted-foreground text-center">
            Sign in to submit your prayer.
          </p>
        )}
      </div>
    </div>
  );
}

function PrayerRequestSlide({ step, journeyId, session, toast, allSteps, guestName }: {
  step: PrayerJourneyStep;
  journeyId: string;
  session: any;
  toast: any;
  allSteps: PrayerJourneyStep[];
  guestName?: { first: string; last: string; display: string } | null;
}) {
  const [, setLocation] = useLocation();
  const [requestTitle, setRequestTitle] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [selectedScope, setSelectedScope] = useState("area"); // "area" or a church_id
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showGuestName, setShowGuestName] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");

  // Get churches from the journey steps for the scope picker
  const churchSteps = allSteps.filter(s => s.step_type === "church" && s.church_id);

  const submitRequest = async (guestName?: string) => {
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
    if (guestName) {
      payload.guest_name = guestName;
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
    const guestName = `${guestFirstName.trim()} ${lastInitial}`.trim();
    try {
      await submitRequest(guestName);
      setSubmitted(true);
      setShowGuestName(false);
      toast({ title: "Request submitted", description: "Your prayer request is being reviewed." });
    } catch {
      toast({ title: "Error", description: "Failed to submit request", variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Request Submitted</h2>
        <p className="text-muted-foreground">
          Your prayer request has been submitted for review. Others will be able to pray for you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center mx-auto mb-4">
          <HandHeart className="w-8 h-8 text-purple-600" />
        </div>
        <h2 className="text-xl font-semibold">Is there anything we can pray for you?</h2>
        <p className="text-muted-foreground mt-2">
          Share your prayer request and the community will lift you up in prayer.
        </p>
      </div>

      <div className="space-y-3">
          <Input
            value={requestTitle}
            onChange={(e) => setRequestTitle(e.target.value)}
            placeholder="What would you like prayer for?"
          />
          <Textarea
            value={requestBody}
            onChange={(e) => setRequestBody(e.target.value)}
            placeholder="Share more details (optional)"
            rows={3}
            className="resize-none"
          />

          {/* Scope selector — church or area-wide */}
          {churchSteps.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Where should this prayer request go?</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedScope === "area" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                  }`}
                  onClick={() => setSelectedScope("area")}
                >
                  Community-wide
                </button>
                {churchSteps.map(cs => (
                  <button
                    key={cs.church_id}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
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

          {/* Anonymous toggle */}
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded"
            />
            Submit anonymously
          </label>

          {/* Guest name input — only if no guestName captured and not logged in */}
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
                  className="text-sm"
                  autoFocus
                />
                <Input
                  value={guestLastName}
                  onChange={(e) => setGuestLastName(e.target.value)}
                  placeholder="Last name"
                  className="text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">Only your last initial will be shown publicly</p>
              <Button onClick={handleGuestSubmit} disabled={guestFirstName.trim().length < 2} className="w-full">
                <Send className="w-4 h-4 mr-2" /> Submit Prayer Request
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => {
                if (!session && !guestName) {
                  setShowGuestName(true);
                } else if (!session && guestName) {
                  // Use captured guest name
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
              className="w-full"
            >
              <Send className="w-4 h-4 mr-2" />
              {submitMutation.isPending ? "Submitting..." : "Submit Prayer Request"}
              {!session && guestName && (
                <span className="ml-1 text-xs opacity-75">as {guestName.display}</span>
              )}
            </Button>
          )}
        </div>
    </div>
  );
}

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

function CompletionScreen({ journey, steps, onBack, onClose, session }: {
  journey: PrayerJourney;
  steps: PrayerJourneyStep[];
  onBack: () => void;
  onClose: () => void;
  session: any;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const churchCount = steps.filter((s) => s.step_type === "church").length;
  const needsCount = steps.filter((s) => s.step_type === "community_need").length;

  const shareUrl = journey.share_token
    ? `${window.location.origin}/journey/${journey.share_token}`
    : window.location.href;

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

        {/* Login/Signup CTA for guests */}
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

        <div className="space-y-3">
          <Button onClick={() => {
            // Navigate to the platform map or national map
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
