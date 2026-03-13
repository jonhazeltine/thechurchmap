import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, MapPin, ChevronRight } from "lucide-react";
import type { Map as MapboxMap } from "mapbox-gl";

// Simple debounce helper
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  
  const debounced = function(this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  } as T & { cancel: () => void };
  
  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };
  
  return debounced;
}

interface PrayerData {
  id: string;
  title: string;
  created_at: string;
}

interface ChurchWithPrayers {
  id: string;
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  prayer_count: number;
  recent_prayers: PrayerData[];
}

interface PrayerMapData {
  churches: ChurchWithPrayers[];
  total_prayer_count: number;
  zoom_level: number;
}

interface PrayerMapOverlayProps {
  map: MapboxMap | null;
  onChurchClick?: (churchId: string, location: { lat: number; lng: number }) => void;
  visible?: boolean;
}

export function PrayerMapOverlay({ map, onChurchClick, visible = true }: PrayerMapOverlayProps) {
  const [prayerData, setPrayerData] = useState<PrayerMapData | null>(null);
  const [zoom, setZoom] = useState(10);
  const [loading, setLoading] = useState(false);

  const fetchPrayerData = useCallback(async () => {
    if (!map || !visible) return;

    const bounds = map.getBounds();
    if (!bounds) return;
    
    const currentZoom = map.getZoom();
    setZoom(currentZoom);

    const bbox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ].join(',');

    try {
      setLoading(true);
      const response = await fetch(`/api/prayers/map?bbox=${bbox}&zoom=${currentZoom}`);
      if (!response.ok) throw new Error('Failed to fetch prayer data');
      
      const data = await response.json();
      setPrayerData(data);
    } catch (error) {
      console.error('Error fetching prayer data:', error);
    } finally {
      setLoading(false);
    }
  }, [map, visible]);

  const debouncedFetch = useCallback(
    debounce(() => fetchPrayerData(), 500),
    [fetchPrayerData]
  );

  useEffect(() => {
    if (!map) return;

    const handleMapUpdate = () => {
      debouncedFetch();
    };

    map.on('moveend', handleMapUpdate);
    map.on('zoomend', handleMapUpdate);

    // Initial fetch
    fetchPrayerData();

    return () => {
      map.off('moveend', handleMapUpdate);
      map.off('zoomend', handleMapUpdate);
      debouncedFetch.cancel();
    };
  }, [map, debouncedFetch, fetchPrayerData]);

  if (!visible || !prayerData || prayerData.churches.length === 0) {
    return null;
  }

  const handleChurchClick = (church: ChurchWithPrayers) => {
    if (onChurchClick) {
      onChurchClick(church.id, church.location);
    }
  };

  // Detail Mode: zoom >= 13
  if (zoom >= 13) {
    return (
      <div className="absolute bottom-4 left-0 right-0 pointer-events-none">
        <div className="max-w-6xl mx-auto px-4 pointer-events-auto">
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-2">
              {prayerData.churches.map((church) => (
                <Card 
                  key={church.id} 
                  className="min-w-[280px] cursor-pointer hover-elevate"
                  onClick={() => handleChurchClick(church)}
                  data-testid={`card-prayer-church-${church.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-medium truncate" data-testid={`text-church-name-${church.id}`}>
                          {church.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {church.address}
                        </p>
                      </div>
                      <Badge variant="secondary" data-testid={`badge-prayer-count-${church.id}`}>
                        {church.prayer_count} {church.prayer_count === 1 ? 'prayer' : 'prayers'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {church.recent_prayers.slice(0, 3).map((prayer) => (
                        <div key={prayer.id} className="text-xs">
                          <p className="font-medium line-clamp-1" data-testid={`text-prayer-title-${prayer.id}`}>
                            {prayer.title}
                          </p>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs"
                      data-testid={`button-view-prayers-${church.id}`}
                    >
                      View all prayers
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  // Summary Mode: 10 <= zoom < 13
  if (zoom >= 10) {
    return (
      <Card className="absolute top-20 right-4 w-80 max-h-96" data-testid="card-prayer-summary">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Prayer Requests
            </CardTitle>
            <Badge variant="secondary" data-testid="badge-total-prayers">
              {prayerData.total_prayer_count} total
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {prayerData.churches.length} {prayerData.churches.length === 1 ? 'church' : 'churches'} in view
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-64">
            <div className="space-y-3">
              {prayerData.churches.map((church) => (
                <div
                  key={church.id}
                  className="p-2 rounded-md hover-elevate cursor-pointer border"
                  onClick={() => handleChurchClick(church)}
                  data-testid={`item-church-${church.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium truncate flex-1" data-testid={`text-church-name-${church.id}`}>
                      {church.name}
                    </p>
                    <Badge variant="outline" className="shrink-0" data-testid={`badge-count-${church.id}`}>
                      {church.prayer_count}
                    </Badge>
                  </div>
                  {church.recent_prayers.length > 0 && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {church.recent_prayers[0].title}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  // Badge Mode: zoom < 10
  return (
    <Card className="absolute top-20 right-4 w-48" data-testid="card-prayer-badge">
      <CardContent className="p-4">
        <div className="text-center">
          <p className="text-2xl font-bold" data-testid="text-total-count">
            {prayerData.total_prayer_count}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Prayer requests
          </p>
          <p className="text-xs text-muted-foreground">
            from {prayerData.churches.length} {prayerData.churches.length === 1 ? 'church' : 'churches'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
