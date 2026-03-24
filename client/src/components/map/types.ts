import type { ChurchWithCallings, Area, MinistryAreaWithCalling, Boundary } from "@shared/schema";
import type mapboxgl from "mapbox-gl";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";

// Internal tag style info for map pin customization
export interface InternalTagStyle {
  tag_id: string;
  color_hex: string;
  icon_key: string;
}

// Collaboration line data for map visualization
export interface CollaborationLine {
  id: string;
  partnerId: string;
  partnerName: string;
  status: 'pending' | 'active' | 'paused';
  hasOverlap: boolean;
  sourceCoords: [number, number];
  targetCoords: [number, number];
  overlapCentroid?: [number, number];
}

export interface MapViewRef {
  flyToChurch: (lng: number, lat: number) => void;
  deleteShape: (featureId: string) => void;
  editShape: (featureId: string) => void;
  startDrawing: () => void;
  getMap: () => mapboxgl.Map | null;
}

export interface MapViewProps {
  churches: ChurchWithCallings[];
  globalAreas?: Area[];
  churchAreas?: Area[];
  ministryAreas?: MinistryAreaWithCalling[];
  boundaries?: Boundary[];
  hoverBoundary?: Boundary | null;
  primaryMinistryArea?: any | null;
  isPrimaryAreaVisible?: boolean;
  visibleGlobalAreaIds?: Set<string>;
  visibleChurchAreaIds?: Set<string>;
  visibleBoundaryIds?: Set<string>;
  selectedChurchId?: string | null;
  onChurchClick?: (church: ChurchWithCallings) => void;
  onMapClick?: () => void;
  onPolygonDrawn?: (coordinates: [number, number][][]) => void;
  onShapeSelected?: (featureId: string) => void;
  onShapeDeselected?: () => void;
  onMinistryAreaClick?: (churchId: string, areaId?: string) => void;
  onMapBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  drawingAreaMode?: boolean;
  drawingPrimaryArea?: boolean;
  editingArea?: Area | null;
  onCancelDrawing?: () => void;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  showAllAreas?: boolean;
  className?: string;
  internalTagStyles?: Record<string, InternalTagStyle>;
  pinAdjustMode?: boolean;
  pinAdjustChurchId?: string | null;
  onPinDrag?: (position: { lat: number; lng: number }) => void;
  healthMetricKey?: string | null;
  healthOverlayVisible?: boolean;
  onHealthDataLoadingChange?: (loading: boolean, metricKey?: string) => void;
  prayerCoverageVisible?: boolean;
  prayerCoverageMode?: "citywide" | "myChurch";
  prayerCoverageData?: { tracts: Array<{ tract_geoid: string; total_allocation_pct: number; effective_allocation_pct?: number; church_count: number; population: number; coverage_pct?: number; effective_coverage_pct?: number }> } | null;
  allocationModeActive?: boolean;
  onTractClick?: (tractGeoid: string, tractLabel: string, population: number, point: { x: number; y: number }) => void;
  onTractLongPress?: (tractGeoid: string, tractLabel: string, population: number, point: { x: number; y: number }) => void;
  prayerOverlayVisible?: boolean;
  onChurchPrayerFocus?: (churchId: string, churchName: string) => void;
  onMapClickForPrayer?: (lngLat: { lng: number; lat: number }, point: { x: number; y: number }) => void;
  collaborationLines?: CollaborationLine[];
  performanceMode?: boolean;
  churchPinsVisible?: boolean;
  onChurchPinsVisibilityChange?: (visible: boolean) => void;
  filterBoundaries?: Boundary[];
  mapOverlayMode?: 'saturation' | 'boundaries' | 'off';
  pinMode?: 'all' | 'mapped' | 'hidden';
  onPinModeChange?: (mode: 'all' | 'mapped' | 'hidden') => void;
  onMapOverlayModeChange?: (mode: 'saturation' | 'boundaries' | 'off') => void;
  saturationTooltipVisible?: boolean;
  onSaturationTooltipVisibilityChange?: (visible: boolean) => void;
  onPrayerCoverageVisibilityChange?: (visible: boolean) => void;
  clippedSaturationGeoJSON?: { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: any; properties: { tract_geoid: string; area_id: string; saturation: number; raw_saturation: number; overlap_fraction: number; church_count: number; population: number; piece_population: number; pop_density: number; has_capacity: boolean; area_name: string; church_name: string; polygon_population: number } }> } | null;
  highlightedAreaId?: string | null;
  hoveredAreaId?: string | null;
}

// Shared refs that child components need access to
export interface MapRefs {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  draw: React.MutableRefObject<MapboxDraw | null>;
  markersRef: React.MutableRefObject<Map<string, mapboxgl.Marker>>;
  popupsRef: React.MutableRefObject<Map<string, mapboxgl.Popup>>;
  markerSizeUpdatersRef: React.MutableRefObject<Map<string, (selectedId?: string | null) => void>>;
  markerInteractionRef: React.MutableRefObject<boolean>;
}
