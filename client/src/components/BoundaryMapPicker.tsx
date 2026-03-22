import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import bbox from "@turf/bbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, X, MapPin, Check, Search, Layers, ChevronDown } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Region overlay data for multi-select
interface RegionOverlayData {
  id: string;
  name: string;
  color: string;
  boundaryIds: string[];
}
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [-85.6681, 42.9634];
const DEFAULT_ZOOM = 8;

const BOUNDARY_TYPES = [
  { value: "city", label: "Cities/Places" },
  { value: "county", label: "Counties" },
  { value: "county_subdivision", label: "Townships" },
  { value: "school_district", label: "School Districts" },
  { value: "zip", label: "ZIP Codes" },
  { value: "census_tract", label: "Census Tracts" },
];

// Zoom thresholds for auto boundary type selection (additive - zooming in adds more types)
const ZOOM_THRESHOLDS = {
  COUNTY: 7,      // zoom < 7: show counties only
  TOWNSHIP: 9,    // zoom 7-9: add townships/county subdivisions  
  CITY: 10,       // zoom >= 10: add cities/places
};

// Determine which boundary types to show based on zoom level (exclusive logic)
// Only ONE boundary type is visible/clickable at each zoom level to prevent overlap
function getZoomBasedBoundaryTypes(zoom: number): string[] {
  if (zoom >= ZOOM_THRESHOLDS.CITY) return ["city"];           // zoom >= 10: cities only
  if (zoom >= ZOOM_THRESHOLDS.TOWNSHIP) return ["county_subdivision"]; // zoom 7-9: townships only
  return ["county"];  // zoom < 7: counties only
}

// Get display label for current zoom-based types
function getZoomBasedTypeLabel(zoom: number): string {
  if (zoom >= ZOOM_THRESHOLDS.CITY) return "Cities/Places";
  if (zoom >= ZOOM_THRESHOLDS.TOWNSHIP) return "Townships";
  return "Counties";
}

interface BoundaryWithGeometry {
  id: string;
  name: string;
  type: string;
  external_id?: string;
  geometry?: any;
  centroid_lng?: number;
  centroid_lat?: number;
  church_count?: number;
}

interface BoundaryMapPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedBoundaries: BoundaryWithGeometry[]) => void;
  initialSelectedIds?: string[];
  initialCenter?: [number, number];
  initialZoom?: number;
  title?: string;
  description?: string;
  // Optional: Show platform boundaries as reference overlay
  platformBoundaryIds?: string[];
  showPlatformBoundaryToggle?: boolean;
  // Optional: Show churches toggle
  showChurchToggle?: boolean;
  // Optional: Platform ID to filter churches to platform-specific ones
  platformId?: string;
  // Optional: Platform regions for overlay selection
  regions?: RegionOverlayData[];
  // Optional: Unique ID to namespace map layers (prevents conflicts between multiple pickers)
  pickerId?: string;
  // Optional: Custom color for selected boundaries (defaults to blue)
  selectionColor?: string;
}

