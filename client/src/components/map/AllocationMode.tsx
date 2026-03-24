import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

interface AllocationModeProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  allocationModeActive: boolean;
  prayerCoverageVisible: boolean;
  onTractClick?: (tractGeoid: string, tractLabel: string, population: number, point: { x: number; y: number }) => void;
  onTractLongPress?: (tractGeoid: string, tractLabel: string, population: number, point: { x: number; y: number }) => void;
}

export function AllocationMode({
  map,
  allocationModeActive,
  prayerCoverageVisible,
  onTractClick,
  onTractLongPress,
}: AllocationModeProps) {
  const onTractClickRef = useRef(onTractClick);
  onTractClickRef.current = onTractClick;
  const onTractLongPressRef = useRef(onTractLongPress);
  onTractLongPressRef.current = onTractLongPress;

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

  return null;
}
