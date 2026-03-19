import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useState } from "react";
import { MapPin, MapPinOff, MessageSquareText, MessageSquareOff, Layers, HandHeart } from "lucide-react";
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
  HEALTH_METRIC_COLOR_SCALES,
  HEALTH_METRIC_KEYS,
  isNegativeMetric,
  isPublicSafetyMetric,
} from "@shared/schema";
import { getChoroplethThresholds } from "@shared/metric-thresholds";
import { renderIconToHtml } from "@/components/ui/icon-renderer";
import { usePlatformContext } from "@/contexts/PlatformContext";


mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Inline SVG icons for map pins (matches Settings page)
// Using bold, simple silhouettes that are visible at any size
const PIN_ICON_SVGS: Record<string, string> = {
  // Current internal tag icons
  anchor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C10.34 2 9 3.34 9 5c0 1.1.6 2.05 1.5 2.56V9H8v2h2.5v7.92C7.36 18.47 5 15.97 5 13H3c0 4.42 4.03 8 9 8s9-3.58 9-8h-2c0 2.97-2.36 5.47-5.5 5.92V11H16V9h-2.5V7.56C14.4 7.05 15 6.1 15 5c0-1.66-1.34-3-3-3zm0 2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/></svg>`,
  handshake: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.22 19.85c-.18.18-.5.21-.71 0L6.91 15.3a3.67 3.67 0 0 1 0-5.18l3.05-3.06a1.5 1.5 0 0 1 2.12 0l.35.35.35-.35a1.5 1.5 0 0 1 2.12 0l3.05 3.06a3.67 3.67 0 0 1 0 5.18l-4.6 4.55c-.21.21-.53.18-.71 0l-.42-.42z"/></svg>`,
  bridge: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14v-2c0-1.1.45-2.1 1.17-2.83A3.98 3.98 0 0 1 11 8h2c1.1 0 2.1.45 2.83 1.17A3.98 3.98 0 0 1 17 12v2h3V8a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v6h3zm-3 2v4h4v-4H4zm12 0v4h4v-4h-4zm-6 0v4h4v-4h-4z"/></svg>`,
  link: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8z"/></svg>`,
  circles: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm6 10a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M9 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm6 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  unity: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`,
  flame: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>`,
  // Basic shapes
  cross: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2z"/></svg>`,
  church: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L4 9v12h5v-5c0-1.66 1.34-3 3-3s3 1.34 3 3v5h5V9l-8-6zm0 2.5l1 .75V8h-2V6.25l1-.75zM12 10a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>`,
  steeple: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11 2h2v3h2v2h-2v2l5 4v8H6v-8l5-4V7H9V5h2V2zm1 9.5L8 14.5V19h3v-3h2v3h3v-4.5l-4-3z"/></svg>`,
  cathedral: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l-1 2h-.5L9 6v2H7l-4 5v7h6v-4h2v4h2v-4h2v4h6v-7l-4-5h-2V6l-1.5-2H12l-1-2h2zm0 5a1 1 0 110 2 1 1 0 010-2zm-4 6h2v3H8v-3zm6 0h2v3h-2v-3z"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.248c-3.148-5.402-12-3.825-12 2.944 0 4.661 5.571 9.427 12 15.808 6.43-6.381 12-11.147 12-15.808 0-6.792-8.875-8.306-12-2.944z"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`,
  // People & community
  people: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  family: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zM4 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm14 3c-1.1 0-2 .9-2 2v5h2v9h3v-9h2V9c0-1.1-.9-2-2-2h-3zM4 7c-1.1 0-2 .9-2 2v5h2v9h3v-9h2V9c0-1.1-.9-2-2-2H4zm8-3c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm0 3c-1.1 0-2 .9-2 2v5h2v9h3v-9h2V9c0-1.1-.9-2-2-2h-3z"/></svg>`,
  child: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4.5 6.5c-.83 0-1.5.67-1.5 1.5v7h-2v6h-2v-6H9v-7c0-.83-.67-1.5-1.5-1.5S6 9.17 6 10v10h3v-3h6v3h3V10c0-.83-.67-1.5-1.5-1.5z"/></svg>`,
  // Service & ministry
  food: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05l-5 2v6.06c0 .86-.78 1.48-1.62 1.28-1.25-.29-2.29-1.08-2.87-2.14-2.8 2.64-6.51 2.81-9.51.61V4.03h4c2.76 0 5 2.24 5 5v8.96c.68 1.11 1.4 2.23 2.06 3zm-9-13.96h-6v6h6v-6z"/></svg>`,
  medical: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  tools: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`,
  truck: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
  // Places & nature
  home: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
  globe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
  tree: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4 12h3v8h4v-6h2v6h4v-8h3L12 2z"/></svg>`,
  mountain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22L14 6z"/></svg>`,
  water: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z"/></svg>`,
  // Faith symbols
  book: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`,
  dove: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-1.27 0-2.4.8-2.82 2H3v2h1.95L2 14c-.21 2 1.79 4 4 4h1v3h2v-3h2v3h2v-3h1c2.21 0 4.21-2 4-4l-2.95-7H17V5h-6.18C10.4 3.8 9.27 3 8 3h4z"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>`,
  candle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-.5 0-1 .19-1.41.59-.78.78-.78 2.05 0 2.83.19.18.43.32.68.41-.27.61-.42 1.28-.42 2-.15 1.46.35 2.87 1.15 3.17V22h2V11c.8-.3 1.3-1.71 1.15-3.17 0-.72-.15-1.39-.42-2 .25-.09.49-.23.68-.41.78-.78.78-2.05 0-2.83C14 2.19 13.5 2 12 2z"/></svg>`,
  crown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>`,
  lamp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>`,
  fish: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20L2 12l10-8v5c5.52 0 10 4.48 10 10 0 .83-.11 1.64-.29 2.42C20.17 18.48 16.43 16 12 16v4z"/></svg>`,
  hands: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 2C9.64 2 8 4.57 8 7v3H6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2h-2V7c0-2.43-1.64-5-4.5-5zM10 7c0-1.38.84-3 2.5-3S15 5.62 15 7v3h-5V7z"/></svg>`,
};

// Stable empty Set to prevent unnecessary re-renders from reference inequality
const EMPTY_SET = new Set<string>();

// Helper to get inline SVG for pin icon
function getPinIconSvg(iconId: string): string | null {
  return PIN_ICON_SVGS[iconId] || null;
}

function getSaturationLabel(value: number): string {
  if (value < 0.0002) return 'Underserved';
  if (value < 0.0005) return 'Emerging';
  if (value < 0.001) return 'Growing';
  if (value < 0.005) return 'Well-served';
  return 'Saturated';
}

function buildPrayerTooltipHtml(features: mapboxgl.MapboxGeoJSONFeature[]): string {
  if (features.length === 0) return '';
  const props = features[0].properties;
  const churchCount = props?.church_count ?? 0;
  const coveragePct = props?.effective_coverage_pct ?? props?.coverage_pct ?? 0;
  const population = props?.population ?? 0;
  let html = '<div style="font-weight:600;margin-bottom:4px">Prayer Coverage</div>';
  html += `<div style="color:#555">${churchCount} ${churchCount === 1 ? 'church' : 'churches'} praying</div>`;
  if (population > 0) html += `<div style="color:#555">Population: ${population.toLocaleString()}</div>`;
  html += `<div style="color:#555">Coverage: ${Math.round(coveragePct)}%</div>`;
  return html;
}

function buildSaturationTooltipHtml(features: mapboxgl.MapboxGeoJSONFeature[]): string {
  const areaMap = new Map<string, { church_name: string; area_name: string; raw_saturation: number; has_capacity: boolean; piece_population: number; pop_density: number; polygon_population: number }>();
  let totalPopulation = 0;
  let maxRawSaturation = 0;
  let anyHasCapacity = false;
  let totalChurchCount = 0;
  let maxPopDensity = 0;

  features.forEach(f => {
    const props = f.properties;
    const areaId = props?.area_id || '';
    const churchCount = props?.church_count ?? 0;
    if (churchCount > totalChurchCount) totalChurchCount = churchCount;
    if (areaId && !areaMap.has(areaId)) {
      const piecePop = props?.piece_population ?? 0;
      const popDens = props?.pop_density ?? 0;
      areaMap.set(areaId, {
        church_name: props?.church_name || 'Unknown Church',
        area_name: props?.area_name || 'Ministry Area',
        raw_saturation: props?.raw_saturation ?? 0,
        has_capacity: props?.has_capacity !== false && props?.has_capacity !== 'false',
        piece_population: piecePop,
        pop_density: popDens,
        polygon_population: props?.polygon_population ?? 0,
      });
      if ((props?.raw_saturation ?? 0) > maxRawSaturation) maxRawSaturation = props?.raw_saturation ?? 0;
      if (props?.has_capacity !== false && props?.has_capacity !== 'false') anyHasCapacity = true;
      if (popDens > maxPopDensity) maxPopDensity = popDens;
    }
    if ((props?.population ?? 0) > totalPopulation) totalPopulation = props?.population ?? 0;
  });

  const uniqueChurchNames = new Set<string>();
  areaMap.forEach(info => uniqueChurchNames.add(info.church_name));
  const churchCount = uniqueChurchNames.size;
  const densityFormatted = maxPopDensity.toLocaleString();

  let html = '<div style="font-weight:600;margin-bottom:4px">Ministry Coverage</div>';

  if (totalChurchCount === 0) {
    html += `<div style="color:#888">0 churches serving this area</div>`;
    html += `<div style="color:#555;margin-top:4px">Population: ${totalPopulation.toLocaleString()}</div>`;
    html += `<div style="margin-top:4px;font-weight:500;color:#dc2626">Coverage: No Coverage</div>`;
  } else {
    const satLabel = getSaturationLabel(maxRawSaturation);
    html += `<div style="color:#555">${churchCount} ${churchCount === 1 ? 'church' : 'churches'} serving</div>`;
    if (churchCount > 0 && churchCount <= 5) {
      const churchPolyPops = new Map<string, number>();
      areaMap.forEach(info => {
        if (!churchPolyPops.has(info.church_name) || info.polygon_population > (churchPolyPops.get(info.church_name) || 0)) {
          churchPolyPops.set(info.church_name, info.polygon_population);
        }
      });
      uniqueChurchNames.forEach(name => {
        const polyPop = churchPolyPops.get(name) || 0;
        const popStr = polyPop > 0 ? ` (${polyPop.toLocaleString()} people)` : '';
        html += `<div style="color:#666;font-size:12px;padding-left:8px">&bull; ${name}${popStr}</div>`;
      });
    }
    html += `<div style="color:#555;margin-top:4px">Density: ${densityFormatted} people/mi&sup2;</div>`;
    html += `<div style="margin-top:4px;font-weight:500;color:#1d4ed8">Coverage: ${satLabel}</div>`;
    if (!anyHasCapacity) {
      html += `<div style="color:#999;font-size:11px;margin-top:2px">Based on baseline capacity (no manual data yet)</div>`;
    }
  }

  return html;
}

