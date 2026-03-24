import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Search, 
  MapPin, 
  Building2, 
  Users, 
  ChevronLeft, 
  ChevronRight,
  Globe,
  LogIn,
  LogOut,
  UserPlus,
  Clock,
  CheckCircle,
  Loader2,
  Map as MapIcon,
  List,
  X,
  Info,
  Rocket,
  TrendingUp,
  Eye,
  EyeOff,
  User as UserIcon
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { UserMembershipStatus } from "@shared/schema";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

interface PublicPlatform {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website: string | null;
  contact_email: string | null;
  default_center_lat: number | null;
  default_center_lng: number | null;
  default_zoom: number;
  created_at: string;
  church_count: number;
  member_count: number;
  primary_boundary?: {
    id: string;
    name: string;
    type: string;
  } | null;
  boundary_names: string[];
}

interface ExploreStats {
  totalPlatforms: number;
  totalChurches: number;
  totalMembers: number;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function GlobalStatsBanner({ stats, isLoading }: { stats?: ExploreStats; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-5 w-8" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg p-4 mb-4" data-testid="global-stats-banner">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Platform Network
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Globe className="h-3 w-3" />
            <span className="text-xs">Platforms</span>
          </div>
          <p className="text-lg font-bold text-foreground" data-testid="stat-total-platforms">
            {stats?.totalPlatforms || 0}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Building2 className="h-3 w-3" />
            <span className="text-xs">Churches</span>
          </div>
          <p className="text-lg font-bold text-foreground" data-testid="stat-total-churches">
            {stats?.totalChurches || 0}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Users className="h-3 w-3" />
            <span className="text-xs">Members</span>
          </div>
          <p className="text-lg font-bold text-foreground" data-testid="stat-total-members">
            {stats?.totalMembers || 0}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyPlatformsState({ user }: { user: any }) {
  const [, navigate] = useLocation();

  return (
    <div className="p-8 text-center" data-testid="empty-platforms-state">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
        <Globe className="h-8 w-8 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">No Platforms Yet</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
        Be among the first to create a city platform and unite churches in your area for greater community impact.
      </p>
      {user ? (
        <Button 
          onClick={() => navigate("/apply-for-platform")}
          className="gap-2"
          data-testid="button-start-platform"
        >
          <Rocket className="h-4 w-4" />
          Start a Platform
        </Button>
      ) : (
        <div className="space-y-3">
          <Button 
            variant="outline"
            onClick={() => navigate("/login")}
            className="gap-2"
            data-testid="button-signin-to-start"
          >
            <LogIn className="h-4 w-4" />
            Sign in to Start a Platform
          </Button>
          <p className="text-xs text-muted-foreground">
            Already have an account? Sign in to apply.
          </p>
        </div>
      )}
    </div>
  );
}

function PlatformListItem({ 
  platform, 
  isSelected, 
  onSelect,
  onNavigate 
}: { 
  platform: PublicPlatform;
  isSelected: boolean;
  onSelect: () => void;
  onNavigate: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");

  const { data: membershipStatus, isLoading: membershipLoading } = useQuery<UserMembershipStatus>({
    queryKey: ['/api/platforms', platform.id, 'my-membership'],
    enabled: !!user,
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/platforms/${platform.id}/join`, { message: joinMessage || null });
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Your membership request has been submitted for review.",
      });
      setShowJoinDialog(false);
      setJoinMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platform.id, 'my-membership'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit join request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const renderJoinButton = () => {
    if (!user) {
      return null;
    }

    if (membershipLoading) {
      return (
        <Badge variant="outline" className="text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
        </Badge>
      );
    }

    if (membershipStatus?.isMember) {
      return (
        <Badge variant="secondary" className="text-xs" data-testid={`badge-member-${platform.id}`}>
          <CheckCircle className="h-3 w-3 mr-1" />
          Member
        </Badge>
      );
    }

    if (membershipStatus?.hasPendingRequest) {
      return (
        <Badge variant="outline" className="text-xs" data-testid={`badge-pending-${platform.id}`}>
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    }

    return (
      <Button 
        size="sm" 
        variant="outline"
        className="h-7 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          setShowJoinDialog(true);
        }}
        data-testid={`button-join-${platform.id}`}
      >
        <UserPlus className="h-3 w-3 mr-1" />
        Join
      </Button>
    );
  };

  return (
    <>
      <div
        className={`p-3 border-b cursor-pointer transition-colors ${
          isSelected ? 'bg-accent' : 'hover-elevate'
        }`}
        onClick={onSelect}
        data-testid={`platform-item-${platform.id}`}
      >
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={platform.logo_url || undefined} alt={platform.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {getInitials(platform.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="font-medium text-sm truncate" data-testid={`text-platform-name-${platform.id}`}>
                  {platform.name}
                </h4>
                {platform.description && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDescriptionDialog(true);
                        }}
                        data-testid={`button-info-${platform.id}`}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p className="text-sm">{platform.description}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              {renderJoinButton()}
            </div>
            
            {platform.primary_boundary && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{platform.primary_boundary.name}</span>
              </div>
            )}
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1" data-testid={`stat-churches-${platform.id}`}>
                <Building2 className="h-3 w-3" />
                <span className="font-medium text-foreground">{platform.church_count}</span>
                <span className="hidden sm:inline">churches</span>
              </span>
              <span className="flex items-center gap-1" data-testid={`stat-members-${platform.id}`}>
                <Users className="h-3 w-3" />
                <span className="font-medium text-foreground">{platform.member_count}</span>
                <span className="hidden sm:inline">members</span>
              </span>
            </div>
          </div>
        </div>
        
        {isSelected && (
          <div className="mt-3 pt-3 border-t">
            {platform.description && (
              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                {platform.description}
              </p>
            )}
            <Button 
              size="sm" 
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate();
              }}
              data-testid={`button-view-platform-${platform.id}`}
            >
              <MapIcon className="h-4 w-4 mr-2" />
              View Platform Map
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join {platform.name}</DialogTitle>
            <DialogDescription>
              Submit a request to join this platform. The platform admins will review your request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join-message">Message (Optional)</Label>
              <Textarea
                id="join-message"
                placeholder="Introduce yourself or explain why you'd like to join..."
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-join-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJoinDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              data-testid="button-submit-join"
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDescriptionDialog} onOpenChange={setShowDescriptionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={platform.logo_url || undefined} alt={platform.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {getInitials(platform.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle>{platform.name}</DialogTitle>
                {platform.primary_boundary && (
                  <p className="text-sm text-muted-foreground">{platform.primary_boundary.name}</p>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            {platform.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {platform.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{platform.church_count}</span>
                <span className="text-muted-foreground">churches</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{platform.member_count}</span>
                <span className="text-muted-foreground">members</span>
              </span>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={() => setShowDescriptionDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Explore() {
  const [location, navigate] = useLocation();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // State for toggle controls - initialized from URL
  const [showLdsChurches, setShowLdsChurches] = useState(() => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    return params.get('showLds') !== 'false';
  });

  const [showAllChurches, setShowAllChurches] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('showChurches') === 'true';
  });

  // Sync toggle state with URL
  const handleLdsToggle = (checked: boolean) => {
    setShowLdsChurches(checked);
    const params = new URLSearchParams(window.location.search);
    if (checked) {
      params.delete('showLds'); // Default is true, so remove param
    } else {
      params.set('showLds', 'false');
    }
    const newUrl = params.toString() ? `/explore?${params.toString()}` : '/explore';
    navigate(newUrl, { replace: true });
  };

  const handleChurchesToggle = (checked: boolean) => {
    setShowAllChurches(checked);
    const params = new URLSearchParams(window.location.search);
    if (checked) {
      params.set('showChurches', 'true');
    } else {
      params.delete('showChurches'); // Default is false, so remove param
    }
    const newUrl = params.toString() ? `/explore?${params.toString()}` : '/explore';
    navigate(newUrl, { replace: true });
  };

  const getUserInitials = (email?: string) => {
    if (!email) return "U";
    const parts = email.split("@")[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const markerTapRef = useRef(false); // Guard against map click after marker tap
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // On mobile with showChurches=true, hide sidebar to show map
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    const hasShowChurches = params.get('showChurches') === 'true';
    // Check if mobile (rough heuristic - will be corrected by useIsMobile)
    const isMobileWidth = window.innerWidth < 768;
    return !(hasShowChurches && isMobileWidth);
  });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [churchesLoading, setChurchesLoading] = useState(true);
  const [fullscreenMap, setFullscreenMap] = useState(() => {
    // On mobile with showChurches=true, show fullscreen map
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const hasShowChurches = params.get('showChurches') === 'true';
    const isMobileWidth = window.innerWidth < 768;
    return hasShowChurches && isMobileWidth;
  });

  const { data: platforms = [], isLoading } = useQuery<PublicPlatform[]>({
    queryKey: ['/api/platforms'],
  });

  const { data: exploreStats, isLoading: statsLoading } = useQuery<ExploreStats>({
    queryKey: ['/api/explore/stats'],
  });

  const filteredPlatforms = useMemo(() => {
    if (!searchQuery.trim()) return platforms;
    const query = searchQuery.toLowerCase();
    return platforms.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query) ||
      p.boundary_names.some(bn => bn.toLowerCase().includes(query))
    );
  }, [platforms, searchQuery]);

  const platformsWithCoords = useMemo(() => {
    return filteredPlatforms.filter(p => 
      p.default_center_lat !== null && p.default_center_lng !== null
    );
  }, [filteredPlatforms]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-98.5795, 39.8283],
        zoom: 3.5,
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      map.current.on('load', () => {
        setMapLoaded(true);
        
        // Add the all-churches layers (sampled GeoJSON for low zoom + vector tiles for high zoom)
        if (map.current) {
          const mapInstance = map.current;
          
          // Churches are loaded via the Mapbox vector tileset (no GeoJSON file needed)
          setChurchesLoading(false);
          
          // Add the vector tileset source for high zoom levels (v8: US-only with name, city, state)
          // Note: source-layer name is set by Mapbox based on upload name
          mapInstance.addSource('all-churches', {
            type: 'vector',
            url: 'mapbox://jonhazeltine.all-churches-v8'
          });
          
          // Dynamically detect the source-layer name from tileset metadata
          const TILESET_SOURCE_LAYER = 'All Churches Tileset - 2025-12-11'; // Will be 'churches' after next upload
          
          // Log any errors loading the source
          mapInstance.on('error', (e) => {
            if (e.error?.message?.includes('all-churches')) {
              console.error('Error loading all-churches tileset:', e.error);
            }
          });
          
          // Function to add the church pin layer from vector tileset
          const addChurchesLayer = () => {
            if (mapInstance.getLayer('all-churches-layer')) {
              console.log('All-churches layer already exists');
              return true;
            }

            try {
              mapInstance.addLayer({
                id: 'all-churches-layer',
                type: 'circle',
                source: 'all-churches',
                'source-layer': TILESET_SOURCE_LAYER,
                minzoom: 0,
                maxzoom: 22,
                paint: {
                  'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    3, 3,
                    5, 5,
                    8, 6,
                    12, 8,
                    16, 12
                  ],
                  'circle-color': '#dc2626',
                  'circle-opacity': [
                    'interpolate', ['linear'], ['zoom'],
                    3, 0.85,
                    5, 0.9,
                    10, 0.95
                  ],
                  'circle-stroke-width': [
                    'interpolate', ['linear'], ['zoom'],
                    3, 0,
                    6, 0.5,
                    10, 1
                  ],
                  'circle-stroke-color': '#ffffff'
                },
                layout: {
                  'visibility': 'none'  // Start hidden - only show when toggle is ON
                }
              });
              console.log('All-churches layer added successfully!');
              return true;
            } catch (err) {
              console.error('Failed to add all-churches layer:', err);
              return false;
            }
          };
          
          // Try to add layer immediately (works if source is cached)
          setTimeout(() => {
            console.log('Attempting to add all-churches layer (delayed)...');
            if (!addChurchesLayer()) {
              console.log('Layer not added yet, waiting for source...');
            }
          }, 1000);
          
          // Debug: Log feature count on every zoom change
          mapInstance.on('zoomend', () => {
            const zoom = mapInstance.getZoom();
            let count = 0;
            // Use GeoJSON layer (has ALL 240k churches at every zoom)
            if (mapInstance.getLayer('all-churches-layer')) {
              const features = mapInstance.queryRenderedFeatures({ layers: ['all-churches-layer'] });
              count = features.length;
            }
            console.log(`🔴 ZOOM ${zoom.toFixed(1)}: ${count} churches visible`);
          });
          
          // Initial debug log after tiles load
          setTimeout(() => {
            let count = 0;
            // Use GeoJSON layer (has ALL 240k churches at every zoom)
            if (mapInstance.getLayer('all-churches-layer')) {
              const features = mapInstance.queryRenderedFeatures({ layers: ['all-churches-layer'] });
              count = features.length;
            }
            const zoom = mapInstance.getZoom();
            console.log(`🔴 INITIAL: ${count} churches at zoom ${zoom.toFixed(1)}`);
          }, 3000);
          
          // Also listen for source data events as backup
          mapInstance.on('sourcedata', (e) => {
            if (e.sourceId === 'all-churches' && e.isSourceLoaded) {
              console.log('All-churches source loaded event fired');
              addChurchesLayer();
            }
          });
          
          // Add hover effect - change cursor (vector tileset layer)
          mapInstance.on('mouseenter', 'all-churches-layer', () => {
            mapInstance.getCanvas().style.cursor = 'pointer';
          });
          
          mapInstance.on('mouseleave', 'all-churches-layer', () => {
            mapInstance.getCanvas().style.cursor = '';
          });
          
          // Add hover effect for lowzoom GeoJSON layer
          mapInstance.on('mouseenter', 'all-churches-layer', () => {
            mapInstance.getCanvas().style.cursor = 'pointer';
          });
          
          mapInstance.on('mouseleave', 'all-churches-layer', () => {
            mapInstance.getCanvas().style.cursor = '';
          });
          
          // Add click handler for lowzoom GeoJSON layer (uses name/city/state from properties)
          mapInstance.on('click', 'all-churches-layer', (e) => {
            if (!e.features || e.features.length === 0) return;
            
            const feature = e.features[0];
            const props = feature.properties || {};
            const coordinates = (feature.geometry as any).coordinates.slice();
            
            // Ensure popup appears at click location
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
              coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }
            
            // Close any existing popup
            if (popupRef.current) {
              popupRef.current.remove();
            }
            
            const name = props.name || 'Church';
            const city = props.city || '';
            const state = props.state || '';
            const location = [city, state].filter(Boolean).join(', ');
            
            const popup = new mapboxgl.Popup({
              closeButton: true,
              closeOnClick: true,
              offset: [0, -10],
              className: 'church-popup',
            })
              .setLngLat(coordinates)
              .setHTML(`
                <div style="padding: 12px 16px; max-width: 280px;">
                  <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #1f2937;">${name}</div>
                  ${location ? `<div style="font-size: 12px; color: #6b7280;">${location}</div>` : ''}
                </div>
              `)
              .addTo(mapInstance);
            
            popupRef.current = popup;
          });
          
          // Add click handler for church details popup (uses name/city/state from tileset)
          mapInstance.on('click', 'all-churches-layer', (e) => {
            if (!e.features || e.features.length === 0) return;
            
            const feature = e.features[0];
            const props = feature.properties || {};
            const coordinates = (feature.geometry as any).coordinates.slice();
            
            // Ensure popup appears at click location
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
              coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }
            
            // Close any existing popup
            if (popupRef.current) {
              popupRef.current.remove();
            }
            
            // Use name/city/state directly from tileset properties (v7)
            const name = props.name || 'Church';
            const city = props.city || '';
            const state = props.state || '';
            const location = [city, state].filter(Boolean).join(', ');
            
            const popup = new mapboxgl.Popup({
              closeButton: true,
              closeOnClick: true,
              offset: [0, -10],
              className: 'church-popup',
            })
              .setLngLat(coordinates)
              .setHTML(`
                <div style="padding: 12px 16px; max-width: 280px;">
                  <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #1f2937;">${name}</div>
                  ${location ? `<div style="font-size: 12px; color: #6b7280;">${location}</div>` : ''}
                </div>
              `)
              .addTo(mapInstance);
            
            popupRef.current = popup;
          });
        }
      });

      // Guard against map click firing after marker tap on mobile
      map.current.on('touchstart', () => {
        markerTapRef.current = false;
      });

      map.current.on('click', () => {
        // Skip if a marker was just tapped (mobile fires map click after touchend)
        if (markerTapRef.current) {
          markerTapRef.current = false;
          return;
        }
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
        setSelectedPlatformId(null);
      });

    } catch (error) {
      console.error('Failed to initialize Mapbox GL:', error);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update all-churches layer visibility when toggle changes OR loading completes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    const updateVisibility = () => {
      // Only show when toggle is ON AND loading is complete
      const shouldShow = showAllChurches && !churchesLoading;
      const visibility = shouldShow ? 'visible' : 'none';
      
      // Update high-zoom vector layer
      if (map.current?.getLayer('all-churches-layer')) {
        console.log('Setting all-churches visibility:', visibility, '(toggle:', showAllChurches, 'loading:', churchesLoading, ')');
        map.current.setLayoutProperty('all-churches-layer', 'visibility', visibility);
      }
      
      // Update low-zoom GeoJSON layer
      if (map.current?.getLayer('all-churches-layer')) {
        console.log('Setting low-zoom churches visibility:', visibility, '(toggle:', showAllChurches, 'loading:', churchesLoading, ')');
        map.current.setLayoutProperty('all-churches-layer', 'visibility', visibility);
      }
    };
    
    // Try immediately
    updateVisibility();
    
    // Also try after a delay in case layer isn't ready yet
    const timeout = setTimeout(updateVisibility, 1500);
    return () => clearTimeout(timeout);
  }, [showAllChurches, churchesLoading, mapLoaded]);

  // Resize map when fullscreen mode changes on mobile
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    // Allow layout to settle, then resize
    const timeout = setTimeout(() => {
      map.current?.resize();
    }, 350);
    
    return () => clearTimeout(timeout);
  }, [fullscreenMap, sidebarOpen, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    platformsWithCoords.forEach(platform => {
      if (platform.default_center_lat === null || platform.default_center_lng === null) return;

      const el = document.createElement('div');
      el.className = 'platform-marker';
      el.style.touchAction = 'manipulation';
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div style="
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          pointer-events: none;
        ">
          <svg style="pointer-events: none;" width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        const div = el.querySelector('div') as HTMLDivElement;
        if (div) {
          div.style.transform = 'scale(1.15)';
          div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
        }

        if (popupRef.current) {
          popupRef.current.remove();
        }

        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: [0, -20],
          className: 'platform-popup',
        })
          .setLngLat([platform.default_center_lng!, platform.default_center_lat!])
          .setHTML(`
            <div style="padding: 8px 12px; max-width: 200px;">
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${platform.name}</div>
              ${platform.primary_boundary ? `<div style="font-size: 12px; color: #666; margin-bottom: 4px;">${platform.primary_boundary.name}</div>` : ''}
              <div style="font-size: 11px; color: #888; display: flex; gap: 12px;">
                <span>${platform.church_count} churches</span>
                <span>${platform.member_count} members</span>
              </div>
            </div>
          `)
          .addTo(map.current!);

        popupRef.current = popup;
      });

      el.addEventListener('mouseleave', () => {
        const div = el.querySelector('div') as HTMLDivElement;
        if (div) {
          div.style.transform = 'scale(1)';
          div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        }
      });

      // Track touch vs click to handle mobile interactions
      let touchMoved = false;

      const handleMarkerClick = () => {
        // Navigate directly to the platform map page using the slug
        navigate(`/${platform.slug}/map`);
      };

      // Touch event handlers for mobile - same pattern as church markers
      el.addEventListener('touchstart', (e) => {
        console.log('[Platform Marker] touchstart on', platform.name);
        touchMoved = false;
      }, { passive: true });

      el.addEventListener('touchmove', () => {
        touchMoved = true;
      }, { passive: true });

      el.addEventListener('touchend', (e) => {
        console.log('[Platform Marker] touchend on', platform.name, 'touchMoved:', touchMoved);
        if (touchMoved) return; // Ignore if user was scrolling/panning
        
        e.preventDefault();
        e.stopPropagation();
        
        // Set flag to prevent map click from clearing selection
        markerTapRef.current = true;
        
        // Close any existing popup
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
        
        handleMarkerClick();
      }, { passive: false });

      // Also add pointerdown/pointerup for more universal touch support
      el.addEventListener('pointerdown', (e) => {
        console.log('[Platform Marker] pointerdown on', platform.name);
        touchMoved = false;
      });

      el.addEventListener('pointerup', (e) => {
        console.log('[Platform Marker] pointerup on', platform.name, 'touchMoved:', touchMoved);
        if (touchMoved) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        markerTapRef.current = true;
        
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
        
        handleMarkerClick();
      });

      el.addEventListener('click', (e) => {
        console.log('[Platform Marker] click on', platform.name);
        e.stopPropagation();
        e.preventDefault();
        // Set flag to prevent map click from clearing selection
        markerTapRef.current = true;
        handleMarkerClick();
      });

      const marker = new mapboxgl.Marker({ 
        element: el,
        anchor: 'center',
      })
        .setLngLat([platform.default_center_lng!, platform.default_center_lat!])
        .addTo(map.current!);

      markersRef.current.set(platform.id, marker);
    });
  }, [platformsWithCoords, mapLoaded]);

  useEffect(() => {
    if (!selectedPlatformId || !map.current) return;

    const platform = platforms.find(p => p.id === selectedPlatformId);
    if (platform && platform.default_center_lat && platform.default_center_lng) {
      map.current.flyTo({
        center: [platform.default_center_lng, platform.default_center_lat],
        zoom: 8,
        duration: 1000,
      });
    }
  }, [selectedPlatformId, platforms]);

  const handleNavigateToPlatform = (platformIdOrSlug: string) => {
    // Find the platform to get its slug
    const platform = platforms.find(p => p.id === platformIdOrSlug || p.slug === platformIdOrSlug);
    if (platform) {
      navigate(`/${platform.slug}/map`);
    } else {
      // Fallback to the slug-based URL if platform not found
      navigate(`/${platformIdOrSlug}/map`);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col" data-testid="explore-page">
      <header className="h-14 border-b bg-background flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            data-testid="button-back-home"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-lg">Explore Platforms</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!user && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/login")}
              data-testid="button-signin"
            >
              <LogIn className="h-4 w-4 mr-1.5" />
              Sign In
            </Button>
          )}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-menu">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{getUserInitials(user.email)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium" data-testid="text-user-email">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} data-testid="link-profile">
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} data-testid="button-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <div className="flex-1 flex relative overflow-hidden">
        {/* Sidebar - completely hidden on mobile when closed */}
        {(!isMobile || sidebarOpen) && (
          <div 
            className={`
              ${isMobile ? 'absolute inset-y-0 left-0 w-full z-20' : 'relative'}
              ${sidebarOpen ? (isMobile ? 'translate-x-0' : 'w-80') : 'w-0'}
              transition-all duration-300 bg-background border-r flex flex-col overflow-hidden shrink-0
            `}
          >
            {sidebarOpen && (
            <>
              <div className="p-4 border-b space-y-4 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">City Platforms</h2>
                  {isMobile && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setFullscreenMap(true);
                        setSidebarOpen(false);
                      }}
                      data-testid="button-view-map"
                    >
                      <MapIcon className="h-4 w-4 mr-1.5" />
                      Map
                    </Button>
                  )}
                </div>

                <GlobalStatsBanner stats={exploreStats} isLoading={statsLoading} />
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search platforms..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-platforms"
                  />
                </div>

                {platforms.length > 0 && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Showing <span className="font-medium text-foreground">{filteredPlatforms.length}</span> of {platforms.length} platforms
                    </span>
                  </div>
                )}
              </div>

              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : platforms.length === 0 ? (
                  <EmptyPlatformsState user={user} />
                ) : filteredPlatforms.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No platforms found</p>
                    <p className="text-sm mt-1">Try adjusting your search</p>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-3"
                      onClick={() => setSearchQuery("")}
                      data-testid="button-clear-search"
                    >
                      Clear search
                    </Button>
                  </div>
                ) : (
                  filteredPlatforms.map((platform) => (
                    <PlatformListItem
                      key={platform.id}
                      platform={platform}
                      isSelected={selectedPlatformId === platform.id}
                      onSelect={() => setSelectedPlatformId(
                        selectedPlatformId === platform.id ? null : platform.id
                      )}
                      onNavigate={() => handleNavigateToPlatform(platform.id)}
                    />
                  ))
                )}
              </ScrollArea>

              {platforms.length === 0 && !isLoading && user && (
                <div className="p-4 border-t">
                  <Button 
                    variant="outline" 
                    className="w-full gap-2"
                    onClick={() => navigate("/apply-for-platform")}
                    data-testid="button-start-platform-footer"
                  >
                    <Rocket className="h-4 w-4" />
                    Start a Platform
                  </Button>
                </div>
              )}
            </>
          )}
          </div>
        )}

        {!sidebarOpen && !isMobile && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-2 top-2 z-10"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-open-sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {!sidebarOpen && isMobile && !fullscreenMap && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute left-3 top-3 z-30 h-10 w-10 rounded-full shadow-lg bg-background/95 backdrop-blur-sm"
            onClick={() => {
              setFullscreenMap(false);
              setSidebarOpen(true);
            }}
            data-testid="button-open-sidebar-mobile"
          >
            <List className="h-5 w-5" />
          </Button>
        )}

        {sidebarOpen && !isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-[318px] top-2 z-10 bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            data-testid="button-close-sidebar-desktop"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        <div className="flex-1 relative">
          <div ref={mapContainer} className="absolute inset-0" data-testid="map-container" />
          
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          )}
          
          {mapLoaded && (
            <div className="absolute bottom-20 left-4 z-10 pb-[env(safe-area-inset-bottom)]">
              <Card className="shadow-lg">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      id="all-churches-toggle"
                      checked={showAllChurches}
                      onCheckedChange={handleChurchesToggle}
                      disabled={churchesLoading}
                      data-testid="switch-all-churches"
                    />
                    <label 
                      htmlFor="all-churches-toggle" 
                      className="flex items-center gap-2 cursor-pointer text-sm font-medium"
                    >
                      {churchesLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                      ) : (
                        <IconBuildingChurch className="h-4 w-4 text-red-500" />
                      )}
                      <span>All Churches</span>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {churchesLoading ? 'Loading...' : '~240K'}
                      </Badge>
                    </label>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .platform-popup .mapboxgl-popup-content {
          padding: 0;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .platform-popup .mapboxgl-popup-tip {
          border-top-color: white;
        }
        .church-popup .mapboxgl-popup-content {
          padding: 0;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border-left: 3px solid #ef4444;
        }
        .church-popup .mapboxgl-popup-tip {
          border-top-color: white;
        }
        .church-popup .mapboxgl-popup-close-button {
          font-size: 16px;
          padding: 4px 8px;
          color: #9ca3af;
        }
        .church-popup .mapboxgl-popup-close-button:hover {
          color: #374151;
          background: transparent;
        }
      `}</style>
    </div>
  );
}
