import { useState, useEffect, useRef, useCallback } from "react";
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
  Check, GripVertical, Trash2, EyeOff, Save, Plus, HandHeart, Map, X, ChevronRight,
  ImagePlus, Loader2, Navigation
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { uploadMedia } from "@/lib/upload";
import { BoundaryMapPicker } from "@/components/BoundaryMapPicker";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
            platform={currentPlatform}
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

function LocationStep({ journey, authHeaders, journeyId, onNext, onSave, platform }: any) {
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
        initialCenter={platform?.default_center_lat && platform?.default_center_lng
          ? [platform.default_center_lng, platform.default_center_lat]
          : undefined}
        initialZoom={platform?.default_zoom || undefined}
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
        // Compute bbox from selected boundaries — only query when boundaries are loaded
        if (boundaries.length === 0) return [];
        let bboxMinLng = 180, bboxMinLat = 90, bboxMaxLng = -180, bboxMaxLat = -90;
        {
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
          // Expand bbox slightly to catch edge churches (~1 mile buffer)
          bboxMinLng -= 0.02; bboxMinLat -= 0.02; bboxMaxLng += 0.02; bboxMaxLat += 0.02;
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
    enabled: (!!pid && (tractIds.length === 0 || boundaries.length > 0)) || boundaries.length > 0,
  });

  // Filter by name locally
  const filteredChurches = churches.filter((c: any) => {
    if (existingChurchIds.has(c.id)) return false;
    if (!nameFilter.trim()) return true;
    const q = nameFilter.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
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
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{church.name}</p>
                  {church.address && (
                    <p className="text-sm text-muted-foreground truncate">{church.address}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {[church.city, church.state].filter(Boolean).join(", ")}
                    {church.denomination && ` · ${church.denomination}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="ml-2 shrink-0" onClick={(e) => { e.stopPropagation(); handleAddChurch(church); }}>Add</Button>
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

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  place_name: string;
}

function LocationPicker({ value, onChange }: { value: LocationData | null; onChange: (loc: LocationData | null) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 3 || !MAPBOX_TOKEN) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const encoded = encodeURIComponent(q);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&types=place,address,poi,neighborhood&limit=5`
      );
      if (!res.ok) throw new Error("Geocoding failed");
      const data = await res.json();
      setSuggestions(data.features || []);
      setOpen((data.features || []).length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(query), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query, fetchSuggestions]);

  // Initialize / update map preview when location is selected
  useEffect(() => {
    if (!value || !mapContainerRef.current || !MAPBOX_TOKEN) return;

    if (!mapRef.current) {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: [value.longitude, value.latitude],
        zoom: 14,
        interactive: false,
      });
      markerRef.current = new mapboxgl.Marker({ color: "#3b82f6" })
        .setLngLat([value.longitude, value.latitude])
        .addTo(mapRef.current);
    } else {
      mapRef.current.setCenter([value.longitude, value.latitude]);
      markerRef.current?.setLngLat([value.longitude, value.latitude]);
    }

    return () => {};
  }, [value]);

  // Clean up map on unmount
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const handleSelect = (feature: any) => {
    const [lng, lat] = feature.center;
    onChange({
      latitude: lat,
      longitude: lng,
      address: feature.text || feature.place_name,
      place_name: feature.place_name,
    });
    setQuery(feature.place_name);
    setOpen(false);
    setSuggestions([]);
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
    setSuggestions([]);
    mapRef.current?.remove();
    mapRef.current = null;
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-1.5">
        <Navigation className="w-3.5 h-3.5" /> Location (optional)
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (value) onChange(null); }}
              placeholder="Search for a place or address..."
              onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {value && !loading && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.preventDefault(); handleClear(); }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList>
              <CommandEmpty>No places found.</CommandEmpty>
              <CommandGroup>
                {suggestions.map((s, i) => (
                  <CommandItem
                    key={i}
                    value={s.place_name}
                    onSelect={() => handleSelect(s)}
                    className="cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">{s.place_name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <div
          ref={mapContainerRef}
          className="h-40 rounded-md overflow-hidden border"
          style={{ minHeight: 160 }}
        />
      )}
    </div>
  );
}

