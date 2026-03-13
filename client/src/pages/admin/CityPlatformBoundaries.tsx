import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import bbox from "@turf/bbox";
import { AdminLayout } from "@/components/AdminLayout";
import { BoundarySearch } from "@/components/BoundarySearch";
import { BoundaryMapPicker } from "@/components/BoundaryMapPicker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePlatformAccess } from "@/hooks/useAdminAccess";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Boundary, BoundaryRole, CityPlatform, PlatformRegionWithCounts } from "@shared/schema";
import { REGION_COLORS, UNASSIGNED_BOUNDARY_COLOR } from "@shared/schema";
import { ChevronLeft, MapPin, Trash2, Plus, Loader2, Map, Globe, Pencil, Users, Layers, X, Check } from "lucide-react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [-85.6681, 42.9634];
const DEFAULT_ZOOM = 10;

interface PlatformBoundary {
  id: string;
  role: BoundaryRole;
  sort_order: number;
  added_at: string;
  boundary: {
    id: string;
    name: string;
    type: string;
    external_id?: string;
    geometry?: any;
  } | null;
}

interface BoundariesResponse {
  platform: Pick<CityPlatform, 'id' | 'name' | 'default_center_lat' | 'default_center_lng' | 'default_zoom'>;
  boundaries: PlatformBoundary[];
}

interface RegionsResponse {
  regions: PlatformRegionWithCounts[];
}

const ROLE_COLORS: Record<BoundaryRole, { fill: string; outline: string; label: string }> = {
  primary: { fill: "#3B82F6", outline: "#2563EB", label: "Primary" },
  included: { fill: "#22C55E", outline: "#16A34A", label: "Included" },
  excluded: { fill: "#EF4444", outline: "#DC2626", label: "Excluded" },
};

