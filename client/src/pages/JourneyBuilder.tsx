import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Church, Heart, PenLine, Sparkles, Eye, ArrowLeft, ArrowRight,
  Check, GripVertical, Trash2, EyeOff, Save, Plus, HandHeart, Map, X
} from "lucide-react";
import { BoundaryMapPicker } from "@/components/BoundaryMapPicker";
import type { PrayerJourney, PrayerJourneyStep } from "@shared/schema";

type BuilderStep = "location" | "churches" | "needs" | "custom" | "refine";

const BUILDER_STEPS: { key: BuilderStep; label: string; icon: React.ReactNode }[] = [
  { key: "location", label: "Location", icon: <MapPin className="w-4 h-4" /> },
  { key: "churches", label: "Churches", icon: <Church className="w-4 h-4" /> },
  { key: "needs", label: "Needs", icon: <Heart className="w-4 h-4" /> },
  { key: "custom", label: "Custom", icon: <PenLine className="w-4 h-4" /> },
  { key: "refine", label: "Refine", icon: <Sparkles className="w-4 h-4" /> },
];

export default function JourneyBuilder() {
  const [, params] = useRoute("/:platform/journey/:id/builder");
  const id = params?.id;
  const { session } = useAuth();
  const { platform: currentPlatform } = usePlatformContext();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState<BuilderStep>("location");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const platformPrefix = currentPlatform ? `/${currentPlatform.slug}` : "";
  const authHeaders = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  // Fetch journey
  const { data: journey, isLoading } = useQuery<PrayerJourney & { steps: PrayerJourneyStep[] }>({
    queryKey: ["journey", id],
    queryFn: async () => {
      const res = await fetch(`/api/journeys/${id}`, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to fetch journey");
      return res.json();
    },
    enabled: !!id && !!session,
  });

  useEffect(() => {
    if (journey) {
      setTitle(journey.title);
      setDescription(journey.description || "");
      setStartsAt(journey.starts_at ? journey.starts_at.split("T")[0] : "");
      setExpiresAt(journey.expires_at ? journey.expires_at.split("T")[0] : "");
    }
  }, [journey]);

  // Save journey metadata
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/journeys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          title,
          description: description || null,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey", id] });
      toast({ title: "Saved", description: "Journey updated." });
    },
  });

  // Add steps
  const addStepsMutation = useMutation({
    mutationFn: async (steps: any[]) => {
      const res = await fetch(`/api/journeys/${id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(steps),
      });
      if (!res.ok) throw new Error("Failed to add steps");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey", id] });
    },
  });

  // Toggle step exclusion
  const toggleStepMutation = useMutation({
    mutationFn: async ({ stepId, is_excluded }: { stepId: string; is_excluded: boolean }) => {
      const res = await fetch(`/api/journeys/${id}/steps/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ is_excluded }),
      });
      if (!res.ok) throw new Error("Failed to update step");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey", id] });
    },
  });

  // Delete step
  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const res = await fetch(`/api/journeys/${id}/steps/${stepId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to delete step");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey", id] });
    },
  });

  // Publish journey (saves first, then publishes, then goes to journey list)
  const publishMutation = useMutation({
    mutationFn: async () => {
      // Save first
      await fetch(`/api/journeys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          title,
          description: description || null,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      // Then publish
      const res = await fetch(`/api/journeys/${id}/publish`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to publish");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Published!", description: "Your prayer journey is now live." });
      setLocation(`${platformPrefix}/journeys`);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // AI suggestions
  const aiMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/journeys/${id}/ai-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      if (!res.ok) throw new Error("Failed to generate suggestions");
      return res.json();
    },
  });

  const handleAddAiSuggestions = async (suggestions: any[]) => {
    const currentMax = Math.max(0, ...(journey?.steps || []).map((s) => s.sort_order));
    const steps = suggestions.map((s, i) => ({
      ...s,
      sort_order: currentMax + i + 1,
      ai_generated: true,
    }));
    await addStepsMutation.mutateAsync(steps);
    toast({ title: "Added", description: `${steps.length} AI-generated steps added.` });
  };

  const currentStepIndex = BUILDER_STEPS.findIndex((s) => s.key === activeStep);
  const steps = journey?.steps || [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation(`${platformPrefix}/journeys`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold border-none bg-transparent p-0 h-auto focus-visible:ring-0"
                placeholder="Journey Title"
              />
              <div className="flex items-center gap-3 mt-1">
                <Input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="h-7 text-xs w-32 border-none bg-transparent p-0 focus-visible:ring-0"
                  placeholder="Start date"
                  title="Start date"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="h-7 text-xs w-32 border-none bg-transparent p-0 focus-visible:ring-0"
                  placeholder="End date"
                  title="Expiry date"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-1" /> Save
            </Button>
            <Button size="sm" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending || steps.filter(s => !s.is_excluded).length === 0}>
              Publish
            </Button>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="border-b bg-muted/30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex overflow-x-auto">
            {BUILDER_STEPS.map((step, i) => (
              <button
                key={step.key}
                onClick={() => setActiveStep(step.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  activeStep === step.key
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  i < currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : activeStep === step.key
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {i < currentStepIndex ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {activeStep === "location" && (
          <LocationStep
            journey={journey}
            authHeaders={authHeaders}
            journeyId={id!}
            onNext={() => setActiveStep("churches")}
            onSave={() => saveMutation.mutate()}
          />
        )}

        {activeStep === "churches" && (
          <ChurchesStep
            journey={journey}
            steps={steps}
            onAddSteps={(s) => addStepsMutation.mutateAsync(s)}
            onDeleteStep={(stepId: string) => deleteStepMutation.mutate(stepId)}
            onNext={() => setActiveStep("needs")}
            platformId={currentPlatform?.id}
            journeyId={id}
            authHeaders={authHeaders}
          />
        )}

        {activeStep === "needs" && (
          <NeedsStep
            journey={journey}
            steps={steps}
            onAddSteps={(s) => addStepsMutation.mutateAsync(s)}
            onDeleteStep={(stepId: string) => deleteStepMutation.mutate(stepId)}
            onNext={() => setActiveStep("custom")}
            platformId={currentPlatform?.id}
          />
        )}

        {activeStep === "custom" && (
          <CustomStep
            steps={steps}
            onAddSteps={(s) => addStepsMutation.mutateAsync(s)}
            onNext={() => setActiveStep("refine")}
          />
        )}

        {activeStep === "refine" && (
          <RefineStep
            steps={steps}
            journeyId={id!}
            authHeaders={authHeaders}
            aiMutation={aiMutation}
            onAddSuggestions={handleAddAiSuggestions}
            onToggle={(stepId: string, excluded: boolean) => toggleStepMutation.mutate({ stepId, is_excluded: excluded })}
            onDelete={(stepId: string) => deleteStepMutation.mutate(stepId)}
            onPublish={() => publishMutation.mutate()}
            isPublishing={publishMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

// --- Sub-components for each builder step ---

function LocationStep({ journey, authHeaders, journeyId, onNext, onSave }: any) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlaces, setSelectedPlaces] = useState<Array<{ id: string; name: string; type: string; state_code?: string }>>([]);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch boundary names for existing tract_ids on load
  const tractIds = journey?.tract_ids || [];
  const { data: existingBoundaries } = useQuery<any[]>({
    queryKey: ["journey-boundary-names", tractIds],
    queryFn: async () => {
      if (tractIds.length === 0) return [];
      const params = new URLSearchParams();
      tractIds.forEach((id: string) => params.append("ids", id));
      const res = await fetch(`/api/boundaries/by-ids?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: tractIds.length > 0 && selectedPlaces.length === 0,
  });

  // Populate selectedPlaces from fetched boundary data
  useEffect(() => {
    if (existingBoundaries && existingBoundaries.length > 0 && selectedPlaces.length === 0) {
      setSelectedPlaces(existingBoundaries.map((b: any) => ({
        id: b.id,
        name: b.name || b.id,
        type: b.type || "area",
        state_code: b.state_code,
      })));
    }
  }, [existingBoundaries]);

  // Autocomplete search — same API as FilterSidebar's "Filter by Place"
  const { data: searchResults = [] } = useQuery<any[]>({
    queryKey: ["/api/boundaries/search", searchQuery],
    queryFn: () => {
      if (!searchQuery || searchQuery.length < 2) return Promise.resolve([]);
      return fetch(`/api/boundaries/search?q=${encodeURIComponent(searchQuery)}&with_geometry=true`)
        .then((res) => (res.ok ? res.json() : []));
    },
    enabled: searchQuery.length >= 2,
  });

  const handleSelectPlace = async (place: any) => {
    const placeId = place.id; // Use the UUID primary key (not external_id) for boundary lookups
    if (selectedPlaces.some((p) => p.id === placeId)) return;

    const newPlace = { id: placeId, name: place.name, type: place.type, state_code: place.state_code };
    const updated = [...selectedPlaces, newPlace];
    setSelectedPlaces(updated);
    setSearchQuery("");
    setSearchOpen(false);

    // Save tract_ids to journey
    const tractIds = updated.map((p) => p.id);
    await fetch(`/api/journeys/${journeyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ tract_ids: tractIds }),
    });
    queryClient.invalidateQueries({ queryKey: ["journey", journeyId] });
    toast({ title: "Location added", description: `${place.name} added to journey.` });
  };

  const handleRemovePlace = async (placeId: string) => {
    const updated = selectedPlaces.filter((p) => p.id !== placeId);
    setSelectedPlaces(updated);
    const tractIds = updated.map((p) => p.id);
    await fetch(`/api/journeys/${journeyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ tract_ids: tractIds }),
    });
    queryClient.invalidateQueries({ queryKey: ["journey", journeyId] });
  };

  const handleMapPickerSave = async (boundaries: any[]) => {
    // Sync to whatever the map picker returns (handles both adds and removes)
    const updated = boundaries.map((b: any) => ({
      id: b.id,
      name: b.name || b.id,
      type: b.type || "area",
      state_code: b.state_code,
    }));
    setSelectedPlaces(updated);
    setMapPickerOpen(false);

    const tractIds = updated.map((p) => p.id);
    await fetch(`/api/journeys/${journeyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ tract_ids: tractIds }),
    });
    queryClient.invalidateQueries({ queryKey: ["journey", journeyId] });
    const added = boundaries.filter((b: any) => !selectedPlaces.some((p) => p.id === b.id)).length;
    const removed = selectedPlaces.filter((p) => !boundaries.some((b: any) => b.id === p.id)).length;
    const parts = [];
    if (added > 0) parts.push(`${added} added`);
    if (removed > 0) parts.push(`${removed} removed`);
    if (parts.length > 0) {
      toast({ title: "Areas updated", description: parts.join(", ") });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Select Location</h2>
        <p className="text-muted-foreground">
          Search for a city, township, or neighborhood — or select areas directly on the map.
        </p>
      </div>

      {/* Two options: search or map picker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-auto py-4 flex flex-col items-center gap-2"
          onClick={() => setSearchOpen(true)}
        >
          <MapPin className="h-5 w-5 text-primary" />
          <span className="font-medium">Search by Name</span>
          <span className="text-xs text-muted-foreground">Type a city, ZIP, or township</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 flex flex-col items-center gap-2"
          onClick={() => setMapPickerOpen(true)}
        >
          <Map className="h-5 w-5 text-primary" />
          <span className="font-medium">Select on Map</span>
          <span className="text-xs text-muted-foreground">Click boundaries to select areas</span>
        </Button>
      </div>

      {/* Map picker dialog */}
      <BoundaryMapPicker
        isOpen={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        onSave={handleMapPickerSave}
        initialSelectedIds={selectedPlaces.map((p) => p.id)}
        title="Select Prayer Journey Areas"
        description="Click on regions to select areas for this prayer journey. Zoom in to see smaller boundaries."
        pickerId="journey-location"
        selectionColor="#6366F1"
      />

      {/* Inline search panel — shown when "Search by Name" is clicked */}
      {searchOpen && (
        <Card>
          <CardContent className="p-3">
            <Command shouldFilter={false} className="rounded-lg border-0">
              <CommandInput
                placeholder="Search places..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                autoFocus
              />
              <CommandList>
                <CommandEmpty>
                  {searchQuery.length < 2
                    ? "Type at least 2 characters to search"
                    : "No places found"}
                </CommandEmpty>
                {searchResults.length > 0 && (
                  <CommandGroup>
                    {searchResults.map((result: any) => {
                      const resultId = result.id;
                      const isSelected = selectedPlaces.some((p) => p.id === resultId);
                      return (
                        <CommandItem
                          key={resultId}
                          value={resultId}
                          onSelect={() => handleSelectPlace(result)}
                        >
                          <span className="mr-2 w-5 h-4 flex items-center justify-center shrink-0">
                            {isSelected && <Check className="h-4 w-4" />}
                          </span>
                          <MapPin className="mr-2 h-4 w-4 opacity-50 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">
                              {result.name}
                              {result.state_code && (
                                <span className="text-muted-foreground">, {result.state_code}</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{result.type}</div>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
            <div className="flex justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected places */}
      {selectedPlaces.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Selected Areas ({selectedPlaces.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {selectedPlaces.map((place) => (
                <span key={place.id} className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary text-sm rounded-full">
                  <MapPin className="w-3 h-3" />
                  {place.name !== place.id ? place.name : place.id}
                  {place.state_code && <span className="text-muted-foreground">, {place.state_code}</span>}
                  <button
                    onClick={() => handleRemovePlace(place.id)}
                    className="ml-1 hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext}>
          Next: Churches <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function ChurchesStep({ journey, steps, onAddSteps, onDeleteStep, onNext, platformId, journeyId, authHeaders }: any) {
  const [nameFilter, setNameFilter] = useState("");
  const [showCount, setShowCount] = useState(50);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const existingChurchIds = new Set(steps.filter((s: any) => s.step_type === "church").map((s: any) => s.church_id));

  const tractIds = journey?.tract_ids || [];

  // Step 1: Fetch boundary geometries for the selected places
  const { data: boundaries = [] } = useQuery<any[]>({
    queryKey: ["journey-boundaries", tractIds],
    queryFn: async () => {
      if (tractIds.length === 0) return [];
      const params = new URLSearchParams();
      tractIds.forEach((id: string) => params.append("ids", id));
      const res = await fetch(`/api/boundaries/by-ids?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: tractIds.length > 0,
  });

  // Step 2: Query churches — use platform membership if available, otherwise viewport
  const pid = journey?.city_platform_id || platformId;
  const { data: churches = [], isLoading } = useQuery<any[]>({
    queryKey: ["journey-churches", pid, boundaries.map((b: any) => b.id)],
    queryFn: async () => {
      // If we have a platform context, fetch all platform churches using boundary bbox
      if (pid) {
        // Compute bbox from boundaries if available, otherwise use wide US bbox
        let bboxMinLng = -125, bboxMinLat = 24, bboxMaxLng = -66, bboxMaxLat = 50;
        if (boundaries.length > 0) {
          bboxMinLng = 180; bboxMinLat = 90; bboxMaxLng = -180; bboxMaxLat = -90;
          for (const b of boundaries) {
            const geom = b.geometry;
            if (!geom) continue;
            const extractCoords = (coords: any) => {
              if (typeof coords[0] === "number") {
                bboxMinLng = Math.min(bboxMinLng, coords[0]);
                bboxMinLat = Math.min(bboxMinLat, coords[1]);
                bboxMaxLng = Math.max(bboxMaxLng, coords[0]);
                bboxMaxLat = Math.max(bboxMaxLat, coords[1]);
              } else {
                for (const c of coords) extractCoords(c);
              }
            };
            extractCoords(geom.coordinates);
          }
          // Expand bbox slightly to catch edge churches
          bboxMinLng -= 0.5; bboxMinLat -= 0.5; bboxMaxLng += 0.5; bboxMaxLat += 0.5;
        }
        const res = await fetch(`/api/churches/in-viewport?minLng=${bboxMinLng}&minLat=${bboxMinLat}&maxLng=${bboxMaxLng}&maxLat=${bboxMaxLat}&limit=2000&platformId=${encodeURIComponent(pid)}`);
        if (!res.ok) return [];
        return res.json();
      }

      // Fallback: use bounding box from boundary geometries
      if (boundaries.length === 0) return [];
      let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
      for (const b of boundaries) {
        const geom = b.geometry;
        if (!geom) continue;
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
        extractCoords(geom.coordinates);
      }
      if (minLng > maxLng) return [];

      const params = new URLSearchParams({
        minLng: String(minLng),
        minLat: String(minLat),
        maxLng: String(maxLng),
        maxLat: String(maxLat),
        limit: "500",
      });

      const res = await fetch(`/api/churches/in-viewport?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!pid || boundaries.length > 0,
  });

  // Filter by name locally
  const filteredChurches = churches.filter((c: any) => {
    if (existingChurchIds.has(c.id)) return false;
    if (!nameFilter.trim()) return true;
    const q = nameFilter.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q)) ||
      (c.denomination && c.denomination.toLowerCase().includes(q))
    );
  });

  // Track which churches have had their prayers fetched
  const [churchPrayers, setChurchPrayers] = useState<Record<string, any[]>>({});
  const [expandedChurch, setExpandedChurch] = useState<string | null>(null);

  const handleAddChurch = async (church: any) => {
    const currentMax = Math.max(0, ...steps.map((s: any) => s.sort_order));
    await onAddSteps([{
      step_type: "church",
      title: `Pray for ${church.name}`,
      body: `Lift up ${church.name} in prayer. May God strengthen their ministry and use them to serve this community.`,
      church_id: church.id,
      sort_order: currentMax + 1,
    }]);
    // Fetch existing prayer needs for this church
    fetchChurchPrayers(church.id);
    setExpandedChurch(church.id);
  };

  const fetchChurchPrayers = async (churchId: string) => {
    if (churchPrayers[churchId]) return;
    try {
      const res = await fetch(`/api/churches/${churchId}/prayers`);
      if (res.ok) {
        const data = await res.json();
        // Response format: { prayers: [...], approved: boolean, pending_count, is_admin }
        const prayers = data.prayers || data || [];
        const approved = Array.isArray(prayers) ? prayers.filter((p: any) => p.status === "approved") : [];
        setChurchPrayers(prev => ({ ...prev, [churchId]: approved }));
      }
    } catch { /* ignore */ }
  };

  const handleAddChurchPrayer = async (prayer: any, churchId: string, churchName: string) => {
    // Find the church step to append this prayer need to
    const churchStep = steps.find((s: any) => s.step_type === "church" && s.church_id === churchId);
    if (!churchStep) return;

    // Check if already included in the church step body
    const prayerTitle = prayer.title || "Prayer need";
    if (churchStep.body?.includes(prayerTitle)) {
      toast({ title: "Already included", description: `"${prayerTitle}" is already part of this church's prayer step.` });
      return;
    }

    try {
      // Append the prayer need to the church step's body
      const separator = "\n\n---\n\n";
      const prayerSection = `Prayer Need: ${prayerTitle}${prayer.body ? `\n${prayer.body}` : ""}`;
      const updatedBody = churchStep.body
        ? `${churchStep.body}${separator}${prayerSection}`
        : prayerSection;

      await fetch(`/api/journeys/${journeyId}/steps/${churchStep.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ body: updatedBody }),
      });
      queryClient.invalidateQueries({ queryKey: ["journey", journeyId] });
      toast({ title: "Added", description: `"${prayerTitle}" added to ${churchName}'s prayer step.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to add prayer need", variant: "destructive" });
    }
  };

  const addedChurchSteps = steps.filter((s: any) => s.step_type === "church");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Select Churches</h2>
        <p className="text-muted-foreground">
          {tractIds.length > 0
            ? `Showing churches within your selected area${churches.length > 0 ? ` (${churches.length} found)` : ""}.`
            : "Go back to the Location step to select an area first."}
        </p>
      </div>

      {addedChurchSteps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Added Churches ({addedChurchSteps.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {addedChurchSteps.map((step: any) => {
                const prayers = churchPrayers[step.church_id] || [];
                // Auto-fetch prayers for this church if not already loaded
                if (!churchPrayers[step.church_id]) {
                  fetchChurchPrayers(step.church_id);
                }
                return (
                  <div key={step.id} className="border-b last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Church className="w-4 h-4 text-primary" />
                      <span className="flex-1 font-medium">{step.title}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onDeleteStep(step.id)}
                        title="Remove church"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {/* Always show prayer needs below the church */}
                    {prayers.length > 0 && (
                      <div className="ml-6 mt-2 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Existing prayer needs:</p>
                        {prayers.map((prayer: any) => {
                          // Check if this prayer need is already embedded in the church step body
                          const prayerTitle = prayer.title || "Prayer need";
                          const isAdded = step.body?.includes(prayerTitle);

                          return (
                            <div key={prayer.id} className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${isAdded ? "bg-primary/10" : "bg-muted/50"}`}>
                              <Heart className={`w-3 h-3 flex-shrink-0 ${isAdded ? "text-primary" : "text-red-400"}`} />
                              <span className="flex-1">{prayer.title}</span>
                              {isAdded ? (
                                <span className="text-xs text-primary font-medium flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Included
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-5 text-xs px-2"
                                  onClick={() => handleAddChurchPrayer(prayer, step.church_id, step.title.replace("Pray for ", ""))}
                                >
                                  + Add to journey
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Name search filter */}
      {churches.length > 0 && (
        <Input
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder="Filter churches by name..."
        />
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Loading churches in your area...</p>
      ) : filteredChurches.length > 0 ? (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filteredChurches.slice(0, showCount).map((church: any) => (
            <Card key={church.id} className="cursor-pointer hover:shadow-sm" onClick={() => handleAddChurch(church)}>
              <CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{church.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[church.city, church.state].filter(Boolean).join(", ")}
                    {church.denomination && ` · ${church.denomination}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleAddChurch(church); }}>Add</Button>
              </CardContent>
            </Card>
          ))}
          {filteredChurches.length > showCount && (
            <Button
              variant="ghost"
              className="w-full text-sm"
              onClick={() => setShowCount((prev) => prev + 50)}
            >
              Show more ({filteredChurches.length - showCount} remaining)
            </Button>
          )}
        </div>
      ) : tractIds.length > 0 && !isLoading ? (
        <p className="text-muted-foreground">
          {nameFilter ? "No churches match your search." : "No churches found in this area."}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={onNext}>
          Next: Community Needs <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function NeedsStep({ journey, steps, onAddSteps, onDeleteStep, onNext, platformId }: any) {
  const existingMetrics = new Set(steps.filter((s: any) => s.step_type === "community_need").map((s: any) => s.metric_key));
  const tractIds = journey?.tract_ids || [];

  // Fetch boundary geometries (cached — same query as ChurchesStep)
  const { data: boundaries = [] } = useQuery<any[]>({
    queryKey: ["journey-boundaries", tractIds],
    queryFn: async () => {
      if (tractIds.length === 0) return [];
      const params = new URLSearchParams();
      tractIds.forEach((id: string) => params.append("ids", id));
      const res = await fetch(`/api/boundaries/by-ids?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: tractIds.length > 0,
  });

  // Fetch area-specific health data using the prompts-for-area endpoint
  // This returns needs with severity levels, just like on church profiles
  const { data: areaNeeds = [], isLoading } = useQuery<any[]>({
    queryKey: ["journey-area-needs", boundaries.map((b: any) => b.id)],
    queryFn: async () => {
      if (boundaries.length === 0) return [];
      // Compute center point from boundaries for the prompts-for-area query
      let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
      for (const b of boundaries) {
        const geom = b.geometry;
        if (!geom) continue;
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
        extractCoords(geom.coordinates);
      }
      const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;

      const res = await fetch(
        `/api/prayers/prompts-for-area?bbox=${encodeURIComponent(bbox)}&limit=30&mode=journey`
      );
      if (!res.ok) return [];
      const data = await res.json();
      // The prompts-for-area returns { prompts: [...], area_summary: {...} }
      return data.prompts || [];
    },
    enabled: boundaries.length > 0,
  });

  const handleAddNeed = async (need: any) => {
    const currentMax = Math.max(0, ...steps.map((s: any) => s.sort_order));
    const value = need.value;
    const displayValue = value ? ` (${Math.round(value * 10) / 10}%)` : "";
    await onAddSteps([{
      step_type: "community_need",
      title: `Pray for ${need.metric_display}`,
      body: need.prayer_text || `${need.metric_display}${displayValue} is a significant need in this community. Pray for healing, resources, and hope for those affected.`,
      metric_key: need.metric_key,
      sort_order: currentMax + 1,
    }]);
  };

  // Only show community needs with a metric_key (not church-specific prayer requests)
  const addedNeedSteps = steps.filter((s: any) => s.step_type === "community_need" && s.metric_key);
  const filteredNeeds = areaNeeds.filter((n: any) => !existingMetrics.has(n.metric_key));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Community Needs</h2>
        <p className="text-muted-foreground">
          {tractIds.length > 0
            ? "Priority community needs identified in your selected area, ranked by severity."
            : "Go back to the Location step to select an area first."}
        </p>
      </div>

      {addedNeedSteps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Added Needs ({addedNeedSteps.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {addedNeedSteps.map((step: any) => (
                <div key={step.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-500" />
                    <span>{step.title}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onDeleteStep?.(step.id)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Analyzing community needs in your area...</p>
      ) : filteredNeeds.length > 0 ? (
        <div className="space-y-2">
          {filteredNeeds.map((need: any, i: number) => {
            const name = need.metric_display || need.metric_key;
            const estimate = need.value;
            const level = need.severity;
            const isCritical = level === "critical" || level === "very_critical";

            return (
              <Card
                key={need.metricKey || need.metric_key || i}
                className="cursor-pointer hover:shadow-sm"
                onClick={() => handleAddNeed(need)}
              >
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isCritical ? "bg-red-500" : "bg-amber-500"
                    }`} />
                    <div>
                      <p className="font-medium text-sm">
                        {name}
                        {estimate && (
                          <span className={`ml-2 text-xs font-normal ${isCritical ? "text-red-600" : "text-amber-600"}`}>
                            {Math.round(estimate * 10) / 10}%
                          </span>
                        )}
                      </p>
                      {level && (
                        <p className={`text-xs ${isCritical ? "text-red-500" : "text-amber-500"}`}>
                          {isCritical ? "Critical" : "Concerning"}
                        </p>
                      )}
                      {need.need_description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{need.need_description}</p>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleAddNeed(need); }}>Add</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : tractIds.length > 0 && !isLoading ? (
        <p className="text-muted-foreground">No significant community needs identified in this area.</p>
      ) : null}

      {/* Regional & Global Prayer Requests */}
      <RegionalPrayerRequests steps={steps} onAddSteps={onAddSteps} />

      <div className="flex justify-end">
        <Button onClick={onNext}>
          Next: Custom Focuses <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function RegionalPrayerRequests({ steps, onAddSteps }: any) {
  const { data: regionalPrayers = [], isLoading } = useQuery<any[]>({
    queryKey: ["regional-prayer-requests"],
    queryFn: async () => {
      // Fetch approved prayers that are regional/global (not church-specific)
      const res = await fetch("/api/prayers/visible?global=true");
      if (!res.ok) return [];
      const data = await res.json();
      // Filter to non-church prayers (global or regional)
      return (data || []).filter((p: any) => !p.church_id || p.global);
    },
  });

  const existingTitles = new Set(steps.map((s: any) => s.title));

  const handleAdd = async (prayer: any) => {
    if (existingTitles.has(prayer.title)) return;
    const currentMax = Math.max(0, ...steps.map((s: any) => s.sort_order));
    await onAddSteps([{
      step_type: "custom",
      title: prayer.title,
      body: prayer.body || prayer.title,
      sort_order: currentMax + 1,
    }]);
  };

  if (isLoading || regionalPrayers.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">Community Prayer Requests</h3>
      <p className="text-xs text-muted-foreground">Prayer requests submitted by the community.</p>
      {regionalPrayers.map((prayer: any) => {
        const isAdded = existingTitles.has(prayer.title);
        return (
          <Card key={prayer.id} className={isAdded ? "opacity-50" : "cursor-pointer hover:shadow-sm"} onClick={() => !isAdded && handleAdd(prayer)}>
            <CardContent className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HandHeart className="w-4 h-4 text-purple-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">{prayer.title}</p>
                  {prayer.body && <p className="text-xs text-muted-foreground line-clamp-1">{prayer.body}</p>}
                </div>
              </div>
              {isAdded ? (
                <span className="text-xs text-primary flex items-center gap-1"><Check className="w-3 h-3" /> Added</span>
              ) : (
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleAdd(prayer); }}>Add</Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CustomStep({ steps, onAddSteps, onNext }: any) {
  const [customTitle, setCustomTitle] = useState("");
  const [customBody, setCustomBody] = useState("");

  const handleAdd = async () => {
    if (!customTitle.trim()) return;
    const currentMax = Math.max(0, ...steps.map((s: any) => s.sort_order));
    await onAddSteps([{
      step_type: "custom",
      title: customTitle,
      body: customBody || null,
      sort_order: currentMax + 1,
    }]);
    setCustomTitle("");
    setCustomBody("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Custom Prayer Focuses</h2>
        <p className="text-muted-foreground">
          Add your own prayer prompts and focuses to the journey.
        </p>
      </div>

      {steps.filter((s: any) => s.step_type === "custom").length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Your Custom Steps</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {steps.filter((s: any) => s.step_type === "custom").map((step: any) => (
                <div key={step.id} className="flex items-center gap-2 text-sm">
                  <PenLine className="w-4 h-4 text-blue-500" />
                  <span>{step.title}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Prayer focus title"
          />
          <Textarea
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
            placeholder="Prayer prompt (optional)"
            rows={3}
          />
          <Button onClick={handleAdd} disabled={!customTitle.trim()}>
            Add Custom Focus
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onNext}>
          Next: AI Suggestions <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function RefineStep({ steps, journeyId, authHeaders, aiMutation, onAddSuggestions, onToggle, onDelete, onPublish, isPublishing }: any) {
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editScriptureRef, setEditScriptureRef] = useState("");
  const [editScriptureText, setEditScriptureText] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [regeneratingStep, setRegeneratingStep] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const activeSteps = steps.filter((s: any) => !s.is_excluded);

  // Group steps by type
  const groups = [
    { key: "church", label: "Churches", icon: <Church className="w-4 h-4" />, steps: steps.filter((s: any) => s.step_type === "church") },
    { key: "community_need", label: "Community Needs", icon: <Heart className="w-4 h-4" />, steps: steps.filter((s: any) => s.step_type === "community_need") },
    { key: "other", label: "Custom & Other", icon: <PenLine className="w-4 h-4" />, steps: steps.filter((s: any) => !["church", "community_need"].includes(s.step_type)) },
  ].filter(g => g.steps.length > 0);

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    setCollapsedGroups(next);
  };

  const startEditing = (step: any) => {
    setEditingStep(step.id);
    setEditTitle(step.title || "");
    setEditBody(step.body || "");
    setEditScriptureRef(step.scripture_ref || "");
    setEditScriptureText(step.scripture_text || "");
  };

  const saveEdit = async (stepId: string) => {
    await fetch(`/api/journeys/${journeyId}/steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        title: editTitle,
        body: editBody,
        scripture_ref: editScriptureRef || null,
        scripture_text: editScriptureText || null,
      }),
    });
    queryClient.invalidateQueries({ queryKey: ["journey", journeyId] });
    setEditingStep(null);
    toast({ title: "Step updated" });
  };

  const regenerateForStep = async (step: any) => {
    setRegeneratingStep(step.id);
    try {
      const res = await fetch(`/api/journeys/${journeyId}/ai-suggest-single`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ step_type: step.step_type, title: step.title, church_name: step.title?.replace("Pray for ", "") }),
      });
      if (res.ok) {
        const suggestion = await res.json();
        // Update the step in place with the AI suggestion
        await fetch(`/api/journeys/${journeyId}/steps/${step.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            body: suggestion.body || step.body,
            scripture_ref: suggestion.scripture_ref || step.scripture_ref,
            scripture_text: suggestion.scripture_text || step.scripture_text,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["journey", journeyId] });
        toast({ title: "Prayer & scripture refreshed" });
      } else {
        // Fallback: generate a simple suggestion
        toast({ title: "AI unavailable", description: "Edit manually or try again later." });
      }
    } catch {
      toast({ title: "Could not regenerate", description: "Try editing manually." });
    }
    setRegeneratingStep(null);
  };

  const handleAddSelected = () => {
    if (!aiMutation.data) return;
    const suggestions = aiMutation.data.filter((_: any, i: number) => selected.has(i));
    onAddSuggestions(suggestions);
    setSelected(new Set());
  };

  const renderStepCard = (step: any) => (
    <div key={step.id} className={`border rounded-lg p-3 ${step.is_excluded ? "opacity-40" : ""}`}>
      {editingStep === step.id ? (
        <div className="space-y-3">
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" className="text-sm" />
          <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} placeholder="Prayer prompt" rows={3} className="text-sm" />
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Input value={editScriptureRef} onChange={(e) => setEditScriptureRef(e.target.value)} placeholder="e.g. Jeremiah 29:7" className="text-sm" />
            <Input value={editScriptureText} onChange={(e) => setEditScriptureText(e.target.value)} placeholder="Verse text" className="text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveEdit(step.id)}><Save className="w-3 h-3 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingStep(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{step.title || "Untitled"}</p>
            {step.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{step.body}</p>}
            {step.scripture_ref && (
              <p className="text-xs text-primary mt-1 italic">
                {step.scripture_ref}{step.scripture_text ? `: ${step.scripture_text}` : ""}
              </p>
            )}
            {!step.scripture_ref && !step.is_excluded && (
              <p className="text-xs text-muted-foreground/40 mt-1 italic">No scripture yet</p>
            )}
          </div>
          <div className="flex gap-0.5 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => regenerateForStep(step)} disabled={regeneratingStep === step.id} title="Regenerate prayer & scripture">
              {regeneratingStep === step.id ? <span className="w-4 h-4 animate-spin">...</span> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => startEditing(step)} title="Edit"><PenLine className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" onClick={() => onToggle(step.id, !step.is_excluded)} title={step.is_excluded ? "Include" : "Exclude"}>
              {step.is_excluded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(step.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Refine Your Journey</h2>
        <p className="text-sm text-muted-foreground">
          Review and edit each step. Use the sparkle button on any card to regenerate its prayer and scripture,
          or generate suggestions for all steps at once below.
        </p>
      </div>

      {/* Grouped Steps */}
      {groups.map(group => {
        const isCollapsed = collapsedGroups.has(group.key);
        const activeCount = group.steps.filter((s: any) => !s.is_excluded).length;
        return (
          <div key={group.key} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {group.icon}
                <span className="text-sm font-semibold">{group.label}</span>
                <span className="text-xs text-muted-foreground">({activeCount} active)</span>
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
            </button>
            {!isCollapsed && (
              <div className="p-2 space-y-2">
                {group.steps.map(renderStepCard)}
              </div>
            )}
          </div>
        );
      })}

      {steps.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No steps added yet. Go back and add churches and community needs.
        </p>
      )}

      {/* Bulk AI Generate */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Generate for All Steps</p>
              <p className="text-xs text-muted-foreground mt-1">
                Creates new prayer prompts and scripture suggestions for every step.
                These appear as suggestions you can select and add — they won't replace your existing content.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button onClick={() => aiMutation.mutate()} disabled={aiMutation.isPending} variant="outline" size="sm">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  {aiMutation.isPending ? "Generating..." : "Generate Suggestions"}
                </Button>
              </div>
            </div>
          </div>

          {aiMutation.data && (
            <div className="mt-4 space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Select suggestions to add as new steps:</p>
              {aiMutation.data.map((suggestion: any, i: number) => (
                <div
                  key={i}
                  className={`p-2.5 rounded border cursor-pointer transition-colors text-sm ${
                    selected.has(i) ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"
                  }`}
                  onClick={() => { const next = new Set(selected); if (next.has(i)) next.delete(i); else next.add(i); setSelected(next); }}
                >
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={selected.has(i)} readOnly className="mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{suggestion.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{suggestion.body}</p>
                      {suggestion.scripture_ref && (
                        <p className="text-xs text-primary mt-1 italic">{suggestion.scripture_ref}: {suggestion.scripture_text}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {selected.size > 0 && (
                <Button onClick={handleAddSelected} size="sm">Add {selected.size} Selected</Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish */}
      <div className="flex items-center justify-between pt-4 border-t">
        <p className="text-sm text-muted-foreground">
          {activeSteps.length} step{activeSteps.length !== 1 ? "s" : ""} in journey
        </p>
        <Button onClick={onPublish} disabled={isPublishing || activeSteps.length === 0} size="lg">
          {isPublishing ? "Publishing..." : "Publish Journey"}
        </Button>
      </div>
    </div>
  );
}

