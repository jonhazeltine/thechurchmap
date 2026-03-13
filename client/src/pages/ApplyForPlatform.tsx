import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import bbox from "@turf/bbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "../../../lib/supabaseClient";
import { insertPlatformApplicationSchema, type Boundary, type ApplicationBoundaryType } from "@shared/schema";
import { BoundaryMapPicker } from "@/components/BoundaryMapPicker";
import type { z } from "zod";
import { 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  X, 
  Check, 
  FileText, 
  Map,
  Eye,
  Users,
  ClipboardCheck,
  Loader2,
  Search
} from "lucide-react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [-85.6681, 42.9634];
const DEFAULT_ZOOM = 8;

type ApplicationForm = z.infer<typeof insertPlatformApplicationSchema>;

const STEPS = [
  { id: 1, title: "Platform Details", icon: FileText },
  { id: 2, title: "Boundary Selection", icon: MapPin },
  { id: 3, title: "Ministry Vision", icon: Eye },
  { id: 4, title: "Leadership", icon: Users },
  { id: 5, title: "Review & Submit", icon: ClipboardCheck },
];

const BOUNDARY_TYPES: { value: ApplicationBoundaryType; label: string }[] = [
  { value: "city", label: "City" },
  { value: "county", label: "County" },
  { value: "zip", label: "ZIP Code" },
  { value: "school_district", label: "School District" },
];

// State FIPS code to state abbreviation mapping
const STATE_FIPS_TO_ABBREV: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
  "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
  "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY", "72": "PR", "78": "VI",
};