export default function CityPlatformBoundaries() {
  const { id: platformId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canManageBoundaries, isSuperAdmin, isLoading: authLoading } = usePlatformAccess(platformId);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredBoundary, setHoveredBoundary] = useState<Boundary | null>(null);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [isSavingBoundaries, setIsSavingBoundaries] = useState(false);
  
  // Region-specific boundary picker state
  const [isRegionPickerOpen, setIsRegionPickerOpen] = useState(false);
  const [pickingRegionBoundaries, setPickingRegionBoundaries] = useState<PlatformRegionWithCounts | null>(null);
  
  const [activeTab, setActiveTab] = useState<string>("boundaries");
  const [isRegionDialogOpen, setIsRegionDialogOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<PlatformRegionWithCounts | null>(null);
  const [regionName, setRegionName] = useState("");
  const [regionColor, setRegionColor] = useState<string>(REGION_COLORS[0]);
  const [isAssigningMode, setIsAssigningMode] = useState(false);
  const [assigningRegion, setAssigningRegion] = useState<PlatformRegionWithCounts | null>(null);
  const [selectedBoundaryIds, setSelectedBoundaryIds] = useState<string[]>([]);
  const [hoveredAssignBoundaryId, setHoveredAssignBoundaryId] = useState<string | null>(null);
  const [layerRefreshCounter, setLayerRefreshCounter] = useState(0);
  
  // Region visibility toggles for map preview
  const [visibleRegionIds, setVisibleRegionIds] = useState<Set<string>>(new Set());
  const [showUnassigned, setShowUnassigned] = useState(true);
  
  // Refs for stable event handlers to prevent accumulation
  const selectedBoundaryIdsRef = useRef<string[]>([]);
  const assignClickHandlerRef = useRef<((e: mapboxgl.MapMouseEvent) => void) | null>(null);
  const assignMouseMoveHandlerRef = useRef<((e: mapboxgl.MapMouseEvent) => void) | null>(null);
  const assignMouseLeaveHandlerRef = useRef<(() => void) | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    selectedBoundaryIdsRef.current = selectedBoundaryIds;
  }, [selectedBoundaryIds]);

  const { data, isLoading, error } = useQuery<BoundariesResponse>({
    queryKey: [`/api/admin/city-platforms/${platformId}/boundaries`],
    enabled: !!platformId,
  });

  const { data: regionsData, isLoading: regionsLoading } = useQuery<RegionsResponse>({
    queryKey: [`/api/admin/city-platforms/${platformId}/regions`],
    enabled: !!platformId,
  });

  // Collect all unique boundary IDs from all regions for geometry fetching
  const allRegionBoundaryIds = regionsData?.regions?.flatMap(r => r.boundary_ids || []) || [];
  const uniqueRegionBoundaryIds = [...new Set(allRegionBoundaryIds)];

  // Fetch geometries for region boundaries (these are different from platform boundaries)
  const { data: regionBoundaryGeometries } = useQuery<Boundary[]>({
    queryKey: ['/api/boundaries/by-ids', uniqueRegionBoundaryIds],
    queryFn: async () => {
      if (uniqueRegionBoundaryIds.length === 0) return [];
      const params = new URLSearchParams();
      uniqueRegionBoundaryIds.forEach(id => params.append('ids', id));
      const response = await fetch(`/api/boundaries/by-ids?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch region boundary geometries');
      return response.json();
    },
    enabled: uniqueRegionBoundaryIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const addBoundaryMutation = useMutation({
    mutationFn: async ({ boundary_id, role }: { boundary_id: string; role: BoundaryRole }) => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/boundaries`, {
        boundary_id,
        role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/boundaries`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/city-platforms'] });
      toast({
        title: "Boundary Added",
        description: "The boundary has been added to the platform.",
      });
    },
    onError: (error: Error) => {
      const message = error.message || "Failed to add boundary";
      if (message.includes("409") || message.toLowerCase().includes("already")) {
        toast({
          title: "Already Added",
          description: "This boundary is already part of the platform.",
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

  const updateBoundaryMutation = useMutation({
    mutationFn: async ({ boundary_id, role, remove }: { boundary_id: string; role?: BoundaryRole; remove?: boolean }) => {
      return apiRequest("PATCH", `/api/admin/city-platforms/${platformId}/boundaries`, {
        boundary_id,
        role,
        remove,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/boundaries`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/city-platforms'] });
      toast({
        title: "Boundary Updated",
        description: "The boundary has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update boundary",
        variant: "destructive",
      });
    },
  });

  // Helper to invalidate all region-related queries (admin + public endpoints)
  const invalidateRegionQueries = () => {
    // Invalidate admin endpoint
    queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/regions`] });
    // Invalidate public endpoint (used by RegionSelector on main map)
    // Use predicate to match any public regions endpoint for this platform
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        if (typeof key === 'string') {
          return key.includes('/api/platforms/') && key.includes('/regions');
        }
        return false;
      }
    });
  };

  const createRegionMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/regions`, { name, color });
    },
    onSuccess: () => {
      invalidateRegionQueries();
      toast({ title: "Region Created", description: "The region has been created successfully." });
      closeRegionDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create region", variant: "destructive" });
    },
  });

  const updateRegionMutation = useMutation({
    mutationFn: async ({ region_id, name, color }: { region_id: string; name?: string; color?: string }) => {
      return apiRequest("PATCH", `/api/admin/city-platforms/${platformId}/regions`, { region_id, name, color });
    },
    onSuccess: () => {
      invalidateRegionQueries();
      toast({ title: "Region Updated", description: "The region has been updated successfully." });
      closeRegionDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update region", variant: "destructive" });
    },
  });

  const deleteRegionMutation = useMutation({
    mutationFn: async (region_id: string) => {
      return apiRequest("DELETE", `/api/admin/city-platforms/${platformId}/regions`, { region_id });
    },
    onSuccess: () => {
      invalidateRegionQueries();
      toast({ title: "Region Deleted", description: "The region has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete region", variant: "destructive" });
    },
  });

  const assignBoundariesMutation = useMutation({
    mutationFn: async ({ region_id, boundary_ids }: { region_id: string; boundary_ids: string[] }) => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/regions/assign`, { region_id, boundary_ids });
    },
    onSuccess: () => {
      invalidateRegionQueries();
      toast({ title: "Boundaries Assigned", description: "Boundaries have been assigned to the region." });
      closeAssignMode();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to assign boundaries", variant: "destructive" });
    },
  });

  const closeRegionDialog = () => {
    setIsRegionDialogOpen(false);
    setEditingRegion(null);
    setRegionName("");
    setRegionColor(REGION_COLORS[0]);
  };

  const openCreateRegionDialog = () => {
    setEditingRegion(null);
    setRegionName("");
    setRegionColor(REGION_COLORS[0]);
    setIsRegionDialogOpen(true);
  };

  const openEditRegionDialog = (region: PlatformRegionWithCounts) => {
    setEditingRegion(region);
    setRegionName(region.name);
    setRegionColor(region.color);
    setIsRegionDialogOpen(true);
  };

  const handleSaveRegion = () => {
    if (!regionName.trim()) return;
    if (editingRegion) {
      updateRegionMutation.mutate({ region_id: editingRegion.id, name: regionName.trim(), color: regionColor });
    } else {
      createRegionMutation.mutate({ name: regionName.trim(), color: regionColor });
    }
  };

  const closeAssignMode = useCallback(() => {
    // First, remove assignment layers and event handlers before changing state
    if (map.current && map.current.isStyleLoaded()) {
      // Remove event handlers using refs
      if (assignClickHandlerRef.current) {
        if (map.current.getLayer('assign-unselected-fill')) {
          map.current.off('click', 'assign-unselected-fill', assignClickHandlerRef.current);
        }
        if (map.current.getLayer('assign-selected-fill')) {
          map.current.off('click', 'assign-selected-fill', assignClickHandlerRef.current);
        }
      }
      if (assignMouseMoveHandlerRef.current) {
        if (map.current.getLayer('assign-unselected-fill')) {
          map.current.off('mousemove', 'assign-unselected-fill', assignMouseMoveHandlerRef.current);
        }
        if (map.current.getLayer('assign-selected-fill')) {
          map.current.off('mousemove', 'assign-selected-fill', assignMouseMoveHandlerRef.current);
        }
      }
      if (assignMouseLeaveHandlerRef.current) {
        if (map.current.getLayer('assign-unselected-fill')) {
          map.current.off('mouseleave', 'assign-unselected-fill', assignMouseLeaveHandlerRef.current);
        }
        if (map.current.getLayer('assign-selected-fill')) {
          map.current.off('mouseleave', 'assign-selected-fill', assignMouseLeaveHandlerRef.current);
        }
      }
      
      // Clear handler refs
      assignClickHandlerRef.current = null;
      assignMouseMoveHandlerRef.current = null;
      assignMouseLeaveHandlerRef.current = null;
      
      // Remove assignment layers
      const ASSIGN_LAYERS = [
        'assign-selected-fill', 'assign-selected-outline',
        'assign-unselected-fill', 'assign-unselected-outline',
        'assign-hover-outline'
      ];
      const ASSIGN_SOURCES = ['assign-all-boundaries'];
      
      ASSIGN_LAYERS.forEach(layer => {
        if (map.current?.getLayer(layer)) {
          map.current.removeLayer(layer);
        }
      });
      ASSIGN_SOURCES.forEach(source => {
        if (map.current?.getSource(source)) {
          map.current.removeSource(source);
        }
      });
      
      // Reset cursor
      map.current.getCanvas().style.cursor = '';
    }
    
    setIsAssigningMode(false);
    setAssigningRegion(null);
    setSelectedBoundaryIds([]);
    setHoveredAssignBoundaryId(null);
    // Trigger layer refresh to restore regular layers
    setLayerRefreshCounter(c => c + 1);
  }, []);

  const enterAssignMode = (region: PlatformRegionWithCounts) => {
    // Open the full BoundaryMapPicker for region boundary selection
    setPickingRegionBoundaries(region);
    setIsRegionPickerOpen(true);
  };

  const handleAssignBoundaries = () => {
    if (!assigningRegion) return;
    assignBoundariesMutation.mutate({ region_id: assigningRegion.id, boundary_ids: selectedBoundaryIds });
  };

  const toggleBoundarySelection = (boundaryId: string) => {
    setSelectedBoundaryIds(prev => 
      prev.includes(boundaryId) 
        ? prev.filter(id => id !== boundaryId)
        : [...prev, boundaryId]
    );
  };

  const initializeMap = useCallback(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    const center: [number, number] = data?.platform?.default_center_lng && data?.platform?.default_center_lat
      ? [data.platform.default_center_lng, data.platform.default_center_lat]
      : DEFAULT_CENTER;
    const zoom = data?.platform?.default_zoom || DEFAULT_ZOOM;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center,
      zoom,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
    });
  }, [data?.platform?.default_center_lat, data?.platform?.default_center_lng, data?.platform?.default_zoom]);

  useEffect(() => {
    if (data?.platform) {
      initializeMap();
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapLoaded(false);
      }
    };
  }, [initializeMap, data?.platform]);

  // Initialize region visibility when regions data loads (all visible by default)
  useEffect(() => {
    if (regionsData?.regions && regionsData.regions.length > 0) {
      setVisibleRegionIds(new Set(regionsData.regions.map(r => r.id)));
    }
  }, [regionsData?.regions]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !data?.boundaries) return;

    const clearAllBoundaryLayers = () => {
      const layers = ['boundary-primary-fill', 'boundary-primary-outline', 
                      'boundary-included-fill', 'boundary-included-outline',
                      'boundary-excluded-fill', 'boundary-excluded-outline',
                      'boundary-hover-fill', 'boundary-hover-outline',
                      'boundaries-unassigned-fill', 'boundaries-unassigned-outline'];
      const sources = ['boundaries-primary', 'boundaries-included', 'boundaries-excluded', 'boundary-hover', 'boundaries-unassigned'];

      regionsData?.regions?.forEach(region => {
        layers.push(`boundary-region-${region.id}-fill`, `boundary-region-${region.id}-outline`);
        sources.push(`boundaries-region-${region.id}`);
      });

      layers.forEach(layer => {
        if (map.current?.getLayer(layer)) {
          map.current.removeLayer(layer);
        }
      });

      sources.forEach(source => {
        if (map.current?.getSource(source)) {
          map.current.removeSource(source);
        }
      });
    };

    clearAllBoundaryLayers();

    // Don't render regular layers when in assignment mode - the assignment mode useEffect handles its own layers
    if (isAssigningMode) return;

    const allFeatures: GeoJSON.Feature[] = [];

    if (activeTab === "regions" && regionsData?.regions) {
      const assignedBoundaryIds = new Set<string>();
      
      // Create a lookup object from regionBoundaryGeometries for quick access
      const geometryLookup: Record<string, Boundary> = {};
      if (regionBoundaryGeometries) {
        regionBoundaryGeometries.forEach(b => {
          if (b.geometry) {
            geometryLookup[b.id] = b;
          }
        });
      }
      
      regionsData.regions.forEach(region => {
        // Use the fetched regionBoundaryGeometries instead of data.boundaries
        const features: GeoJSON.Feature[] = (region.boundary_ids || [])
          .filter(id => geometryLookup[id])
          .map(id => {
            const boundary = geometryLookup[id];
            assignedBoundaryIds.add(id);
            return {
              type: "Feature" as const,
              properties: { name: boundary.name, regionId: region.id, regionName: region.name },
              geometry: boundary.geometry,
            };
          });

        if (features.length > 0) {
          // Show all regions when visibleRegionIds is empty (initial load), or check membership
          const isVisible = visibleRegionIds.size === 0 || visibleRegionIds.has(region.id);
          
          // Only add to allFeatures if visible (for bounds calculation)
          if (isVisible) {
            allFeatures.push(...features);
          }

          map.current!.addSource(`boundaries-region-${region.id}`, {
            type: "geojson",
            data: { type: "FeatureCollection", features },
          });

          map.current!.addLayer({
            id: `boundary-region-${region.id}-fill`,
            type: "fill",
            source: `boundaries-region-${region.id}`,
            paint: {
              "fill-color": region.color,
              "fill-opacity": 0.3,
            },
            layout: {
              visibility: isVisible ? 'visible' : 'none',
            },
          });

          map.current!.addLayer({
            id: `boundary-region-${region.id}-outline`,
            type: "line",
            source: `boundaries-region-${region.id}`,
            paint: {
              "line-color": region.color,
              "line-width": 2,
            },
            layout: {
              visibility: isVisible ? 'visible' : 'none',
            },
          });
        }
      });

      const unassignedFeatures: GeoJSON.Feature[] = data.boundaries
        .filter(b => !assignedBoundaryIds.has(b.boundary?.id || "") && b.boundary?.geometry)
        .map(b => ({
          type: "Feature" as const,
          properties: { name: b.boundary?.name },
          geometry: b.boundary!.geometry,
        }));

      if (unassignedFeatures.length > 0) {
        if (showUnassigned) {
          allFeatures.push(...unassignedFeatures);
        }

        map.current!.addSource('boundaries-unassigned', {
          type: "geojson",
          data: { type: "FeatureCollection", features: unassignedFeatures },
        });

        map.current!.addLayer({
          id: 'boundaries-unassigned-fill',
          type: 'fill',
          source: 'boundaries-unassigned',
          paint: {
            'fill-color': UNASSIGNED_BOUNDARY_COLOR,
            'fill-opacity': 0.2,
          },
          layout: {
            visibility: showUnassigned ? 'visible' : 'none',
          },
        });

        map.current!.addLayer({
          id: 'boundaries-unassigned-outline',
          type: 'line',
          source: 'boundaries-unassigned',
          paint: {
            'line-color': UNASSIGNED_BOUNDARY_COLOR,
            'line-width': 1,
            'line-dasharray': [2, 2],
          },
          layout: {
            visibility: showUnassigned ? 'visible' : 'none',
          },
        });
      }
    } else {
      (['primary', 'included', 'excluded'] as BoundaryRole[]).forEach(role => {
        const features: GeoJSON.Feature[] = data.boundaries
          .filter(b => b.role === role && b.boundary?.geometry)
          .map(b => ({
            type: "Feature" as const,
            properties: { name: b.boundary?.name, role: b.role },
            geometry: b.boundary!.geometry,
          }));

        if (features.length > 0) {
          allFeatures.push(...features);
          const colors = ROLE_COLORS[role];

          map.current!.addSource(`boundaries-${role}`, {
            type: "geojson",
            data: { type: "FeatureCollection", features },
          });

          map.current!.addLayer({
            id: `boundary-${role}-fill`,
            type: "fill",
            source: `boundaries-${role}`,
            paint: {
              "fill-color": colors.fill,
              "fill-opacity": role === 'excluded' ? 0.3 : 0.2,
            },
          });

          map.current!.addLayer({
            id: `boundary-${role}-outline`,
            type: "line",
            source: `boundaries-${role}`,
            paint: {
              "line-color": colors.outline,
              "line-width": role === 'primary' ? 3 : 2,
              "line-dasharray": role === 'excluded' ? [2, 2] : [1],
            },
          });
        }
      });
    }

    if (allFeatures.length > 0) {
      const combined: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: allFeatures,
      };
      try {
        const bounds = bbox(combined);
        map.current.fitBounds(
          [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
          { padding: 50, maxZoom: 14, duration: 500 }
        );
      } catch (e) {
        console.warn("Could not fit bounds:", e);
      }
    }
  }, [data?.boundaries, mapLoaded, activeTab, regionsData?.regions, isAssigningMode, layerRefreshCounter, visibleRegionIds, showUnassigned, regionBoundaryGeometries]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (map.current.getLayer('boundary-hover-fill')) {
      map.current.removeLayer('boundary-hover-fill');
    }
    if (map.current.getLayer('boundary-hover-outline')) {
      map.current.removeLayer('boundary-hover-outline');
    }
    if (map.current.getSource('boundary-hover')) {
      map.current.removeSource('boundary-hover');
    }

    if (hoveredBoundary?.geometry) {
      const feature: GeoJSON.Feature = {
        type: "Feature",
        properties: { name: hoveredBoundary.name },
        geometry: hoveredBoundary.geometry,
      };

      map.current.addSource('boundary-hover', {
        type: 'geojson',
        data: feature,
      });

      map.current.addLayer({
        id: 'boundary-hover-fill',
        type: 'fill',
        source: 'boundary-hover',
        paint: {
          'fill-color': '#FCD34D',
          'fill-opacity': 0.4,
        },
      });

      map.current.addLayer({
        id: 'boundary-hover-outline',
        type: 'line',
        source: 'boundary-hover',
        paint: {
          'line-color': '#F59E0B',
          'line-width': 3,
        },
      });

      try {
        const bounds = bbox(feature);
        map.current.fitBounds(
          [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
          { padding: 50, maxZoom: 14, duration: 500 }
        );
      } catch (e) {
        console.warn("Could not fit bounds for hovered boundary:", e);
      }
    }
  }, [hoveredBoundary, mapLoaded]);

  // Assignment mode map layers and click handlers
  useEffect(() => {
    if (!map.current || !mapLoaded || !data?.boundaries) return;
    
    // Guard with isStyleLoaded check to prevent "Style is not done loading" errors
    if (!map.current.isStyleLoaded()) return;

    const ASSIGN_LAYERS = [
      'assign-selected-fill', 'assign-selected-outline',
      'assign-unselected-fill', 'assign-unselected-outline',
      'assign-hover-outline'
    ];

    // Helper to remove event handlers using refs
    const removeEventHandlers = () => {
      if (!map.current) return;
      if (assignClickHandlerRef.current) {
        if (map.current.getLayer('assign-unselected-fill')) {
          map.current.off('click', 'assign-unselected-fill', assignClickHandlerRef.current);
        }
        if (map.current.getLayer('assign-selected-fill')) {
          map.current.off('click', 'assign-selected-fill', assignClickHandlerRef.current);
        }
      }
      if (assignMouseMoveHandlerRef.current) {
        if (map.current.getLayer('assign-unselected-fill')) {
          map.current.off('mousemove', 'assign-unselected-fill', assignMouseMoveHandlerRef.current);
        }
        if (map.current.getLayer('assign-selected-fill')) {
          map.current.off('mousemove', 'assign-selected-fill', assignMouseMoveHandlerRef.current);
        }
      }
      if (assignMouseLeaveHandlerRef.current) {
        if (map.current.getLayer('assign-unselected-fill')) {
          map.current.off('mouseleave', 'assign-unselected-fill', assignMouseLeaveHandlerRef.current);
        }
        if (map.current.getLayer('assign-selected-fill')) {
          map.current.off('mouseleave', 'assign-selected-fill', assignMouseLeaveHandlerRef.current);
        }
      }
    };

    // Clear assignment mode layers
    const clearAssignmentLayers = () => {
      ASSIGN_LAYERS.forEach(layer => {
        if (map.current?.getLayer(layer)) {
          map.current.removeLayer(layer);
        }
      });
      if (map.current?.getSource('assign-all-boundaries')) {
        map.current.removeSource('assign-all-boundaries');
      }
    };

    if (!isAssigningMode) {
      // Not in assignment mode - clean up everything
      removeEventHandlers();
      assignClickHandlerRef.current = null;
      assignMouseMoveHandlerRef.current = null;
      assignMouseLeaveHandlerRef.current = null;
      clearAssignmentLayers();
      return;
    }

    // Create features for all boundaries with selection state
    const allFeatures: GeoJSON.Feature[] = data.boundaries
      .filter(b => b.boundary?.geometry)
      .map(b => ({
        type: "Feature" as const,
        properties: { 
          boundaryId: b.boundary!.id,
          name: b.boundary?.name,
          isSelected: selectedBoundaryIds.includes(b.boundary!.id)
        },
        geometry: b.boundary!.geometry,
      }));

    if (allFeatures.length === 0) return;

    const featureCollection: GeoJSON.FeatureCollection = { 
      type: 'FeatureCollection', 
      features: allFeatures 
    };

    // Check if source already exists - use setData instead of removing/re-adding
    const existingSource = map.current.getSource('assign-all-boundaries') as mapboxgl.GeoJSONSource | undefined;
    
    if (existingSource) {
      // Source exists - just update the data (avoids "Style is not done loading" errors)
      existingSource.setData(featureCollection);
    } else {
      // Source doesn't exist - create it and the layers
      map.current.addSource('assign-all-boundaries', {
        type: 'geojson',
        data: featureCollection,
      });

      // Unselected boundaries layer (gray, low opacity)
      map.current.addLayer({
        id: 'assign-unselected-fill',
        type: 'fill',
        source: 'assign-all-boundaries',
        filter: ['==', ['get', 'isSelected'], false],
        paint: {
          'fill-color': '#94A3B8',
          'fill-opacity': 0.15,
        },
      });

      map.current.addLayer({
        id: 'assign-unselected-outline',
        type: 'line',
        source: 'assign-all-boundaries',
        filter: ['==', ['get', 'isSelected'], false],
        paint: {
          'line-color': '#64748B',
          'line-width': 1,
        },
      });

      // Selected boundaries layer (region color, higher opacity)
      map.current.addLayer({
        id: 'assign-selected-fill',
        type: 'fill',
        source: 'assign-all-boundaries',
        filter: ['==', ['get', 'isSelected'], true],
        paint: {
          'fill-color': assigningRegion?.color || '#3B82F6',
          'fill-opacity': 0.4,
        },
      });

      map.current.addLayer({
        id: 'assign-selected-outline',
        type: 'line',
        source: 'assign-all-boundaries',
        filter: ['==', ['get', 'isSelected'], true],
        paint: {
          'line-color': assigningRegion?.color || '#3B82F6',
          'line-width': 3,
        },
      });

      // Create stable handlers that read from refs (not closures over state)
      // This prevents handler accumulation on re-renders
      const handleClick = (e: mapboxgl.MapMouseEvent) => {
        if (!e.features?.length) return;
        const boundaryId = e.features[0].properties?.boundaryId;
        if (boundaryId) {
          // Use ref to get current selection state
          const currentSelected = selectedBoundaryIdsRef.current;
          if (currentSelected.includes(boundaryId)) {
            setSelectedBoundaryIds(currentSelected.filter(id => id !== boundaryId));
          } else {
            setSelectedBoundaryIds([...currentSelected, boundaryId]);
          }
        }
      };

      const handleMouseMove = (e: mapboxgl.MapMouseEvent) => {
        if (e.features?.length) {
          map.current!.getCanvas().style.cursor = 'pointer';
          const boundaryId = e.features[0].properties?.boundaryId;
          setHoveredAssignBoundaryId(boundaryId || null);
        } else {
          map.current!.getCanvas().style.cursor = '';
          setHoveredAssignBoundaryId(null);
        }
      };

      const handleMouseLeave = () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = '';
        }
        setHoveredAssignBoundaryId(null);
      };

      // Store handler refs so they can be properly removed later
      assignClickHandlerRef.current = handleClick;
      assignMouseMoveHandlerRef.current = handleMouseMove;
      assignMouseLeaveHandlerRef.current = handleMouseLeave;

      // Add event handlers
      map.current.on('click', 'assign-unselected-fill', handleClick);
      map.current.on('click', 'assign-selected-fill', handleClick);
      map.current.on('mousemove', 'assign-unselected-fill', handleMouseMove);
      map.current.on('mousemove', 'assign-selected-fill', handleMouseMove);
      map.current.on('mouseleave', 'assign-unselected-fill', handleMouseLeave);
      map.current.on('mouseleave', 'assign-selected-fill', handleMouseLeave);
    }

    // Cleanup function - remove handlers on unmount or when deps change causing full re-render
    return () => {
      // Note: We don't remove handlers here for selectedBoundaryIds changes
      // because we use setData instead of recreating sources/layers
      // Handlers are only removed when exiting assignment mode or unmounting
    };
  }, [isAssigningMode, mapLoaded, data?.boundaries, selectedBoundaryIds, assigningRegion?.color]);

  // Get hovered boundary name for tooltip
  const hoveredAssignBoundaryName = hoveredAssignBoundaryId 
    ? data?.boundaries?.find(b => b.boundary?.id === hoveredAssignBoundaryId)?.boundary?.name 
    : null;

  const handleAddBoundary = (boundary: Boundary) => {
    addBoundaryMutation.mutate({ boundary_id: boundary.id, role: 'included' });
  };

  const handleRoleChange = (boundaryId: string, newRole: BoundaryRole) => {
    updateBoundaryMutation.mutate({ boundary_id: boundaryId, role: newRole });
  };

  const handleRemoveBoundary = (boundaryId: string) => {
    updateBoundaryMutation.mutate({ boundary_id: boundaryId, remove: true });
  };

  const handleMapPickerSave = async (selectedBoundaries: { id: string; name: string; type: string; geometry?: any }[]) => {
    const existingIds = new Set(data?.boundaries?.map(b => b.boundary?.id).filter(Boolean) || []);
    const selectedIds = new Set(selectedBoundaries.map(b => b.id));
    
    // Find boundaries to add (in selection but not existing)
    const boundariesToAdd = selectedBoundaries.filter(b => !existingIds.has(b.id));
    
    // Find boundaries to remove (existing but not in selection)
    const boundariesToRemove = (data?.boundaries || [])
      .filter(b => b.boundary?.id && !selectedIds.has(b.boundary.id))
      .map(b => b.boundary!.id);
    
    if (boundariesToAdd.length === 0 && boundariesToRemove.length === 0) {
      setIsMapPickerOpen(false);
      return;
    }
    
    setIsSavingBoundaries(true);
    
    const BATCH_SIZE = 5;
    let addedCount = 0;
    let removedCount = 0;
    let failCount = 0;
    
    // Remove boundaries first
    for (let i = 0; i < boundariesToRemove.length; i += BATCH_SIZE) {
      const batch = boundariesToRemove.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(boundaryId => 
          apiRequest("PATCH", `/api/admin/city-platforms/${platformId}/boundaries`, {
            boundary_id: boundaryId,
            remove: true,
          })
        )
      );
      
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          removedCount++;
        } else {
          failCount++;
          console.error(`Failed to remove boundary:`, result.reason);
        }
      });
    }
    
    // Add new boundaries
    for (let i = 0; i < boundariesToAdd.length; i += BATCH_SIZE) {
      const batch = boundariesToAdd.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(boundary => 
          apiRequest("POST", `/api/admin/city-platforms/${platformId}/boundaries`, {
            boundary_id: boundary.id,
            role: 'included' as BoundaryRole,
          })
        )
      );
      
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          addedCount++;
        } else {
          failCount++;
          console.error(`Failed to add boundary ${batch[idx].name}:`, result.reason);
        }
      });
    }
    
    setIsSavingBoundaries(false);
    setIsMapPickerOpen(false);
    
    queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/boundaries`] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/city-platforms'] });
    
    // Build description message
    const parts: string[] = [];
    if (addedCount > 0) parts.push(`Added ${addedCount}`);
    if (removedCount > 0) parts.push(`Removed ${removedCount}`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    
    toast({
      title: "Boundaries Updated",
      description: parts.join('. ') + '.',
      variant: failCount > 0 && addedCount === 0 && removedCount === 0 ? "destructive" : "default",
    });
  };

  // Handler for saving region boundaries from the full BoundaryMapPicker
  const handleRegionPickerSave = async (selectedBoundaries: { id: string; name: string; type: string; geometry?: any }[]) => {
    if (!pickingRegionBoundaries) return;
    
    const selectedIds = selectedBoundaries.map(b => b.id);
    
    setIsSavingBoundaries(true);
    
    try {
      await assignBoundariesMutation.mutateAsync({ 
        region_id: pickingRegionBoundaries.id, 
        boundary_ids: selectedIds 
      });
    } catch (error) {
      console.error('Error saving region boundaries:', error);
    }
    
    setIsSavingBoundaries(false);
    setIsRegionPickerOpen(false);
    setPickingRegionBoundaries(null);
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <Skeleton className="h-12 w-64 mb-8" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!canManageBoundaries) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to manage boundaries for this platform.</p>
          <p className="text-sm text-muted-foreground mt-2">Contact a super admin to request boundary management access.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(`/admin/platform/${platformId}`)}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </AdminLayout>
    );
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-[600px]" />
            <Skeleton className="h-[600px]" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Boundaries</h2>
            <p className="text-muted-foreground mb-4">
              {(error as Error).message || "Failed to load platform boundaries"}
            </p>
            <Button onClick={() => navigate("/admin/city-platforms")} data-testid="button-back-to-platforms">
              Back to Platforms
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {isSavingBoundaries && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card rounded-lg shadow-lg p-6 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Saving Boundaries...</p>
              <p className="text-sm text-muted-foreground">Linking churches to selected regions</p>
            </div>
          </div>
        </div>
      )}
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin/city-platforms")}
              data-testid="button-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">
                Manage Boundaries
              </h1>
              <p className="text-muted-foreground">
                {data?.platform?.name || "City Platform"} - Configure geographic boundaries
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(`/${platformId}`)}
            data-testid="button-view-platform"
          >
            <Globe className="h-4 w-4 mr-2" />
            View Platform
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList data-testid="tabs-boundaries-regions">
            <TabsTrigger value="boundaries" data-testid="tab-boundaries">
              <MapPin className="h-4 w-4 mr-2" />
              Boundaries
            </TabsTrigger>
            <TabsTrigger value="regions" data-testid="tab-regions">
              <Layers className="h-4 w-4 mr-2" />
              Regions
            </TabsTrigger>
          </TabsList>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <TabsContent value="boundaries" className="mt-0 space-y-6">
                <Card>
                  <CardHeader className="space-y-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Add Boundaries
                      </CardTitle>
                      <CardDescription>
                        Add geographic boundaries to define platform coverage
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => setIsMapPickerOpen(true)}
                      className="w-full sm:w-auto"
                      data-testid="button-open-map-picker"
                    >
                      <Map className="h-4 w-4 mr-2" />
                      Select on Map
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Or search for a specific boundary:
                      </p>
                      <BoundarySearch
                        onSelect={handleAddBoundary}
                        onHover={setHoveredBoundary}
                        className="w-full"
                      />
                    </div>
                    {addBoundaryMutation.isPending && (
                      <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Adding boundary...
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Platform Boundaries</CardTitle>
                    <CardDescription>
                      {data?.boundaries?.length || 0} boundar{(data?.boundaries?.length || 0) !== 1 ? 'ies' : 'y'} configured
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data?.boundaries && data.boundaries.length > 0 ? (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Boundary</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.boundaries.map((item) => (
                              <TableRow key={item.id} data-testid={`row-boundary-${item.boundary?.id}`}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div className="min-w-0">
                                      <div className="font-medium truncate">{item.boundary?.name || "Unknown"}</div>
                                      <div className="text-xs text-muted-foreground">{item.boundary?.type}</div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={item.role}
                                    onValueChange={(value) => handleRoleChange(item.boundary!.id, value as BoundaryRole)}
                                    disabled={updateBoundaryMutation.isPending}
                                  >
                                    <SelectTrigger 
                                      className="w-[130px]" 
                                      data-testid={`select-role-${item.boundary?.id}`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="primary">
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ROLE_COLORS.primary.fill }} />
                                          Primary
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="included">
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ROLE_COLORS.included.fill }} />
                                          Included
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="excluded">
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ROLE_COLORS.excluded.fill }} />
                                          Excluded
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="text-right">
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={updateBoundaryMutation.isPending}
                                        data-testid={`button-remove-${item.boundary?.id}`}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Remove Boundary</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to remove "{item.boundary?.name}" from this platform?
                                          This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleRemoveBoundary(item.boundary!.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          data-testid="button-confirm-remove"
                                        >
                                          Remove
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-12 border rounded-lg border-dashed">
                        <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                        <p className="text-muted-foreground">No boundaries configured</p>
                        <p className="text-sm text-muted-foreground">Use the search above to add boundaries</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="p-4">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: ROLE_COLORS.primary.fill }} />
                      <span>Primary</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: ROLE_COLORS.included.fill }} />
                      <span>Included</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded border-2 border-dashed" style={{ borderColor: ROLE_COLORS.excluded.outline, backgroundColor: `${ROLE_COLORS.excluded.fill}40` }} />
                      <span>Excluded</span>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="regions" className="mt-0 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Layers className="h-5 w-5" />
                        Regions
                      </CardTitle>
                      <CardDescription>
                        Organize boundaries into named regions
                      </CardDescription>
                    </div>
                    <Button onClick={openCreateRegionDialog} data-testid="button-create-region">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Region
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {regionsLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                      </div>
                    ) : regionsData?.regions && regionsData.regions.length > 0 ? (
                      <div className="space-y-3">
                        {regionsData.regions.map((region) => (
                          <Card key={region.id} className="p-4" data-testid={`card-region-${region.id}`}>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div 
                                  className="w-5 h-5 rounded-full shrink-0 border" 
                                  style={{ backgroundColor: region.color }}
                                  data-testid={`swatch-region-${region.id}`}
                                />
                                <div className="min-w-0">
                                  <div className="font-medium truncate" data-testid={`text-region-name-${region.id}`}>
                                    {region.name}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {region.boundary_count} boundaries
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {region.church_count} churches
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => enterAssignMode(region)}
                                  data-testid={`button-assign-${region.id}`}
                                  title="Assign boundaries on map"
                                >
                                  <Layers className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditRegionDialog(region)}
                                  data-testid={`button-edit-${region.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      data-testid={`button-delete-${region.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Region</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete "{region.name}"? 
                                        This will unassign all boundaries from this region.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteRegionMutation.mutate(region.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 border rounded-lg border-dashed">
                        <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                        <p className="text-muted-foreground">No regions created</p>
                        <p className="text-sm text-muted-foreground mb-4">Create regions to organize boundaries</p>
                        <Button onClick={openCreateRegionDialog} variant="outline" data-testid="button-create-first-region">
                          <Plus className="h-4 w-4 mr-2" />
                          Create First Region
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="p-4">
                  <div className="flex flex-wrap gap-4 text-sm">
                    {regionsData?.regions?.map((region) => (
                      <label 
                        key={region.id} 
                        className="flex items-center gap-2 cursor-pointer hover-elevate rounded px-2 py-1 -mx-2 -my-1"
                        data-testid={`toggle-region-${region.id}`}
                      >
                        <Checkbox
                          checked={visibleRegionIds.has(region.id)}
                          onCheckedChange={(checked) => {
                            setVisibleRegionIds(prev => {
                              const next = new Set(prev);
                              if (checked) {
                                next.add(region.id);
                              } else {
                                next.delete(region.id);
                              }
                              return next;
                            });
                          }}
                          className="border-2"
                          style={{ 
                            borderColor: region.color,
                            backgroundColor: visibleRegionIds.has(region.id) ? region.color : 'transparent'
                          }}
                        />
                        <span>{region.name}</span>
                      </label>
                    ))}
                    <label 
                      className="flex items-center gap-2 cursor-pointer hover-elevate rounded px-2 py-1 -mx-2 -my-1"
                      data-testid="toggle-region-unassigned"
                    >
                      <Checkbox
                        checked={showUnassigned}
                        onCheckedChange={(checked) => setShowUnassigned(!!checked)}
                        className="border-2 border-dashed"
                        style={{ 
                          borderColor: UNASSIGNED_BOUNDARY_COLOR,
                          backgroundColor: showUnassigned ? `${UNASSIGNED_BOUNDARY_COLOR}50` : 'transparent'
                        }}
                      />
                      <span>Unassigned</span>
                    </label>
                  </div>
                </Card>
              </TabsContent>
            </div>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>
                  {isAssigningMode ? (
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: assigningRegion?.color }} 
                      />
                      Assigning to: {assigningRegion?.name}
                    </div>
                  ) : (
                    "Map Preview"
                  )}
                </CardTitle>
                <CardDescription>
                  {isAssigningMode
                    ? "Click on boundaries to select or deselect them"
                    : activeTab === "regions" 
                      ? "Boundaries colored by region assignment"
                      : "Visual representation of all platform boundaries"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div
                  ref={mapContainer}
                  className="h-[500px] rounded-lg overflow-hidden border"
                  data-testid="map-container"
                />
                
                {/* Hover tooltip for assignment mode */}
                {isAssigningMode && hoveredAssignBoundaryName && (
                  <div 
                    className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-sm border rounded-md px-3 py-2 shadow-md z-10 pointer-events-none"
                    data-testid="tooltip-boundary-name"
                  >
                    <span className="text-sm font-medium">{hoveredAssignBoundaryName}</span>
                  </div>
                )}
                
                {/* Floating panel for assignment mode */}
                {isAssigningMode && (
                  <div 
                    className="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur-sm border rounded-lg p-4 shadow-lg z-10"
                    data-testid="panel-assign-boundaries"
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div 
                          className="w-5 h-5 rounded-full shrink-0 border" 
                          style={{ backgroundColor: assigningRegion?.color }}
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{assigningRegion?.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {selectedBoundaryIds.length} boundar{selectedBoundaryIds.length !== 1 ? 'ies' : 'y'} selected
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={closeAssignMode}
                          data-testid="button-cancel-assign"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAssignBoundaries}
                          disabled={assignBoundariesMutation.isPending}
                          data-testid="button-save-assign"
                        >
                          {assignBoundariesMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-2" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </Tabs>
      </div>
      
      <BoundaryMapPicker
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        onSave={handleMapPickerSave}
        initialSelectedIds={data?.boundaries?.map(b => b.boundary?.id).filter(Boolean) as string[] || []}
        initialCenter={data?.platform?.default_center_lng && data?.platform?.default_center_lat 
          ? [data.platform.default_center_lng, data.platform.default_center_lat] 
          : undefined}
        initialZoom={data?.platform?.default_zoom || undefined}
        title={`Select Boundaries for ${data?.platform?.name || 'Platform'}`}
        description="Click on regions to select or deselect them. Selected regions define your platform's coverage area."
        showPlatformBoundaryToggle={true}
        platformBoundaryIds={data?.boundaries?.map(b => b.boundary?.id).filter(Boolean) as string[] || []}
        regions={regionsData?.regions?.map(r => ({
          id: r.id,
          name: r.name,
          color: r.color,
          boundaryIds: r.boundary_ids || []
        })) || []}
        pickerId="platform-picker"
      />

      {/* Region-specific boundary picker */}
      <BoundaryMapPicker
        isOpen={isRegionPickerOpen}
        onClose={() => {
          setIsRegionPickerOpen(false);
          setPickingRegionBoundaries(null);
        }}
        onSave={handleRegionPickerSave}
        initialSelectedIds={pickingRegionBoundaries?.boundary_ids || []}
        initialCenter={data?.platform?.default_center_lng && data?.platform?.default_center_lat 
          ? [data.platform.default_center_lng, data.platform.default_center_lat] 
          : undefined}
        initialZoom={data?.platform?.default_zoom || undefined}
        title={`Select Boundaries for Region: ${pickingRegionBoundaries?.name || 'Region'}`}
        description="Click on boundaries to select or deselect them for this region."
        platformBoundaryIds={data?.boundaries?.map(b => b.boundary?.id).filter(Boolean) as string[] || []}
        showPlatformBoundaryToggle={true}
        showChurchToggle={true}
        platformId={platformId}
        regions={regionsData?.regions?.map(r => ({
          id: r.id,
          name: r.name,
          color: r.color,
          boundaryIds: r.boundary_ids || []
        })) || []}
        pickerId="region-picker"
        selectionColor={pickingRegionBoundaries?.color}
      />

      <Dialog open={isRegionDialogOpen} onOpenChange={(open) => !open && closeRegionDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRegion ? "Edit Region" : "Create Region"}</DialogTitle>
            <DialogDescription>
              {editingRegion ? "Update the region name and color." : "Create a new region to group boundaries."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="region-name">Name</Label>
              <Input
                id="region-name"
                placeholder="e.g., Downtown, East Side"
                value={regionName}
                onChange={(e) => setRegionName(e.target.value)}
                data-testid="input-region-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {REGION_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      regionColor === color ? "border-foreground scale-110" : "border-transparent hover:border-muted-foreground"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setRegionColor(color)}
                    data-testid={`color-swatch-${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRegionDialog} data-testid="button-cancel-region">
              Cancel
            </Button>
            <Button 
              onClick={handleSaveRegion} 
              disabled={!regionName.trim() || createRegionMutation.isPending || updateRegionMutation.isPending}
              data-testid="button-save-region"
            >
              {(createRegionMutation.isPending || updateRegionMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingRegion ? "Save Changes" : "Create Region"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  );
}
