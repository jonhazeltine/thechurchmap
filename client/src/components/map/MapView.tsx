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
import { ChurchPinLayer } from "./ChurchPinLayer";

// Shared constants, types, and helpers
import type { MapViewProps, MapViewRef, CollaborationLine } from "./types";
export type { InternalTagStyle, CollaborationLine, MapViewRef } from "./types";
import {
  EMPTY_SET,
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
  
  // Internal tag styles passed to ChurchPinLayer component
  
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
  
  // onChurchClick passed to ChurchPinLayer component
  
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

  // Church pin markers — extracted to <ChurchPinLayer> component (rendered in JSX below)


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
      <ChurchPinLayer
        map={map}
        draw={draw}
        markersRef={markersRef}
        popupsRef={popupsRef}
        markerSizeUpdatersRef={markerSizeUpdatersRef}
        markerInteractionRef={markerInteractionRef}
        churches={churches}
        selectedChurchId={selectedChurchId}
        onChurchClick={onChurchClick}
        onChurchPrayerFocus={onChurchPrayerFocus}
        prayerOverlayVisible={prayerOverlayVisible}
        drawingAreaMode={drawingAreaMode}
        drawingPrimaryArea={drawingPrimaryArea}
        allocationModeActive={allocationModeActive}
        performanceMode={performanceMode}
        churchPinsVisible={churchPinsVisible}
        platformSettings={platformSettings}
        internalTagStyles={internalTagStyles}
      />
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
