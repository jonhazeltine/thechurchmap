import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Building, Users, MapPin, ZoomIn, Pencil, X, Layers, Eye, EyeOff } from "lucide-react";
import bbox from "@turf/bbox";
import { useAdminAccess } from "@/hooks/useAdminAccess";

interface CityPlatformMapData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  is_public: boolean;
  primary_boundary_id: string | null;
  default_center_lat: number | null;
  default_center_lng: number | null;
  default_zoom: number;
  church_count: number;
  member_count: number;
  centroid: GeoJSON.Point | null;
  boundary_geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const CONUS_CENTER: [number, number] = [-98.5795, 39.8283];
const CONUS_ZOOM = 3.5;

export default function AdminCityPlatformsMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<CityPlatformMapData | null>(null);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const { isSuperAdmin, isLoading: authLoading } = useAdminAccess();

  const isAuthReady = !authLoading && isSuperAdmin === true;

  const { data: platforms, isLoading, error } = useQuery<CityPlatformMapData[]>({
    queryKey: ["/api/admin/city-platforms/map"],
    enabled: isAuthReady,
  });

  useEffect(() => {
    if (!isAuthReady || !mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: CONUS_CENTER,
      zoom: CONUS_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isAuthReady]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !platforms || platforms.length === 0) return;

    const boundariesFeatures = platforms
      .filter((p) => p.boundary_geojson)
      .map((p) => ({
        type: "Feature" as const,
        properties: {
          id: p.id,
          name: p.name,
          is_active: p.is_active,
          is_public: p.is_public,
          church_count: p.church_count,
          member_count: p.member_count,
        },
        geometry: p.boundary_geojson!,
      }));

    const centroidsFeatures = platforms
      .filter((p) => p.centroid)
      .map((p) => ({
        type: "Feature" as const,
        properties: {
          id: p.id,
          name: p.name,
          is_active: p.is_active,
          is_public: p.is_public,
          church_count: p.church_count,
          member_count: p.member_count,
        },
        geometry: p.centroid!,
      }));

    const boundariesGeoJSON: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: boundariesFeatures,
    };

    const centroidsGeoJSON: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: centroidsFeatures,
    };

    if (map.current.getSource("platforms-boundaries")) {
      (map.current.getSource("platforms-boundaries") as mapboxgl.GeoJSONSource).setData(boundariesGeoJSON);
    } else {
      map.current.addSource("platforms-boundaries", {
        type: "geojson",
        data: boundariesGeoJSON,
      });

      map.current.addLayer({
        id: "platforms-boundaries-fill",
        type: "fill",
        source: "platforms-boundaries",
        paint: {
          "fill-color": [
            "case",
            ["get", "is_active"],
            "rgba(59, 130, 246, 0.2)",
            "rgba(156, 163, 175, 0.2)",
          ],
          "fill-opacity": 0.6,
        },
      });

      map.current.addLayer({
        id: "platforms-boundaries-line",
        type: "line",
        source: "platforms-boundaries",
        paint: {
          "line-color": [
            "case",
            ["get", "is_active"],
            "#3b82f6",
            "#9ca3af",
          ],
          "line-width": 2,
        },
      });
    }

    if (map.current.getSource("platforms-centroids")) {
      (map.current.getSource("platforms-centroids") as mapboxgl.GeoJSONSource).setData(centroidsGeoJSON);
    } else {
      map.current.addSource("platforms-centroids", {
        type: "geojson",
        data: centroidsGeoJSON,
      });

      map.current.addLayer({
        id: "platforms-centroids-labels",
        type: "symbol",
        source: "platforms-centroids",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
          "text-anchor": "bottom",
          "text-offset": [0, -0.5],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      map.current.addLayer({
        id: "platforms-centroids-markers",
        type: "circle",
        source: "platforms-centroids",
        paint: {
          "circle-radius": 8,
          "circle-color": [
            "case",
            ["get", "is_active"],
            "#3b82f6",
            "#9ca3af",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }

    map.current.on("click", "platforms-boundaries-fill", (e) => {
      if (e.features && e.features[0]) {
        const platformId = e.features[0].properties?.id;
        const platform = platforms.find((p) => p.id === platformId);
        if (platform) {
          setSelectedPlatform(platform);
        }
      }
    });

    map.current.on("click", "platforms-centroids-markers", (e) => {
      if (e.features && e.features[0]) {
        const platformId = e.features[0].properties?.id;
        const platform = platforms.find((p) => p.id === platformId);
        if (platform) {
          setSelectedPlatform(platform);
        }
      }
    });

    map.current.on("mouseenter", "platforms-boundaries-fill", () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "pointer";
      }
    });

    map.current.on("mouseleave", "platforms-boundaries-fill", () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "";
      }
    });

    map.current.on("mouseenter", "platforms-centroids-markers", () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "pointer";
      }
    });

    map.current.on("mouseleave", "platforms-centroids-markers", () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "";
      }
    });
  }, [mapLoaded, platforms]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (map.current.getLayer("platforms-boundaries-fill")) {
      map.current.setLayoutProperty(
        "platforms-boundaries-fill",
        "visibility",
        showBoundaries ? "visible" : "none"
      );
    }
    if (map.current.getLayer("platforms-boundaries-line")) {
      map.current.setLayoutProperty(
        "platforms-boundaries-line",
        "visibility",
        showBoundaries ? "visible" : "none"
      );
    }
  }, [showBoundaries, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (map.current.getLayer("platforms-centroids-labels")) {
      map.current.setLayoutProperty(
        "platforms-centroids-labels",
        "visibility",
        showLabels ? "visible" : "none"
      );
    }
  }, [showLabels, mapLoaded]);

  const handleZoomToPlatform = useCallback(() => {
    if (!map.current || !selectedPlatform) return;

    if (selectedPlatform.boundary_geojson) {
      const bounds = bbox({
        type: "Feature",
        properties: {},
        geometry: selectedPlatform.boundary_geojson,
      });
      map.current.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 50, duration: 1000 }
      );
    } else if (selectedPlatform.centroid) {
      map.current.flyTo({
        center: selectedPlatform.centroid.coordinates as [number, number],
        zoom: selectedPlatform.default_zoom || 10,
        duration: 1000,
      });
    } else if (selectedPlatform.default_center_lat && selectedPlatform.default_center_lng) {
      map.current.flyTo({
        center: [selectedPlatform.default_center_lng, selectedPlatform.default_center_lat],
        zoom: selectedPlatform.default_zoom || 10,
        duration: 1000,
      });
    }
  }, [selectedPlatform]);

  const handleResetView = useCallback(() => {
    if (map.current) {
      map.current.flyTo({
        center: CONUS_CENTER,
        zoom: CONUS_ZOOM,
        duration: 1000,
      });
    }
  }, []);

  return (
    <AdminLayout>
      <div className="relative h-[calc(100vh-0px)] w-full" data-testid="container-city-platforms-map">
        <div
          ref={mapContainer}
          className="absolute inset-0"
          data-testid="map-container"
        />

        {(authLoading || !isAuthReady || isLoading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <div className="space-y-2 text-center">
              <Skeleton className="h-8 w-48 mx-auto" />
              <p className="text-muted-foreground">
                {authLoading ? "Checking access..." : "Loading platforms..."}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <Card className="max-w-md">
              <CardContent className="pt-6">
                <p className="text-destructive">Failed to load city platforms</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="absolute top-4 left-4 z-10">
          <Card className="w-64">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Map Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="toggle-boundaries" className="flex items-center gap-2 text-sm">
                  {showBoundaries ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  Boundaries
                </Label>
                <Switch
                  id="toggle-boundaries"
                  checked={showBoundaries}
                  onCheckedChange={setShowBoundaries}
                  data-testid="switch-toggle-boundaries"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="toggle-labels" className="flex items-center gap-2 text-sm">
                  {showLabels ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  Labels
                </Label>
                <Switch
                  id="toggle-labels"
                  checked={showLabels}
                  onCheckedChange={setShowLabels}
                  data-testid="switch-toggle-labels"
                />
              </div>
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleResetView}
                  data-testid="button-reset-view"
                >
                  <MapPin className="h-3 w-3 mr-2" />
                  Reset to US View
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {platforms?.length || 0} platform{(platforms?.length || 0) !== 1 ? "s" : ""} total
              </div>
            </CardContent>
          </Card>
        </div>

        {selectedPlatform && (
          <div className="absolute top-4 right-16 z-10" data-testid="panel-platform-details">
            <Card className="w-80">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg" data-testid="text-platform-name">
                    {selectedPlatform.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">/{selectedPlatform.slug}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedPlatform(null)}
                  data-testid="button-close-panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant={selectedPlatform.is_active ? "default" : "secondary"}
                    data-testid="badge-active-status"
                  >
                    {selectedPlatform.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Badge
                    variant={selectedPlatform.is_public ? "outline" : "secondary"}
                    data-testid="badge-public-status"
                  >
                    {selectedPlatform.is_public ? "Public" : "Private"}
                  </Badge>
                </div>

                {selectedPlatform.description && (
                  <p className="text-sm text-muted-foreground" data-testid="text-platform-description">
                    {selectedPlatform.description}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold" data-testid="text-church-count">
                        {selectedPlatform.church_count}
                      </p>
                      <p className="text-xs text-muted-foreground">Churches</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold" data-testid="text-member-count">
                        {selectedPlatform.member_count}
                      </p>
                      <p className="text-xs text-muted-foreground">Members</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t">
                  <Button
                    onClick={handleZoomToPlatform}
                    className="w-full"
                    data-testid="button-zoom-to-platform"
                  >
                    <ZoomIn className="h-4 w-4 mr-2" />
                    Zoom to Platform
                  </Button>
                  <Link href={`/admin/city-platforms?id=${selectedPlatform.id}`}>
                    <Button
                      variant="outline"
                      className="w-full"
                      data-testid="link-edit-platform"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Platform
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
