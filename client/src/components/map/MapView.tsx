import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import {
  type ChurchWithCallings,
  type Area,
  type MinistryAreaWithCalling,
  type Boundary,
  getColorForCallingType,
  MAP_AREA_COLORS,
} from "@shared/schema";
import { renderIconToHtml } from "@/components/ui/icon-renderer";
import { usePlatformContext } from "@/contexts/PlatformContext";

// Extracted child components
import { CollaborationLinesLayer } from "./CollaborationLines";
import { BoundaryLayer } from "./BoundaryLayer";
import { AreaLayer } from "./AreaLayer";
import { MapControls } from "./MapControls";
import { AllocationMode } from "./AllocationMode";
import { EmberParticles } from "./EmberParticles";
import { SaturationLayer } from "./SaturationLayer";
import { PrayerCoverageLayer } from "./PrayerCoverageLayer";
import { HealthChoropleth } from "./HealthChoropleth";

// Shared constants, types, and helpers
import type { MapViewProps, MapViewRef, CollaborationLine } from "./types";
export type { InternalTagStyle, CollaborationLine, MapViewRef } from "./types";
import {
  CLUSTER_SOURCE_ID, CLUSTER_LAYER_ID, CLUSTER_COUNT_LAYER_ID, UNCLUSTERED_LAYER_ID,
  getPinIconSvg, EMPTY_SET,
  getMapStyleUrl, getSaturationLabel, USER_MAP_STYLE_KEY,
} from "./constants";
import { buildPrayerTooltipHtml, buildSaturationTooltipHtml } from "./tooltipHelpers";


mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Inline SVG icons for map pins (matches Settings page)
// Using bold, simple silhouettes that are visible at any size

// Stable empty Set to prevent unnecessary re-renders from reference inequality

// Helper to get inline SVG for pin icon




// Internal tag style info for map pin customization


// Collaboration line data for map visualization