function getStateAbbrev(stateFips: string | undefined | null): string | null {
  if (!stateFips) return null;
  return STATE_FIPS_TO_ABBREV[stateFips] || null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function ApplyForPlatform() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedBoundaries, setSelectedBoundaries] = useState<Boundary[]>([]);
  const [boundarySearchQuery, setBoundarySearchQuery] = useState("");
  const [boundarySearchResults, setBoundarySearchResults] = useState<Boundary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const form = useForm<ApplicationForm>({
    resolver: zodResolver(insertPlatformApplicationSchema),
    defaultValues: {
      requested_platform_name: "",
      requested_platform_slug: null,
      requested_boundary_type: "city",
      boundary_ids: [],
      city_description: "",
      ministry_vision: "",
      existing_partners: null,
      leadership_experience: null,
      expected_timeline: null,
    },
  });

  const nameValue = form.watch("requested_platform_name");
  const boundaryType = form.watch("requested_boundary_type");

  useEffect(() => {
    if (nameValue) {
      const currentSlug = form.getValues("requested_platform_slug");
      const generatedSlug = slugify(nameValue);
      if (!currentSlug || currentSlug === slugify(form.getValues("requested_platform_name").slice(0, -1) || "")) {
        form.setValue("requested_platform_slug", generatedSlug, { shouldValidate: true });
      }
    }
  }, [nameValue, form]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    setSelectedBoundaries([]);
    form.setValue("boundary_ids", []);
    setBoundarySearchQuery("");
    setBoundarySearchResults([]);
  }, [boundaryType, form]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const searchBoundaries = async () => {
      if (!boundarySearchQuery || boundarySearchQuery.length < 2) {
        setBoundarySearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const typeFilter = boundaryType === "city" ? "Place" : 
                          boundaryType === "county" ? "County" :
                          boundaryType === "zip" ? "ZIP" :
                          boundaryType === "school_district" ? "School District" : "";
        
        const response = await fetch(
          `/api/boundaries/search?q=${encodeURIComponent(boundarySearchQuery)}&type=${encodeURIComponent(typeFilter)}&with_geometry=true`
        );
        if (response.ok) {
          const results = await response.json();
          setBoundarySearchResults(results);
          setIsDropdownOpen(results.length > 0);
        }
      } catch (error) {
        console.error("Error searching boundaries:", error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchBoundaries, 300);
    return () => clearTimeout(debounceTimer);
  }, [boundarySearchQuery, boundaryType]);

  const initializeMap = useCallback(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (currentStep === 2) {
      setTimeout(() => {
        initializeMap();
      }, 100);
    }
    
    return () => {
      if (currentStep !== 2 && map.current) {
        map.current.remove();
        map.current = null;
        setMapLoaded(false);
      }
    };
  }, [currentStep, initializeMap]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (map.current.getLayer("boundary-fill")) {
      map.current.removeLayer("boundary-fill");
    }
    if (map.current.getLayer("boundary-outline")) {
      map.current.removeLayer("boundary-outline");
    }
    if (map.current.getSource("boundaries")) {
      map.current.removeSource("boundaries");
    }

    if (selectedBoundaries.length > 0) {
      const features = selectedBoundaries
        .filter(b => b.geometry)
        .map(b => ({
          type: "Feature" as const,
          properties: { name: b.name, id: b.id },
          geometry: b.geometry,
        }));

      if (features.length > 0) {
        const featureCollection: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features,
        };

        map.current.addSource("boundaries", {
          type: "geojson",
          data: featureCollection,
        });

        map.current.addLayer({
          id: "boundary-fill",
          type: "fill",
          source: "boundaries",
          paint: {
            "fill-color": "#3B82F6",
            "fill-opacity": 0.2,
          },
        });

        map.current.addLayer({
          id: "boundary-outline",
          type: "line",
          source: "boundaries",
          paint: {
            "line-color": "#2563EB",
            "line-width": 2,
          },
        });

        const bounds = bbox(featureCollection);
        map.current.fitBounds(
          [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
          { padding: 50, maxZoom: 12 }
        );
      }
    }
  }, [selectedBoundaries, mapLoaded]);

  const submitMutation = useMutation({
    mutationFn: async (data: ApplicationForm) => {
      console.log('[Platform Application] Submitting application, user:', user?.email);
      
      // Refresh the session before submitting to ensure token is valid
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log('[Platform Application] Session check:', {
        hasSession: !!sessionData?.session,
        hasToken: !!sessionData?.session?.access_token,
        error: sessionError?.message
      });
      
      if (!sessionData?.session?.access_token) {
        console.error('[Platform Application] No valid session - attempting refresh');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        console.log('[Platform Application] Refresh result:', {
          hasSession: !!refreshData?.session,
          error: refreshError?.message
        });
        
        if (!refreshData?.session) {
          throw new Error('Your session has expired. Please log out and log back in.');
        }
      }
      
      const result = await apiRequest("POST", "/api/platform-applications", data);
      console.log('[Platform Application] Submission result:', result);
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Application Submitted",
        description: "Your platform application has been submitted for review. You will be notified when it's processed.",
      });
      navigate("/");
    },
    onError: (error: Error) => {
      const isAuthError = error.message?.includes('401') || error.message?.includes('Unauthorized');
      toast({
        title: "Submission Failed",
        description: isAuthError 
          ? "Your session has expired. Please log out, log back in, and try again."
          : (error.message || "Failed to submit application. Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleSelectBoundary = (boundary: Boundary) => {
    if (selectedBoundaries.some(b => b.id === boundary.id)) {
      return;
    }
    const newBoundaries = [...selectedBoundaries, boundary];
    setSelectedBoundaries(newBoundaries);
    form.setValue("boundary_ids", newBoundaries.map(b => b.id), { shouldValidate: true });
    setBoundarySearchQuery("");
    setBoundarySearchResults([]);
    setIsDropdownOpen(false);
  };

  const handleRemoveBoundary = (boundaryId: string) => {
    const newBoundaries = selectedBoundaries.filter(b => b.id !== boundaryId);
    setSelectedBoundaries(newBoundaries);
    form.setValue("boundary_ids", newBoundaries.map(b => b.id), { shouldValidate: true });
  };

  const handleMapPickerSave = (pickedBoundaries: Array<{ id: string; name: string; type: string; external_id?: string; geometry?: any; centroid_lng?: number; centroid_lat?: number }>) => {
    const boundariesAsBoundary: Boundary[] = pickedBoundaries.map(b => ({
      id: b.id,
      name: b.name,
      type: b.type,
      external_id: b.external_id,
      geometry: b.geometry,
    }));
    setSelectedBoundaries(boundariesAsBoundary);
    form.setValue("boundary_ids", boundariesAsBoundary.map(b => b.id), { shouldValidate: true });
  };

  const validateCurrentStep = async (): Promise<boolean> => {
    let fieldsToValidate: (keyof ApplicationForm)[] = [];
    
    switch (currentStep) {
      case 1:
        fieldsToValidate = ["requested_platform_name"];
        break;
      case 2:
        fieldsToValidate = ["requested_boundary_type", "boundary_ids"];
        break;
      case 3:
        fieldsToValidate = ["city_description", "ministry_vision"];
        break;
      case 4:
        break;
      case 5:
        break;
    }

    if (fieldsToValidate.length === 0) return true;
    
    const result = await form.trigger(fieldsToValidate);
    return result;
  };

  const handleNext = async () => {
    const isValid = await validateCurrentStep();
    if (isValid && currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = form.handleSubmit((data) => {
    // Only submit if we're on step 5 (review page)
    if (currentStep !== 5) {
      return;
    }
    submitMutation.mutate(data);
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back-home"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Apply for a City Platform</h1>
            <p className="text-sm text-muted-foreground">
              Submit your application to launch a Church Map platform in your city
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              
              return (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : isCompleted
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                    data-testid={`step-indicator-${step.id}`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-5 w-5" />
                    )}
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-12 sm:w-20 h-0.5 mx-2 ${
                        isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-center font-medium">
            Step {currentStep}: {STEPS[currentStep - 1].title}
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={handleSubmit}>
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Platform Details</CardTitle>
                  <CardDescription>
                    Choose a name for your city platform. This will be how your community identifies your network.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="requested_platform_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platform Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Grand Rapids Church Map"
                            {...field}
                            data-testid="input-platform-name"
                          />
                        </FormControl>
                        <FormDescription>
                          This is the public name for your city platform
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="requested_platform_slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platform URL Slug</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-sm">thechurchmap.com/</span>
                            <Input
                              placeholder="grand-rapids"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-platform-slug"
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Optional. If left blank, a URL will be assigned based on your platform name.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {currentStep === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Boundary Selection</CardTitle>
                  <CardDescription>
                    Define the geographic area your platform will cover. Select one or more boundaries.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="requested_boundary_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Boundary Type *</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value) => field.onChange(value as ApplicationBoundaryType)}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-boundary-type">
                              <SelectValue placeholder="Select boundary type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BOUNDARY_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose the type of geographic boundary for your platform
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="w-full h-auto py-4 flex items-center justify-center gap-3 border-dashed border-2"
                      onClick={() => setIsMapPickerOpen(true)}
                      data-testid="button-select-on-map"
                    >
                      <Map className="h-5 w-5 text-primary" />
                      <div className="text-left">
                        <div className="font-medium">Select on Map</div>
                        <div className="text-sm text-muted-foreground">
                          Visually browse and select boundaries from an interactive map
                        </div>
                      </div>
                    </Button>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or search by name</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Search & Add Boundaries</Label>
                    <div className="relative" ref={dropdownRef}>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder={`Search for ${BOUNDARY_TYPES.find(t => t.value === boundaryType)?.label.toLowerCase() || 'boundaries'}...`}
                          value={boundarySearchQuery}
                          onChange={(e) => setBoundarySearchQuery(e.target.value)}
                          onFocus={() => {
                            if (boundarySearchResults.length > 0) {
                              setIsDropdownOpen(true);
                            }
                          }}
                          className="pl-9"
                          data-testid="input-boundary-search"
                        />
                      </div>

                      {isDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
                          {isSearching ? (
                            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Searching...
                            </div>
                          ) : boundarySearchResults.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-muted-foreground">
                              No boundaries found
                            </div>
                          ) : (
                            <div className="py-1">
                              {boundarySearchResults.map((boundary) => {
                                const isSelected = selectedBoundaries.some(b => b.id === boundary.id);
                                return (
                                  <button
                                    key={boundary.id}
                                    type="button"
                                    onClick={() => handleSelectBoundary(boundary)}
                                    disabled={isSelected}
                                    className={`w-full px-4 py-2 text-left flex items-start gap-3 ${
                                      isSelected ? "opacity-50 cursor-not-allowed" : "hover-elevate active-elevate-2"
                                    }`}
                                    data-testid={`button-boundary-${boundary.id}`}
                                  >
                                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm truncate">
                                        {boundary.name}
                                        {boundaryType !== 'zip' && (boundary as any).state_fips && (
                                          <span className="text-muted-foreground font-normal">, {getStateAbbrev((boundary as any).state_fips)}</span>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground">{boundary.type}</div>
                                    </div>
                                    {isSelected && (
                                      <Check className="h-4 w-4 text-primary" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedBoundaries.length > 0 && (
                    <div className="space-y-2">
                      <Label>Selected Boundaries ({selectedBoundaries.length})</Label>
                      <div className="flex flex-wrap gap-2">
                        {selectedBoundaries.map((boundary) => {
                          const stateAbbrev = getStateAbbrev((boundary as any).state_fips);
                          return (
                            <Badge
                              key={boundary.id}
                              variant="secondary"
                              className="flex items-center gap-1 px-3 py-1"
                            >
                              <MapPin className="h-3 w-3" />
                              <span>
                                {boundary.name}
                                {boundaryType !== 'zip' && stateAbbrev && `, ${stateAbbrev}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBoundary(boundary.id)}
                                className="ml-1 hover:text-destructive"
                                data-testid={`button-remove-boundary-${boundary.id}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="boundary_ids"
                    render={() => (
                      <FormItem>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {MAPBOX_TOKEN && (
                    <div className="space-y-2">
                      <Label>Map Preview</Label>
                      <div className="border rounded-lg overflow-hidden">
                        <div
                          ref={mapContainer}
                          className="h-[300px] w-full"
                          data-testid="map-preview"
                        />
                      </div>
                      {selectedBoundaries.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Select boundaries above to see them on the map
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {currentStep === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Ministry Vision</CardTitle>
                  <CardDescription>
                    Tell us about your city and your vision for The Church Map platform.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="city_description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>About Your City *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your city - its size, demographics, unique characteristics, and the church landscape..."
                            className="min-h-[120px]"
                            {...field}
                            data-testid="input-city-description"
                          />
                        </FormControl>
                        <FormDescription>
                          Help us understand your local context (minimum 20 characters)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ministry_vision"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ministry Vision *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Share your vision for how The Church Map could unite churches in your area, foster collaboration, and advance the Gospel..."
                            className="min-h-[150px]"
                            {...field}
                            data-testid="input-ministry-vision"
                          />
                        </FormControl>
                        <FormDescription>
                          What do you hope to accomplish with this platform? (minimum 20 characters)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="existing_partners"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Existing Partners</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="List any churches, organizations, or networks you're already connected with..."
                            className="min-h-[100px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-existing-partners"
                          />
                        </FormControl>
                        <FormDescription>
                          Optional. Mention any existing relationships that could help launch this platform.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {currentStep === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle>Leadership & Timeline</CardTitle>
                  <CardDescription>
                    Tell us about your experience and when you'd like to launch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="leadership_experience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Leadership Experience</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your experience in church leadership, ministry coordination, or community organizing..."
                            className="min-h-[120px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-leadership-experience"
                          />
                        </FormControl>
                        <FormDescription>
                          Optional. Share any relevant background that qualifies you to lead this initiative.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expected_timeline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Timeline</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Ready to launch in Q1 2026, or Within 3 months"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-expected-timeline"
                          />
                        </FormControl>
                        <FormDescription>
                          Optional. When would you ideally like to launch your platform?
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {currentStep === 5 && (
              <Card>
                <CardHeader>
                  <CardTitle>Review Your Application</CardTitle>
                  <CardDescription>
                    Please review all the information before submitting your application.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Platform Details
                      </h3>
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Platform Name:</span>
                          <span className="font-medium" data-testid="review-platform-name">
                            {form.getValues("requested_platform_name")}
                          </span>
                        </div>
                        {form.getValues("requested_platform_slug") && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">URL Slug:</span>
                            <span className="font-medium" data-testid="review-platform-slug">
                              {form.getValues("requested_platform_slug")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Geographic Coverage
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Boundary Type:</span>
                          <span className="font-medium" data-testid="review-boundary-type">
                            {BOUNDARY_TYPES.find(t => t.value === form.getValues("requested_boundary_type"))?.label}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Selected Boundaries:</span>
                          <div className="flex flex-wrap gap-1 mt-1" data-testid="review-boundaries">
                            {selectedBoundaries.map((b) => (
                              <Badge key={b.id} variant="secondary" className="text-xs">
                                {b.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Ministry Vision
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">About Your City:</span>
                          <p className="mt-1 text-foreground" data-testid="review-city-description">
                            {form.getValues("city_description")}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ministry Vision:</span>
                          <p className="mt-1 text-foreground" data-testid="review-ministry-vision">
                            {form.getValues("ministry_vision")}
                          </p>
                        </div>
                        {form.getValues("existing_partners") && (
                          <div>
                            <span className="text-muted-foreground">Existing Partners:</span>
                            <p className="mt-1 text-foreground" data-testid="review-existing-partners">
                              {form.getValues("existing_partners")}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Leadership & Timeline
                      </h3>
                      <div className="space-y-3 text-sm">
                        {form.getValues("leadership_experience") ? (
                          <div>
                            <span className="text-muted-foreground">Leadership Experience:</span>
                            <p className="mt-1 text-foreground" data-testid="review-leadership-experience">
                              {form.getValues("leadership_experience")}
                            </p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground italic">No leadership experience provided</p>
                        )}
                        {form.getValues("expected_timeline") ? (
                          <div>
                            <span className="text-muted-foreground">Expected Timeline:</span>
                            <p className="mt-1 text-foreground" data-testid="review-expected-timeline">
                              {form.getValues("expected_timeline")}
                            </p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground italic">No timeline specified</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                    <p>
                      By submitting this application, you confirm that the information provided is accurate.
                      Our team will review your application and contact you at your registered email address.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
                data-testid="button-back"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              {currentStep < 5 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  data-testid="button-next"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Submit Application
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </main>

      <BoundaryMapPicker
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        onSave={handleMapPickerSave}
        initialSelectedIds={selectedBoundaries.map(b => b.id)}
        title="Select Platform Boundaries"
        description="Click on regions to select them. These boundaries will define your platform's geographic coverage."
      />
    </div>
  );
}
