import { useEffect, useRef } from "react";
import type mapboxgl from "mapbox-gl";

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

interface EmberParticlesProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  mapContainer: React.MutableRefObject<HTMLDivElement | null>;
  active: boolean;
}

export function EmberParticles({ map, mapContainer, active }: EmberParticlesProps) {
  const emberCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const emberParticlesRef = useRef<EmberParticle[]>([]);
  const emberAnimFrameRef = useRef<number | null>(null);
  const emberTractBoundsRef = useRef<Array<{ minLng: number; maxLng: number; minLat: number; maxLat: number; ratio: number; polygon: number[][] }>>([]);

  // Ember particle overlay system
  useEffect(() => {
    if (!active || !map.current || !mapContainer.current) {
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
  }, [active]);

  return null;
}