// Internal tag style info for map pin customization
export interface InternalTagStyle {
  tag_id: string;
  color_hex: string;
  icon_key: string;
}

interface MapViewProps {
  churches: ChurchWithCallings[];
  globalAreas?: Area[];
  churchAreas?: Area[];
  ministryAreas?: MinistryAreaWithCalling[];  // Sprint 1.8: All ministry areas with calling info
  boundaries?: Boundary[];
  hoverBoundary?: Boundary | null;
  primaryMinistryArea?: any | null;  // GeoJSON geometry for selected church's primary ministry area
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
  drawingPrimaryArea?: boolean;  // True when drawing primary ministry area - hides all other elements
  editingArea?: Area | null;
  onCancelDrawing?: () => void;
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  showAllAreas?: boolean;
  className?: string;
  internalTagStyles?: Record<string, InternalTagStyle>;  // Map of church_id -> tag style
  pinAdjustMode?: boolean;
  pinAdjustChurchId?: string | null;
  onPinDrag?: (position: { lat: number; lng: number }) => void;
  // Health data overlay props
  healthMetricKey?: string | null;
  healthOverlayVisible?: boolean;
  onHealthDataLoadingChange?: (loading: boolean, metricKey?: string) => void;
  // Prayer coverage overlay props
  prayerCoverageVisible?: boolean;
  prayerCoverageMode?: "citywide" | "myChurch";
  prayerCoverageData?: { tracts: Array<{ tract_geoid: string; total_allocation_pct: number; effective_allocation_pct?: number; church_count: number; population: number; coverage_pct?: number; effective_coverage_pct?: number }> } | null;
  allocationModeActive?: boolean;
  onTractClick?: (tractGeoid: string, tractLabel: string, population: number, point: { x: number; y: number }) => void;
  onTractLongPress?: (tractGeoid: string, tractLabel: string, population: number, point: { x: number; y: number }) => void;
  // Prayer Mode focus props
  prayerOverlayVisible?: boolean;
  onChurchPrayerFocus?: (churchId: string, churchName: string) => void;
  onMapClickForPrayer?: (lngLat: { lng: number; lat: number }, point: { x: number; y: number }) => void;
  // Collaboration lines
  collaborationLines?: CollaborationLine[];
  // Performance mode - uses clustering instead of DOM markers
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
    
    const isSaturation = mapOverlayModeRef.current === 'saturation';
    if (activeId) {
      m.setPaintProperty('areas-fill', 'fill-opacity', isBoundaries ? [
        'case',
        ['==', ['get', 'id'], activeId],
        0.45,
        0.15
      ] : isSaturation ? [
        'case',
        ['==', ['get', 'id'], activeId],
        0.35,
        0.01
      ] : 0);
      m.setPaintProperty('areas-outline', 'line-width', [
        'case',
        ['==', ['get', 'id'], activeId],
        3.5,
        isSaturation ? 1.5 : 2
      ]);
    } else {
      m.setPaintProperty('areas-fill', 'fill-opacity', isBoundaries ? 0.15 : isSaturation ? 0.01 : 0);
      m.setPaintProperty('areas-outline', 'line-width', isSaturation ? 1.5 : 2);
    }
    
