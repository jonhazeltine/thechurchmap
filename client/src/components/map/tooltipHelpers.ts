import type mapboxgl from "mapbox-gl";
import { getSaturationLabel } from "./constants";

export function buildPrayerTooltipHtml(features: mapboxgl.MapboxGeoJSONFeature[]): string {
  if (features.length === 0) return '';
  const props = features[0].properties;
  const churchCount = props?.church_count ?? 0;
  const coveragePct = props?.effective_coverage_pct ?? props?.coverage_pct ?? 0;
  const population = props?.population ?? 0;
  let html = '<div style="font-weight:600;margin-bottom:4px">Prayer Coverage</div>';
  html += `<div style="opacity:0.7">${churchCount} ${churchCount === 1 ? 'church' : 'churches'} praying</div>`;
  if (population > 0) html += `<div style="opacity:0.7">Population: ${population.toLocaleString()}</div>`;
  html += `<div style="opacity:0.7">Coverage: ${Math.round(coveragePct)}%</div>`;
  return html;
}

export function buildSaturationTooltipHtml(features: mapboxgl.MapboxGeoJSONFeature[]): string {
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
    html += `<div style="opacity:0.5">0 churches serving this area</div>`;
    html += `<div style="opacity:0.7;margin-top:4px">Population: ${totalPopulation.toLocaleString()}</div>`;
    html += `<div style="margin-top:4px;font-weight:500;color:#dc2626">Coverage: No Coverage</div>`;
  } else {
    const satLabel = getSaturationLabel(maxRawSaturation);
    html += `<div style="opacity:0.7">${churchCount} ${churchCount === 1 ? 'church' : 'churches'} serving</div>`;
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
        html += `<div style="opacity:0.6;font-size:12px;padding-left:8px">&bull; ${name}${popStr}</div>`;
      });
    }
    html += `<div style="opacity:0.7;margin-top:4px">Density: ${densityFormatted} people/mi&sup2;</div>`;
    html += `<div style="margin-top:4px;font-weight:500;color:#3b82f6">Coverage: ${satLabel}</div>`;
    if (!anyHasCapacity) {
      html += `<div style="opacity:0.45;font-size:11px;margin-top:2px">Based on baseline capacity (no manual data yet)</div>`;
    }
  }

  return html;
}