function ImageUploadField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadMedia(file, (p) => setProgress(p.progress));
      if (result?.url) {
        onChange(result.url);
      }
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-1.5">
        <ImagePlus className="w-3.5 h-3.5" /> Image (optional)
      </label>
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Step image"
            className="h-32 rounded-md border object-cover"
          />
          <button
            className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5 shadow-sm hover:bg-destructive hover:text-destructive-foreground transition-colors"
            onClick={() => onChange(null)}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Uploading {progress}%
              </>
            ) : (
              <>
                <ImagePlus className="w-4 h-4 mr-1" />
                Upload Image
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

const CUSTOM_STEP_TYPES = [
  { value: "custom", label: "Custom" },
  { value: "thanksgiving", label: "Thanksgiving" },
  { value: "prayer_request", label: "Prayer Request" },
  { value: "scripture", label: "Scripture" },
] as const;

function CustomStep({ steps, onAddSteps, onNext }: any) {
  const [customTitle, setCustomTitle] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [stepType, setStepType] = useState<string>("custom");
  const [location, setLocation] = useState<LocationData | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!customTitle.trim()) return;
    const currentMax = Math.max(0, ...steps.map((s: any) => s.sort_order));

    const metadata: Record<string, any> = {};
    if (location) {
      metadata.latitude = location.latitude;
      metadata.longitude = location.longitude;
      metadata.address = location.address;
      metadata.place_name = location.place_name;
    }
    if (imageUrl) {
      metadata.image_url = imageUrl;
    }

    await onAddSteps([{
      step_type: stepType,
      title: customTitle,
      body: customBody || null,
      sort_order: currentMax + 1,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    }]);
    setCustomTitle("");
    setCustomBody("");
    setStepType("custom");
    setLocation(null);
    setImageUrl(null);
  };

  const customStepTypes = new Set(["custom", "thanksgiving", "prayer_request", "scripture"]);
  const customSteps = steps.filter((s: any) => customStepTypes.has(s.step_type));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Prayer Steps</h2>
        <p className="text-muted-foreground">
          Add thanksgiving, prayer requests, scripture, and custom prayer focuses to the journey.
        </p>
      </div>

      {customSteps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Your Custom Steps</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {customSteps.map((step: any) => (
                <div key={step.id} className="flex items-start gap-2 text-sm">
                  <PenLine className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium">{step.title}</span>
                    {step.metadata?.place_name && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {step.metadata.place_name}
                      </div>
                    )}
                    {step.metadata?.image_url && (
                      <img
                        src={step.metadata.image_url}
                        alt=""
                        className="h-16 rounded mt-1 object-cover"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-2">
            {CUSTOM_STEP_TYPES.map((t) => (
              <Button
                key={t.value}
                size="sm"
                variant={stepType === t.value ? "default" : "outline"}
                onClick={() => setStepType(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <Input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={stepType === "scripture" ? "Scripture reference" : stepType === "thanksgiving" ? "Thanksgiving title" : stepType === "prayer_request" ? "Prayer request title" : "Prayer focus title"}
          />
          <Textarea
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
            placeholder="Prayer prompt (optional)"
            rows={3}
          />

          <LocationPicker value={location} onChange={setLocation} />
          <ImageUploadField value={imageUrl} onChange={setImageUrl} />

          <Button onClick={handleAdd} disabled={!customTitle.trim()}>
            Add {CUSTOM_STEP_TYPES.find(t => t.value === stepType)?.label || "Custom"} Step
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [regeneratingStep, setRegeneratingStep] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const activeSteps = steps.filter((s: any) => !s.is_excluded);

  const typeBadgeColors: Record<string, string> = {
    church: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    community_need: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    custom: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    scripture: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    thanksgiving: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    prayer_request: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };
  const typeLabels: Record<string, string> = {
    church: "Church", community_need: "Community Need", custom: "Custom",
    scripture: "Scripture", thanksgiving: "Thanksgiving", prayer_request: "Prayer Request",
  };

  // Sort steps by sort_order for display
  const sortedSteps = [...steps].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
  const stepIds = sortedSteps.map((s: any) => s.id);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stepIds.indexOf(active.id as string);
    const newIndex = stepIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(stepIds, oldIndex, newIndex);

    // Optimistically update the cache so UI doesn't snap back
    queryClient.setQueryData(["journey", journeyId], (old: any) => {
      if (!old?.steps) return old;
      const reordered = newOrder.map((id, i) => {
        const step = old.steps.find((s: any) => s.id === id);
        return step ? { ...step, sort_order: i } : null;
      }).filter(Boolean);
      return { ...old, steps: reordered };
    });

    // Save to server
    try {
      await fetch(`/api/journeys/${journeyId}/steps/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ step_ids: newOrder }),
      });
    } catch {
      // Revert on failure
      queryClient.invalidateQueries({ queryKey: ["journey", journeyId] });
    }
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
        body: JSON.stringify({ step_type: step.step_type, title: step.title, church_name: step.title?.replace("Pray for ", ""), church_id: step.church_id }),
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

  // Match AI suggestions to steps by church_id or metric_key
  const getSuggestionForStep = (step: any): any | null => {
    if (!aiMutation.data) return null;
    return aiMutation.data.find((s: any) => {
      if (step.step_type === 'church' && s.church_id === step.church_id) return true;
      if (step.step_type === 'community_need' && s.metric_key === step.metric_key) return true;
      return false;
    });
  };

  // Suggestions that don't match any existing step (truly new)
  const unmatchedSuggestions = (aiMutation.data || []).filter((s: any) => {
    return !steps.some((step: any) => {
      if (step.step_type === 'church' && s.church_id === step.church_id) return true;
      if (step.step_type === 'community_need' && s.metric_key === step.metric_key) return true;
      return false;
    });
  });

  const handleAddSelected = () => {
    if (unmatchedSuggestions.length === 0) return;
    const toAdd = unmatchedSuggestions.filter((_: any, i: number) => selected.has(i));
    onAddSuggestions(toAdd);
    setSelected(new Set());
  };

  const applyInlineSuggestion = async (step: any, suggestion: any) => {
    await fetch(`/api/journeys/${journeyId}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        body: suggestion.body,
        scripture_ref: suggestion.scripture_ref || null,
        scripture_text: suggestion.scripture_text || null,
      }),
    });
    queryClient.invalidateQueries({ queryKey: ["journey", journeyId] });
    toast({ title: "Updated with AI suggestion" });
  };

  function SortableStepCard({ step }: { step: any }) {
    const suggestion = getSuggestionForStep(step);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.5 : undefined };
    const badgeColor = typeBadgeColors[step.step_type] || "bg-muted text-muted-foreground";

    return (
      <div ref={setNodeRef} style={style} className={`border rounded-lg overflow-hidden ${step.is_excluded ? "opacity-40 border-dashed" : ""}`}>
        {step.is_excluded && (
          <div className="bg-muted/50 px-3 py-1 text-xs text-muted-foreground flex items-center justify-between">
            <span>Excluded from journey</span>
            <Button variant="ghost" size="sm" className="h-5 text-xs" onClick={() => onToggle(step.id, false)}>Restore</Button>
          </div>
        )}
        <div className="p-3">
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
              <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1 shrink-0">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>
                    {typeLabels[step.step_type] || step.step_type}
                  </span>
                </div>
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

        {/* Inline AI suggestion */}
        {suggestion && editingStep !== step.id && (
          <div className="border-t bg-amber-50/50 dark:bg-amber-950/20 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">AI Suggestion</p>
                <p className="text-xs text-muted-foreground mt-0.5">{suggestion.body}</p>
                {suggestion.scripture_ref && (
                  <p className="text-xs text-primary mt-1 italic">{suggestion.scripture_ref}: {suggestion.scripture_text}</p>
                )}
              </div>
              <Button size="sm" variant="outline" className="shrink-0 text-xs h-7" onClick={() => applyInlineSuggestion(step, suggestion)}>
                Use This
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Refine Your Journey</h2>
        <p className="text-sm text-muted-foreground">
          Review and edit each step. Use the sparkle button on any card to regenerate its prayer and scripture,
          or generate suggestions for all steps at once below.
        </p>
      </div>

      {/* Sortable Steps — flat list, drag across categories */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {sortedSteps.map((step: any) => (
              <SortableStepCard key={step.id} step={step} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {steps.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No steps added yet. Go back and add churches and community needs.
        </p>
      )}

      {/* AI Generate All — updates existing cards in place */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
        <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">AI Assist</p>
          <p className="text-xs text-muted-foreground">
            Generates fresh prayers and scripture for each step above. Suggestions appear below each card — you choose whether to apply them.
          </p>
        </div>
        <Button onClick={() => aiMutation.mutate()} disabled={aiMutation.isPending} variant="outline" size="sm" className="shrink-0">
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          {aiMutation.isPending ? "Generating..." : "Generate"}
        </Button>
      </div>

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