    if (m.getLayer('primary-area-fill')) {
      m.setPaintProperty('primary-area-fill', 'fill-opacity', isBoundaries ? 0.4 : isSaturation ? 0.01 : 0);
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
  
  // Tooltip visibility ref for use in click handler closure
  const saturationTooltipVisibleRef = useRef(saturationTooltipVisible);
  
  // Performance mode ref for clustering
  const performanceModeRef = useRef(performanceMode);
  
  // Health data loading callback ref
  const onHealthDataLoadingChangeRef = useRef(onHealthDataLoadingChange);
  onHealthDataLoadingChangeRef.current = onHealthDataLoadingChange;
  
  // Get platform context for limiting health data queries to platform boundaries
  const { platform } = usePlatformContext();
  const platformIdRef = useRef(platform?.id);
  platformIdRef.current = platform?.id;
  
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
  const USER_MAP_STYLE_KEY = 'kingdom-map-style-preference';
  const [userMapStyle, setUserMapStyle] = useState<string | null>(() => {
    return localStorage.getItem(USER_MAP_STYLE_KEY);
  });
  
  // Helper to get Mapbox style URL from style ID
  const getMapStyleUrl = (styleId: string) => {
    switch (styleId) {
      case 'standard': return 'mapbox://styles/mapbox/standard';
      case 'light-v11': return 'mapbox://styles/mapbox/light-v11';
      case 'dark-v11': return 'mapbox://styles/mapbox/dark-v11';
      case 'satellite-streets-v12': return 'mapbox://styles/mapbox/satellite-streets-v12';
      case 'outdoors-v12': return 'mapbox://styles/mapbox/outdoors-v12';
      case 'moonlight': return 'mapbox://styles/mapbox/cj3kbeqzo00022smj7akz3o1e';
      case 'blueprint': return 'mapbox://styles/mslee/ciellcr9y001g5pknxuqwjhqm';
      default: return 'mapbox://styles/mapbox/streets-v12';
    }
  };
  
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

    const getMapStyleUrl = (styleId: string) => {
      switch (styleId) {
        case 'standard': return 'mapbox://styles/mapbox/standard';
        case 'light-v11': return 'mapbox://styles/mapbox/light-v11';
        case 'dark-v11': return 'mapbox://styles/mapbox/dark-v11';
        case 'satellite-streets-v12': return 'mapbox://styles/mapbox/satellite-streets-v12';
        case 'outdoors-v12': return 'mapbox://styles/mapbox/outdoors-v12';
        case 'moonlight': return 'mapbox://styles/mapbox/cj3kbeqzo00022smj7akz3o1e';
        case 'blueprint': return 'mapbox://styles/mslee/ciellcr9y001g5pknxuqwjhqm';
        default: return 'mapbox://styles/mapbox/streets-v12';
      }
    };

    // User preference (localStorage) takes priority over platform default
    const userPreference = localStorage.getItem('kingdom-map-style-preference');
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
              tapHtml += '<div style="border-top:1px solid #e5e7eb;margin:6px 0"></div>';
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
              tapHtml += '<div style="font-weight:600;margin-bottom:4px;color:#059669">Collaboration Opportunity!</div>';
              tapHtml += `<div style="color:#555">${uniqueChurches.length} churches serving this area</div>`;
              uniqueChurches.forEach(c => {
                tapHtml += `<div style="color:#666;font-size:12px;padding-left:8px">&bull; ${c.church_name}</div>`;
                if (c.population > 0) {
                  tapHtml += `<div style="color:#999;font-size:11px;padding-left:16px">${c.population.toLocaleString()} people</div>`;
                }
              });
            } else if (uniqueChurches.length === 1) {
              const c = uniqueChurches[0];
              tapHtml += `<div style="font-weight:600;margin-bottom:4px">${c.church_name}</div>`;
              tapHtml += `<div style="color:#666;font-size:12px">${c.area_name}</div>`;
              if (c.population > 0) {
                tapHtml += `<div style="color:#555;font-size:12px;margin-top:2px">${c.population.toLocaleString()} people</div>`;
              }
            }
          }

          if (prayerFeatures.length > 0) {
            if (areaFeatures.length > 0) tapHtml += '<div style="border-top:1px solid #e5e7eb;margin:6px 0"></div>';
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

  // Performance Mode constants (shared between effects)
  const CLUSTER_SOURCE_ID = 'churches-clustered';
  const CLUSTER_LAYER_ID = 'clusters';
  const CLUSTER_COUNT_LAYER_ID = 'cluster-count';
  const UNCLUSTERED_LAYER_ID = 'unclustered-point';

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

  // Render ministry areas as GeoJSON layers (dual-context architecture)
  useEffect(() => {
    if (!map.current) return;

    // Build church id -> calling color map (only needed when NOT in show all mode)
    const churchCallingColors: Record<string, string> = {};
    if (!showAllAreas) {
      churches.forEach(church => {
        if (church.callings && church.callings.length > 0) {
          // Use first calling's color as primary
          const primaryCalling = church.callings[0];
          churchCallingColors[church.id] = primaryCalling.color || MAP_AREA_COLORS.defaultCalling;
        }
      });
    }

    // Filter visible areas from both contexts
    // Sprint 1.8: When showAllAreas is true, use ministryAreas with calling colors from DB
    const visibleGlobal = globalAreas.filter(a => visibleGlobalAreaIds?.has(a.id));
    const visibleChurch = (showAllAreas || mapOverlayMode === 'boundaries' || mapOverlayMode === 'saturation')
      ? (ministryAreas || [])
      : (churchAreas || []).filter(a => visibleChurchAreaIds?.has(a.id));
    const allVisibleAreas = [...visibleGlobal, ...visibleChurch];

    // Wait for map style to load before adding sources/layers
    const renderAreas = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;

      const featureCollection = {
        type: 'FeatureCollection' as const,
        features: allVisibleAreas.map((area) => {
          const isPrimary = 'is_primary' in area ? area.is_primary : false;
          const callingColor = isPrimary
            ? MAP_AREA_COLORS.primaryMinistryArea
            : ('calling_color' in area 
              ? area.calling_color 
              : (area.church_id ? (churchCallingColors[area.church_id] || MAP_AREA_COLORS.defaultCalling) : null));
          
          return {
            type: 'Feature' as const,
            id: area.id,
            properties: {
              id: area.id,
              name: area.name,
              type: area.type,
              church_id: area.church_id,
              church_name: 'church_name' in area ? area.church_name : null,
              calling_color: callingColor,
              is_primary: isPrimary,
              population: 'population' in area ? area.population : null,
            },
            geometry: area.geometry,
          };
        }),
      };

      if (map.current.getSource('areas')) {
        const source = map.current.getSource('areas') as mapboxgl.GeoJSONSource;
        source.setData(featureCollection as any);
        applyAreaHighlight(map.current);
        return;
      }

      if (allVisibleAreas.length === 0) return;

      map.current.addSource('areas', {
        type: 'geojson',
        data: featureCollection as any,
      });

      const areasBeforeId = undefined;

      map.current.addLayer({
        id: 'areas-fill',
        type: 'fill',
        source: 'areas',
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'is_primary'], true],
            MAP_AREA_COLORS.primaryMinistryArea,
            ['!=', ['get', 'church_id'], null],
            ['coalesce', ['get', 'calling_color'], MAP_AREA_COLORS.defaultCalling],
            MAP_AREA_COLORS.globalArea
          ],
          'fill-opacity': [
            'case',
            ['==', ['get', 'is_primary'], true],
            mapOverlayModeRef.current === 'boundaries' ? 0.3 : mapOverlayModeRef.current === 'saturation' ? 0.01 : 0,
            mapOverlayModeRef.current === 'boundaries' ? 0.15 : mapOverlayModeRef.current === 'saturation' ? 0.01 : 0
          ],
        },
      }, areasBeforeId);

      map.current.addLayer({
        id: 'areas-outline',
        type: 'line',
        source: 'areas',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'is_primary'], true],
            MAP_AREA_COLORS.primaryMinistryArea,
            ['!=', ['get', 'church_id'], null],
            ['coalesce', ['get', 'calling_color'], MAP_AREA_COLORS.defaultCallingOutline],
            MAP_AREA_COLORS.globalAreaOutline
          ],
          'line-width': [
            'case',
            ['==', ['get', 'is_primary'], true],
            3,
            2
          ],
        },
      }, areasBeforeId);

      // Add click handler for ministry areas (desktop only - on mobile, only pin taps open church drawer)
      map.current.on('click', 'areas-fill', (e) => {
        if (e.originalEvent instanceof TouchEvent) return;
        if (e.features && e.features.length > 0) {
          const churchId = e.features[0].properties?.church_id;
          const areaId = e.features[0].properties?.id;
          if (churchId && onMinistryAreaClick) {
            onMinistryAreaClick(churchId, areaId);
          }
        }
      });

      // Change cursor to pointer when hovering over ministry areas
      map.current.on('mouseenter', 'areas-fill', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = 'pointer';
        }
      });

      map.current.on('mouseleave', 'areas-fill', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = '';
        }
      });

      // Apply highlight state after layer creation
      applyAreaHighlight(map.current);
    };

    // More robust rendering approach - use idle as fallback only if immediate render didn't happen
    const mapInstance = map.current;
    let didRender = false;
    
    if (mapInstance.isStyleLoaded()) {
      renderAreas();
      didRender = true;
    } else {
      mapInstance.once('load', () => {
        renderAreas();
        didRender = true;
      });
    }
    
    // Use 'idle' event as fallback ONLY if we haven't rendered yet
    const handleIdle = () => {
      if (!didRender && mapInstance.isStyleLoaded()) {
        renderAreas();
      }
    };
    mapInstance.once('idle', handleIdle);

    return () => {
      if (mapInstance) {
        mapInstance.off('load', renderAreas);
        mapInstance.off('idle', handleIdle);
      }
    };
  }, [globalAreas, churchAreas, ministryAreas, visibleGlobalAreaIds, visibleChurchAreaIds, showAllAreas, mapOverlayMode]);

  // EFFECT 1: Render place boundaries and hover preview (independent of primary area)
  // Layer order (bottom to top): health overlay → place boundaries → primary ministry area → labels
  useEffect(() => {
    if (!map.current) return;

    const renderBoundaries = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;
      
      // When drawing primary area, remove all boundaries for a clean drawing experience
      if (drawingPrimaryArea) {
        if (map.current.getLayer('boundaries-fill')) {
          map.current.removeLayer('boundaries-fill');
        }
        if (map.current.getLayer('boundaries-outline')) {
          map.current.removeLayer('boundaries-outline');
        }
        if (map.current.getLayer('boundary-preview-fill')) {
          map.current.removeLayer('boundary-preview-fill');
        }
        if (map.current.getLayer('boundary-preview-outline')) {
          map.current.removeLayer('boundary-preview-outline');
        }
        if (map.current.getSource('boundaries')) {
          map.current.removeSource('boundaries');
        }
        if (map.current.getSource('boundary-preview')) {
          map.current.removeSource('boundary-preview');
        }
        if (map.current.getLayer('filter-boundary-fill')) {
          map.current.removeLayer('filter-boundary-fill');
        }
        if (map.current.getLayer('filter-boundary-outline')) {
          map.current.removeLayer('filter-boundary-outline');
        }
        if (map.current.getSource('filter-boundaries')) {
          map.current.removeSource('filter-boundaries');
        }
        return;
      }

      // Find first label layer for proper stacking
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

      // Remove existing boundary layers (NOT primary area - that's handled separately)
      if (map.current.getLayer('boundaries-fill')) {
        map.current.removeLayer('boundaries-fill');
      }
      if (map.current.getLayer('boundaries-outline')) {
        map.current.removeLayer('boundaries-outline');
      }
      if (map.current.getLayer('boundary-preview-fill')) {
        map.current.removeLayer('boundary-preview-fill');
      }
      if (map.current.getLayer('boundary-preview-outline')) {
        map.current.removeLayer('boundary-preview-outline');
      }
      if (map.current.getSource('boundaries')) {
        map.current.removeSource('boundaries');
      }
      if (map.current.getSource('boundary-preview')) {
        map.current.removeSource('boundary-preview');
      }

      // Filter boundaries to only include visible ones
      const visibleBoundaries = boundaries.filter(b => visibleBoundaryIds.has(b.id));

      // Render attached boundaries
      if (visibleBoundaries.length > 0) {
        map.current.addSource('boundaries', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: visibleBoundaries.map((boundary) => ({
              type: 'Feature',
              id: boundary.id,
              properties: {
                id: boundary.id,
                name: boundary.name,
                type: boundary.type,
              },
              geometry: boundary.geometry,
            })),
          },
        });

        // Blue fill layer for boundaries (city/place) - add below labels
        map.current.addLayer({
          id: 'boundaries-fill',
          type: 'fill',
          source: 'boundaries',
          paint: {
            'fill-color': MAP_AREA_COLORS.boundary,
            'fill-opacity': 0.15,
          },
        }, firstLabelLayer);

        // Blue outline layer for boundaries
        map.current.addLayer({
          id: 'boundaries-outline',
          type: 'line',
          source: 'boundaries',
          paint: {
            'line-color': MAP_AREA_COLORS.boundaryOutline,
            'line-width': 3,
          },
        }, firstLabelLayer);
      }

      if (map.current.getLayer('filter-boundary-fill')) {
        map.current.removeLayer('filter-boundary-fill');
      }
      if (map.current.getLayer('filter-boundary-outline')) {
        map.current.removeLayer('filter-boundary-outline');
      }
      if (map.current.getSource('filter-boundaries')) {
        map.current.removeSource('filter-boundaries');
      }

      if (filterBoundaries.length > 0) {
        map.current.addSource('filter-boundaries', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: filterBoundaries.map((boundary) => ({
              type: 'Feature',
              id: boundary.id,
              properties: {
                id: boundary.id,
                name: boundary.name,
                type: boundary.type,
              },
              geometry: boundary.geometry,
            })),
          },
        });

        map.current.addLayer({
          id: 'filter-boundary-fill',
          type: 'fill',
          source: 'filter-boundaries',
          paint: {
            'fill-color': '#6366f1',
            'fill-opacity': 0.08,
          },
        }, firstLabelLayer);

        map.current.addLayer({
          id: 'filter-boundary-outline',
          type: 'line',
          source: 'filter-boundaries',
          paint: {
            'line-color': '#6366f1',
            'line-width': 2,
            'line-dasharray': [3, 2],
          },
        }, firstLabelLayer);
      }

      if (hoverBoundary && hoverBoundary.geometry) {
        map.current.addSource('boundary-preview', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: hoverBoundary.geometry,
          },
        });

        // Dashed border preview - add below labels
        map.current.addLayer({
          id: 'boundary-preview-fill',
          type: 'fill',
          source: 'boundary-preview',
          paint: {
            'fill-color': 'rgba(150,150,150,0.25)',
            'fill-opacity': 1,
          },
        }, firstLabelLayer);

        map.current.addLayer({
          id: 'boundary-preview-outline',
          type: 'line',
          source: 'boundary-preview',
          paint: {
            'line-color': 'rgba(100,100,100,0.9)',
            'line-width': 2,
            'line-dasharray': [4, 2],
          },
        }, firstLabelLayer);
      }
    };

    const mapInstance = map.current;
    let didRender = false;
    
    if (mapInstance.isStyleLoaded()) {
      renderBoundaries();
      didRender = true;
    } else {
      mapInstance.once('load', () => {
        renderBoundaries();
        didRender = true;
      });
    }
    
    const handleIdle = () => {
      if (!didRender && mapInstance.isStyleLoaded()) {
        renderBoundaries();
      }
    };
    mapInstance.once('idle', handleIdle);

    return () => {
      if (mapInstance) {
        mapInstance.off('load', renderBoundaries);
        mapInstance.off('idle', handleIdle);
      }
    };
  }, [boundaries, hoverBoundary, visibleBoundaryIds, drawingPrimaryArea, filterBoundaries]);

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
          'fill-opacity': mapOverlayModeRef.current === 'boundaries' ? 0.4 : mapOverlayModeRef.current === 'saturation' ? 0.01 : 0,
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

  // Collaboration lines layer - connects churches with active collaborations
  useEffect(() => {
    if (!map.current) return;

    const renderCollaborationLines = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;

      // Remove existing collaboration layers
      const layersToRemove = [
        'collaboration-lines',
        'collaboration-lines-glow',
        'collaboration-lines-pending',
        'collaboration-lines-overlap',
        'collaboration-overlap-points'
      ];
      for (const layerId of layersToRemove) {
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      }
      if (map.current.getSource('collaboration-lines')) {
        map.current.removeSource('collaboration-lines');
      }

      // Don't render if no lines
      if (!collaborationLines || collaborationLines.length === 0) return;

      // Build GeoJSON FeatureCollection with LineString features
      const lineFeatures: any[] = [];
      const overlapFeatures: any[] = [];

      for (const line of collaborationLines) {
        // Create line from source to partner
        lineFeatures.push({
          type: 'Feature',
          properties: {
            id: line.id,
            partnerId: line.partnerId,
            partnerName: line.partnerName,
            status: line.status,
            hasOverlap: line.hasOverlap,
            lineType: 'partner' // Main collaboration line
          },
          geometry: {
            type: 'LineString',
            coordinates: [line.sourceCoords, line.targetCoords]
          }
        });

        // If there's overlap, add a line to the centroid and a point marker
        if (line.hasOverlap && line.overlapCentroid) {
          // Add line from source to overlap centroid
          lineFeatures.push({
            type: 'Feature',
            properties: {
              id: `${line.id}-overlap`,
              partnerId: line.partnerId,
              partnerName: line.partnerName,
              status: line.status,
              hasOverlap: true,
              lineType: 'overlap' // Line to shared ministry area
            },
            geometry: {
              type: 'LineString',
              coordinates: [line.sourceCoords, line.overlapCentroid]
            }
          });

          // Add point marker at the centroid
          overlapFeatures.push({
            type: 'Feature',
            properties: {
              id: line.id,
              partnerName: line.partnerName,
              featureType: 'overlap-point'
            },
            geometry: {
              type: 'Point',
              coordinates: line.overlapCentroid
            }
          });
        }
      }

      const geojson = {
        type: 'FeatureCollection',
        features: [...lineFeatures, ...overlapFeatures]
      };

      // Add source
      map.current.addSource('collaboration-lines', {
        type: 'geojson',
        data: geojson as any
      });

      // Find layer to insert below (above markers but below labels)
      const findInsertBefore = () => {
        const layers = map.current?.getStyle()?.layers || [];
        for (const layer of layers) {
          if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
            return layer.id;
          }
        }
        return undefined;
      };
      const beforeId = findInsertBefore();

      // Add glow effect for active collaboration lines (rendered first, below main lines)
      map.current.addLayer({
        id: 'collaboration-lines-glow',
        type: 'line',
        source: 'collaboration-lines',
        filter: ['all', 
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'status'], 'active']
        ],
        paint: {
          'line-color': '#10B981',
          'line-width': 10,
          'line-opacity': 0.25,
          'line-blur': 4
        }
      }, beforeId);

      // Add main line layer for partner connections
      map.current.addLayer({
        id: 'collaboration-lines',
        type: 'line',
        source: 'collaboration-lines',
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'lineType'], 'partner']
        ],
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'status'], 'active'], '#10B981', // Green for active
            ['==', ['get', 'status'], 'pending'], '#F59E0B', // Amber for pending
            '#6B7280' // Gray for paused
          ],
          'line-width': [
            'case',
            ['==', ['get', 'status'], 'active'], 4,
            3
          ],
          'line-opacity': 0.85
        }
      }, beforeId);

      // Add dashed overlay for pending collaborations
      map.current.addLayer({
        id: 'collaboration-lines-pending',
        type: 'line',
        source: 'collaboration-lines',
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'lineType'], 'partner'],
          ['==', ['get', 'status'], 'pending']
        ],
        paint: {
          'line-color': '#F59E0B',
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [4, 3]
        }
      }, beforeId);

      // Add overlap line layer (lines to shared ministry area centroids)
      map.current.addLayer({
        id: 'collaboration-lines-overlap',
        type: 'line',
        source: 'collaboration-lines',
        filter: ['all',
          ['==', ['geometry-type'], 'LineString'],
          ['==', ['get', 'lineType'], 'overlap']
        ],
        paint: {
          'line-color': '#8B5CF6', // Purple for overlap lines
          'line-width': 3,
          'line-opacity': 0.7,
          'line-dasharray': [2, 2]
        }
      }, beforeId);

      // Add overlap centroid markers (circles at shared ministry area centers)
      map.current.addLayer({
        id: 'collaboration-overlap-points',
        type: 'circle',
        source: 'collaboration-lines',
        filter: ['all',
          ['==', ['geometry-type'], 'Point'],
          ['==', ['get', 'featureType'], 'overlap-point']
        ],
        paint: {
          'circle-radius': 10,
          'circle-color': '#8B5CF6', // Purple to match overlap lines
          'circle-opacity': 0.9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff'
        }
      }, beforeId);
    };

    const mapInstance = map.current;
    
    if (mapInstance.isStyleLoaded()) {
      renderCollaborationLines();
    } else {
      mapInstance.once('idle', renderCollaborationLines);
    }

    return () => {
      if (map.current) {
        try {
          // Remove all collaboration layers
          const layersToRemove = [
            'collaboration-lines',
            'collaboration-lines-glow',
            'collaboration-lines-pending',
            'collaboration-lines-overlap',
            'collaboration-overlap-points'
          ];
          for (const layerId of layersToRemove) {
            if (map.current.getLayer(layerId)) {
              map.current.removeLayer(layerId);
            }
          }
          if (map.current.getSource('collaboration-lines')) {
            map.current.removeSource('collaboration-lines');
          }
        } catch (e) {
          // Layers may already be removed
        }
      }
    };
  }, [collaborationLines]);

  // Health data choropleth overlay - refs for stable layer management
  // Cache includes platformId so switching metrics OR platforms triggers refetch
  const lastHealthFetchRef = useRef<{ 
    bbox: string; 
    metric: string;
    platformId?: string | null;
  } | null>(null);
  const healthFetchAbortRef = useRef<AbortController | null>(null);
  const healthTractCacheRef = useRef<Map<string, any>>(new Map()); // Cache tracts by metric+geoid

  // Shared helper to enforce layer ordering: health overlay < boundaries < primary area < labels
  // This ensures the yellow primary ministry area is always visible on top of health choropleth
  const enforceOverlayOrder = useCallback(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    
    try {
      const hasPrimaryArea = !!map.current.getLayer('primary-area-fill');
      const hasHealthOverlay = !!map.current.getLayer('health-choropleth-fill');
      const hasBoundaries = !!map.current.getLayer('boundaries-fill');
      
      if (hasPrimaryArea && hasHealthOverlay) {
        // Move health overlay BELOW primary area
        map.current.moveLayer('health-choropleth-fill', 'primary-area-fill');
        if (map.current.getLayer('health-choropleth-outline')) {
          map.current.moveLayer('health-choropleth-outline', 'primary-area-fill');
        }
      }
      
      if (hasPrimaryArea && hasBoundaries) {
        // Move boundaries BELOW primary area
        map.current.moveLayer('boundaries-fill', 'primary-area-fill');
        if (map.current.getLayer('boundaries-outline')) {
          map.current.moveLayer('boundaries-outline', 'primary-area-fill');
        }
      }
    } catch (e) {
      // Layer ordering may fail if layers are being modified, that's ok
    }
  }, []);

  // Combined health overlay initialization and update
  useEffect(() => {
    if (!map.current) return;

    // Helper to find the first label layer to insert health overlay below labels
    const findFirstLabelLayerId = () => {
      if (!map.current) return undefined;
      const layers = map.current.getStyle()?.layers || [];
      for (const layer of layers) {
        if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
          return layer.id;
        }
      }
      return undefined;
    };

    // Helper to ensure layers exist
    const ensureHealthLayers = () => {
      if (!map.current) return false;
      
      // Check if source already exists
      if (map.current.getSource('health-choropleth')) return true;

      try {
        // Find first label layer to insert overlay below it
        const firstLabelLayer = findFirstLabelLayerId();
        
        // If primary area exists, insert health layers BELOW it; otherwise below labels
        // This ensures primary area is always on top of health overlay
        const beforeId = map.current.getLayer('primary-area-fill') ? 'primary-area-fill' : firstLabelLayer;

        // Create empty source
        map.current.addSource('health-choropleth', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // Add fill layer - insert below primary area or labels
        map.current.addLayer({
          id: 'health-choropleth-fill',
          type: 'fill',
          source: 'health-choropleth',
          paint: {
            'fill-color': ['coalesce', ['get', 'fillColor'], '#9CA3AF'],
            'fill-opacity': 0.55,
          },
          layout: { visibility: 'none' },
        }, beforeId);

        // Add outline layer - also below primary area or labels
        map.current.addLayer({
          id: 'health-choropleth-outline',
          type: 'line',
          source: 'health-choropleth',
          paint: {
            'line-color': 'rgba(100,100,100,0.5)',
            'line-width': 0.5,
          },
          layout: { visibility: 'none' },
        }, beforeId);

        console.log('Health choropleth layers initialized below:', beforeId);
        
        // Enforce order after creation
        enforceOverlayOrder();
        return true;
      } catch (err) {
        console.error('Error initializing health layers:', err);
        return false;
      }
    };

    const updateHealthData = async () => {
      if (!map.current) return;
      
      // Ensure layers are created
      if (!ensureHealthLayers()) {
        console.log('Waiting for map to be ready for health layers');
        return;
      }

      // Toggle visibility
      const visibility = healthMetricKey && healthOverlayVisible ? 'visible' : 'none';
      console.log('Setting health overlay visibility:', visibility, 'metric:', healthMetricKey);
      
      if (map.current.getLayer('health-choropleth-fill')) {
        map.current.setLayoutProperty('health-choropleth-fill', 'visibility', visibility);
      }
      if (map.current.getLayer('health-choropleth-outline')) {
        map.current.setLayoutProperty('health-choropleth-outline', 'visibility', visibility);
      }

      if (!healthMetricKey || !healthOverlayVisible) return;

      // Get current platform ID
      const currentPlatformId = platformIdRef.current;
      
      // Check cache - for platform views, we cache the entire platform's data
      // For national view, we don't cache since user may pan anywhere
      const cached = lastHealthFetchRef.current;
      if (cached?.metric === healthMetricKey && cached?.platformId === currentPlatformId) {
        // Already have data for this metric and platform - no fetch needed
        console.log('Using cached health data for metric:', healthMetricKey, 'platform:', currentPlatformId || 'national');
        return;
      }

      // Get viewport bounds as a starting point (API will expand to platform bounds if needed)
      const bounds = map.current.getBounds();
      if (!bounds) return;
      
      // Use a very large bbox when we have a platform - API will constrain to platform boundaries
      // This ensures we get ALL platform data regardless of current zoom/pan
      let bbox: string;
      if (currentPlatformId) {
        // For platform views: use huge bbox, let API constrain to platform boundaries
        // This loads ALL platform data at once for smooth zoom/pan
        bbox = '-180,-90,180,90';
      } else {
        // For national view: use current viewport with modest expansion
        const west = bounds.getWest();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const north = bounds.getNorth();
        const viewportWidth = east - west;
        const viewportHeight = north - south;
        bbox = `${(west - viewportWidth * 0.25).toFixed(4)},${(south - viewportHeight * 0.25).toFixed(4)},${(east + viewportWidth * 0.25).toFixed(4)},${(north + viewportHeight * 0.25).toFixed(4)}`;
      }

      // Abort previous request
      if (healthFetchAbortRef.current) {
        healthFetchAbortRef.current.abort();
      }
      healthFetchAbortRef.current = new AbortController();

      // Build query with optional platform_id to load entire platform's data
      const queryParams = new URLSearchParams({
        bbox,
        metric_key: healthMetricKey,
      });
      if (currentPlatformId) {
        queryParams.set('platform_id', currentPlatformId);
      }
      
      console.log('Fetching health tract data:', currentPlatformId ? `entire platform ${currentPlatformId}` : `viewport ${bbox}`);

      // Signal loading started
      onHealthDataLoadingChangeRef.current?.(true, healthMetricKey);

      try {
        const response = await fetch(
          `/api/health-data/tracts?${queryParams.toString()}`,
          { signal: healthFetchAbortRef.current.signal }
        );
        if (!response.ok) return;

        const tractData = await response.json();
        console.log('Got tract data with', tractData.features?.length, 'features');
        if (!tractData.features?.length) return;

        // Update cache - for platform views, this caches the entire platform's data
        lastHealthFetchRef.current = { 
          bbox, 
          metric: healthMetricKey,
          platformId: currentPlatformId
        };

        // Fixed thresholds matching prompts-for-area (calibrated to national averages)
        // Uses shared getChoroplethThresholds() for consistent classification with prayer prompts
        const thresholdConfig = getChoroplethThresholds(healthMetricKey);
        const isNegative = thresholdConfig?.direction === 'negative' || isNegativeMetric(healthMetricKey);
        
        // Color scales: [green, yellow-green, yellow, orange, red] for negative
        //               [red, orange, yellow, yellow-green, green] for positive
        const colorScale = isNegative
          ? HEALTH_METRIC_COLOR_SCALES.negative
          : HEALTH_METRIC_COLOR_SCALES.positive;

        // Get color based on fixed thresholds (matches prompts-for-area exactly)
        // Note: Crime data is now normalized at the API level (health-data/tracts route)
        const getColorForValue = (value: number): string => {
          // Use metric-specific thresholds if available
          if (thresholdConfig) {
            const [moderate, concerning, critical, veryCritical] = thresholdConfig.breakpoints;
            
            if (thresholdConfig.direction === 'negative') {
              // Negative: higher is worse (diseases, crime, poverty, etc.)
              if (value < moderate) return colorScale[0]; // green (low)
              if (value < concerning) return colorScale[1]; // yellow-green (moderate)
              if (value < critical) return colorScale[2]; // yellow (concerning)
              if (value < veryCritical) return colorScale[3]; // orange (critical)
              return colorScale[4]; // red (very critical)
            } else {
              // Positive: lower is worse (screenings, education, etc.)
              if (value > moderate) return colorScale[4]; // green (good)
              if (value > concerning) return colorScale[3]; // yellow-green (moderate)
              if (value > critical) return colorScale[2]; // yellow (concerning)
              if (value > veryCritical) return colorScale[1]; // orange (critical)
              return colorScale[0]; // red (very critical)
            }
          }
          
          // Fallback to generic thresholds for unconfigured metrics
          if (isNegative) {
            // Negative metrics: higher is worse
            if (value < 10) return colorScale[0]; // green (low)
            if (value < 20) return colorScale[1]; // yellow-green (moderate)
            if (value < 30) return colorScale[2]; // yellow (concerning)
            if (value < 40) return colorScale[3]; // orange (high)
            return colorScale[4]; // red (critical)
          } else {
            // Positive metrics: higher is better
            if (value >= 90) return colorScale[4]; // green
            if (value >= 80) return colorScale[3]; // yellow-green  
            if (value >= 60) return colorScale[2]; // yellow
            if (value >= 40) return colorScale[1]; // orange
            return colorScale[0]; // red (critical)
          }
        };

        const featuresWithColor = tractData.features.map((feature: any) => {
          const value = feature.properties?.estimate;
          // Solid grey for missing data - clearly distinguishable from colored data
          let color = '#9CA3AF';
          
          // Only color if we have valid numeric data (not null, undefined, or sentinel values)
          if (value !== null && value !== undefined && !isNaN(value) && value !== -999) {
            color = getColorForValue(value);
          }
          
          return {
            ...feature,
            properties: { ...feature.properties, fillColor: color },
          };
        });

        // Update source data without removing layers
        const source = map.current.getSource('health-choropleth') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({ type: 'FeatureCollection', features: featuresWithColor });
        }
        
        // Signal loading complete
        onHealthDataLoadingChangeRef.current?.(false, healthMetricKey);
      } catch (error: any) {
        // Signal loading complete (even on error)
        onHealthDataLoadingChangeRef.current?.(false, healthMetricKey);
        if (error.name !== 'AbortError') {
          console.error('Error fetching health data:', error);
        }
      }
    };

    // Debounced update on map move - 1200ms to reduce API calls during panning
    let moveTimeout: NodeJS.Timeout;
    const handleMoveEnd = () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(updateHealthData, 1200);
    };

    // Run update when map is ready
    const runWhenReady = () => {
      if (map.current?.isStyleLoaded()) {
        updateHealthData();
      }
    };

    // Initial update - wait for map to be ready
    if (map.current.isStyleLoaded()) {
      updateHealthData();
    } else {
      map.current.once('load', runWhenReady);
    }

    // Listen for map moves
    map.current.on('moveend', handleMoveEnd);

    return () => {
      clearTimeout(moveTimeout);
      if (healthFetchAbortRef.current) {
        healthFetchAbortRef.current.abort();
      }
      if (map.current) {
        map.current.off('load', runWhenReady);
        map.current.off('moveend', handleMoveEnd);
      }
    };
  }, [healthMetricKey, healthOverlayVisible]);

  // Clear cache when metric or platform changes
  useEffect(() => {
    lastHealthFetchRef.current = null;
  }, [healthMetricKey, platform?.id]);

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

  // Prayer coverage overlay layer — stabilized to prevent flicker during zoom
  const prayerFetchAbortRef = useRef<AbortController | null>(null);
  const lastPrayerFetchRef = useRef<{ geoids: string } | null>(null);
  const cachedTractGeometriesRef = useRef<Map<string, any>>(new Map());
  const onTractClickRef = useRef(onTractClick);
  onTractClickRef.current = onTractClick;
  const onTractLongPressRef = useRef(onTractLongPress);
  onTractLongPressRef.current = onTractLongPress;
  // Ember particle system
  interface EmberParticle {
    lng: number;
    lat: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
    alpha: number;
  }
  const emberCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const emberParticlesRef = useRef<EmberParticle[]>([]);
  const emberAnimFrameRef = useRef<number | null>(null);
  const emberTractBoundsRef = useRef<Array<{ minLng: number; maxLng: number; minLat: number; maxLat: number; ratio: number; polygon: number[][] }>>([]);

  const computeCoverageFeatures = useCallback((
    tracts: Array<{ tract_geoid: string; total_allocation_pct: number; effective_allocation_pct?: number; church_count: number; population: number; coverage_pct?: number; effective_coverage_pct?: number }>,
    geometryCache: Map<string, any>,
    mode: string,
  ) => {
    const coverageMap = new Map(tracts.map(t => [t.tract_geoid, t]));
    const features: any[] = [];

    const entries = Array.from(geometryCache.entries());
    for (let i = 0; i < entries.length; i++) {
      const [geoid, geometry] = entries[i];
      const coverage = coverageMap.get(geoid);
      if (!coverage) continue;
      const pct = coverage.total_allocation_pct ?? 0;
      const effectivePct = coverage.effective_coverage_pct ?? coverage.coverage_pct ?? 0;
      const coverageRatio = Math.min(effectivePct / 100, 1.5);
      const density_bucket = coverageRatio < 0.25 ? 1 : coverageRatio < 0.5 ? 2 : coverageRatio < 0.85 ? 3 : 4;
      features.push({
        ...geometry,
        properties: {
          ...geometry.properties,
          coverage_ratio: coverageRatio,
          allocation_pct: pct,
          coverage_pct: coverage.coverage_pct ?? 0,
          effective_coverage_pct: effectivePct,
          church_count: coverage.church_count ?? 0,
          density_bucket,
        },
      });
    }
    return features;
  }, []);

  useEffect(() => {
    if (!map.current) return;

    const ensurePrayerLayers = () => {
      if (!map.current) return false;
      if (map.current.getSource('prayer-coverage') && map.current.getLayer('prayer-coverage-fill')) return true;

      try {
        const layers = map.current.getStyle()?.layers || [];
        let beforeId: string | undefined;
        for (const layer of layers) {
          if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
            beforeId = layer.id;
            break;
          }
        }

        if (!map.current.getSource('prayer-coverage')) {
          map.current.addSource('prayer-coverage', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        map.current.addLayer({
          id: 'prayer-coverage-fill',
          type: 'fill',
          source: 'prayer-coverage',
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'coverage_ratio'], 0],
              0, '#FEF9C3',
              0.2, '#FDE68A',
              0.5, '#FBBF24',
              0.8, '#F59E0B',
              1.0, '#D97706',
              1.5, '#B45309',
            ],
            'fill-opacity': [
              'case',
              ['==', ['coalesce', ['get', 'church_count'], 0], 0],
              0.08,
              ['interpolate', ['linear'], ['coalesce', ['get', 'coverage_ratio'], 0],
                0, 0.25,
                0.15, 0.35,
                0.3, 0.45,
                0.6, 0.55,
                1.0, 0.65,
              ],
            ],
          },
          layout: { visibility: 'none' },
        }, beforeId);

        map.current.addLayer({
          id: 'prayer-coverage-outline',
          type: 'line',
          source: 'prayer-coverage',
          paint: {
            'line-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'coverage_ratio'], 0],
              0, '#FDE68A',
              0.5, '#FBBF24',
              1.0, '#D97706',
              1.5, '#92400E',
            ],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.5,
              12, 1,
              15, 1.5,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['coalesce', ['get', 'coverage_ratio'], 0],
              0, 0.4,
              0.3, 0.6,
              0.6, 0.75,
              1.0, 0.9,
            ],
          },
          layout: { visibility: 'none' },
        }, beforeId);

        return true;
      } catch (err) {
        console.error('Error initializing prayer coverage layers:', err);
        return false;
      }
    };

    const updatePrayerCoverage = async () => {
      if (!map.current) return;
      if (!ensurePrayerLayers()) return;

      const showLayers = () => {
        ['prayer-coverage-fill', 'prayer-coverage-outline'].forEach(layerId => {
          if (map.current?.getLayer(layerId)) {
            map.current.setLayoutProperty(layerId, 'visibility', 'visible');
          }
        });
      };
      const hideLayers = () => {
        ['prayer-coverage-fill', 'prayer-coverage-outline'].forEach(layerId => {
          if (map.current?.getLayer(layerId)) {
            map.current.setLayoutProperty(layerId, 'visibility', 'none');
          }
        });
      };

      if (!prayerCoverageVisible) {
        hideLayers();
        lastPrayerFetchRef.current = null;
        return;
      }

      if (!prayerCoverageData?.tracts?.length) {
        if (!prayerCoverageData || prayerCoverageData.tracts.length === 0) {
          const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
          if (source) source.setData({ type: 'FeatureCollection', features: [] });
          hideLayers();
          lastPrayerFetchRef.current = null;
          cachedTractGeometriesRef.current.clear();
        }
        return;
      }

      const geoids = prayerCoverageData.tracts.map(t => t.tract_geoid);
      const geoidKey = [...geoids].sort().join(',');

      const missingGeoids = geoids.filter(g => !cachedTractGeometriesRef.current.has(g));

      if (missingGeoids.length === 0) {
        const features = computeCoverageFeatures(
          prayerCoverageData.tracts, cachedTractGeometriesRef.current, prayerCoverageMode
        );
        const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features });
        showLayers();
        lastPrayerFetchRef.current = { geoids: geoidKey };
        return;
      }

      if (cachedTractGeometriesRef.current.size > 0) {
        const features = computeCoverageFeatures(
          prayerCoverageData.tracts, cachedTractGeometriesRef.current, prayerCoverageMode
        );
        const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
        if (source && features.length > 0) {
          source.setData({ type: 'FeatureCollection', features });
          showLayers();
        }
      }

      if (prayerFetchAbortRef.current) prayerFetchAbortRef.current.abort();
      prayerFetchAbortRef.current = new AbortController();

      try {
        const response = await fetch(
          `/api/tracts/geometries?geoids=${missingGeoids.join(',')}`,
          { signal: prayerFetchAbortRef.current.signal }
        );
        if (!response.ok) return;

        const geojson = await response.json();

        for (const feature of geojson.features) {
          const geoid = feature.properties?.geoid;
          if (geoid) cachedTractGeometriesRef.current.set(geoid, feature);
        }

        lastPrayerFetchRef.current = { geoids: geoidKey };

        if (!map.current) return;
        const features = computeCoverageFeatures(
          prayerCoverageData.tracts, cachedTractGeometriesRef.current, prayerCoverageMode
        );
        const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({ type: 'FeatureCollection', features });
          showLayers();
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching prayer coverage geometries:', error);
        }
      }
    };

    if (map.current.isStyleLoaded()) {
      updatePrayerCoverage();
    } else {
      map.current.once('load', updatePrayerCoverage);
    }

    const mapRef3 = map.current;
    const handlePrayerStyleReset = () => {
      updatePrayerCoverage();
    };
    mapRef3.on('style.load', handlePrayerStyleReset);

    return () => {
      if (prayerFetchAbortRef.current) prayerFetchAbortRef.current.abort();
      mapRef3.off('style.load', handlePrayerStyleReset);
    };
  }, [prayerCoverageVisible, prayerCoverageData, prayerCoverageMode, computeCoverageFeatures]);

  useEffect(() => {
    if (!map.current) return;

    const findFirstLabelLayerIdSat = () => {
      if (!map.current) return undefined;
      const layers = map.current.getStyle()?.layers || [];
      for (const layer of layers) {
        if (layer.type === 'symbol' && (layer.id.includes('label') || layer.id.includes('place'))) {
          return layer.id;
        }
      }
      return undefined;
    };

    const ensureSatLayers = () => {
      if (!map.current) return false;
      if (map.current.getSource('ministry-saturation')) return true;
      
      try {
        const beforeId = findFirstLabelLayerIdSat();
        
        map.current.addSource('ministry-saturation', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        
        map.current.addLayer({
          id: 'ministry-saturation-fill',
          type: 'fill',
          source: 'ministry-saturation',
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['sqrt', ['max', ['coalesce', ['get', 'saturation'], 0], 0]],
              0, '#E0F2FE',
              0.15, '#BAE6FD',
              0.3, '#7DD3FC',
              0.5, '#38BDF8',
              0.7, '#0EA5E9',
              0.85, '#0284C7',
              1.0, '#0369A1',
              1.22, '#075985',
            ],
            'fill-opacity': [
              'case',
              ['==', ['coalesce', ['get', 'church_count'], 0], 0],
              0.08,
              ['interpolate', ['linear'], ['sqrt', ['max', ['coalesce', ['get', 'saturation'], 0], 0]],
                0, 0.2,
                0.15, 0.3,
                0.3, 0.4,
                0.5, 0.5,
                0.7, 0.6,
                1.0, 0.7,
              ],
            ],
          },
          layout: { visibility: 'none' },
        }, beforeId);
        
        map.current.addLayer({
          id: 'ministry-saturation-outline',
          type: 'line',
          source: 'ministry-saturation',
          paint: {
            'line-color': [
              'interpolate', ['linear'], ['coalesce', ['get', 'saturation'], 0],
              0, '#BAE6FD',
              0.5, '#38BDF8',
              1.0, '#0284C7',
              1.5, '#075985',
            ],
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8, 0.5,
              12, 1,
              15, 1.5,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['coalesce', ['get', 'saturation'], 0],
              0, 0.4,
              0.3, 0.6,
              0.6, 0.75,
              1.0, 0.9,
            ],
          },
          layout: { visibility: 'none' },
        }, beforeId);
        
        return true;
      } catch (err) {
        console.error('Error initializing ministry saturation layers:', err);
        return false;
      }
    };

    const doUpdate = () => {
      if (!map.current) return;
      if (!ensureSatLayers()) return;
    
      const visibility = mapOverlayMode === 'saturation' ? 'visible' : 'none';
      ['ministry-saturation-fill', 'ministry-saturation-outline'].forEach(layerId => {
        if (map.current!.getLayer(layerId)) {
          map.current!.setLayoutProperty(layerId, 'visibility', visibility);
        }
      });

      applyAreaHighlight(map.current);
      if (map.current.getLayer('primary-area-fill')) {
        map.current.setPaintProperty('primary-area-fill', 'fill-opacity', mapOverlayMode === 'boundaries' ? 0.4 : mapOverlayMode === 'saturation' ? 0.01 : 0);
      }
      
      if (mapOverlayMode !== 'saturation') return;
      
      const geojson = clippedSaturationGeoJSON || { type: 'FeatureCollection' as const, features: [] };
      const source = map.current.getSource('ministry-saturation') as mapboxgl.GeoJSONSource;
      if (source) source.setData(geojson as any);
    };

    if (map.current.isStyleLoaded()) {
      doUpdate();
    } else {
      const mapRef = map.current;
      const handleReady = () => {
        mapRef.off('idle', handleReady);
        mapRef.off('style.load', handleReady);
        doUpdate();
      };
      mapRef.once('idle', handleReady);
      mapRef.once('style.load', handleReady);
    }

    const mapRef2 = map.current;
    const handleStyleReset = () => {
      doUpdate();
    };
    mapRef2.on('style.load', handleStyleReset);

    return () => {
      mapRef2.off('style.load', handleStyleReset);
    };
  }, [mapOverlayMode, clippedSaturationGeoJSON]);

  useEffect(() => {
    if (!map.current) return;
    applyAreaHighlight(map.current);
  }, [hoveredAreaId, highlightedAreaId, mapOverlayMode, applyAreaHighlight]);

  // Ember particle overlay system
  useEffect(() => {
    if (!prayerCoverageVisible || !map.current || !mapContainer.current) {
      // Clean up
      if (emberAnimFrameRef.current) {
        cancelAnimationFrame(emberAnimFrameRef.current);
        emberAnimFrameRef.current = null;
      }
      emberParticlesRef.current = [];
      if (emberCanvasRef.current) {
        emberCanvasRef.current.style.display = 'none';
      }
      return;
    }

    // Create or show the canvas
    let canvas = emberCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '5';
      mapContainer.current.parentElement?.appendChild(canvas);
      emberCanvasRef.current = canvas;
    }
    canvas.style.display = 'block';

    const EMBER_COLORS = ['#FFD700', '#FFA500', '#FFBF00', '#FFE4B5'];
    const MAX_PARTICLES = 120;
    let spawnAccum = 0;
    const SPAWN_PER_SEC = 25;

    // Point-in-polygon test (ray casting)
    const pointInPolygon = (px: number, py: number, poly: number[][]) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    };

    // Extract tract polygons from the prayer-coverage source
    const updateTractBounds = () => {
      if (!map.current) return;
      const source = map.current.getSource('prayer-coverage') as mapboxgl.GeoJSONSource;
      if (!source) return;
      const data = (source as any)._data;
      if (!data || !data.features) return;

      const bounds: typeof emberTractBoundsRef.current = [];
      for (const feature of data.features) {
        if (!feature.geometry) continue;
        const ratio = feature.properties?.coverage_ratio ?? 0.5;
        let rings: number[][][] = [];
        if (feature.geometry.type === 'Polygon') {
          rings = [feature.geometry.coordinates[0]];
        } else if (feature.geometry.type === 'MultiPolygon') {
          rings = feature.geometry.coordinates.map((p: number[][][]) => p[0]);
        }
        for (const ring of rings) {
          let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
          for (const [lng, lat] of ring) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
          if (isFinite(minLng)) {
            bounds.push({ minLng, maxLng, minLat, maxLat, ratio, polygon: ring });
          }
        }
      }
      emberTractBoundsRef.current = bounds;
    };

    updateTractBounds();

    const spawnParticle = (): EmberParticle | null => {
      const tracts = emberTractBoundsRef.current;
      if (tracts.length === 0) return null;
      const totalWeight = tracts.reduce((sum, t) => sum + (t.ratio || 0.01), 0);
      let r = Math.random() * totalWeight;
      let tract = tracts[0];
      for (const t of tracts) {
        r -= (t.ratio || 0.01);
        if (r <= 0) { tract = t; break; }
      }
      // Rejection-sample to land inside the actual polygon
      for (let attempt = 0; attempt < 10; attempt++) {
        const lng = tract.minLng + Math.random() * (tract.maxLng - tract.minLng);
        const lat = tract.minLat + Math.random() * (tract.maxLat - tract.minLat);
        if (pointInPolygon(lng, lat, tract.polygon)) {
          const maxLife = 180 + Math.random() * 240; // 3-7 seconds at 60fps (slower)
          return {
            lng,
            lat,
            vx: (Math.random() - 0.5) * 0.000015, // 75% slower drift
            vy: Math.random() * 0.000012 + 0.000004,
            life: 0,
            maxLife,
            size: 2.0 + Math.random() * 3.5,
            color: EMBER_COLORS[Math.floor(Math.random() * EMBER_COLORS.length)],
            alpha: 0.4 + Math.random() * 0.4,
          };
        }
      }
      return null;
    };

    let lastFrameTime = 0;
    const animate = (timestamp: number) => {
      if (!map.current || !canvas) return;
      const dt = lastFrameTime ? (timestamp - lastFrameTime) / 1000 : 0.016;
      lastFrameTime = timestamp;

      const mapCanvas = map.current.getCanvas();
      const w = mapCanvas.width;
      const h = mapCanvas.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = mapCanvas.style.width;
      canvas.style.height = mapCanvas.style.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      // Spawn new particles at controlled rate
      spawnAccum += SPAWN_PER_SEC * dt;
      while (spawnAccum >= 1 && emberParticlesRef.current.length < MAX_PARTICLES) {
        spawnAccum -= 1;
        const p = spawnParticle();
        if (p) emberParticlesRef.current.push(p);
      }
      if (spawnAccum > 3) spawnAccum = 3;

      // Update and draw particles
      const alive: EmberParticle[] = [];
      for (const p of emberParticlesRef.current) {
        p.life++;
        p.lng += p.vx;
        p.lat += p.vy;

        // Gentle wobble
        p.vx += (Math.random() - 0.5) * 0.000001;

        if (p.life >= p.maxLife) continue;

        // Kill particle if it drifted outside all tracts
        const tracts = emberTractBoundsRef.current;
        let insideAny = false;
        for (const t of tracts) {
          if (p.lng >= t.minLng && p.lng <= t.maxLng && p.lat >= t.minLat && p.lat <= t.maxLat) {
            if (pointInPolygon(p.lng, p.lat, t.polygon)) {
              insideAny = true;
              break;
            }
          }
        }
        if (!insideAny) continue; // remove particle

        // Project to screen
        const pt = map.current.project([p.lng, p.lat]);
        const sx = pt.x * dpr;
        const sy = pt.y * dpr;

        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) {
          alive.push(p);
          continue;
        }

        // Slow fade in/out
        const t = p.life / p.maxLife;
        let opacity: number;
        if (t < 0.2) {
          opacity = (t / 0.2) * p.alpha;
        } else if (t > 0.75) {
          opacity = ((1 - t) / 0.25) * p.alpha;
        } else {
          opacity = p.alpha;
        }

        // Very slow, graceful breathing pulse
        const pulse = 1 + 0.1 * Math.sin(p.life * 0.015);
        const radius = p.size * pulse * dpr;

        const hex = p.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const glowR = radius * 2;
        const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
        gradient.addColorStop(0, `rgba(255,255,255,1)`);
        gradient.addColorStop(0.15, `rgba(${r},${g},${b},1)`);
        gradient.addColorStop(0.4, `rgba(${r},${g},${b},0.8)`);
        gradient.addColorStop(0.7, `rgba(${r},${g},${b},0.15)`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
        ctx.fill();

        alive.push(p);
      }
      emberParticlesRef.current = alive;
      ctx.globalAlpha = 1;

      emberAnimFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    emberAnimFrameRef.current = requestAnimationFrame(animate);

    // Re-extract bounds when source data changes
    const onSourceData = (e: any) => {
      if (e.sourceId === 'prayer-coverage' && e.isSourceLoaded) {
        updateTractBounds();
      }
    };
    map.current.on('sourcedata', onSourceData);

    return () => {
      if (emberAnimFrameRef.current) {
        cancelAnimationFrame(emberAnimFrameRef.current);
        emberAnimFrameRef.current = null;
      }
      if (map.current) {
        map.current.off('sourcedata', onSourceData);
      }
    };
  }, [prayerCoverageVisible]);

  useEffect(() => {
    if (!map.current) return;
    const heatmapActive = !!(healthMetricKey && healthOverlayVisible);

    if (map.current.getLayer('health-choropleth-fill')) {
      const choroOpacity = (prayerCoverageVisible && heatmapActive) ? 0.25 : 0.55;
      map.current.setPaintProperty('health-choropleth-fill', 'fill-opacity', choroOpacity);
    }
  }, [healthMetricKey, healthOverlayVisible, prayerCoverageVisible]);

  const prayerHoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const saturationPopupRef = useRef<mapboxgl.Popup | null>(null);
  const tapPopupRef = useRef<mapboxgl.Popup | null>(null);

  // Ministry saturation hover: show public metrics on tract
  useEffect(() => {
    if (!map.current || !saturationTooltipVisible) {
      if (saturationPopupRef.current) {
        saturationPopupRef.current.remove();
        saturationPopupRef.current = null;
      }
      return;
    }
    const m = map.current;

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'saturation-hover-popup',
      anchor: 'bottom',
      offset: [0, -4],
    });
    saturationPopupRef.current = popup;

    const handleSaturationMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (mapOverlayModeRef.current !== 'saturation') return;
      if (!m.getLayer('ministry-saturation-fill')) return;
      const features = m.queryRenderedFeatures(e.point, { layers: ['ministry-saturation-fill'] });
      if (features.length > 0) {
        let html = `<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">`;
        html += buildSaturationTooltipHtml(features);

        const satPrayerLayers2: string[] = [];
        if (m.getLayer('prayer-coverage-fill')) satPrayerLayers2.push('prayer-coverage-fill');
        const satPrayerFeatures2 = satPrayerLayers2.length > 0 ? m.queryRenderedFeatures(e.point, { layers: satPrayerLayers2 }) : [];
        if (satPrayerFeatures2.length > 0) {
          html += '<div style="border-top:1px solid #e5e7eb;margin:6px 0"></div>';
          html += buildPrayerTooltipHtml(satPrayerFeatures2);
        }

        html += `</div>`;

        m.getCanvas().style.cursor = 'pointer';
        popup.setLngLat(e.lngLat).setHTML(html).addTo(m);
        return;
      }

      const satPrayerLayers: string[] = [];
      if (m.getLayer('prayer-coverage-fill')) satPrayerLayers.push('prayer-coverage-fill');
      const satPrayerFeatures = satPrayerLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: satPrayerLayers }) : [];
      if (satPrayerFeatures.length > 0) {
        let html = '<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">';
        html += buildPrayerTooltipHtml(satPrayerFeatures);
        html += '</div>';
        m.getCanvas().style.cursor = 'pointer';
        popup.setLngLat(e.lngLat).setHTML(html).addTo(m);
        return;
      }

      m.getCanvas().style.cursor = '';
      popup.remove();
    };

    const handleSaturationMouseLeave = () => {
      if (mapOverlayModeRef.current !== 'saturation') return;
      m.getCanvas().style.cursor = '';
      popup.remove();
    };

    const handleAreaMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (mapOverlayModeRef.current === 'saturation') return;

      const areaLayers: string[] = [];
      if (m.getLayer('areas-fill')) areaLayers.push('areas-fill');
      const prayerLayers: string[] = [];
      if (m.getLayer('prayer-coverage-fill')) prayerLayers.push('prayer-coverage-fill');

      const areaFeatures = areaLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: areaLayers }) : [];
      const prayerFeatures = prayerLayers.length > 0 ? m.queryRenderedFeatures(e.point, { layers: prayerLayers }) : [];

      if (areaFeatures.length === 0 && prayerFeatures.length === 0) {
        m.getCanvas().style.cursor = '';
        popup.remove();
        return;
      }

      let html = '<div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px">';

      if (areaFeatures.length > 0) {
        const churchMap = new Map<string, { church_name: string; area_name: string; population: number }>();
        areaFeatures.forEach(f => {
          const props = f.properties;
          const churchName = props?.church_name || 'Unknown Church';
          const areaName = props?.name || 'Ministry Area';
          const pop = props?.population ? Number(props.population) : 0;
          const key = churchName;
          if (!churchMap.has(key)) {
            churchMap.set(key, {
              church_name: churchName,
              area_name: areaName,
              population: pop,
            });
          } else {
            const existing = churchMap.get(key)!;
            if (pop > existing.population) existing.population = pop;
          }
        });

        const uniqueChurches = Array.from(churchMap.values());

        if (uniqueChurches.length > 1) {
          html += '<div style="font-weight:600;margin-bottom:4px;color:#059669">Collaboration Opportunity!</div>';
          html += `<div style="color:#555">${uniqueChurches.length} churches serving this area</div>`;
          uniqueChurches.forEach(c => {
            html += `<div style="color:#666;font-size:12px;padding-left:8px">&bull; ${c.church_name}</div>`;
            if (c.population > 0) {
              html += `<div style="color:#999;font-size:11px;padding-left:16px">${c.population.toLocaleString()} people</div>`;
            }
          });
        } else if (uniqueChurches.length === 1) {
          const c = uniqueChurches[0];
          html += `<div style="font-weight:600;margin-bottom:4px">${c.church_name}</div>`;
          html += `<div style="color:#666;font-size:12px">${c.area_name}</div>`;
          if (c.population > 0) {
            html += `<div style="color:#555;font-size:12px;margin-top:2px">${c.population.toLocaleString()} people</div>`;
          }
        }
      }

      if (prayerFeatures.length > 0) {
        if (areaFeatures.length > 0) html += '<div style="border-top:1px solid #e5e7eb;margin:6px 0"></div>';
        html += buildPrayerTooltipHtml(prayerFeatures);
      }

      html += '</div>';

      m.getCanvas().style.cursor = 'pointer';
      popup.setLngLat(e.lngLat).setHTML(html).addTo(m);
    };

    const handleGeneralMouseMove = (e: mapboxgl.MapMouseEvent) => {
      if (mapOverlayModeRef.current === 'saturation') {
        handleSaturationMouseMove(e);
      } else {
        handleAreaMouseMove(e);
      }
    };

    let lastMouseMoveTime = 0;
    const MOUSEMOVE_THROTTLE_MS = 50;

    const throttledMouseMove = (e: mapboxgl.MapMouseEvent) => {
      const now = Date.now();
      if (now - lastMouseMoveTime < MOUSEMOVE_THROTTLE_MS) return;
      lastMouseMoveTime = now;
      handleGeneralMouseMove(e);
    };

    m.on('mousemove', throttledMouseMove);
    if (m.getLayer('ministry-saturation-fill')) {
      m.on('mouseleave', 'ministry-saturation-fill', handleSaturationMouseLeave);
    }

    return () => {
      m.off('mousemove', throttledMouseMove);
      if (m.getLayer('ministry-saturation-fill')) {
        m.off('mouseleave', 'ministry-saturation-fill', handleSaturationMouseLeave);
      }
      popup.remove();
      saturationPopupRef.current = null;
    };
  }, [mapOverlayMode, saturationTooltipVisible]);


  // Allocation mode: long-press detection for tract selection
  useEffect(() => {
    if (!map.current || !allocationModeActive || !prayerCoverageVisible) return;

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let pressStartPoint: { x: number; y: number } | null = null;
    let tractInfo: { geoid: string; label: string; population: number; point: { x: number; y: number } } | null = null;
    let longPressTriggered = false;
    let pressId = 0;
    let isPressed = false;

    const resolveTractSync = (e: mapboxgl.MapMouseEvent) => {
      const m = map.current;
      if (!m || !m.getLayer('allocation-tracts-fill')) return null;
      const features = m.queryRenderedFeatures(e.point, { layers: ['allocation-tracts-fill'] });
      if (features.length > 0) {
        const props = features[0].properties;
        const geoid = props?.geoid;
        if (typeof geoid === 'string' && geoid) {
          const rawName = props?.name || '';
          const population = props?.population || 0;
          const stripped = rawName.replace(/^(Census\s+Tract|Tract)\s*/i, '').trim();
          const label = stripped ? `Area ${stripped}` : `Area ${geoid.slice(-4)}`;
          return { geoid, label, population, point: { x: e.point.x, y: e.point.y } };
        }
      }
      return null;
    };

    const resolveTractAsync = async (e: mapboxgl.MapMouseEvent) => {
      try {
        const res = await fetch(`/api/tracts/resolve?lng=${e.lngLat.lng}&lat=${e.lngLat.lat}`);
        if (!res.ok) return null;
        const tract = await res.json();
        return {
          geoid: tract.geoid,
          label: (tract.friendly_label ? `Area ${tract.friendly_label.replace(/^(Census\s+Tract|Tract)\s*/i, '').trim()}` : `Area ${tract.geoid.slice(-4)}`),
          population: tract.population || 0,
          point: { x: e.point.x, y: e.point.y }
        };
      } catch { return null; }
    };

    const handleMouseDown = (e: mapboxgl.MapMouseEvent) => {
      longPressTriggered = false;
      isPressed = true;
      pressId++;
      const currentPressId = pressId;
      pressStartPoint = { x: e.point.x, y: e.point.y };

      const syncResult = resolveTractSync(e);
      if (syncResult) {
        tractInfo = syncResult;
        longPressTimer = setTimeout(() => {
          longPressTriggered = true;
          if (tractInfo && onTractLongPressRef.current) {
            onTractLongPressRef.current(tractInfo.geoid, tractInfo.label, tractInfo.population, tractInfo.point);
          }
        }, 500);
      } else {
        resolveTractAsync(e).then(result => {
          if (currentPressId !== pressId || !isPressed) return;
          if (!result) return;
          tractInfo = result;
          longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            if (tractInfo && onTractLongPressRef.current) {
              onTractLongPressRef.current(tractInfo.geoid, tractInfo.label, tractInfo.population, tractInfo.point);
            }
          }, 500);
        });
      }
    };

    const handleMouseUp = (e: mapboxgl.MapMouseEvent) => {
      isPressed = false;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      const wasDrag = pressStartPoint && e.point &&
        Math.sqrt(
          (e.point.x - pressStartPoint.x) ** 2 +
          (e.point.y - pressStartPoint.y) ** 2
        ) > 5;
      if (!longPressTriggered && !wasDrag && tractInfo && onTractClickRef.current) {
        onTractClickRef.current(tractInfo.geoid, tractInfo.label, tractInfo.population, tractInfo.point);
      }
      tractInfo = null;
      pressStartPoint = null;
    };

    const handleMouseMovePress = (e: mapboxgl.MapMouseEvent) => {
      if (pressStartPoint && isPressed) {
        const dx = e.point.x - pressStartPoint.x;
        const dy = e.point.y - pressStartPoint.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          tractInfo = null;
          isPressed = false;
        }
      }
    };

    const canvas = map.current.getCanvas();

    let lastTouchPoint: mapboxgl.Point | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const point = new mapboxgl.Point(touch.clientX - rect.left, touch.clientY - rect.top);
      lastTouchPoint = point;
      const lngLat = map.current!.unproject(point);
      handleMouseDown({ point, lngLat } as mapboxgl.MapMouseEvent);
    };

    const handleTouchEnd = () => {
      const endPoint = lastTouchPoint || (pressStartPoint ? new mapboxgl.Point(pressStartPoint.x, pressStartPoint.y) : new mapboxgl.Point(0, 0));
      const lngLat = map.current!.unproject(endPoint);
      handleMouseUp({ point: endPoint, lngLat } as mapboxgl.MapMouseEvent);
      lastTouchPoint = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !pressStartPoint) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const point = new mapboxgl.Point(touch.clientX - rect.left, touch.clientY - rect.top);
      lastTouchPoint = point;
      const lngLat = map.current!.unproject(point);
      handleMouseMovePress({ point, lngLat } as mapboxgl.MapMouseEvent);
    };

    map.current.on('mousedown', handleMouseDown);
    map.current.on('mouseup', handleMouseUp);
    map.current.on('mousemove', handleMouseMovePress);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.style.cursor = 'crosshair';

    return () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      isPressed = false;
      pressId++;
      if (map.current) {
        map.current.off('mousedown', handleMouseDown);
        map.current.off('mouseup', handleMouseUp);
        map.current.off('mousemove', handleMouseMovePress);
        map.current.getCanvas().style.cursor = '';
      }
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [allocationModeActive, prayerCoverageVisible]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainer} className="w-full h-full" data-testid="map-container" />
      {mapOverlayMode === 'saturation' && (
        <div className="absolute bottom-16 right-3 z-10 bg-background/90 backdrop-blur-sm border rounded-md px-3 py-2 shadow-sm" data-testid="saturation-legend">
          <p className="text-xs font-medium mb-1.5">Ministry Saturation</p>
          <div
            className="h-2.5 w-36 rounded-sm"
            style={{ background: 'linear-gradient(to right, #E0F2FE, #BAE6FD, #7DD3FC, #38BDF8, #0EA5E9, #0284C7, #0369A1, #075985)' }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>No Coverage</span>
            <span>Full</span>
          </div>
        </div>
      )}
      <div className="absolute bottom-16 left-3 z-10 flex flex-col gap-1.5">
        {onPinModeChange && (
          <button
            onClick={() => {
              const next = pinMode === 'all' ? 'mapped' : pinMode === 'mapped' ? 'hidden' : 'all';
              onPinModeChange(next);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm border shadow-sm hover-elevate active-elevate-2 ${pinMode !== 'hidden' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/90'}`}
            data-testid="button-toggle-pins-map"
          >
            {pinMode === 'hidden' ? <MapPinOff className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
            {pinMode === 'all' ? 'All Pins' : pinMode === 'mapped' ? 'Mapped Only' : 'Pins Off'}
          </button>
        )}
        {onMapOverlayModeChange && (
          <button
            onClick={() => {
              const next = mapOverlayMode === 'saturation' ? 'boundaries' : mapOverlayMode === 'boundaries' ? 'off' : 'saturation';
              onMapOverlayModeChange(next);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm border shadow-sm hover-elevate active-elevate-2 ${mapOverlayMode !== 'off' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/90'}`}
            data-testid="button-toggle-saturation-map"
          >
            <Layers className="w-3.5 h-3.5" />
            {mapOverlayMode === 'saturation' ? 'Saturation' : mapOverlayMode === 'boundaries' ? 'Boundaries' : 'Overlays Off'}
          </button>
        )}
        {onPrayerCoverageVisibilityChange && (
          <button
            onClick={() => onPrayerCoverageVisibilityChange(!prayerCoverageVisible)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm border shadow-sm hover-elevate active-elevate-2 ${prayerCoverageVisible ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/90'}`}
            data-testid="button-toggle-prayer-coverage-map"
          >
            <HandHeart className="w-3.5 h-3.5" />
            {prayerCoverageVisible ? 'Prayer On' : 'Prayer'}
          </button>
        )}
        {onSaturationTooltipVisibilityChange && (
          <button
            onClick={() => onSaturationTooltipVisibilityChange(!saturationTooltipVisible)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm border shadow-sm hover-elevate active-elevate-2 ${saturationTooltipVisible ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/90'}`}
            data-testid="button-toggle-tooltips-map"
          >
            {saturationTooltipVisible ? <MessageSquareOff className="w-3.5 h-3.5" /> : <MessageSquareText className="w-3.5 h-3.5" />}
            {saturationTooltipVisible ? 'Hide Tooltips' : 'Tooltips'}
          </button>
        )}
      </div>
    </div>
  );
});