export const MapView = forwardRef<MapViewRef, MapViewProps>(({ 
  churches, 
  globalAreas = [], 
  churchAreas = [], 
  ministryAreas = [],
  boundaries = [],
  hoverBoundary = null,
  primaryMinistryArea = null,
  isPrimaryAreaVisible = true,
  visibleGlobalAreaIds = EMPTY_SET, 
  visibleChurchAreaIds = EMPTY_SET, 
  visibleBoundaryIds = EMPTY_SET,
  selectedChurchId = null, 
  onChurchClick,
  onMapClick,
  onPolygonDrawn,
  onShapeSelected,
  onShapeDeselected,
  onMinistryAreaClick,
  onMapBoundsChange,
  drawingAreaMode = false,
  drawingPrimaryArea = false,
  editingArea = null, 
  onCancelDrawing, 
  leftSidebarOpen, 
  rightSidebarOpen, 
  showAllAreas = false,
  className = "",
  internalTagStyles = {},
  pinAdjustMode = false,
  pinAdjustChurchId = null,
  onPinDrag,
  healthMetricKey = null,
  healthOverlayVisible = false,
  onHealthDataLoadingChange,
  prayerCoverageVisible = false,
  prayerCoverageMode = "citywide",
  prayerCoverageData = null,
  allocationModeActive = false,
  onTractClick,
  onTractLongPress,
  prayerOverlayVisible = false,
  onChurchPrayerFocus,
  onMapClickForPrayer,
  collaborationLines = [],
  performanceMode = false,
  churchPinsVisible = true,
  onChurchPinsVisibilityChange,
  mapOverlayMode = 'off',
  pinMode = 'all',
  onPinModeChange,
  onMapOverlayModeChange,
  saturationTooltipVisible = false,
  onSaturationTooltipVisibilityChange,
  onPrayerCoverageVisibilityChange,
  filterBoundaries = [],
  clippedSaturationGeoJSON = null,
  highlightedAreaId = null,
  hoveredAreaId = null,
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const popupsRef = useRef<Map<string, mapboxgl.Popup>>(new Map());
  const markerSizeUpdatersRef = useRef<Map<string, (selectedId?: string | null) => void>>(new Map());
  const drawingAreaModeRef = useRef(drawingAreaMode);
  const drawingPrimaryAreaRef = useRef(drawingPrimaryArea);
  const allocationModeActiveRef = useRef(allocationModeActive);
  const onCancelDrawingRef = useRef(onCancelDrawing);
  const onMapClickRef = useRef(onMapClick);
  const selectedChurchIdRef = useRef(selectedChurchId);
  const ministrySaturationVisible = mapOverlayMode === 'saturation';
  const showBoundariesMode = mapOverlayMode === 'boundaries';
  const highlightedAreaIdRef = useRef(highlightedAreaId);
  highlightedAreaIdRef.current = highlightedAreaId;
  const hoveredAreaIdRef = useRef(hoveredAreaId);
  hoveredAreaIdRef.current = hoveredAreaId;
  const mapOverlayModeRef = useRef(mapOverlayMode);
  mapOverlayModeRef.current = mapOverlayMode;
  const ministrySaturationVisibleRef = useRef(ministrySaturationVisible);
  ministrySaturationVisibleRef.current = ministrySaturationVisible;
  const prayerCoverageVisibleRef = useRef(prayerCoverageVisible);
  prayerCoverageVisibleRef.current = prayerCoverageVisible;
  
  const applyAreaHighlight = useCallback((m: mapboxgl.Map) => {
    if (!m.getLayer('areas-fill') || !m.getLayer('areas-outline')) return;
    
    const activeId = hoveredAreaIdRef.current || highlightedAreaIdRef.current;
    const isBoundaries = mapOverlayModeRef.current === 'boundaries';
    
    if (activeId) {
      m.setPaintProperty('areas-fill', 'fill-opacity', isBoundaries ? [
        'case',
        ['==', ['get', 'id'], activeId],
        0.45,
        0.15
      ] : 0);
      m.setPaintProperty('areas-outline', 'line-width', [
        'case',
        ['==', ['get', 'id'], activeId],
        3.5,
        2
      ]);
    } else {
      m.setPaintProperty('areas-fill', 'fill-opacity', isBoundaries ? 0.15 : 0);
      m.setPaintProperty('areas-outline', 'line-width', 2);
    }
    
    if (m.getLayer('primary-area-fill')) {
      m.setPaintProperty('primary-area-fill', 'fill-opacity', isBoundaries ? 0.4 : 0);
    }
  }, []);

  // Flag to track when marker was just interacted with (prevents map click from deselecting)
  const markerInteractionRef = useRef(false);
  
  // Track internal tag styles for marker customization
  const internalTagStylesRef = useRef(internalTagStyles);
  
  // Pin adjustment mode refs
  const pinAdjustModeRef = useRef(pinAdjustMode);
  const pinAdjustChurchIdRef = useRef(pinAdjustChurchId);
  const onPinDragRef = useRef(onPinDrag);
  const ghostMarkerRef = useRef<mapboxgl.Marker | null>(null);
  
  // Throttled zoom handler timing ref (for performance optimization)
  const lastZoomUpdateRef = useRef<number>(0);
  
  // Prayer Mode focus refs
  const prayerOverlayVisibleRef = useRef(prayerOverlayVisible);
  const onChurchPrayerFocusRef = useRef(onChurchPrayerFocus);
  const onMapClickForPrayerRef = useRef(onMapClickForPrayer);
  const onMinistryAreaClickRef = useRef(onMinistryAreaClick);
  
  // Tooltip visibility ref for use in click handler closure
  const saturationTooltipVisibleRef = useRef(saturationTooltipVisible);
  
  // Performance mode ref for clustering
  const performanceModeRef = useRef(performanceMode);
  
  // Health data loading callback passed to HealthChoropleth component
  
  // Get platform context for limiting health data queries to platform boundaries
  const { platform } = usePlatformContext();
  // platformIdRef moved to HealthChoropleth component
  
  // Store onChurchClick in ref to avoid effect re-runs
  const onChurchClickRef = useRef(onChurchClick);
  onChurchClickRef.current = onChurchClick;
  
  // Ref for onPolygonDrawn to avoid stale closure in map event handlers
  const onPolygonDrawnRef = useRef(onPolygonDrawn);
  
  // Platform settings for pin color/icon (fetched from API)
  const [platformSettings, setPlatformSettings] = useState<{
    defaultPinColor: string;
    defaultPinIcon: string;
    mapBaseStyle: string;
  }>({
    defaultPinColor: '#DC2626',
    defaultPinIcon: '',
    mapBaseStyle: 'streets-v12',
  });
  const platformSettingsRef = useRef(platformSettings);
  
  // Track pending style to apply once map is loaded
  const pendingStyleRef = useRef<string | null>(null);
  
  // Track user's preferred map style from localStorage
  // USER_MAP_STYLE_KEY imported from ./constants
  const [userMapStyle, setUserMapStyle] = useState<string | null>(() => {
    return localStorage.getItem(USER_MAP_STYLE_KEY);
  });

  // getMapStyleUrl imported from ./constants
  
  // Fetch platform settings on mount
  useEffect(() => {
    fetch('/api/platform/settings')
      .then(res => res.json())
      .then(data => {
        const settings = {
          defaultPinColor: data.defaultPinColor || '#DC2626',
          defaultPinIcon: data.defaultPinIcon || '',
          mapBaseStyle: data.mapBaseStyle || 'streets-v12',
        };
        setPlatformSettings(settings);
        platformSettingsRef.current = settings;
      })
      .catch(err => {
        console.error('Failed to fetch platform settings:', err);
      });
  }, []);
  
  // Listen for user map style changes (from MapStyleSelector)
  useEffect(() => {
    const handleUserStyleChange = (e: CustomEvent) => {
      setUserMapStyle(e.detail);
    };
    window.addEventListener('userMapStyleChanged', handleUserStyleChange as EventListener);
    return () => {
      window.removeEventListener('userMapStyleChanged', handleUserStyleChange as EventListener);
    };
  }, []);
  
  // Keep platform settings ref in sync and update map style when settings change
  // User preference takes priority over platform default
  useEffect(() => {
    platformSettingsRef.current = platformSettings;
    
    if (!map.current) return;
    
    // User preference takes priority, otherwise use platform default
    const effectiveStyle = userMapStyle || platformSettings.mapBaseStyle || 'streets-v12';
    
    const applyStyle = () => {
      if (!map.current) return;
      const newStyleUrl = getMapStyleUrl(effectiveStyle);
      map.current.setStyle(newStyleUrl);
    };
    
    // If map style is already loaded, apply immediately
    if (map.current.isStyleLoaded()) {
      applyStyle();
    } else {
      // Store the pending style and wait for load event
      pendingStyleRef.current = effectiveStyle;
      const onStyleLoad = () => {
        if (pendingStyleRef.current === effectiveStyle) {
          applyStyle();
          pendingStyleRef.current = null;
        }
        map.current?.off('style.load', onStyleLoad);
      };
      map.current.on('style.load', onStyleLoad);
    }
  }, [platformSettings, userMapStyle]);

  // Keep refs in sync with props
  drawingAreaModeRef.current = drawingAreaMode;
  drawingPrimaryAreaRef.current = drawingPrimaryArea;
  allocationModeActiveRef.current = allocationModeActive;
  internalTagStylesRef.current = internalTagStyles;
  onCancelDrawingRef.current = onCancelDrawing;
  onMapClickRef.current = onMapClick;
  selectedChurchIdRef.current = selectedChurchId;
  pinAdjustModeRef.current = pinAdjustMode;
  pinAdjustChurchIdRef.current = pinAdjustChurchId;
  onPinDragRef.current = onPinDrag;
  prayerOverlayVisibleRef.current = prayerOverlayVisible;
  onChurchPrayerFocusRef.current = onChurchPrayerFocus;
  onMapClickForPrayerRef.current = onMapClickForPrayer;
  onMinistryAreaClickRef.current = onMinistryAreaClick;
  performanceModeRef.current = performanceMode;
  saturationTooltipVisibleRef.current = saturationTooltipVisible;
  onPolygonDrawnRef.current = onPolygonDrawn;

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    flyToChurch: (lng: number, lat: number) => {
      if (!map.current) return;
      map.current.flyTo({
        center: [lng, lat],
        zoom: 15,
        duration: 1500,
      });
    },
    deleteShape: (featureId: string) => {
      if (!draw.current) return;
      draw.current.delete(featureId);
      if (onPolygonDrawnRef.current) {
        onPolygonDrawnRef.current([]);
      }
    },
    editShape: (featureId: string) => {
      if (!draw.current) return;
      // Switch to direct_select mode to allow vertex manipulation
      draw.current.changeMode('direct_select', { featureId });
    },
    startDrawing: () => {
      if (!draw.current) return;
      // Clear any existing features and start fresh drawing
      draw.current.deleteAll();
      draw.current.changeMode('draw_polygon');
    },
    getMap: () => map.current,
  }));

  // Automatically activate polygon draw mode when entering area drawing mode
  // Show/hide polygon control based on drawing mode
  useEffect(() => {
    if (!draw.current || !map.current) return;
    
    // Dynamically update controls visibility
    const container = map.current.getContainer();
    const drawControls = container.querySelector('.mapboxgl-ctrl-group');
    const polygonButton = drawControls?.querySelector('.mapbox-gl-draw_polygon');
    
    if (polygonButton) {
      if (drawingAreaMode || editingArea) {
        (polygonButton as HTMLElement).style.display = 'block';
      } else {
        (polygonButton as HTMLElement).style.display = 'none';
      }
    }
  }, [drawingAreaMode, editingArea]);

  useEffect(() => {
    if (!draw.current || !map.current) return;
    
    // Define helper function before any early returns
    const loadEditingPolygon = () => {
      if (!draw.current || !editingArea?.geometry) return;
      
      draw.current.deleteAll();
      
      const feature = {
        type: 'Feature' as const,
        properties: {},
        geometry: editingArea.geometry,
      };
      
      const featureIds = draw.current.add(feature);
      
      // Enter direct_select mode to allow vertex editing
      if (featureIds && featureIds.length > 0) {
        draw.current.changeMode('direct_select', { featureId: featureIds[0] });
      }
    };
    
    // Wait for map to be fully loaded
    if (!map.current.loaded()) {
      const onLoad = () => {
        if (!draw.current) return;
        
        if (editingArea && editingArea.geometry) {
          loadEditingPolygon();
        } else if (drawingAreaMode) {
          draw.current.changeMode('draw_polygon');
        }
      };
      map.current.once('load', onLoad);
      return;
    }
    
    if (editingArea && editingArea.geometry) {
      loadEditingPolygon();
    } else if (drawingAreaMode) {
      // Activate polygon drawing mode for new areas
      draw.current.changeMode('draw_polygon');
    } else {
      // Exit drawing mode and clear features
      draw.current.changeMode('simple_select');
      draw.current.deleteAll();
    }
  }, [drawingAreaMode, editingArea]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // getMapStyleUrl imported from ./constants

    // User preference (localStorage) takes priority over platform default
    const userPreference = localStorage.getItem(USER_MAP_STYLE_KEY);
    const savedStyle = userPreference || platformSettingsRef.current.mapBaseStyle || 'streets-v12';
    const styleUrl = getMapStyleUrl(savedStyle);

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: styleUrl,
        center: [-85.6681, 42.9634], // Grand Rapids, MI
        zoom: 11,
      });
    } catch (error) {
      console.error('Failed to initialize Mapbox GL:', error);
      return;
    }

    // Admin default style change - only apply if user has no personal preference
    const handleAdminStyleChange = (e: CustomEvent) => {
      const userPreference = localStorage.getItem('kingdom-map-style-preference');
      if (!userPreference && map.current) {
        const newStyleUrl = getMapStyleUrl(e.detail);
        map.current.setStyle(newStyleUrl);
      }
    };
    window.addEventListener('mapStyleChanged', handleAdminStyleChange as EventListener);

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Initialize Mapbox Draw with larger vertex handles (double size)
    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,  // Create control, will hide via CSS
        trash: false,   // Never show - we'll use custom UI
      },
      defaultMode: 'simple_select',
      styles: [
        // Active polygon fill
        {
          'id': 'gl-draw-polygon-fill-active',
          'type': 'fill',
          'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          'paint': {
            'fill-color': '#fbb03b',
            'fill-outline-color': '#fbb03b',
            'fill-opacity': 0.1
          }
        },
        // Inactive polygon fill
        {
          'id': 'gl-draw-polygon-fill-inactive',
          'type': 'fill',
          'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
          'paint': {
            'fill-color': '#3bb2d0',
            'fill-outline-color': '#3bb2d0',
            'fill-opacity': 0.1
          }
        },
        // Polygon stroke active
        {
          'id': 'gl-draw-polygon-stroke-active',
          'type': 'line',
          'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          'layout': {
            'line-cap': 'round',
            'line-join': 'round'
          },
          'paint': {
            'line-color': '#fbb03b',
            'line-dasharray': [0.2, 2],
            'line-width': 2
          }
        },
        // Polygon stroke inactive
        {
          'id': 'gl-draw-polygon-stroke-inactive',
          'type': 'line',
          'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
          'layout': {
            'line-cap': 'round',
            'line-join': 'round'
          },
          'paint': {
            'line-color': '#3bb2d0',
            'line-width': 2
          }
        },
        // DOUBLED SIZE: Vertex point halos (outer ring)
        {
          'id': 'gl-draw-polygon-and-line-vertex-halo-active',
          'type': 'circle',
          'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          'paint': {
            'circle-radius': 10, // Was 5, now doubled
            'circle-color': '#FFF'
          }
        },
        // DOUBLED SIZE: Vertex points (inner circle)
        {
          'id': 'gl-draw-polygon-and-line-vertex-active',
          'type': 'circle',
          'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          'paint': {
            'circle-radius': 6,  // Was 3, now doubled
            'circle-color': '#fbb03b'
          }
        },
        // DOUBLED SIZE: Midpoint handles
        {
          'id': 'gl-draw-polygon-midpoint',
          'type': 'circle',
          'filter': ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']],
          'paint': {
            'circle-radius': 6,  // Was 3, now doubled
            'circle-color': '#fbb03b'
          }
        },
        // Line stroke active
        {
          'id': 'gl-draw-line-active',
          'type': 'line',
          'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
          'layout': {
            'line-cap': 'round',
            'line-join': 'round'
          },
          'paint': {
            'line-color': '#fbb03b',
            'line-dasharray': [0.2, 2],
            'line-width': 2
          }
        },
        // Line stroke inactive
        {
          'id': 'gl-draw-line-inactive',
          'type': 'line',
          'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString']],
          'layout': {
            'line-cap': 'round',
            'line-join': 'round'
          },
          'paint': {
            'line-color': '#3bb2d0',
            'line-width': 2
          }
        },
        // DOUBLED SIZE: Point active
        {
          'id': 'gl-draw-point-active',
          'type': 'circle',
          'filter': ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['==', 'active', 'true']],
          'paint': {
            'circle-radius': 10, // Was 5, now doubled
            'circle-color': '#fbb03b'
          }
        },
        // DOUBLED SIZE: Point inactive
        {
          'id': 'gl-draw-point-inactive',
          'type': 'circle',
          'filter': ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['==', 'active', 'false']],
          'paint': {
            'circle-radius': 6,  // Was 3, now doubled
            'circle-color': '#3bb2d0'
          }
        }
      ]
    });

    map.current.addControl(draw.current, 'top-left');
    
    // Hide polygon control by default (will be shown when drawing)
    const container = map.current.getContainer();
    const drawControls = container.querySelector('.mapboxgl-ctrl-group');
    const polygonButton = drawControls?.querySelector('.mapbox-gl-draw_polygon');
    if (polygonButton) {
      (polygonButton as HTMLElement).style.display = 'none';
    }
    
    // Check if drawing mode was requested before map was ready (race condition fix)
    // This handles the case where component mounts with drawingAreaMode=true
    if (drawingAreaModeRef.current && draw.current) {
      console.log('🎨 Activating pending drawing mode after map init');
      draw.current.changeMode('draw_polygon');
      // Also show the polygon button
      if (polygonButton) {
        (polygonButton as HTMLElement).style.display = 'block';
      }
    }

    // Draw event handlers - use refs to avoid stale closures
    map.current.on('draw.create', (e: any) => {
      const feature = e.features[0];
      if (feature.geometry.type === 'Polygon' && onPolygonDrawnRef.current) {
        onPolygonDrawnRef.current(feature.geometry.coordinates);
      }
    });

    map.current.on('draw.update', (e: any) => {
      const feature = e.features[0];
      if (feature.geometry.type === 'Polygon' && onPolygonDrawnRef.current) {
        onPolygonDrawnRef.current(feature.geometry.coordinates);
      }
    });

    map.current.on('draw.delete', () => {
      // If in area drawing mode, cancel the drawing
      if (drawingAreaModeRef.current && onCancelDrawingRef.current) {
        onCancelDrawingRef.current();
      } else if (onPolygonDrawnRef.current) {
        // Otherwise clear polygon filter
        onPolygonDrawnRef.current([]);
      }
    });

    // Shape selection handler
    map.current.on('draw.selectionchange', (e: any) => {
      if (e.features && e.features.length > 0) {
        // Shape selected
        if (onShapeSelected) {
          onShapeSelected(e.features[0].id);
        }
      } else {
        // Shape deselected
        if (onShapeDeselected) {
          onShapeDeselected();
        }
      }
    });

    // Map click handler to deselect church when clicking on the map
    // This fires for clicks on the map canvas itself (not marker DOM elements)
    // Marker clicks are handled by DOM event handlers with stopPropagation
    let lastClickTs = 0;
    map.current.on('click', (e: any) => {
      // Debounce: prevent double-fire if both native click and our synthetic touchend click arrive
      const now = Date.now();
      if (now - lastClickTs < 400) return;
      lastClickTs = now;
      // Skip if a marker was just interacted with (prevents deselect on marker tap on mobile)
      if (markerInteractionRef.current) {
        return;
      }
      
      // Close all church preview popups when clicking elsewhere on the map (mobile dismissal)
      popupsRef.current.forEach((popup) => {
        popup.remove();
      });
      
      // Check if we clicked on interactive ministry area layers (which have their own click handlers)
      // Prayer coverage layers are deliberately excluded here since they should be click-through
      // Only query layers that actually exist on the map to avoid errors
      const interactiveLayerIds = ['areas-fill'];
      const existingLayers = interactiveLayerIds.filter(id => map.current?.getLayer(id));
      
      let clickedOnInteractiveLayer = false;
      if (existingLayers.length > 0) {
        const clickedFeatures = map.current?.queryRenderedFeatures(e.point, { layers: existingLayers });
        clickedOnInteractiveLayer = !!(clickedFeatures && clickedFeatures.length > 0);
      }

      // Saturation layer click: open church detail for the clicked tract's church
      if (!clickedOnInteractiveLayer && mapOverlayModeRef.current === 'saturation' && map.current?.getLayer('ministry-saturation-fill')) {
        const satFeatures = map.current.queryRenderedFeatures(e.point, { layers: ['ministry-saturation-fill'] });
        if (satFeatures.length > 0) {
          const churchId = satFeatures[0].properties?.church_id;
          const areaId = satFeatures[0].properties?.area_id;
          if (churchId && onMinistryAreaClickRef.current) {
            onMinistryAreaClickRef.current(churchId, areaId);
            return;
          }
        }
      }
      
      // In prayer mode, forward map clicks for prayer location selection
      // Prayer coverage layers are click-through - they don't block prayer mode clicks
      if (prayerOverlayVisibleRef.current && onMapClickForPrayerRef.current && !clickedOnInteractiveLayer) {
        onMapClickForPrayerRef.current(
          { lng: e.lngLat.lng, lat: e.lngLat.lat },
          { x: e.point.x, y: e.point.y }
        );
        return;
      }

      // Deselect church when:
      // 1. Not in drawing mode (drawing mode has its own cancel flow)
      // 2. Didn't click on an interactive layer (ministry areas have their own handlers)
      // Note: Boundary clicks DO trigger deselection - they're just visual context
      if (!drawingAreaModeRef.current && onMapClickRef.current && !clickedOnInteractiveLayer) {
        onMapClickRef.current();
      }

      // Tap tooltip: show saturation or area info on tap (mobile-friendly)
      // Only show when tooltips are enabled via the toggle button
      if (!map.current) {
        return;
      }
      const m = map.current;

      if (tapPopupRef.current) {
        tapPopupRef.current.remove();
        tapPopupRef.current = null;
      }

      if (!saturationTooltipVisibleRef.current) {
        return;
      }

      if (allocationModeActiveRef.current) {
        return;
      }
      if (drawingAreaModeRef.current || drawingPrimaryAreaRef.current) {
        return;
      }

      const clusterLayers = ['clusters', 'cluster-count', 'unclustered-point'];
      const existingClusterLayers = clusterLayers.filter(l => m.getLayer(l));
      if (existingClusterLayers.length > 0) {
        const clusterFeatures = m.queryRenderedFeatures(e.point, { layers: existingClusterLayers });
        if (clusterFeatures.length > 0) {
          return;
        }
      }

      let tapHtml: string | null = null;

      if (mapOverlayModeRef.current === 'saturation') {
        if (m.getLayer('ministry-saturation-fill')) {
          const features = m.queryRenderedFeatures(e.point, { layers: ['ministry-saturation-fill'] });
          if (features.length > 0) {
            tapHtml = `<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">`;
            tapHtml += buildSaturationTooltipHtml(features);
            tapHtml += `</div>`;
          }
        }

        const satPrayerLayers: string[] = [];
        if (m.getLayer('prayer-coverage-fill')) satPrayerLayers.push('prayer-coverage-fill');
        const satPrayerFeatures = satPrayerLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: satPrayerLayers }) : [];
        if (satPrayerFeatures.length > 0) {
          const prayerHtml = buildPrayerTooltipHtml(satPrayerFeatures);
          if (prayerHtml) {
            if (!tapHtml) {
              tapHtml = '<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">';
            } else {
              tapHtml = tapHtml.replace(/<\/div>$/, '');
              tapHtml += '<div style="border-top:1px solid currentColor;opacity:0.15;margin:6px 0"></div>';
            }
            tapHtml += prayerHtml;
            tapHtml += '</div>';
          }
        }
      } else {
        const areaLayers: string[] = [];
        if (m.getLayer('areas-fill')) areaLayers.push('areas-fill');
        const prayerLayers: string[] = [];
        if (m.getLayer('prayer-coverage-fill')) prayerLayers.push('prayer-coverage-fill');

        const areaFeatures = areaLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: areaLayers }) : [];
        const prayerFeatures = prayerLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: prayerLayers }) : [];

        if (areaFeatures.length > 0 || prayerFeatures.length > 0) {
          tapHtml = '<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">';

          if (areaFeatures.length > 0) {
            const churchMap = new Map<string, { church_name: string; area_name: string; population: number }>();
            areaFeatures.forEach(f => {
              const props = f.properties;
              const churchName = props?.church_name || 'Unknown Church';
              const areaName = props?.name || 'Ministry Area';
              const pop = props?.population ? Number(props.population) : 0;
              if (!churchMap.has(churchName)) {
                churchMap.set(churchName, { church_name: churchName, area_name: areaName, population: pop });
              } else {
                const existing = churchMap.get(churchName)!;
                if (pop > existing.population) existing.population = pop;
              }
            });

            const uniqueChurches = Array.from(churchMap.values());

            if (uniqueChurches.length > 1) {
              tapHtml += '<div style="font-weight:600;margin-bottom:4px;color:#10b981">Collaboration Opportunity!</div>';
              tapHtml += `<div style="opacity:0.7">${uniqueChurches.length} churches serving this area</div>`;
              uniqueChurches.forEach(c => {
                tapHtml += `<div style="opacity:0.6;font-size:12px;padding-left:8px">&bull; ${c.church_name}</div>`;
                if (c.population > 0) {
                  tapHtml += `<div style="opacity:0.45;font-size:11px;padding-left:16px">${c.population.toLocaleString()} people</div>`;
                }
              });
            } else if (uniqueChurches.length === 1) {
              const c = uniqueChurches[0];
              tapHtml += `<div style="font-weight:600;margin-bottom:4px">${c.church_name}</div>`;
              tapHtml += `<div style="opacity:0.6;font-size:12px">${c.area_name}</div>`;
              if (c.population > 0) {
                tapHtml += `<div style="opacity:0.7;font-size:12px;margin-top:2px">${c.population.toLocaleString()} people</div>`;
              }
            }
          }

          if (prayerFeatures.length > 0) {
            if (areaFeatures.length > 0) tapHtml += '<div style="border-top:1px solid currentColor;opacity:0.15;margin:6px 0"></div>';
            tapHtml += buildPrayerTooltipHtml(prayerFeatures);
          }
          tapHtml += '</div>';
        }
      }

      if (tapHtml) {
        const tapPopup = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          className: 'saturation-hover-popup tap-popup',
          anchor: 'bottom',
          offset: [0, -4],
          maxWidth: '280px',
        });
        tapPopup.setLngLat(e.lngLat).setHTML(tapHtml).addTo(m);
        tapPopupRef.current = tapPopup;
      }
    });
    
    // Close all popups when zooming out below level 13 (mobile dismissal on zoom out)
    // Also update all marker sizes with throttling for performance
    const THROTTLE_MS = 100; // Only update markers every 100ms during zoom
    
    const handleZoom = () => {
      if (!map.current) return;
      
      // Close popups below zoom 11
      if (map.current.getZoom() < 11) {
        popupsRef.current.forEach((popup) => {
          popup.remove();
        });
      }
      
      // Throttled marker size update - prevents lag on touch devices
      const now = Date.now();
      if (now - lastZoomUpdateRef.current < THROTTLE_MS) return;
      lastZoomUpdateRef.current = now;
      
      // Batch update all marker sizes using requestAnimationFrame
      requestAnimationFrame(() => {
        if (!map.current) return; // Guard against unmount
        markerSizeUpdatersRef.current.forEach((updater) => {
          updater(selectedChurchIdRef.current);
        });
      });
    };
    
    // Final size update on zoomend to ensure correct final sizes
    const handleZoomEnd = () => {
      requestAnimationFrame(() => {
        if (!map.current) return; // Guard against unmount
        markerSizeUpdatersRef.current.forEach((updater) => {
          updater(selectedChurchIdRef.current);
        });
      });
    };
    
    map.current.on('zoom', handleZoom);
    map.current.on('zoomend', handleZoomEnd);
    
    // Store handlers for cleanup
    const mapInstance = map.current;

    // Mobile touch-to-click bridge: Mapbox GL's canvas click event doesn't fire
    // reliably from touch input on mobile browsers/webviews. We listen for touchend
    // on the canvas and fire a synthetic Mapbox click event for short taps.
    const canvas = mapInstance.getCanvasContainer();
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!mapInstance || e.changedTouches.length !== 1) return;
      const dt = Date.now() - touchStartTime;
      const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      // Only treat as a tap if touch was short (<300ms) and didn't move much (<10px)
      if (dt < 300 && dx < 10 && dy < 10) {
        const rect = canvas.getBoundingClientRect();
        const x = e.changedTouches[0].clientX - rect.left;
        const y = e.changedTouches[0].clientY - rect.top;
        const point = new mapboxgl.Point(x, y);
        const lngLat = mapInstance.unproject(point);
        mapInstance.fire('click', { point, lngLat, originalEvent: e as any });
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('mapStyleChanged', handleAdminStyleChange as EventListener);
      // Remove zoom handlers to prevent memory leaks
      mapInstance?.off('zoom', handleZoom);
      mapInstance?.off('zoomend', handleZoomEnd);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Resize map when sidebars toggle
  useEffect(() => {
    if (!map.current) return;
    
    // Let the layout settle before resizing
    const timer = setTimeout(() => {
      map.current?.resize();
    }, 300);
    
    return () => clearTimeout(timer);
  }, [leftSidebarOpen, rightSidebarOpen]);

  // Pin adjustment mode - make marker draggable and show ghost marker
  useEffect(() => {
    if (!map.current || !pinAdjustChurchId) return;
    
    const marker = markersRef.current.get(pinAdjustChurchId);
    if (!marker) return;
    
    const church = churches.find(c => c.id === pinAdjustChurchId);
    if (!church?.location?.coordinates) return;
    
    const [realLng, realLat] = church.location.coordinates;
    
    if (pinAdjustMode) {
      // Make marker draggable
      marker.setDraggable(true);
      
      // Add drag event handler
      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        onPinDragRef.current?.({ lat: lngLat.lat, lng: lngLat.lng });
      });
      
      // Create ghost marker at real location
      const ghostEl = document.createElement('div');
      ghostEl.style.width = '24px';
      ghostEl.style.height = '24px';
      ghostEl.style.borderRadius = '50%';
      ghostEl.style.border = '2px dashed rgba(0,0,0,0.5)';
      ghostEl.style.backgroundColor = 'rgba(255,255,255,0.3)';
      ghostEl.style.pointerEvents = 'none';
      
      ghostMarkerRef.current = new mapboxgl.Marker({
        element: ghostEl,
        anchor: 'center',
      })
        .setLngLat([realLng, realLat])
        .addTo(map.current!);
    } else {
      // Disable dragging
      marker.setDraggable(false);
      
      // Remove ghost marker
      if (ghostMarkerRef.current) {
        ghostMarkerRef.current.remove();
        ghostMarkerRef.current = null;
      }
    }
    
    return () => {
      // Cleanup
      marker.setDraggable(false);
      if (ghostMarkerRef.current) {
        ghostMarkerRef.current.remove();
        ghostMarkerRef.current = null;
      }
    };
  }, [pinAdjustMode, pinAdjustChurchId, churches]);

  // Emit map bounds changes with debouncing
  useEffect(() => {
    if (!onMapBoundsChange) return;

    let debounceTimer: NodeJS.Timeout;

    const emitBounds = () => {
      if (!map.current) return;
      const bounds = map.current.getBounds();
      if (!bounds) return;
      onMapBoundsChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    };

    const handleMove = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(emitBounds, 300);
    };

    // If map is available, listen for events
    if (map.current) {
      // Emit initial bounds
      map.current.once('load', emitBounds);
      
      // Listen for map movements
      map.current.on('moveend', handleMove);
      map.current.on('zoomend', handleMove);
    } else {
      // Fallback: emit default bounds for Grand Rapids area if map isn't initialized
      onMapBoundsChange({
        north: 43.1, // ~15km north of Grand Rapids
        south: 42.8, // ~15km south of Grand Rapids
        east: -85.4, // ~15km east of Grand Rapids
        west: -85.9, // ~15km west of Grand Rapids
      });
    }

    return () => {
      clearTimeout(debounceTimer);
      map.current?.off('moveend', handleMove);
      map.current?.off('zoomend', handleMove);
    };
  }, [onMapBoundsChange]);

  useEffect(() => {
    if (!map.current || !churches) return;

    const currentChurchIds = new Set(churches.map(c => c.id));
    
    // Remove markers and popups for churches that no longer exist
    markersRef.current.forEach((marker, churchId) => {
      if (!currentChurchIds.has(churchId)) {
        marker.remove();
        markersRef.current.delete(churchId);
        
        // Also remove associated popup and size updater
        const popup = popupsRef.current.get(churchId);
        if (popup) {
          popup.remove();
          popupsRef.current.delete(churchId);
        }
        markerSizeUpdatersRef.current.delete(churchId);
      }
    });

    // Add markers for new churches only (don't update existing ones)
    churches.forEach((church) => {
      // Check for location - use display_lat/display_lng as fallback if no location.coordinates
      const hasLocationCoords = church.location?.coordinates;
      const hasDisplayCoords = church.display_lat != null && church.display_lng != null;
      
      if (!hasLocationCoords && !hasDisplayCoords) return;

      // Skip if marker already exists - let it stay at its position!
      if (markersRef.current.has(church.id)) {
        return;
      }

      // Create new marker with dynamic sizing based on zoom
      // Use display location for visual position if available, otherwise use real location
      const realLng = hasLocationCoords ? church.location!.coordinates[0] : church.display_lng!;
      const realLat = hasLocationCoords ? church.location!.coordinates[1] : church.display_lat!;
      const lng = church.display_lng ?? realLng;
      const lat = church.display_lat ?? realLat;
      const el = document.createElement('div');
      
      // Function to calculate marker size based on zoom level and selected state
      const getMarkerSize = (zoom: number, isSelected: boolean): number => {
        // Base sizes - regional stays good, neighborhood shrinks more
        let baseSize: number;
        if (zoom <= 7) baseSize = 18;       // Very zoomed out - small
        else if (zoom <= 9) baseSize = 22;  // Regional view
        else if (zoom <= 11) baseSize = 24; // City view (slightly smaller)
        else if (zoom <= 13) baseSize = 26; // Neighborhood view (smaller to reduce overlap)
        else if (zoom <= 15) baseSize = 30; // Street view
        else baseSize = 34;                 // Very zoomed in
        
        // Selected markers are 1.25x larger
        return isSelected ? Math.round(baseSize * 1.25) : baseSize;
      };
      
      // Function to update marker size - takes currentSelectedId as parameter to avoid stale closure
      // Optimized: removed CSS transitions during zoom to reduce GPU overhead on touch devices
      const updateMarkerSize = (currentSelectedId?: string | null) => {
        if (!map.current) return;
        const zoom = map.current.getZoom();
        const isSelected = currentSelectedId === church.id;
        const size = getMarkerSize(zoom, isSelected);
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        // No transition during rapid zoom for performance
        
        // Update icon sizes proportionally (40% of marker size, min 8px)
        const iconSize = Math.max(8, Math.round(size * 0.40));
        const icons = el.querySelectorAll('.default-pin-icon svg, .internal-tag-icon svg');
        icons.forEach(svg => {
          (svg as SVGElement).style.width = `${iconSize}px`;
          (svg as SVGElement).style.height = `${iconSize}px`;
        });
      };
      
      // Store the update function for later use when selection changes
      markerSizeUpdatersRef.current.set(church.id, updateMarkerSize);
      
      // Check if this marker should be initially selected (e.g., when navigating from church detail)
      const isInitiallySelected = selectedChurchIdRef.current === church.id;
      
      // Initial size - respect selection state on creation
      const initialSize = map.current ? getMarkerSize(map.current.getZoom(), isInitiallySelected) : 32;
      el.style.width = `${initialSize}px`;
      el.style.height = `${initialSize}px`;
      el.setAttribute('data-testid', `marker-church-${church.id}`);
      
      // Apply default pin color and icon from platform settings
      const defaultPinColor = platformSettingsRef.current.defaultPinColor || '#DC2626';
      const defaultPinIcon = platformSettingsRef.current.defaultPinIcon || '';
      
      // Set className and background color - using inline style with important to ensure it applies
      // GPU optimization: will-change hints for smoother transforms on touch devices
      el.className = 'rounded-full border-2 border-white shadow-lg cursor-pointer hover:opacity-90';
      el.style.setProperty('background-color', defaultPinColor, 'important');
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.willChange = 'transform'; // GPU acceleration hint
      el.style.contain = 'layout style'; // CSS containment for performance
      
      // Add icon if configured (using inline SVG lookup)
      if (defaultPinIcon) {
        const iconSvg = getPinIconSvg(defaultPinIcon);
        if (iconSvg) {
          const iconWrapper = document.createElement('div');
          iconWrapper.className = 'default-pin-icon';
          iconWrapper.style.zIndex = '10';
          iconWrapper.style.pointerEvents = 'none';
          iconWrapper.innerHTML = iconSvg;
          
          // Style the SVG to be visible on colored background - size is 40% of pin
          const iconSize = Math.max(8, Math.round(initialSize * 0.40));
          const svg = iconWrapper.querySelector('svg');
          if (svg) {
            svg.style.fill = 'white';
            svg.style.color = 'white';
            svg.style.width = `${iconSize}px`;
            svg.style.height = `${iconSize}px`;
          }
          
          el.appendChild(iconWrapper);
        }
      }
      
      // Apply selected styling if this is the initially selected church
      if (isInitiallySelected) {
        el.classList.add('selected-church-marker');
        console.log('[Marker Created] Applied initial selection styling to:', church.name, church.id);
      }
      
      // Hide marker if drawing primary area (clean map for drawing)
      if (drawingPrimaryAreaRef.current || drawingAreaModeRef.current) {
        el.style.visibility = 'hidden';
      }
      
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: 'center',
        pitchAlignment: 'map'
      })
        .setLngLat([lng, lat])
        .addTo(map.current!);
      
      // NOTE: Zoom-based size updates are now handled by a single throttled handler
      // instead of individual listeners per marker (performance optimization)

      markersRef.current.set(church.id, marker);

      // Hover preview popup (only at zoom level 13+)
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15,
        className: 'church-preview-popup'
      });

      // Store popup reference for cleanup
      popupsRef.current.set(church.id, popup);

      // Track touch vs click to handle mobile interactions
      let touchMoved = false;
      let popupVisible = false;

      // Touch event handlers for mobile
      el.addEventListener('touchstart', () => {
        touchMoved = false;
      });

      el.addEventListener('touchmove', () => {
        touchMoved = true;
      });

      el.addEventListener('touchend', (e) => {
        if (touchMoved) return; // Ignore if user was scrolling/panning

        e.preventDefault();
        e.stopPropagation();
        
        // Set marker interaction flag to prevent map click from deselecting
        markerInteractionRef.current = true;
        // Clear the flag after a longer delay - Mapbox click fires ~200ms after touch
        // Using 300ms to be safe and cover all timing variations
        setTimeout(() => {
          markerInteractionRef.current = false;
        }, 300);

        // In Prayer Mode: open the prayer dialog instead of church detail
        if (prayerOverlayVisibleRef.current && onChurchPrayerFocusRef.current) {
          popup.remove();
          popupVisible = false;
          onChurchPrayerFocusRef.current(church.id, church.name);
          return;
        }

        // On touch devices: tap shows/refreshes the popup tooltip
        // The popup contains a "View Profile" link for navigation
        if (map.current && map.current.getZoom() >= 11) {
          showPopup();
          popupVisible = true;
        }
        onChurchClick?.(church);
      });

      // Click handler for mouse/desktop - stop propagation to prevent map click from firing
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // In Prayer Mode: open the prayer dialog instead of church detail
        if (prayerOverlayVisibleRef.current && onChurchPrayerFocusRef.current) {
          popup.remove();
          popupVisible = false;
          onChurchPrayerFocusRef.current(church.id, church.name);
          return;
        }
        
        onChurchClick?.(church);
      });

      // Function to show popup (shared between hover and touch)
      const showPopup = () => {
        if (!map.current || map.current.getZoom() < 11) return;

        // Close all other popups first (fixes mobile issue where old popup stays open)
        popupsRef.current.forEach((p, id) => {
          if (id !== church.id) {
            p.remove();
          }
        });

        // Create popup content using DOM APIs (safe from XSS)
        const container = document.createElement('div');
        container.className = 'p-3 min-w-[220px]';

        // Header with image and title
        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex items-start gap-3 mb-2';

        const imageDiv = document.createElement('div');
        imageDiv.className = 'w-12 h-12 bg-muted rounded-md flex items-center justify-center flex-shrink-0';
        imageDiv.innerHTML = '<svg class="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>';

        const textDiv = document.createElement('div');
        textDiv.className = 'flex-1 min-w-0';

        const nameH3 = document.createElement('h3');
        nameH3.className = 'font-semibold text-sm leading-tight mb-1';
        nameH3.textContent = church.name;
        textDiv.appendChild(nameH3);

        if (church.address || church.city) {
          const addressP = document.createElement('p');
          addressP.className = 'text-xs text-muted-foreground leading-tight';
          let rawAddr = church.address || '';
          const city = church.city || '';
          const state = church.state || '';
          if (rawAddr) {
            const parts = rawAddr.split(',').map((s: string) => s.trim());
            const seen = new Set<string>();
            const unique: string[] = [];
            for (const p of parts) {
              const key = p.toLowerCase();
              if (key && !seen.has(key)) {
                seen.add(key);
                unique.push(p);
              }
            }
            rawAddr = unique.join(', ');
          }
          const cityState = [city, state].filter(Boolean).join(', ');
          if (rawAddr && city && rawAddr.toLowerCase().includes(city.toLowerCase())) {
            addressP.textContent = rawAddr;
          } else {
            addressP.textContent = [rawAddr, cityState].filter(Boolean).join(', ');
          }
          textDiv.appendChild(addressP);
        }

        if (church.phone) {
          const phoneLink = document.createElement('a');
          phoneLink.href = `tel:${church.phone}`;
          phoneLink.className = 'text-xs text-primary hover:underline mt-1 block';
          phoneLink.textContent = church.phone;
          phoneLink.setAttribute('data-testid', 'link-phone-popup');
          textDiv.appendChild(phoneLink);
        }

        headerDiv.appendChild(imageDiv);
        headerDiv.appendChild(textDiv);
        container.appendChild(headerDiv);

        // Add "View Profile" button
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'mt-3 pt-3 border-t';
        
        const profileButton = document.createElement('button');
        profileButton.className = 'w-full px-3 py-2 text-xs font-medium text-primary bg-accent hover:bg-accent/80 rounded-md transition-colors';
        profileButton.textContent = 'View Profile';
        profileButton.setAttribute('data-testid', 'button-view-profile-popup');
        profileButton.addEventListener('click', (e) => {
          e.stopPropagation();
          popup.remove();
          // Navigate to full church profile page
          window.location.href = `/church/${church.id}`;
        });
        
        buttonDiv.appendChild(profileButton);
        container.appendChild(buttonDiv);

        popup.setLngLat([lng, lat])
          .setDOMContent(container)
          .addTo(map.current!);
      };

      // Mouse hover handlers for desktop with delay to allow reaching the popup
      let hideTimeout: ReturnType<typeof setTimeout> | null = null;
      let isHoveringPopup = false;
      
      const clearHideTimeout = () => {
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
      };
      
      const scheduleHide = () => {
        clearHideTimeout();
        hideTimeout = setTimeout(() => {
          if (!isHoveringPopup) {
            popup.remove();
            popupVisible = false;
          }
        }, 150); // Small delay to allow mouse to reach popup
      };
      
      el.addEventListener('mouseenter', () => {
        clearHideTimeout();
        showPopup();
        popupVisible = true;
        
        // Add hover listeners to popup content after it's shown
        const popupElement = popup.getElement();
        if (popupElement) {
          popupElement.addEventListener('mouseenter', () => {
            isHoveringPopup = true;
            clearHideTimeout();
          });
          popupElement.addEventListener('mouseleave', () => {
            isHoveringPopup = false;
            scheduleHide();
          });
        }
      });

      el.addEventListener('mouseleave', () => {
        scheduleHide();
      });
    });
    // Note: onChurchClick intentionally not in deps - we use the latest via closure
  }, [churches]);

  // Performance Mode constants imported from ./constants

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.display = churchPinsVisible ? '' : 'none';
    });
    if (map.current) {
      const m = map.current;
      const visibility = churchPinsVisible ? 'visible' : 'none';
      [CLUSTER_LAYER_ID, CLUSTER_COUNT_LAYER_ID, UNCLUSTERED_LAYER_ID].forEach(layerId => {
        if (m.getLayer(layerId)) {
          m.setLayoutProperty(layerId, 'visibility', visibility);
        }
      });
    }
  }, [churchPinsVisible]);

  // Store churches ref for click handler access without re-creating effect
  const churchesRef = useRef(churches);
  churchesRef.current = churches;

  // Performance Mode: Layer lifecycle (only responds to performanceMode toggle)
  useEffect(() => {
    if (!map.current) return;

    const mapInstance = map.current;

    // Helper to remove cluster layers and source
    const removeClusterLayers = () => {
      if (!mapInstance) return;
      try {
        if (mapInstance.getLayer(CLUSTER_COUNT_LAYER_ID)) {
          mapInstance.removeLayer(CLUSTER_COUNT_LAYER_ID);
        }
        if (mapInstance.getLayer(CLUSTER_LAYER_ID)) {
          mapInstance.removeLayer(CLUSTER_LAYER_ID);
        }
        if (mapInstance.getLayer(UNCLUSTERED_LAYER_ID)) {
          mapInstance.removeLayer(UNCLUSTERED_LAYER_ID);
        }
        if (mapInstance.getSource(CLUSTER_SOURCE_ID)) {
          mapInstance.removeSource(CLUSTER_SOURCE_ID);
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
    };

    // Helper to show/hide DOM markers
    const setMarkersVisible = (visible: boolean) => {
      markersRef.current.forEach((marker) => {
        const el = marker.getElement();
        el.style.display = visible ? 'flex' : 'none';
      });
    };

    // Helper to create cluster layers with empty initial data
    const createClusterLayers = () => {
      if (!mapInstance || !mapInstance.isStyleLoaded()) return;
      if (mapInstance.getSource(CLUSTER_SOURCE_ID)) return; // Already exists

      // Create source with empty data initially
      // clusterRadius: 40 (moderate - prevents mega-clusters while still grouping)
      // clusterMinPoints: 5 (small groups don't cluster, keeping more visible elements)
      // clusterMaxZoom: 12 (stop clustering earlier so we get individual pins sooner)
      // This prevents 1000+ mega-clusters while keeping good performance
      mapInstance.addSource(CLUSTER_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 40,
        clusterMinPoints: 5,
      });

      // Cluster circles layer
      mapInstance.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#DC2626',
          'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 50, 40],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Cluster count labels
      mapInstance.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // Unclustered points (individual churches)
      mapInstance.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#DC2626',
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
    };

    // Cluster click handler - zoom to expand
    const handleClusterClick = (e: mapboxgl.MapMouseEvent) => {
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER_ID],
      });
      if (!features.length) return;

      const clusterId = features[0].properties?.cluster_id;
      const source = mapInstance.getSource(CLUSTER_SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (!source || !clusterId) return;

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        const geometry = features[0].geometry;
        if (geometry.type === 'Point') {
          mapInstance.easeTo({
            center: geometry.coordinates as [number, number],
            zoom: zoom ?? 14,
          });
        }
      });
    };

    // Unclustered point click handler - open church detail
    const handleUnclusteredClick = (e: mapboxgl.MapMouseEvent) => {
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: [UNCLUSTERED_LAYER_ID],
      });
      if (!features.length) return;

      const churchId = features[0].properties?.id;
      if (churchId && onChurchClickRef.current) {
        const church = churchesRef.current.find(c => c.id === churchId);
        if (church) {
          onChurchClickRef.current(church);
        }
      }
    };

    // Cursor change on hover
    const handleMouseEnter = () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    };
    const handleMouseLeave = () => {
      mapInstance.getCanvas().style.cursor = '';
    };

    // Setup or teardown based on performanceMode
    const setupPerformanceMode = () => {
      if (!mapInstance.isStyleLoaded()) return;

      if (performanceMode) {
        // Performance mode ON: hide DOM markers, create cluster layers
        setMarkersVisible(false);
        createClusterLayers();

        // Add event listeners
        mapInstance.on('click', CLUSTER_LAYER_ID, handleClusterClick);
        mapInstance.on('click', UNCLUSTERED_LAYER_ID, handleUnclusteredClick);
        mapInstance.on('mouseenter', CLUSTER_LAYER_ID, handleMouseEnter);
        mapInstance.on('mouseleave', CLUSTER_LAYER_ID, handleMouseLeave);
        mapInstance.on('mouseenter', UNCLUSTERED_LAYER_ID, handleMouseEnter);
        mapInstance.on('mouseleave', UNCLUSTERED_LAYER_ID, handleMouseLeave);
      } else {
        // Performance mode OFF: show DOM markers, remove cluster layers
        setMarkersVisible(true);
        removeClusterLayers();

        // Remove event listeners
        mapInstance.off('click', CLUSTER_LAYER_ID, handleClusterClick);
        mapInstance.off('click', UNCLUSTERED_LAYER_ID, handleUnclusteredClick);
        mapInstance.off('mouseenter', CLUSTER_LAYER_ID, handleMouseEnter);
        mapInstance.off('mouseleave', CLUSTER_LAYER_ID, handleMouseLeave);
        mapInstance.off('mouseenter', UNCLUSTERED_LAYER_ID, handleMouseEnter);
        mapInstance.off('mouseleave', UNCLUSTERED_LAYER_ID, handleMouseLeave);
      }
    };

    // Run setup when map is ready
    if (mapInstance.isStyleLoaded()) {
      setupPerformanceMode();
    } else {
      mapInstance.once('load', setupPerformanceMode);
    }

    // Also handle style changes (map style reload)
    const handleStyleLoad = () => {
      if (performanceModeRef.current) {
        createClusterLayers();
      }
    };
    mapInstance.on('style.load', handleStyleLoad);

    // Cleanup only runs when performanceMode changes or component unmounts
    return () => {
      if (mapInstance) {
        mapInstance.off('style.load', handleStyleLoad);
        mapInstance.off('click', CLUSTER_LAYER_ID, handleClusterClick);
        mapInstance.off('click', UNCLUSTERED_LAYER_ID, handleUnclusteredClick);
        mapInstance.off('mouseenter', CLUSTER_LAYER_ID, handleMouseEnter);
        mapInstance.off('mouseleave', CLUSTER_LAYER_ID, handleMouseLeave);
        mapInstance.off('mouseenter', UNCLUSTERED_LAYER_ID, handleMouseEnter);
        mapInstance.off('mouseleave', UNCLUSTERED_LAYER_ID, handleMouseLeave);
        
        // Only remove layers when turning OFF performance mode (not during re-renders)
        // Check the incoming performanceMode value, not the ref
        if (!performanceMode) {
          // We're switching to non-performance mode, cleanup is handled above
        }
      }
    };
  }, [performanceMode]);

  // Performance Mode: Data updates (only updates source data when churches change)
  useEffect(() => {
    if (!map.current || !performanceMode) return;

    const mapInstance = map.current;

    // Build GeoJSON feature collection from churches
    const featureCollection = {
      type: 'FeatureCollection' as const,
      features: churches
        .filter(church => {
          const hasLocationCoords = church.location?.coordinates;
          const lng = hasLocationCoords ? church.location!.coordinates[0] : church.display_lng;
          const lat = hasLocationCoords ? church.location!.coordinates[1] : church.display_lat;
          return lng && lat && !isNaN(lng) && !isNaN(lat);
        })
        .map(church => {
          const hasLocationCoords = church.location?.coordinates;
          const lng = hasLocationCoords ? church.location!.coordinates[0] : church.display_lng!;
          const lat = hasLocationCoords ? church.location!.coordinates[1] : church.display_lat!;
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [lng, lat] as [number, number],
            },
            properties: {
              id: church.id,
              name: church.name,
            },
          };
        }),
    };

    // Try to update the source data
    const updateSourceData = () => {
      const source = mapInstance.getSource(CLUSTER_SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData(featureCollection);
        return true;
      }
      return false;
    };

    // If source exists, update immediately
    if (updateSourceData()) return;

    // Otherwise wait for sourcedata event (source was just created)
    const handleSourceData = (e: mapboxgl.MapSourceDataEvent) => {
      if (e.sourceId === CLUSTER_SOURCE_ID && e.isSourceLoaded) {
        updateSourceData();
        mapInstance.off('sourcedata', handleSourceData);
      }
    };
    mapInstance.on('sourcedata', handleSourceData);

    // Also try on next frame in case source is being added
    const timeoutId = setTimeout(() => {
      updateSourceData();
    }, 50);

    return () => {
      mapInstance.off('sourcedata', handleSourceData);
      clearTimeout(timeoutId);
    };
  }, [churches, performanceMode]);

  // Update existing markers when platform settings change (e.g., after async fetch completes)
  useEffect(() => {
    if (!map.current || markersRef.current.size === 0) return;
    
    const defaultPinColor = platformSettings.defaultPinColor || '#DC2626';
    const defaultPinIcon = platformSettings.defaultPinIcon || '';
    
    // Update all existing markers with platform settings (unless they have internal tag styling)
    markersRef.current.forEach((marker, churchId) => {
      const el = marker.getElement();
      
      // Skip if marker has internal tag styling (admin feature)
      if (el.classList.contains('internal-tag-styled')) return;
      
      // Update background color
      el.style.setProperty('background-color', defaultPinColor, 'important');
      
      // Update icon - remove existing and add new if configured
      const existingDefaultIcon = el.querySelector('.default-pin-icon');
      if (existingDefaultIcon) {
        existingDefaultIcon.remove();
      }
      
      if (defaultPinIcon) {
        const iconSvg = getPinIconSvg(defaultPinIcon);
        if (iconSvg) {
          const iconWrapper = document.createElement('div');
          iconWrapper.className = 'default-pin-icon';
          iconWrapper.style.zIndex = '10';
          iconWrapper.style.pointerEvents = 'none';
          iconWrapper.innerHTML = iconSvg;
          
          // Style the SVG to be visible on colored background - size is 40% of pin
          const markerSize = el.offsetWidth || parseInt(el.style.width) || 24;
          const iconSize = Math.max(8, Math.round(markerSize * 0.40));
          const svg = iconWrapper.querySelector('svg');
          if (svg) {
            svg.style.fill = 'white';
            svg.style.color = 'white';
            svg.style.width = `${iconSize}px`;
            svg.style.height = `${iconSize}px`;
          }
          
          el.appendChild(iconWrapper);
        }
      }
    });
  }, [platformSettings]);

  // Highlight selected church marker and hide others when in draw mode or allocation mode
  useEffect(() => {
    if (!map.current) return;
    
    console.log('[Selection Effect] Running with selectedChurchId:', selectedChurchId, 'markerCount:', markersRef.current.size, 'allocationMode:', allocationModeActive);

    // Check if Mapbox Draw is actively in drawing mode (not simple_select)
    const isActivelyDrawing = draw.current ? draw.current.getMode() !== 'simple_select' : false;

    markersRef.current.forEach((marker, churchId) => {
      const el = marker.getElement();
      const isSelected = selectedChurchId === churchId;
      
      // Use classList to toggle selected state without affecting data-testid or recreating the element
      if (isSelected) {
        el.classList.add('selected-church-marker');
      } else {
        el.classList.remove('selected-church-marker');
      }
      
      // Update marker size when selection changes (selected markers are 1.5x larger)
      const sizeUpdater = markerSizeUpdatersRef.current.get(churchId);
      if (sizeUpdater) {
        sizeUpdater(selectedChurchId);
      }
      
      // Hide ALL markers during allocation mode for a clean map
      if (allocationModeActive) {
        el.style.visibility = 'hidden';
      }
      // When drawing primary area, hide ALL markers from the start (clean map for drawing)
      else if (drawingPrimaryArea) {
        el.style.visibility = 'hidden';
      }
      // Hide all markers except selected when actively drawing (only if a church is selected)
      // Only hide when Mapbox Draw is in drawing mode (not simple_select) to prevent hiding during zoom/pan
      else if (isActivelyDrawing && selectedChurchId) {
        if (isSelected) {
          el.style.visibility = 'visible';
        } else {
          el.style.visibility = 'hidden';
        }
      } else {
        // Show all markers when not actively drawing or when no church is selected
        el.style.visibility = 'visible';
      }
    });
  }, [selectedChurchId, drawingAreaMode, drawingPrimaryArea, allocationModeActive]);

  // Update marker colors and icons when internal tag styles change (admin-only feature)
  useEffect(() => {
    if (!map.current) return;

    const hasActiveStyles = Object.keys(internalTagStyles).length > 0;
    const styledChurchIds = Object.keys(internalTagStyles);
    const markerChurchIds = Array.from(markersRef.current.keys());
    console.log('🏷️ Internal Tag Styles Update:', {
      hasActiveStyles,
      styleCount: styledChurchIds.length,
      churchIds: styledChurchIds,
      markerCount: markersRef.current.size,
      markerIds: markerChurchIds.slice(0, 5), // first 5 marker IDs
      matchingMarkers: styledChurchIds.filter(id => markersRef.current.has(id)),
    });
    
    markersRef.current.forEach((marker, churchId) => {
      const el = marker.getElement();
      const tagStyle = internalTagStyles[churchId];
      const existingIcon = el.querySelector('.internal-tag-icon') as HTMLElement | null;
      
      if (hasActiveStyles && tagStyle) {
        // Apply color styling
        el.style.backgroundColor = tagStyle.color_hex;
        el.classList.add('internal-tag-styled');
        el.style.animation = 'internal-tag-pulse 2s ease-in-out infinite';
        
        if (tagStyle.icon_key) {
          // Convert legacy icon keys (e.g., "Fa6:FaAnchor") to simple keys (e.g., "anchor")
          let iconId = tagStyle.icon_key;
          if (iconId.includes(':')) {
            const parts = iconId.split(':');
            iconId = parts[1] || parts[0];
            iconId = iconId.replace(/^(Fa|Lu|Md|Bi|Hi|Ai|Bs|Fi|Gi|Go|Gr|Im|Io|Ri|Si|Sl|Tb|Ti|Vsc|Wi)/i, '');
          }
          iconId = iconId.toLowerCase();
          
          // Check if we need to create a new icon or just update the existing one
          const existingTagId = existingIcon?.getAttribute('data-tag-id');
          const existingIconId = existingIcon?.getAttribute('data-icon-id');
          
          if (existingIcon && existingTagId === tagStyle.tag_id && existingIconId === iconId) {
            // Same tag and icon - just update the size based on current marker dimensions
            const markerSize = el.offsetWidth || parseInt(el.style.width) || 24;
            const iconSize = Math.max(8, Math.round(markerSize * 0.40));
            const svg = existingIcon.querySelector('svg');
            if (svg) {
              (svg as SVGElement).style.width = `${iconSize}px`;
              (svg as SVGElement).style.height = `${iconSize}px`;
            }
          } else {
            // Different tag or no existing icon - remove old and create new
            if (existingIcon) {
              existingIcon.remove();
            }
            
            const iconSvg = getPinIconSvg(iconId);
            if (iconSvg) {
              const markerSize = el.offsetWidth || parseInt(el.style.width) || 24;
              const iconSize = Math.max(8, Math.round(markerSize * 0.40));
              
              const iconWrapper = document.createElement('div');
              iconWrapper.className = 'internal-tag-icon';
              iconWrapper.style.zIndex = '10';
              iconWrapper.style.pointerEvents = 'none';
              iconWrapper.setAttribute('data-tag-id', tagStyle.tag_id);
              iconWrapper.setAttribute('data-icon-id', iconId);
              iconWrapper.innerHTML = iconSvg;
              
              const svg = iconWrapper.querySelector('svg');
              if (svg) {
                svg.style.fill = 'white';
                svg.style.color = 'white';
                svg.style.width = `${iconSize}px`;
                svg.style.height = `${iconSize}px`;
              }
              
              el.appendChild(iconWrapper);
              console.log('🎯 Icon created for church:', churchId, 'markerSize:', markerSize, 'iconSize:', iconSize);
            } else {
              console.warn('Icon not found for key:', iconId, '(original:', tagStyle.icon_key, ')');
            }
          }
        } else if (existingIcon) {
          // No icon_key but has existing icon - remove it
          existingIcon.remove();
        }
      } else if (hasActiveStyles) {
        // Remove internal tag icon if present
        if (existingIcon) {
          existingIcon.remove();
        }
        // Dim churches without matching tags when filter is active
        el.style.backgroundColor = '';
        el.classList.remove('internal-tag-styled');
        el.style.animation = '';
        el.style.opacity = '0.4';
        
        // Remove default pin icon if present
        const defaultIcon = el.querySelector('.default-pin-icon');
        if (defaultIcon) {
          defaultIcon.remove();
        }
      } else {
        // Reset to default pin color/icon when no internal tag filter is active
        // Use platformSettingsRef to get correct values (not localStorage which is never set)
        const defaultPinColor = platformSettingsRef.current.defaultPinColor || '#DC2626';
        const defaultPinIcon = platformSettingsRef.current.defaultPinIcon || '';
        
        el.style.setProperty('background-color', defaultPinColor, 'important');
        el.classList.remove('internal-tag-styled');
        el.style.animation = '';
        el.style.opacity = '';
        
        // Re-add default pin icon if configured and not already present
        const existingDefaultIcon = el.querySelector('.default-pin-icon');
        if (defaultPinIcon && !existingDefaultIcon) {
          const iconSvg = getPinIconSvg(defaultPinIcon);
          if (iconSvg) {
            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'default-pin-icon';
            iconWrapper.style.zIndex = '10';
            iconWrapper.style.pointerEvents = 'none';
            iconWrapper.innerHTML = iconSvg;
            
            // Style the SVG to be visible on colored background
            const svg = iconWrapper.querySelector('svg');
            if (svg) {
              svg.style.fill = 'white';
              svg.style.color = 'white';
              svg.style.width = '14px';
              svg.style.height = '14px';
            }
            
            el.appendChild(iconWrapper);
          }
        }
      }
    });
  }, [internalTagStyles, churches]);

  // Render ministry areas - extracted to <AreaLayer> component (rendered in JSX below)


  // EFFECT 1: Render place boundaries - extracted to <BoundaryLayer> component (rendered in JSX below)


  // EFFECT 2: Render primary ministry area (INDEPENDENT of boundaries)
  // Skip if church areas already contain an is_primary area (handled by areas layer)
  const hasPrimaryInAreas = (churchAreas || []).some(a => 'is_primary' in a && a.is_primary);
  useEffect(() => {
    if (!map.current) return;

    const renderPrimaryArea = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;

      const findFirstLabelLayerId = () => {
        const layers = map.current?.getStyle()?.layers || [];
        for (const layer of layers) {
          if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
            return layer.id;
          }
        }
        return undefined;
      };
      const firstLabelLayer = findFirstLabelLayerId();

      if (map.current.getLayer('primary-area-fill')) {
        map.current.removeLayer('primary-area-fill');
      }
      if (map.current.getLayer('primary-area-outline')) {
        map.current.removeLayer('primary-area-outline');
      }
      if (map.current.getSource('primary-area')) {
        map.current.removeSource('primary-area');
      }

      // Skip rendering if primary area is already handled by the areas layer
      if (hasPrimaryInAreas) return;

      if (!primaryMinistryArea || !isPrimaryAreaVisible) return;

      map.current.addSource('primary-area', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { isPrimary: true },
          geometry: primaryMinistryArea,
        },
      });

      // Yellow/Gold fill for primary ministry area - higher opacity to stand out
      // When saturation is ON, primary area must be hidden (opacity 0)
      map.current.addLayer({
        id: 'primary-area-fill',
        type: 'fill',
        source: 'primary-area',
        paint: {
          'fill-color': MAP_AREA_COLORS.primaryMinistryArea,
          'fill-opacity': mapOverlayModeRef.current === 'boundaries' ? 0.4 : 0,
        },
      }, firstLabelLayer);

      // Yellow/Gold outline for primary ministry area - thicker for visibility
      map.current.addLayer({
        id: 'primary-area-outline',
        type: 'line',
        source: 'primary-area',
        paint: {
          'line-color': MAP_AREA_COLORS.primaryMinistryArea,
          'line-width': 4,
        },
      }, firstLabelLayer);
      
      // Ensure proper layer ordering: health overlay < boundaries < primary area < labels
      // Use shared enforceOverlayOrder helper for consistent ordering
      try {
        const hasHealthOverlay = !!map.current.getLayer('health-choropleth-fill');
        const hasBoundaries = !!map.current.getLayer('boundaries-fill');
        
        if (hasHealthOverlay) {
          map.current.moveLayer('health-choropleth-fill', 'primary-area-fill');
          if (map.current.getLayer('health-choropleth-outline')) {
            map.current.moveLayer('health-choropleth-outline', 'primary-area-fill');
          }
        }
        if (hasBoundaries) {
          map.current.moveLayer('boundaries-fill', 'primary-area-fill');
          if (map.current.getLayer('boundaries-outline')) {
            map.current.moveLayer('boundaries-outline', 'primary-area-fill');
          }
        }
      } catch (e) {
        // Layer ordering may fail if layers don't exist yet, that's ok
      }
      
      // Schedule another ordering check after idle to catch late-added layers
      mapInstance.once('idle', () => {
        try {
          if (map.current?.getLayer('health-choropleth-fill') && map.current?.getLayer('primary-area-fill')) {
            map.current.moveLayer('health-choropleth-fill', 'primary-area-fill');
            if (map.current?.getLayer('health-choropleth-outline')) {
              map.current.moveLayer('health-choropleth-outline', 'primary-area-fill');
            }
          }
        } catch (e) {}
      });
    };

    const mapInstance = map.current;
    
    // ALWAYS use idle event - it's the most reliable indicator that the map is truly ready
    // The load event can fire before styles are fully loaded
    const attemptRender = () => {
      if (mapInstance.isStyleLoaded()) {
        renderPrimaryArea();
        return true;
      }
      return false;
    };
    
    // Try immediately
    if (!attemptRender()) {
      // If not ready, wait for idle (more reliable than load)
      const handleIdle = () => attemptRender();
      mapInstance.once('idle', handleIdle);
      
      // Also try on load as backup
      const handleLoad = () => attemptRender();
      mapInstance.once('load', handleLoad);

      return () => {
        mapInstance.off('load', handleLoad);
        mapInstance.off('idle', handleIdle);
      };
    }

    return () => {};
  }, [primaryMinistryArea, isPrimaryAreaVisible, hasPrimaryInAreas]);

  // Collaboration lines layer - extracted to <CollaborationLinesLayer> component (rendered in JSX below)

  // Health data choropleth overlay - extracted to <HealthChoropleth> component (rendered in JSX below)

  // Allocation mode: show all tract outlines in viewport
  const allocationFetchAbortRef = useRef<AbortController | null>(null);
  const allocationHoveredFeatureIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!map.current) return;
    const m = map.current;

    const findFirstLabelLayerId = () => {
      const layers = m.getStyle()?.layers || [];
      for (const layer of layers) {
        if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
          return layer.id;
        }
      }
      return undefined;
    };

    const ensureAllocationLayers = () => {
      if (m.getSource('allocation-tracts')) return true;
      try {
        const beforeId = m.getLayer('primary-area-fill')
            ? 'primary-area-fill'
            : (m.getLayer('health-choropleth-fill') ? 'health-choropleth-fill' : findFirstLabelLayerId());

        m.addSource('allocation-tracts', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          promoteId: 'geoid',
        });

        m.addLayer({
          id: 'allocation-tracts-fill',
          type: 'fill',
          source: 'allocation-tracts',
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              '#F59E0B',
              ['coalesce', ['feature-state', 'allocationColor'], '#9CA3AF'],
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.25,
              ['coalesce', ['feature-state', 'allocationOpacity'], 0.03],
            ],
          },
          layout: { visibility: 'none' },
        }, beforeId);

        m.addLayer({
          id: 'allocation-tracts-outline',
          type: 'line',
          source: 'allocation-tracts',
          paint: {
            'line-color': '#6B7280',
            'line-width': 1.5,
            'line-opacity': 0.8,
          },
          layout: { visibility: 'none' },
        }, beforeId);

        return true;
      } catch (err) {
        console.error('Error initializing allocation tract layers:', err);
        return false;
      }
    };

    const fetchTractsForViewport = async () => {
      if (!m || !allocationModeActive) return;
      if (!ensureAllocationLayers()) return;

      const bounds = m.getBounds();
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

      if (allocationFetchAbortRef.current) allocationFetchAbortRef.current.abort();
      allocationFetchAbortRef.current = new AbortController();

      try {
        const res = await fetch(`/api/tracts/geometries?bbox=${bbox}`, {
          signal: allocationFetchAbortRef.current.signal,
        });
        if (!res.ok) return;
        const geojson = await res.json();
        const source = m.getSource('allocation-tracts') as mapboxgl.GeoJSONSource;
        if (source) source.setData(geojson);

        const coverageMap = new Map(
          (prayerCoverageData?.tracts ?? []).map((t: any) => [t.tract_geoid, t])
        );
        requestAnimationFrame(() => {
          if (!m || !m.getSource('allocation-tracts')) return;
          for (const feature of geojson.features) {
            const geoid = feature.properties?.geoid;
            if (!geoid) continue;
            const coverage = coverageMap.get(geoid);
            const pct = coverage ? (coverage.allocation_pct ?? coverage.total_allocation_pct ?? 0) : 0;
            if (pct > 0) {
              const opacity = 0.1 + (Math.min(pct, 100) / 100) * 0.5;
              let color: string;
              if (pct <= 10) color = '#FDE68A';
              else if (pct <= 25) color = '#FCD34D';
              else if (pct <= 50) color = '#F59E0B';
              else if (pct <= 75) color = '#D97706';
              else color = '#B45309';
              m.setFeatureState(
                { source: 'allocation-tracts', id: geoid },
                { allocationOpacity: opacity, allocationColor: color }
              );
            } else {
              m.setFeatureState(
                { source: 'allocation-tracts', id: geoid },
                { allocationOpacity: 0.03, allocationColor: '#9CA3AF' }
              );
            }
          }
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error fetching allocation tracts:', err);
        }
      }
    };

    const handleMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (!m || !allocationModeActive) return;
      const features = m.queryRenderedFeatures(e.point, { layers: ['allocation-tracts-fill'] });
      if (features.length > 0) {
        const geoid = features[0].properties?.geoid;
        const featureId = (typeof geoid === 'string' && geoid) ? geoid : features[0].id;
        if (!featureId && featureId !== 0) return;
        if (allocationHoveredFeatureIdRef.current !== null && allocationHoveredFeatureIdRef.current !== featureId) {
          m.setFeatureState(
            { source: 'allocation-tracts', id: allocationHoveredFeatureIdRef.current },
            { hover: false }
          );
        }
        allocationHoveredFeatureIdRef.current = featureId;
        m.setFeatureState(
          { source: 'allocation-tracts', id: featureId },
          { hover: true }
        );
        m.getCanvas().style.cursor = 'pointer';
      } else {
        if (allocationHoveredFeatureIdRef.current !== null) {
          m.setFeatureState(
            { source: 'allocation-tracts', id: allocationHoveredFeatureIdRef.current },
            { hover: false }
          );
          allocationHoveredFeatureIdRef.current = null;
        }
        m.getCanvas().style.cursor = allocationModeActive ? 'crosshair' : '';
      }
    };

    const handleMouseLeave = () => {
      if (!m) return;
      if (allocationHoveredFeatureIdRef.current !== null) {
        m.setFeatureState(
          { source: 'allocation-tracts', id: allocationHoveredFeatureIdRef.current },
          { hover: false }
        );
        allocationHoveredFeatureIdRef.current = null;
      }
      m.getCanvas().style.cursor = allocationModeActive ? 'crosshair' : '';
    };

    const hidePerformanceModeLayers = (hide: boolean) => {
      const layers = ['clusters', 'cluster-count', 'unclustered-point'];
      layers.forEach(layerId => {
        if (m.getLayer(layerId)) {
          m.setLayoutProperty(layerId, 'visibility', hide ? 'none' : 'visible');
        }
      });
    };

    const setup = () => {
      if (!allocationModeActive) {
        if (allocationFetchAbortRef.current) allocationFetchAbortRef.current.abort();
        m.off('moveend', fetchTractsForViewport);
        m.off('mousemove', 'allocation-tracts-fill', handleMouseMove);
        m.off('mouseleave', 'allocation-tracts-fill', handleMouseLeave);
        if (m.getLayer('allocation-tracts-fill')) {
          m.setLayoutProperty('allocation-tracts-fill', 'visibility', 'none');
        }
        if (m.getLayer('allocation-tracts-outline')) {
          m.setLayoutProperty('allocation-tracts-outline', 'visibility', 'none');
        }
        const source = m.getSource('allocation-tracts') as mapboxgl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features: [] });
        hidePerformanceModeLayers(false);
        return;
      }

      hidePerformanceModeLayers(true);
      if (!ensureAllocationLayers()) return;
      m.setLayoutProperty('allocation-tracts-fill', 'visibility', 'visible');
      m.setLayoutProperty('allocation-tracts-outline', 'visibility', 'visible');
      fetchTractsForViewport();
      m.on('moveend', fetchTractsForViewport);
      m.on('mousemove', 'allocation-tracts-fill', handleMouseMove);
      m.on('mouseleave', 'allocation-tracts-fill', handleMouseLeave);
    };

    if (m.isStyleLoaded()) {
      setup();
    } else {
      m.once('load', setup);
    }

    return () => {
      if (allocationFetchAbortRef.current) allocationFetchAbortRef.current.abort();
      if (m) {
        m.off('moveend', fetchTractsForViewport);
        m.off('mousemove', 'allocation-tracts-fill', handleMouseMove);
        m.off('mouseleave', 'allocation-tracts-fill', handleMouseLeave);
      }
    };
  }, [allocationModeActive, prayerCoverageData]);

  // Prayer coverage overlay - extracted to <PrayerCoverageLayer> component (rendered in JSX below)

  // Ministry saturation choropleth - extracted to <SaturationLayer> component (rendered in JSX below)

  useEffect(() => {
    if (!map.current) return;
    applyAreaHighlight(map.current);
  }, [hoveredAreaId, highlightedAreaId, mapOverlayMode, applyAreaHighlight]);

  // Ember particle overlay system - extracted to <EmberParticles> component (rendered in JSX below)

  const tapPopupRef = useRef<mapboxgl.Popup | null>(null);

  // Ministry saturation hover tooltips - extracted to <SaturationLayer> component (rendered in JSX below)


  // Allocation mode: long-press detection - extracted to <AllocationMode> component (rendered in JSX below)


  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainer} className="w-full h-full" data-testid="map-container" />

      {/* Extracted child components (renderless - they manage map layers via useEffect) */}
      <AreaLayer
        map={map}
        churches={churches}
        globalAreas={globalAreas}
        churchAreas={churchAreas}
        ministryAreas={ministryAreas}
        visibleGlobalAreaIds={visibleGlobalAreaIds}
        visibleChurchAreaIds={visibleChurchAreaIds}
        showAllAreas={showAllAreas}
        mapOverlayMode={mapOverlayMode}
        mapOverlayModeRef={mapOverlayModeRef}
        onMinistryAreaClick={onMinistryAreaClick}
        applyAreaHighlight={applyAreaHighlight}
      />
      <AllocationMode
        map={map}
        allocationModeActive={allocationModeActive}
        prayerCoverageVisible={prayerCoverageVisible}
        onTractClick={onTractClick}
        onTractLongPress={onTractLongPress}
      />
      <HealthChoropleth
        map={map}
        healthMetricKey={healthMetricKey}
        healthOverlayVisible={healthOverlayVisible}
        prayerCoverageVisible={prayerCoverageVisible}
        platformId={platform?.id}
        onHealthDataLoadingChange={onHealthDataLoadingChange}
      />
      <PrayerCoverageLayer
        map={map}
        prayerCoverageVisible={prayerCoverageVisible}
        prayerCoverageMode={prayerCoverageMode}
        prayerCoverageData={prayerCoverageData}
      />
      <SaturationLayer
        map={map}
        mapOverlayMode={mapOverlayMode}
        mapOverlayModeRef={mapOverlayModeRef}
        clippedSaturationGeoJSON={clippedSaturationGeoJSON}
        saturationTooltipVisible={saturationTooltipVisible}
        applyAreaHighlight={applyAreaHighlight}
      />
      <EmberParticles map={map} mapContainer={mapContainer} active={prayerCoverageVisible} />
      <CollaborationLinesLayer map={map} collaborationLines={collaborationLines} />
      <BoundaryLayer
        map={map}
        boundaries={boundaries}
        hoverBoundary={hoverBoundary}
        visibleBoundaryIds={visibleBoundaryIds}
        drawingPrimaryArea={drawingPrimaryArea}
        filterBoundaries={filterBoundaries}
      />

      {/* Map overlay controls and legend */}
      <MapControls
        pinMode={pinMode}
        mapOverlayMode={mapOverlayMode}
        prayerCoverageVisible={prayerCoverageVisible}
        saturationTooltipVisible={saturationTooltipVisible}
        onPinModeChange={onPinModeChange}
        onMapOverlayModeChange={onMapOverlayModeChange}
        onPrayerCoverageVisibilityChange={onPrayerCoverageVisibilityChange}
        onSaturationTooltipVisibilityChange={onSaturationTooltipVisibilityChange}
      />
    </div>
  );
});