export function BoundaryMapPicker({
  isOpen,
  onClose,
  onSave,
  initialSelectedIds = [],
  initialCenter,
  initialZoom,
  title = "Select Platform Boundaries",
  description = "Click on regions to select or deselect them. Selected regions define your platform's coverage area.",
  platformBoundaryIds = [],
  showPlatformBoundaryToggle = false,
  showChurchToggle = false,
  platformId,
  regions = [],
  pickerId = "default",
  selectionColor = "#3B82F6"
}: BoundaryMapPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [boundaryType, setBoundaryType] = useState("city");
  const [currentZoom, setCurrentZoom] = useState(initialZoom || DEFAULT_ZOOM);
  const [boundaries, setBoundaries] = useState<BoundaryWithGeometry[]>([]);
  const [selectedBoundaries, setSelectedBoundaries] = useState<BoundaryWithGeometry[]>([]);
  const [hoveredBoundaryId, setHoveredBoundaryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyWithChurches, setShowOnlyWithChurches] = useState(false);
  
  // Multi-select overlays: "platform" for platform boundaries, "churches" for church markers, or region IDs
  const [selectedOverlays, setSelectedOverlays] = useState<Set<string>>(new Set(["platform"]));
  const [platformBoundaryData, setPlatformBoundaryData] = useState<BoundaryWithGeometry[]>([]);
  const [regionBoundaryData, setRegionBoundaryData] = useState<Map<string, BoundaryWithGeometry[]>>(new Map());
  const [overlayDropdownOpen, setOverlayDropdownOpen] = useState(false);
  
  // Derived state for churches visibility from overlay selection
  const showChurches = selectedOverlays.has("churches");
  
  // Selected boundary type — always a single type
  const effectiveBoundaryTypes = [boundaryType];
  
  const selectedIdsSet = useRef(new Set<string>(initialSelectedIds));
  const lastInitialIdsRef = useRef<string>("");
  const boundariesRef = useRef<BoundaryWithGeometry[]>([]);
  const selectedBoundariesRef = useRef<BoundaryWithGeometry[]>([]);
  const handleBoundaryClickRef = useRef<(id: string) => void>(() => {});
  const layerEventsRegistered = useRef(false);
  const fetchBoundariesRef = useRef<() => void>(() => {});
  const fetchedRegionIdsRef = useRef<Set<string>>(new Set());

  const fetchBoundariesByIds = useCallback(async (ids: string[]): Promise<BoundaryWithGeometry[]> => {
    if (ids.length === 0) return [];
    
    try {
      const params = new URLSearchParams();
      ids.forEach(id => params.append("ids", id));
      
      const response = await fetch(`/api/boundaries/by-ids?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      return await response.json();
    } catch (error) {
      console.error("Error fetching boundaries by ID:", error);
      return [];
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const newIdSet = new Set(initialSelectedIds);
      selectedIdsSet.current = newIdSet;
      
      // Reset overlay selection state when picker opens (prevents state leaking between pickers)
      setSelectedOverlays(new Set(["platform"]));
      setRegionBoundaryData(new Map());
      setPlatformBoundaryData([]); // Also reset platform boundary data so it refetches
      fetchedRegionIdsRef.current = new Set();
      
      const sortedIds = [...initialSelectedIds].sort().join(",");
      const shouldFetchInitial = sortedIds !== lastInitialIdsRef.current && initialSelectedIds.length > 0;
      
      if (shouldFetchInitial) {
        lastInitialIdsRef.current = sortedIds;
        fetchBoundariesByIds(initialSelectedIds).then(fetchedBoundaries => {
          if (fetchedBoundaries.length > 0) {
            setSelectedBoundaries(fetchedBoundaries);
            selectedBoundariesRef.current = fetchedBoundaries;
            setTimeout(() => {
              updateMapLayers(boundariesRef.current, fetchedBoundaries);
            }, 0);
          }
        });
      } else if (initialSelectedIds.length === 0) {
        setSelectedBoundaries([]);
        selectedBoundariesRef.current = [];
      }
    }
  // Note: updateMapLayers intentionally excluded - called via setTimeout captures latest ref
  }, [isOpen, initialSelectedIds, fetchBoundariesByIds]);

  const fetchBoundariesInViewport = useCallback(async () => {
    if (!map.current) return;
    
    const bounds = map.current.getBounds();
    if (!bounds) return;
    
    setIsLoading(true);
    
    try {
      const params = new URLSearchParams({
        minLng: bounds.getWest().toString(),
        minLat: bounds.getSouth().toString(),
        maxLng: bounds.getEast().toString(),
        maxLat: bounds.getNorth().toString(),
        limit: "1000",
        includeChurchCounts: "true"
      });
      
      // Pass selected boundary type to filter
      if (!effectiveBoundaryTypes.includes("all")) {
        params.set("type", effectiveBoundaryTypes.join(","));
      }

      // Include census tracts when explicitly selected (they're excluded by default)
      if (effectiveBoundaryTypes.includes("census_tract")) {
        params.set("include_tracts", "true");
      }
      
      const response = await fetch(`/api/boundaries/viewport?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      setBoundaries(data);
      boundariesRef.current = data;
      
      setSelectedBoundaries(prev => {
        const validPrev = prev.filter(b => selectedIdsSet.current.has(b.id));
        const existingIds = new Set(validPrev.map(b => b.id));
        const newlyMatchedBoundaries = data.filter(
          (b: BoundaryWithGeometry) => selectedIdsSet.current.has(b.id) && !existingIds.has(b.id)
        );
        const updated = [...validPrev, ...newlyMatchedBoundaries];
        // Update the ref immediately for the map layer update
        selectedBoundariesRef.current = updated;
        return updated;
      });
      
      updateMapLayers(data, selectedBoundariesRef.current);
    } catch (error) {
      console.error("Error fetching boundaries:", error);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveBoundaryTypes.join(",")]);

  // Keep ref current so map event handlers always call latest version
  fetchBoundariesRef.current = fetchBoundariesInViewport;

  // Helper to parse geometry if it's a JSON string (PostGIS returns stringified GeoJSON)
  const parseGeometry = (geometry: any): any => {
    if (!geometry) return null;
    if (typeof geometry === 'string') {
      try {
        return JSON.parse(geometry);
      } catch (e) {
        console.warn('Failed to parse geometry string:', e);
        return null;
      }
    }
    return geometry;
  };

  // Helper to validate GeoJSON geometry
  const isValidGeometry = (geometry: any): boolean => {
    const parsed = parseGeometry(geometry);
    if (!parsed) return false;
    if (!parsed.type) return false;
    if (!parsed.coordinates) return false;
    if (parsed.type === 'Polygon' && (!Array.isArray(parsed.coordinates) || parsed.coordinates.length === 0)) return false;
    if (parsed.type === 'MultiPolygon' && (!Array.isArray(parsed.coordinates) || parsed.coordinates.length === 0)) return false;
    return true;
  };

  const updateMapLayers = useCallback((boundaryData: BoundaryWithGeometry[], currentSelectedBoundaries?: BoundaryWithGeometry[]) => {
    if (!map.current || !mapLoaded) return;
    
    // Namespace layer/source IDs with pickerId to avoid collisions with overlay layers
    const boundariesSourceId = `${pickerId}-boundaries`;
    const boundariesSelectedSourceId = `${pickerId}-boundaries-selected`;
    const fillLayerId = `${pickerId}-boundaries-fill`;
    const outlineLayerId = `${pickerId}-boundaries-outline`;
    const selectedFillLayerId = `${pickerId}-boundaries-selected-fill`;
    const selectedOutlineLayerId = `${pickerId}-boundaries-selected-outline`;
    const hoverLayerId = `${pickerId}-boundaries-hover`;
    
    // Remove existing layers (namespaced)
    const layersToRemove = [
      fillLayerId, outlineLayerId, 
      selectedFillLayerId, selectedOutlineLayerId, 
      hoverLayerId
    ];
    layersToRemove.forEach(layer => {
      if (map.current?.getLayer(layer)) {
        map.current.removeLayer(layer);
      }
    });
    
    // Remove existing sources (namespaced)
    [boundariesSourceId, boundariesSelectedSourceId].forEach(source => {
      if (map.current?.getSource(source)) {
        map.current.removeSource(source);
      }
    });
    
    // Merge viewport boundaries with selected boundaries (for out-of-viewport selections)
    const allBoundaries = [...boundaryData];
    const viewportIds = new Set(boundaryData.map(b => b.id));
    
    // Add selected boundaries that are outside current viewport
    const selectedToAdd = currentSelectedBoundaries || [];
    selectedToAdd.forEach(b => {
      if (!viewportIds.has(b.id) && isValidGeometry(b.geometry)) {
        allBoundaries.push(b);
      }
    });
    
    if (allBoundaries.length === 0) return;
    
    // All boundaries with valid geometry - PARSE geometry strings to objects
    const allFeatures = allBoundaries
      .filter(b => isValidGeometry(b.geometry))
      .map(b => ({
        type: "Feature" as const,
        properties: { 
          id: b.id, 
          name: b.name, 
          type: b.type
        },
        geometry: parseGeometry(b.geometry),
      }));
    
    if (allFeatures.length === 0) return;
    
    // Selected boundaries only with valid geometry - PARSE geometry strings to objects
    const selectedFeatures = allBoundaries
      .filter(b => isValidGeometry(b.geometry) && selectedIdsSet.current.has(b.id))
      .map(b => ({
        type: "Feature" as const,
        properties: { 
          id: b.id, 
          name: b.name, 
          type: b.type
        },
        geometry: parseGeometry(b.geometry),
      }));
    
    // Add source for all boundaries
    map.current.addSource(boundariesSourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: allFeatures,
      },
    });
    
    // Add source for selected boundaries
    map.current.addSource(boundariesSelectedSourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: selectedFeatures,
      },
    });
    
    // Layer for all boundaries (light style)
    map.current.addLayer({
      id: fillLayerId,
      type: "fill",
      source: boundariesSourceId,
      paint: {
        "fill-color": "#94A3B8",
        "fill-opacity": 0.1,
      },
    });
    
    map.current.addLayer({
      id: outlineLayerId,
      type: "line",
      source: boundariesSourceId,
      paint: {
        "line-color": "#64748B",
        "line-width": 1,
      },
    });
    
    // Layer for selected boundaries (on top with highlighted style)
    // Use selectionColor prop for custom region colors
    map.current.addLayer({
      id: selectedFillLayerId,
      type: "fill",
      source: boundariesSelectedSourceId,
      paint: {
        "fill-color": selectionColor,
        "fill-opacity": 0.35,
      },
    });
    
    map.current.addLayer({
      id: selectedOutlineLayerId,
      type: "line",
      source: boundariesSelectedSourceId,
      paint: {
        "line-color": selectionColor,
        "line-width": 3,
      },
    });
    
    // Hover layer
    map.current.addLayer({
      id: hoverLayerId,
      type: "line",
      source: boundariesSourceId,
      paint: {
        "line-color": "#1E40AF",
        "line-width": 3,
      },
      filter: ["==", ["get", "id"], ""],
    });
    
    // Register layer event handlers AFTER layers are created
    // Only register once to avoid duplicate handlers
    if (!layerEventsRegistered.current) {
      layerEventsRegistered.current = true;
      
      map.current.on("click", fillLayerId, (e) => {
        if (e.features && e.features[0]) {
          const boundaryId = e.features[0].properties?.id;
          if (boundaryId) {
            handleBoundaryClickRef.current(boundaryId);
          }
        }
      });
      
      map.current.on("mousemove", fillLayerId, (e) => {
        if (map.current) {
          map.current.getCanvas().style.cursor = "pointer";
          if (e.features && e.features[0]) {
            const boundaryId = e.features[0].properties?.id;
            if (boundaryId) {
              setHoveredBoundaryId(boundaryId);
              map.current.setFilter(hoverLayerId, ["==", ["get", "id"], boundaryId]);
            }
          }
        }
      });
      
      map.current.on("mouseleave", fillLayerId, () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = "";
          setHoveredBoundaryId(null);
          if (map.current.getLayer(hoverLayerId)) {
            map.current.setFilter(hoverLayerId, ["==", ["get", "id"], ""]);
          }
        }
      });
    }
  }, [mapLoaded, pickerId]);

  const handleBoundaryClick = useCallback((boundaryId: string) => {
    // Check both viewport boundaries and already-selected boundaries
    // (selected boundaries might not be in current viewport)
    let boundary = boundariesRef.current.find(b => b.id === boundaryId);
    
    // If not found in viewport, check if it's already selected (for toggle-off case)
    if (!boundary) {
      boundary = selectedBoundaries.find(b => b.id === boundaryId);
    }
    
    if (!boundary) {
      console.log("Boundary not found for click:", boundaryId, "- may need to fetch");
      return;
    }
    
    if (selectedIdsSet.current.has(boundaryId)) {
      selectedIdsSet.current.delete(boundaryId);
      setSelectedBoundaries(prev => {
        const updated = prev.filter(b => b.id !== boundaryId);
        selectedBoundariesRef.current = updated;
        return updated;
      });
    } else {
      selectedIdsSet.current.add(boundaryId);
      setSelectedBoundaries(prev => {
        const updated = [...prev, boundary!];
        selectedBoundariesRef.current = updated;
        return updated;
      });
    }
    
    // Use a small delay to ensure state is updated before re-rendering layers
    setTimeout(() => {
      updateMapLayers(boundariesRef.current, selectedBoundariesRef.current);
    }, 0);
  }, [updateMapLayers, selectedBoundaries]);

  // Keep refs updated so map click handler always has latest function/data
  handleBoundaryClickRef.current = handleBoundaryClick;
  selectedBoundariesRef.current = selectedBoundaries;

  const initializeMap = useCallback(() => {
    if (!mapContainer.current || map.current) return;
    
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    // Use provided initial center/zoom or defaults
    const center = initialCenter || DEFAULT_CENTER;
    const zoom = initialZoom || DEFAULT_ZOOM;
    
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
    
    // Track zoom level changes for auto boundary type switching
    map.current.on("zoomend", () => {
      if (map.current) {
        setCurrentZoom(map.current.getZoom());
      }
    });
    
    // Note: Click/hover handlers for boundaries-fill are registered in updateMapLayers
    // AFTER the layer is created, to ensure proper event binding
    
    // Use ref to always call latest fetchBoundariesInViewport (avoids stale closure)
    map.current.on("moveend", () => {
      fetchBoundariesRef.current();
    });
  }, [initialCenter, initialZoom]);

  useEffect(() => {
    if (isOpen && !map.current) {
      setTimeout(() => {
        initializeMap();
      }, 100);
    }
    
    return () => {
      if (!isOpen && map.current) {
        map.current.remove();
        map.current = null;
        setMapLoaded(false);
        layerEventsRegistered.current = false;
      }
    };
  }, [isOpen, initializeMap]);

  useEffect(() => {
    if (mapLoaded) {
      fetchBoundariesInViewport();
    }
  }, [mapLoaded, fetchBoundariesInViewport]);

  useEffect(() => {
    if (mapLoaded) {
      fetchBoundariesInViewport();
    }
  }, [effectiveBoundaryTypes.join(","), mapLoaded, fetchBoundariesInViewport]);

  // CRITICAL: When mapLoaded becomes true OR boundaries change, re-render the map layers.
  // This fixes the race condition where data arrives but updateMapLayers exits early 
  // because mapLoaded was false. We watch the `boundaries` STATE (not ref) so React
  // knows to re-run this effect when new data arrives.
  useEffect(() => {
    if (mapLoaded && boundaries.length > 0) {
      updateMapLayers(boundaries, selectedBoundariesRef.current);
    }
  }, [mapLoaded, boundaries, selectedBoundaries, updateMapLayers]);

  // Fetch platform boundaries when picker is open and map is loaded
  useEffect(() => {
    if (!isOpen || !mapLoaded || !map.current || !showPlatformBoundaryToggle || platformBoundaryIds.length === 0) return;
    
    // Only fetch if we don't already have data (was reset on open)
    if (platformBoundaryData.length > 0) return;
    
    const fetchPlatformBoundaries = async () => {
      console.log("🗺️ Fetching platform boundaries:", platformBoundaryIds.length, "IDs:", platformBoundaryIds);
      const data = await fetchBoundariesByIds(platformBoundaryIds);
      console.log("🗺️ Platform boundaries fetched:", data.length, "boundaries");
      // Log each boundary's geometry status to debug
      data.forEach((b: any) => {
        console.log(`🗺️ Fetched boundary: ${b.name}, geometry: ${b.geometry ? 'present' : 'NULL'}, type: ${typeof b.geometry}`);
      });
      setPlatformBoundaryData(data);
    };
    
    fetchPlatformBoundaries();
  }, [isOpen, mapLoaded, showPlatformBoundaryToggle, platformBoundaryIds, platformBoundaryData.length, fetchBoundariesByIds]);

  // Fetch region boundaries when regions are selected - merge with existing cache
  useEffect(() => {
    if (!mapLoaded || !map.current || regions.length === 0) return;
    
    // Filter to only region IDs (exclude "platform" and "churches")
    const selectedRegionIds = Array.from(selectedOverlays).filter(id => id !== "platform" && id !== "churches");
    if (selectedRegionIds.length === 0) return;
    
    let isCancelled = false;
    
    const fetchRegionBoundaries = async () => {
      for (const regionId of selectedRegionIds) {
        if (isCancelled) return;
        
        const region = regions.find(r => r.id === regionId);
        if (!region || !region.boundaryIds || region.boundaryIds.length === 0) continue;
        
        // Skip if we already fetched this region's data (using ref to avoid stale closure)
        if (fetchedRegionIdsRef.current.has(regionId)) continue;
        
        // Mark as fetching to prevent duplicate requests
        fetchedRegionIdsRef.current.add(regionId);
        
        const data = await fetchBoundariesByIds(region.boundaryIds);
        
        // Guard against stale updates - merge with existing state
        if (!isCancelled && data.length > 0) {
          setRegionBoundaryData(prev => {
            const newMap = new Map(prev);
            newMap.set(regionId, data);
            return newMap;
          });
        }
      }
    };
    
    fetchRegionBoundaries();
    
    return () => {
      isCancelled = true;
    };
  }, [mapLoaded, selectedOverlays, regions, fetchBoundariesByIds]);

  // Render platform boundaries overlay
  useEffect(() => {
    console.log('🗺️ Platform overlay effect triggered:', {
      mapLoaded,
      hasMap: !!map.current,
      platformBoundaryDataLength: platformBoundaryData.length,
      selectedOverlaysHasPlatform: selectedOverlays.has("platform")
    });
    
    if (!mapLoaded || !map.current) {
      console.log('🗺️ Platform overlay: Early exit - map not ready');
      return;
    }
    
    const sourceId = `${pickerId}-platform-boundaries-source`;
    const fillLayerId = `${pickerId}-platform-boundaries-fill`;
    const lineLayerId = `${pickerId}-platform-boundaries-line`;
    
    // Remove existing layers/source first
    if (map.current.getLayer(fillLayerId)) map.current.removeLayer(fillLayerId);
    if (map.current.getLayer(lineLayerId)) map.current.removeLayer(lineLayerId);
    if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
    
    const showPlatformOverlay = selectedOverlays.has("platform");
    if (!showPlatformOverlay || platformBoundaryData.length === 0) {
      console.log('🗺️ Platform overlay: Early exit - showOverlay:', showPlatformOverlay, 'dataLength:', platformBoundaryData.length);
      return;
    }
    
    // DEBUG: Log each boundary's geometry status
    console.log('🗺️ Platform boundaries geometry check:');
    platformBoundaryData.forEach(b => {
      const geomType = typeof b.geometry;
      const hasGeom = b.geometry !== null && b.geometry !== undefined;
      const isValid = isValidGeometry(b.geometry);
      console.log(`  - ${b.name}: geometry=${hasGeom ? 'present' : 'null'}, type=${geomType}, isValid=${isValid}`, 
        hasGeom ? (geomType === 'string' ? b.geometry.substring(0, 100) : b.geometry) : 'N/A');
    });
    
    // Parse geometry strings to objects (API returns stringified JSON)
    const features = platformBoundaryData
      .filter(b => isValidGeometry(b.geometry))
      .map(b => ({
        type: "Feature" as const,
        properties: { id: b.id, name: b.name },
        geometry: parseGeometry(b.geometry)
      }));
    
    console.log('🗺️ Platform overlay: features after filter:', features.length, 'of', platformBoundaryData.length);
    
    if (features.length === 0) {
      console.log('🗺️ Platform overlay: Early exit - no valid features');
      return;
    }
    
    try {
      console.log('🗺️ Platform overlay: Adding source and layers...');
      map.current.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features }
      });
      
      // Add layers ON TOP of other layers so the overlay is visible
      // The fill uses low opacity and line-only mode so users can still interact with boundaries beneath
      map.current.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.1
        }
      });
      
      map.current.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#3b82f6",
          "line-width": 3,
          "line-dasharray": [4, 3]
        }
      });
      console.log('🗺️ Platform overlay: Layers added successfully!');
    } catch (err) {
      console.error('🗺️ Platform overlay: Error adding layers:', err);
    }
  }, [mapLoaded, selectedOverlays, platformBoundaryData, pickerId, boundaries]);

  // Render region boundaries overlays
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    
    // Clean up existing region layers
    regions.forEach(region => {
      const sourceId = `${pickerId}-region-${region.id}-source`;
      const fillLayerId = `${pickerId}-region-${region.id}-fill`;
      const lineLayerId = `${pickerId}-region-${region.id}-line`;
      
      if (map.current?.getLayer(fillLayerId)) map.current.removeLayer(fillLayerId);
      if (map.current?.getLayer(lineLayerId)) map.current.removeLayer(lineLayerId);
      if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId);
    });
    
    // Add layers for selected regions
    regions.forEach(region => {
      if (!selectedOverlays.has(region.id)) return;
      
      const boundaryData = regionBoundaryData.get(region.id);
      if (!boundaryData || boundaryData.length === 0) return;
      
      const sourceId = `${pickerId}-region-${region.id}-source`;
      const fillLayerId = `${pickerId}-region-${region.id}-fill`;
      const lineLayerId = `${pickerId}-region-${region.id}-line`;
      
      const features = boundaryData
        .filter(b => isValidGeometry(b.geometry))
        .map(b => ({
          type: "Feature" as const,
          properties: { id: b.id, name: b.name },
          geometry: parseGeometry(b.geometry)
        }));
      
      if (features.length === 0) return;
      
      map.current!.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features }
      });
      
      // Add layers ON TOP so region overlays are visible
      map.current!.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": region.color,
          "fill-opacity": 0.2
        }
      });
      
      map.current!.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": region.color,
          "line-width": 3
        }
      });
    });
  }, [mapLoaded, selectedOverlays, regionBoundaryData, regions, pickerId, boundaries]);

  // Fetch and render churches when toggle is enabled
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    
    const sourceId = `${pickerId}-churches-source`;
    const layerId = `${pickerId}-churches-layer`;
    
    const cleanupChurchLayer = () => {
      if (map.current?.getLayer(layerId)) map.current.removeLayer(layerId);
      if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId);
    };
    
    cleanupChurchLayer();
    
    if (!showChurches) return;
    
    const fetchAndRenderChurches = async () => {
      try {
        const bounds = map.current?.getBounds();
        if (!bounds) return;
        
        const params = new URLSearchParams({
          minLng: bounds.getWest().toString(),
          maxLng: bounds.getEast().toString(),
          minLat: bounds.getSouth().toString(),
          maxLat: bounds.getNorth().toString(),
          limit: "500"
        });
        
        if (platformId) {
          params.set("platformId", platformId);
        }
        
        const response = await fetch(`/api/churches/in-viewport?${params}`);
        if (!response.ok) return;
        
        const churches = await response.json();
        
        if (!map.current || churches.length === 0) return;
        
        const features = churches
          .filter((c: any) => c.longitude && c.latitude)
          .map((c: any) => ({
            type: "Feature" as const,
            properties: { id: c.id, name: c.name },
            geometry: {
              type: "Point" as const,
              coordinates: [c.longitude, c.latitude]
            }
          }));
        
        const source = map.current.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
        if (source) {
          source.setData({ type: "FeatureCollection", features });
        } else {
          map.current.addSource(sourceId, {
            type: "geojson",
            data: { type: "FeatureCollection", features }
          });
          
          map.current.addLayer({
            id: layerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": 6,
              "circle-color": "#ef4444",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff"
            }
          });
        }
      } catch (error) {
        console.error("Error fetching churches:", error);
      }
    };
    
    fetchAndRenderChurches();
    
    const handleMoveEnd = () => {
      if (showChurches) {
        fetchAndRenderChurches();
      }
    };
    
    map.current.on("moveend", handleMoveEnd);
    
    return () => {
      if (map.current) {
        map.current.off("moveend", handleMoveEnd);
      }
    };
  }, [mapLoaded, showChurches, pickerId]);

  const handleRemoveBoundary = (boundaryId: string) => {
    selectedIdsSet.current.delete(boundaryId);
    setSelectedBoundaries(prev => {
      const updated = prev.filter(b => b.id !== boundaryId);
      selectedBoundariesRef.current = updated;
      return updated;
    });
    setTimeout(() => {
      updateMapLayers(boundariesRef.current, selectedBoundariesRef.current);
    }, 0);
  };

  const handleSave = () => {
    onSave(selectedBoundaries);
    onClose();
  };

  const handleZoomToBoundary = (boundary: BoundaryWithGeometry) => {
    if (!map.current || !boundary.geometry) return;
    
    try {
      const bounds = bbox(boundary.geometry);
      map.current.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 50, maxZoom: 12 }
      );
    } catch (e) {
      if (boundary.centroid_lng && boundary.centroid_lat) {
        map.current.flyTo({
          center: [boundary.centroid_lng, boundary.centroid_lat],
          zoom: 10
        });
      }
    }
  };

  const filteredBoundaries = boundaries.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase());
    const isSelected = selectedIdsSet.current.has(b.id);
    const matchesChurchFilter = !showOnlyWithChurches || isSelected || (b.church_count && b.church_count > 0);
    return matchesSearch && matchesChurchFilter;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-boundary-picker"
          >
            <X className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            {selectedBoundaries.length} selected
          </Badge>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-cancel-boundary-picker"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={selectedBoundaries.length === 0}
            data-testid="button-save-boundaries"
          >
            <Check className="h-4 w-4 mr-2" />
            Save Selection
          </Button>
        </div>
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r bg-card flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <Select value={boundaryType} onValueChange={setBoundaryType}>
                <SelectTrigger className="flex-1" data-testid="select-boundary-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOUNDARY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter visible boundaries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-filter-boundaries"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="churches-filter" 
                checked={showOnlyWithChurches}
                onCheckedChange={(checked) => setShowOnlyWithChurches(checked === true)}
                data-testid="checkbox-churches-filter"
              />
              <Label htmlFor="churches-filter" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
                <IconBuildingChurch className="h-3 w-3" />
                With churches only
              </Label>
            </div>
            
            {(showPlatformBoundaryToggle || showChurchToggle || regions.length > 0) && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  Overlay Layers
                </Label>
                <Popover open={overlayDropdownOpen} onOpenChange={setOverlayDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                      data-testid="button-overlay-selector"
                    >
                      <span className="truncate">
                        {selectedOverlays.size === 0 
                          ? "Select overlays..." 
                          : `${selectedOverlays.size} overlay${selectedOverlays.size > 1 ? 's' : ''} selected`
                        }
                      </span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <div className="p-2 space-y-1">
                      {showChurchToggle && (
                        <div
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate ${selectedOverlays.has("churches") ? "bg-primary/10" : ""}`}
                          onClick={() => {
                            const newSet = new Set(selectedOverlays);
                            if (newSet.has("churches")) {
                              newSet.delete("churches");
                            } else {
                              newSet.add("churches");
                            }
                            setSelectedOverlays(newSet);
                          }}
                          data-testid="overlay-option-churches"
                        >
                          <div 
                            className="w-4 h-4 rounded border flex items-center justify-center"
                            style={{ borderColor: "#ef4444", backgroundColor: selectedOverlays.has("churches") ? "#ef4444" : "transparent" }}
                          >
                            {selectedOverlays.has("churches") && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="text-sm">Churches</span>
                          <div className="ml-auto w-3 h-3 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                        </div>
                      )}
                      
                      {showPlatformBoundaryToggle && platformBoundaryIds.length > 0 && (
                        <div
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate ${selectedOverlays.has("platform") ? "bg-primary/10" : ""}`}
                          onClick={() => {
                            const newSet = new Set(selectedOverlays);
                            if (newSet.has("platform")) {
                              newSet.delete("platform");
                            } else {
                              newSet.add("platform");
                            }
                            setSelectedOverlays(newSet);
                          }}
                          data-testid="overlay-option-platform"
                        >
                          <div 
                            className="w-4 h-4 rounded border flex items-center justify-center"
                            style={{ borderColor: "#3b82f6", backgroundColor: selectedOverlays.has("platform") ? "#3b82f6" : "transparent" }}
                          >
                            {selectedOverlays.has("platform") && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="text-sm">Platform Boundaries</span>
                          <div className="ml-auto w-3 h-3 rounded-sm" style={{ backgroundColor: "#3b82f6" }} />
                        </div>
                      )}
                      
                      {regions.length > 0 && (
                        <>
                          <div className="border-t my-1" />
                          <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Regions</div>
                          
                          <div
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate ${regions.every(r => selectedOverlays.has(r.id)) ? "bg-primary/10" : ""}`}
                            onClick={() => {
                              const newSet = new Set(selectedOverlays);
                              const allSelected = regions.every(r => newSet.has(r.id));
                              if (allSelected) {
                                regions.forEach(r => newSet.delete(r.id));
                              } else {
                                regions.forEach(r => newSet.add(r.id));
                              }
                              setSelectedOverlays(newSet);
                            }}
                            data-testid="overlay-option-all-regions"
                          >
                            <div 
                              className="w-4 h-4 rounded border flex items-center justify-center border-muted-foreground"
                              style={{ backgroundColor: regions.every(r => selectedOverlays.has(r.id)) ? "hsl(var(--primary))" : "transparent" }}
                            >
                              {regions.every(r => selectedOverlays.has(r.id)) && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <span className="text-sm font-medium">All Regions</span>
                          </div>
                          
                          {regions.map(region => (
                            <div
                              key={region.id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate ${selectedOverlays.has(region.id) ? "bg-primary/10" : ""}`}
                              onClick={() => {
                                const newSet = new Set(selectedOverlays);
                                if (newSet.has(region.id)) {
                                  newSet.delete(region.id);
                                } else {
                                  newSet.add(region.id);
                                }
                                setSelectedOverlays(newSet);
                              }}
                              data-testid={`overlay-option-region-${region.id}`}
                            >
                              <div 
                                className="w-4 h-4 rounded border flex items-center justify-center"
                                style={{ borderColor: region.color, backgroundColor: selectedOverlays.has(region.id) ? region.color : "transparent" }}
                              >
                                {selectedOverlays.has(region.id) && <Check className="h-3 w-3 text-white" />}
                              </div>
                              <span className="text-sm">{region.name}</span>
                              <div className="ml-auto w-3 h-3 rounded-sm" style={{ backgroundColor: region.color }} />
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
          
          {selectedBoundaries.length > 0 && (
            <div className="p-4 border-b">
              <h3 className="text-sm font-medium mb-2">Selected ({selectedBoundaries.length})</h3>
              <div className="flex flex-wrap gap-1">
                {selectedBoundaries.slice(0, 10).map(b => (
                  <Badge
                    key={b.id}
                    variant="default"
                    className="cursor-pointer group"
                    onClick={() => handleRemoveBoundary(b.id)}
                    data-testid={`badge-selected-${b.id}`}
                  >
                    {b.name}
                    <X className="h-3 w-3 ml-1 opacity-60 group-hover:opacity-100" />
                  </Badge>
                ))}
                {selectedBoundaries.length > 10 && (
                  <Badge variant="outline">
                    +{selectedBoundaries.length - 10} more
                  </Badge>
                )}
              </div>
            </div>
          )}
          
          <ScrollArea className="flex-1">
            <div className="p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredBoundaries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchQuery 
                    ? "No matching boundaries" 
                    : showOnlyWithChurches
                    ? "No boundaries with churches in view. Try disabling filter or zooming out."
                    : "Pan/zoom the map to load boundaries"
                  }
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredBoundaries.map(boundary => {
                    const isSelected = selectedIdsSet.current.has(boundary.id);
                    const isHovered = hoveredBoundaryId === boundary.id;
                    
                    return (
                      <button
                        key={boundary.id}
                        onClick={() => handleBoundaryClick(boundary.id)}
                        onDoubleClick={() => handleZoomToBoundary(boundary)}
                        className={`w-full p-2 rounded-md text-left flex items-center gap-2 transition-colors ${
                          isSelected 
                            ? "bg-primary/10 border border-primary/30" 
                            : isHovered
                            ? "bg-muted"
                            : "hover-elevate"
                        }`}
                        data-testid={`button-boundary-${boundary.id}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected 
                            ? "bg-primary border-primary" 
                            : "border-muted-foreground/30"
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{boundary.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="capitalize">{boundary.type}</span>
                            {boundary.church_count !== undefined && boundary.church_count > 0 && (
                              <>
                                <span className="text-muted-foreground/50">•</span>
                                <span className="text-primary font-medium">{boundary.church_count} {boundary.church_count === 1 ? 'church' : 'churches'}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="p-3 border-t text-xs text-muted-foreground">
            <p>Tip: Double-click a boundary to zoom to it</p>
          </div>
        </aside>
        
        <div className="flex-1 relative">
          <div ref={mapContainer} className="absolute inset-0" />
          
          {isLoading && (
            <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm rounded-md px-3 py-2 flex items-center gap-2 shadow-md">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading boundaries...</span>
            </div>
          )}
          
          {boundaries.length > 0 && !isLoading && (
            <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded-md px-3 py-2 shadow-md">
              <span className="text-sm text-muted-foreground">
                {boundaries.length} boundaries in view
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
