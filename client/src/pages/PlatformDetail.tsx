import { useRoute, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  MapPin, 
  Building2, 
  Users, 
  ChevronLeft, 
  Map,
  Globe,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import type { PlatformRegionWithCounts } from "@shared/schema";

interface PlatformData {
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
  is_active: boolean;
  is_public: boolean;
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function PlatformDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-6 w-48" />
        </div>
      </header>
      <div className="relative">
        <Skeleton className="w-full h-48 md:h-64" />
      </div>
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-start gap-6 -mt-16 relative z-10 mb-8">
          <Skeleton className="h-24 w-24 rounded-xl shrink-0" />
          <div className="flex-1 pt-8 space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
        <Card>
          <CardContent className="p-6 space-y-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-4 pt-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function PlatformNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            asChild
            data-testid="button-back"
          >
            <Link href="/platforms">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span className="text-lg font-medium">Platform Not Found</span>
        </div>
      </header>
      <main className="container mx-auto px-4 py-16 max-w-lg text-center">
        <div className="rounded-full bg-muted w-20 h-20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold mb-3" data-testid="text-error-title">
          Platform Not Found
        </h1>
        <p className="text-muted-foreground mb-8" data-testid="text-error-message">
          The platform you're looking for doesn't exist or is no longer available.
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="outline" asChild data-testid="button-browse-platforms">
            <Link href="/platforms">
              <Building2 className="h-4 w-4 mr-2" />
              Browse Platforms
            </Link>
          </Button>
          <Button asChild data-testid="button-explore-map">
            <Link href="/explore">
              <Map className="h-4 w-4 mr-2" />
              Explore Map
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

// Helper to detect UUID pattern
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export default function PlatformDetail() {
  const [match, params] = useRoute("/platform/:slug");
  const [, navigate] = useLocation();
  const identifier = params?.slug || "";

  const { data: platform, isLoading, error } = useQuery<PlatformData>({
    queryKey: ['/api/platforms', identifier],
    enabled: !!identifier,
  });

  // Fetch regions for the platform
  const { data: regionsData } = useQuery<{ regions: PlatformRegionWithCounts[] }>({
    queryKey: [`/api/admin/city-platforms/${platform?.id}/regions`],
    enabled: !!platform?.id,
  });

  const regions = regionsData?.regions || [];
  const hasRegions = regions.length > 0;

  // Redirect UUID URLs to slug-based URLs for canonical URLs
  useEffect(() => {
    if (platform && isUUID(identifier) && platform.slug && platform.slug !== identifier) {
      navigate(`/platform/${platform.slug}`, { replace: true });
    }
  }, [platform, identifier, navigate]);

  if (isLoading) {
    return <PlatformDetailSkeleton />;
  }

  if (error || !platform) {
    return <PlatformNotFound />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            asChild
            data-testid="button-back"
          >
            <Link href="/platforms">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span className="text-lg font-medium truncate" data-testid="text-header-title">
            {platform.name}
          </span>
        </div>
      </header>

      <div className="relative">
        {platform.banner_url ? (
          <div className="w-full h-48 md:h-64 relative">
            <img
              src={platform.banner_url}
              alt={`${platform.name} banner`}
              className="w-full h-full object-cover"
              data-testid="img-platform-banner"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="w-full h-48 md:h-64 bg-gradient-to-br from-primary/20 via-primary/10 to-background" />
        )}
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-col sm:flex-row items-start gap-6 -mt-16 relative z-10 mb-8">
          <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg shrink-0">
            <AvatarImage 
              src={platform.logo_url || undefined} 
              alt={platform.name}
              data-testid="img-platform-logo"
            />
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-2xl">
              {getInitials(platform.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 pt-2 sm:pt-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-2" data-testid="text-platform-name">
              {platform.name}
            </h1>
            {platform.primary_boundary && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span data-testid="text-platform-location">{platform.primary_boundary.name}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card data-testid="card-stat-churches">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-primary/10 p-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-church-count">
                  {platform.church_count}
                </p>
                <p className="text-sm text-muted-foreground">Churches</p>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-stat-members">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-primary/10 p-3">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-member-count">
                  {platform.member_count}
                </p>
                <p className="text-sm text-muted-foreground">Members</p>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-action-map">
            <CardContent className="flex items-center justify-center p-6">
              <Button asChild className="w-full" data-testid="button-view-on-map">
                <Link href={`/${platform.slug || platform.id}`}>
                  <Map className="h-4 w-4 mr-2" />
                  View on Map
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <h2 className="text-lg font-semibold">About</h2>
          </CardHeader>
          <CardContent className="space-y-6">
            {platform.description ? (
              <CardDescription className="text-base leading-relaxed" data-testid="text-platform-description">
                {platform.description}
              </CardDescription>
            ) : (
              <CardDescription className="text-base italic" data-testid="text-no-description">
                No description available for this platform.
              </CardDescription>
            )}

            {hasRegions ? (
              <div>
                <h3 className="text-sm font-medium mb-3">Regions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="container-region-cards">
                  {regions.map((region) => (
                    <Link 
                      key={region.id} 
                      href={`/${platform.slug || platform.id}?region=${region.id}`}
                      className="block"
                    >
                      <Card 
                        className="hover-elevate cursor-pointer transition-all overflow-hidden"
                        data-testid={`card-region-${region.id}`}
                      >
                        {region.cover_image_url ? (
                          <div className="relative h-24 w-full">
                            <img 
                              src={region.cover_image_url} 
                              alt={region.name}
                              className="w-full h-full object-cover"
                              data-testid={`img-region-cover-${region.id}`}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <div className="absolute bottom-2 left-3 right-3">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full shrink-0 border border-white/50"
                                  style={{ backgroundColor: region.color }}
                                />
                                <p className="font-medium text-white truncate text-sm">{region.name}</p>
                              </div>
                              <p className="text-xs text-white/80 flex items-center gap-1 mt-0.5 ml-5">
                                <IconBuildingChurch className="h-3 w-3" />
                                {region.church_count} {region.church_count === 1 ? 'church' : 'churches'}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10 shrink-0" style={{ backgroundColor: `${region.color}20` }}>
                                <AvatarFallback 
                                  style={{ backgroundColor: region.color, color: 'white' }}
                                  className="text-sm font-medium"
                                >
                                  {region.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{region.name}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <IconBuildingChurch className="h-3 w-3" />
                                  {region.church_count} {region.church_count === 1 ? 'church' : 'churches'}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            ) : platform.boundary_names.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium mb-2">Coverage Areas</h3>
                <div className="flex flex-wrap gap-2" data-testid="container-boundary-badges">
                  {platform.boundary_names.map((name, index) => (
                    <Badge 
                      key={index} 
                      variant="secondary"
                      data-testid={`badge-boundary-${index}`}
                    >
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-4 border-t">
              {platform.website && (
                <Button variant="outline" asChild data-testid="button-website">
                  <a href={platform.website} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-4 w-4 mr-2" />
                    Website
                  </a>
                </Button>
              )}
              {platform.contact_email && (
                <Button variant="outline" asChild data-testid="button-contact">
                  <a href={`mailto:${platform.contact_email}`}>
                    <Mail className="h-4 w-4 mr-2" />
                    Contact
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-medium mb-2">Ready to explore?</h3>
            <p className="text-muted-foreground mb-4">
              Discover churches and connect with the community in {platform.name}.
            </p>
            <Button asChild size="lg" data-testid="button-explore-cta">
              <Link href={`/${platform.slug || platform.id}`}>
                <Map className="h-4 w-4 mr-2" />
                Explore {platform.name} on Map
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
