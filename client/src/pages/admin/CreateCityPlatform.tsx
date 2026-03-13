import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import bbox from "@turf/bbox";
import { AdminLayout } from "@/components/AdminLayout";
import { BoundarySearch } from "@/components/BoundarySearch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertCityPlatformSchema, type Boundary } from "@shared/schema";
import type { z } from "zod";
import { 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  X, 
  Check, 
  Globe, 
  FileText, 
  ClipboardCheck,
  Loader2
} from "lucide-react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// USA national view - centered on continental US
const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283];
const DEFAULT_ZOOM = 3.5;

type CreatePlatformForm = z.infer<typeof insertCityPlatformSchema>;

const STEPS = [
  { id: 1, title: "Select Location", icon: MapPin },
  { id: 2, title: "Platform Details", icon: FileText },
  { id: 3, title: "Review & Submit", icon: ClipboardCheck },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function CreateCityPlatform() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isSuperAdmin, isLoading: authLoading } = useAdminAccess();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedBoundary, setSelectedBoundary] = useState<Boundary | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const form = useForm<CreatePlatformForm>({
    resolver: zodResolver(insertCityPlatformSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      is_active: true,
      is_public: true,
      default_zoom: 9,
      primary_boundary_id: null,
      default_center_lat: null,
      default_center_lng: null,
    },
  });

  const nameValue = form.watch("name");

  useEffect(() => {
    if (nameValue) {
      const currentSlug = form.getValues("slug");
      const generatedSlug = slugify(nameValue);
      if (!currentSlug || currentSlug === slugify(form.getValues("name").slice(0, -1) || "")) {
        form.setValue("slug", generatedSlug, { shouldValidate: true });
      }
    }
  }, [nameValue, form]);

  // Initialize map when component mounts and container is available
  useEffect(() => {
    // Only initialize on Step 1
    if (currentStep !== 1) return;
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

    map.current.on("moveend", () => {
      if (map.current) {
        const center = map.current.getCenter();
        const zoom = map.current.getZoom();
        setMapCenter([center.lng, center.lat]);
        setMapZoom(Math.round(zoom));
        form.setValue("default_center_lng", center.lng);
        form.setValue("default_center_lat", center.lat);
        form.setValue("default_zoom", Math.round(zoom));
      }
    });

    map.current.on("click", (e) => {
      if (map.current) {
        setMapCenter([e.lngLat.lng, e.lngLat.lat]);
        form.setValue("default_center_lng", e.lngLat.lng);
        form.setValue("default_center_lat", e.lngLat.lat);
        map.current.flyTo({ center: [e.lngLat.lng, e.lngLat.lat] });
      }
    });
  }, [currentStep, form]);
  
  // Separate cleanup effect that only runs on unmount
  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapLoaded(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (map.current.getLayer("boundary-fill")) {
      map.current.removeLayer("boundary-fill");
    }
    if (map.current.getLayer("boundary-outline")) {
      map.current.removeLayer("boundary-outline");
    }
    if (map.current.getSource("boundary")) {
      map.current.removeSource("boundary");
    }

    if (selectedBoundary?.geometry) {
      const geojson: GeoJSON.Feature = {
        type: "Feature",
        properties: { name: selectedBoundary.name },
        geometry: selectedBoundary.geometry,
      };

      map.current.addSource("boundary", {
        type: "geojson",
        data: geojson,
      });

      map.current.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "boundary",
        paint: {
          "fill-color": "#3B82F6",
          "fill-opacity": 0.2,
        },
      });

      map.current.addLayer({
        id: "boundary-outline",
        type: "line",
        source: "boundary",
        paint: {
          "line-color": "#2563EB",
          "line-width": 2,
        },
      });

      const bounds = bbox(geojson);
      map.current.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 50, maxZoom: 14 }
      );
    }
  }, [selectedBoundary, mapLoaded]);

  const createMutation = useMutation({
    mutationFn: async (data: CreatePlatformForm) => {
      return apiRequest("POST", "/api/admin/city-platforms", data);
    },
    onSuccess: (platform: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/city-platforms"] });
      toast({
        title: "Platform Created",
        description: "Now let's select the geographic boundaries for your platform.",
      });
      navigate(`/admin/city-platforms/${platform.id}/boundaries`);
    },
    onError: (error: Error) => {
      const message = error.message || "Failed to create platform";
      if (message.includes("409") || message.toLowerCase().includes("slug")) {
        toast({
          title: "Slug Conflict",
          description: "A platform with this slug already exists. Please choose a different slug.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
      }
    },
  });

  const handleBoundarySelect = (boundary: Boundary) => {
    setSelectedBoundary(boundary);
    form.setValue("primary_boundary_id", boundary.id);
    
    // Auto-populate platform name and slug from boundary name
    const platformName = `${boundary.name} Network`;
    form.setValue("name", platformName, { shouldValidate: true });
    form.setValue("slug", slugify(platformName), { shouldValidate: true });
    
    if (boundary.geometry) {
      const geojson: GeoJSON.Feature = {
        type: "Feature",
        properties: {},
        geometry: boundary.geometry,
      };
      const bounds = bbox(geojson);
      const centerLng = (bounds[0] + bounds[2]) / 2;
      const centerLat = (bounds[1] + bounds[3]) / 2;
      
      // Calculate appropriate zoom level based on boundary size
      const boundsWidth = bounds[2] - bounds[0];
      const boundsHeight = bounds[3] - bounds[1];
      const maxDimension = Math.max(boundsWidth, boundsHeight);
      
      // Estimate zoom level (rough heuristic)
      let autoZoom = 11;
      if (maxDimension > 2) autoZoom = 7;
      else if (maxDimension > 1) autoZoom = 8;
      else if (maxDimension > 0.5) autoZoom = 9;
      else if (maxDimension > 0.2) autoZoom = 10;
      else if (maxDimension > 0.1) autoZoom = 11;
      else autoZoom = 12;
      
      setMapCenter([centerLng, centerLat]);
      setMapZoom(autoZoom);
      form.setValue("default_center_lng", centerLng);
      form.setValue("default_center_lat", centerLat);
      form.setValue("default_zoom", autoZoom);

      // Fly to the boundary on the map
      if (map.current) {
        map.current.fitBounds(
          [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
          { padding: 50, maxZoom: 14 }
        );
      }
    } else {
      // Fallback for boundaries without geometry - use current map center
      form.setValue("default_center_lng", mapCenter[0]);
      form.setValue("default_center_lat", mapCenter[1]);
      form.setValue("default_zoom", mapZoom);
    }
  };

  const handleRemoveBoundary = () => {
    setSelectedBoundary(null);
    form.setValue("primary_boundary_id", null);
    form.setValue("name", "");
    form.setValue("slug", "");
    // Set defaults to valid values instead of null - prevents submission with missing viewport data
    form.setValue("default_center_lng", DEFAULT_CENTER[0]);
    form.setValue("default_center_lat", DEFAULT_CENTER[1]);
    form.setValue("default_zoom", DEFAULT_ZOOM);
    setMapCenter(DEFAULT_CENTER);
    setMapZoom(DEFAULT_ZOOM);
    
    // Reset map to default view and remove boundary layer
    if (map.current) {
      if (map.current.getLayer("boundary-fill")) {
        map.current.removeLayer("boundary-fill");
      }
      if (map.current.getLayer("boundary-outline")) {
        map.current.removeLayer("boundary-outline");
      }
      if (map.current.getSource("boundary")) {
        map.current.removeSource("boundary");
      }
      map.current.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    }
  };

  const validateStep = async (step: number): Promise<boolean> => {
    switch (step) {
      case 1:
        if (!selectedBoundary) {
          toast({
            title: "Location Required",
            description: "Please select a city or region to continue.",
            variant: "destructive",
          });
          return false;
        }
        // Ensure map defaults are always set (fallback to current map state if needed)
        const currentLat = form.getValues("default_center_lat");
        const currentLng = form.getValues("default_center_lng");
        const currentZoom = form.getValues("default_zoom");
        
        if (currentLat === null || currentLat === undefined || 
            currentLng === null || currentLng === undefined) {
          form.setValue("default_center_lng", mapCenter[0]);
          form.setValue("default_center_lat", mapCenter[1]);
        }
        if (currentZoom === null || currentZoom === undefined || currentZoom === 0) {
          form.setValue("default_zoom", mapZoom);
        }
        
        // Final validation - ensure values are now set
        const finalLat = form.getValues("default_center_lat");
        const finalLng = form.getValues("default_center_lng");
        const finalZoom = form.getValues("default_zoom");
        
        if (finalLat === null || finalLat === undefined ||
            finalLng === null || finalLng === undefined ||
            finalZoom === null || finalZoom === undefined) {
          toast({
            title: "Map Configuration Required",
            description: "Unable to determine map settings. Please try selecting the boundary again.",
            variant: "destructive",
          });
          return false;
        }
        return true;
      case 2:
        const step2Valid = await form.trigger(["name", "slug", "description", "is_active", "is_public"]);
        if (!step2Valid) {
          toast({
            title: "Validation Error",
            description: "Please fill in all required fields correctly.",
            variant: "destructive",
          });
        }
        return step2Valid;
      case 3:
        return true;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid && currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    const formData = form.getValues();
    createMutation.mutate(formData);
  };

  if (authLoading || isSuperAdmin === undefined) {
    return (
      <AdminLayout>
        <div className="p-8">
          <Skeleton className="h-12 w-48 mb-8" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (isSuperAdmin !== true) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground">Only super admins can create city platforms.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Create City Platform</h1>
          <p className="text-muted-foreground mt-2">
            Set up a new city platform network with geographic boundaries
          </p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              
              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
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
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`text-xs mt-2 font-medium ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-4 mt-[-1rem] ${
                        currentStep > step.id ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()}>
            {currentStep === 1 && (
              <Card data-testid="step-1-content">
                <CardHeader>
                  <CardTitle>Select Location</CardTitle>
                  <CardDescription>
                    Search for a city or region to create your platform. The platform name and map settings will be auto-populated.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Primary boundary note */}
                  <div className="flex gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100">Choose your primary boundary</p>
                      <p className="text-blue-700 dark:text-blue-300 mt-1">
                        This will be the starting area for your platform. You can expand or customize your boundaries later in the platform settings.
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">Search for a City or Region</Label>
                    <BoundarySearch
                      onSelect={handleBoundarySelect}
                      className="w-full"
                    />
                  </div>

                  <div
                    ref={mapContainer}
                    className="h-[300px] rounded-lg overflow-hidden border"
                    data-testid="map-container"
                  />

                  {selectedBoundary ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-4 border rounded-lg bg-primary/5 border-primary/20">
                        <MapPin className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{selectedBoundary.name}</div>
                          <div className="text-sm text-muted-foreground capitalize">{selectedBoundary.type}</div>
                        </div>
                        <Badge variant="default">Selected</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleRemoveBoundary}
                          data-testid="button-remove-boundary"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
                        <div>
                          <Label className="text-xs text-muted-foreground">Platform Name (auto-generated)</Label>
                          <div className="font-medium text-sm" data-testid="text-auto-name">
                            {form.getValues("name") || "-"}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Map Center</Label>
                          <div className="font-mono text-sm" data-testid="text-auto-center">
                            {mapCenter[1].toFixed(4)}, {mapCenter[0].toFixed(4)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <p className="text-sm">Search above to find and select a city or region</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {currentStep === 2 && (
              <Card data-testid="step-2-content">
                <CardHeader>
                  <CardTitle>Platform Details</CardTitle>
                  <CardDescription>
                    Customize the platform name and settings. Fields are pre-filled based on your selection.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platform Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Grand Rapids Network"
                            {...field}
                            data-testid="input-platform-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL Slug *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., grand-rapids-network"
                            {...field}
                            data-testid="input-platform-slug"
                          />
                        </FormControl>
                        <FormDescription>
                          This will be part of the platform URL
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the purpose and vision of this city platform..."
                            {...field}
                            value={field.value || ""}
                            data-testid="input-platform-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="is_active"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Active</FormLabel>
                            <FormDescription>
                              Platform is active and operational
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-platform-active"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_public"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Public</FormLabel>
                            <FormDescription>
                              Visible to the public
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-platform-public"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStep === 3 && (
              <Card data-testid="step-3-content">
                <CardHeader>
                  <CardTitle>Review & Submit</CardTitle>
                  <CardDescription>
                    Review all details before creating the city platform. After creation, you'll be taken to select additional geographic boundaries for your platform.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label className="text-xs text-muted-foreground">Platform Name</Label>
                      <div className="font-medium" data-testid="review-name">
                        {form.getValues("name") || "-"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Slug</Label>
                      <div className="font-mono text-sm" data-testid="review-slug">
                        /{form.getValues("slug") || "-"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <div className="text-sm" data-testid="review-description">
                      {form.getValues("description") || <span className="text-muted-foreground">No description</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Status:</Label>
                      <Badge variant={form.getValues("is_active") ? "default" : "secondary"} data-testid="review-active">
                        {form.getValues("is_active") ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Visibility:</Label>
                      <Badge variant={form.getValues("is_public") ? "outline" : "secondary"} data-testid="review-public">
                        <Globe className="h-3 w-3 mr-1" />
                        {form.getValues("is_public") ? "Public" : "Private"}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Primary Boundary</Label>
                    {selectedBoundary ? (
                      <div className="flex items-center gap-2 mt-1" data-testid="review-boundary">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span>{selectedBoundary.name}</span>
                        <span className="text-muted-foreground">({selectedBoundary.type})</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground" data-testid="review-no-boundary">
                        No boundary selected
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Default Center (Lng)</Label>
                      <div className="font-mono text-sm" data-testid="review-center-lng">
                        {form.getValues("default_center_lng")?.toFixed(4) || "-"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Default Center (Lat)</Label>
                      <div className="font-mono text-sm" data-testid="review-center-lat">
                        {form.getValues("default_center_lat")?.toFixed(4) || "-"}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Default Zoom</Label>
                      <div className="font-mono text-sm" data-testid="review-zoom">
                        {form.getValues("default_zoom")}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 1}
                data-testid="button-previous"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>

              {currentStep < STEPS.length ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  data-testid="button-next"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  data-testid="button-submit"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Create Platform
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </AdminLayout>
  );
}
