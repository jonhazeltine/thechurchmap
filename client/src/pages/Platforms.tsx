import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Search, 
  MapPin, 
  Building2, 
  Users, 
  ChevronLeft, 
  ExternalLink,
  Globe,
  LogIn,
  UserPlus,
  Clock,
  CheckCircle,
  Loader2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserMembershipStatus } from "@shared/schema";

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function PlatformCard({ platform }: { platform: PublicPlatform }) {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [showJoinDialog, setShowJoinDialog] = useState(false);
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
      return (
        <Button 
          variant="secondary" 
          size="sm" 
          className="flex-1"
          asChild
          data-testid={`button-signin-${platform.id}`}
        >
          <Link href="/login">
            <LogIn className="h-4 w-4 mr-1.5" />
            Sign in to Join
          </Link>
        </Button>
      );
    }

    if (membershipLoading) {
      return (
        <Button size="sm" className="flex-1" disabled>
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          Loading...
        </Button>
      );
    }

    if (membershipStatus?.isMember) {
      return (
        <Badge variant="secondary" className="flex-1 justify-center py-1.5" data-testid={`badge-member-${platform.id}`}>
          <CheckCircle className="h-4 w-4 mr-1.5" />
          Member
        </Badge>
      );
    }

    if (membershipStatus?.hasPendingRequest) {
      return (
        <Badge variant="outline" className="flex-1 justify-center py-1.5" data-testid={`badge-pending-${platform.id}`}>
          <Clock className="h-4 w-4 mr-1.5" />
          Request Pending
        </Badge>
      );
    }

    return (
      <Button 
        size="sm" 
        className="flex-1"
        onClick={() => setShowJoinDialog(true)}
        data-testid={`button-join-${platform.id}`}
      >
        <UserPlus className="h-4 w-4 mr-1.5" />
        Join
      </Button>
    );
  };

  return (
    <>
      <Card 
        className="overflow-hidden hover-elevate transition-all duration-200"
        data-testid={`card-platform-${platform.id}`}
      >
        {platform.banner_url && (
          <div className="h-32 w-full relative">
            <img 
              src={platform.banner_url} 
              alt={`${platform.name} banner`}
              className="w-full h-full object-cover"
              data-testid={`img-banner-${platform.id}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}
        
        <CardHeader className={`flex flex-row items-start gap-4 ${platform.banner_url ? '-mt-10 relative z-10' : ''}`}>
          <Avatar className={`h-16 w-16 shrink-0 ring-4 ring-background ${platform.banner_url ? 'shadow-lg' : ''}`}>
            <AvatarImage src={platform.logo_url || undefined} alt={platform.name} />
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-lg">
              {getInitials(platform.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-1">
            <CardTitle className="text-lg leading-tight" data-testid={`text-name-${platform.id}`}>
              {platform.name}
            </CardTitle>
            {platform.primary_boundary && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{platform.primary_boundary.name}</span>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {platform.description && (
            <CardDescription className="line-clamp-2" data-testid={`text-description-${platform.id}`}>
              {platform.description}
            </CardDescription>
          )}

          {platform.boundary_names.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {platform.boundary_names.slice(0, 3).map((name, index) => (
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className="text-xs"
                  data-testid={`badge-boundary-${platform.id}-${index}`}
                >
                  {name}
                </Badge>
              ))}
              {platform.boundary_names.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{platform.boundary_names.length - 3} more
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 pt-2 border-t">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid={`stat-churches-${platform.id}`}>
              <Building2 className="h-4 w-4" />
              <span className="font-medium text-foreground">{platform.church_count}</span>
              <span>churches</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground" data-testid={`stat-members-${platform.id}`}>
              <Users className="h-4 w-4" />
              <span className="font-medium text-foreground">{platform.member_count}</span>
              <span>members</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            {platform.website && (
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                asChild
                data-testid={`button-website-${platform.id}`}
              >
                <a href={platform.website} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-4 w-4 mr-1.5" />
                  Website
                </a>
              </Button>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              asChild
              data-testid={`button-view-${platform.id}`}
            >
              <Link href={`/${platform.slug}`}>
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View Map
              </Link>
            </Button>

            {renderJoinButton()}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join {platform.name}</DialogTitle>
            <DialogDescription>
              Submit a request to join this platform. Platform administrators will review your request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`join-message-${platform.id}`}>Message (optional)</Label>
              <Textarea
                id={`join-message-${platform.id}`}
                placeholder="Tell the platform administrators why you'd like to join..."
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                rows={3}
                maxLength={500}
                data-testid={`textarea-join-message-${platform.id}`}
              />
              <p className="text-xs text-muted-foreground">{joinMessage.length}/500 characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowJoinDialog(false)}
              disabled={joinMutation.isPending}
              data-testid={`button-cancel-join-${platform.id}`}
            >
              Cancel
            </Button>
            <Button
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              data-testid={`button-submit-join-${platform.id}`}
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Submit Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlatformCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start gap-4">
        <Skeleton className="h-16 w-16 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex items-center gap-4 pt-2 border-t">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Platforms() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: platforms, isLoading, error } = useQuery<PublicPlatform[]>({
    queryKey: ["/api/platforms"],
  });

  const filteredPlatforms = useMemo(() => {
    if (!platforms) return [];
    if (!searchTerm.trim()) return platforms;

    const searchLower = searchTerm.toLowerCase();
    return platforms.filter(platform =>
      platform.name.toLowerCase().includes(searchLower) ||
      platform.description?.toLowerCase().includes(searchLower) ||
      platform.boundary_names.some(bn => bn.toLowerCase().includes(searchLower))
    );
  }, [platforms, searchTerm]);

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
            <Link href="/">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Discover Platforms</h1>
            <p className="text-sm text-muted-foreground">
              Find and join city platform networks in your area
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search platforms by name or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          {platforms && (
            <p className="text-sm text-muted-foreground mt-3" data-testid="text-results-count">
              {filteredPlatforms.length === platforms.length
                ? `${platforms.length} platform${platforms.length !== 1 ? 's' : ''} available`
                : `Showing ${filteredPlatforms.length} of ${platforms.length} platforms`
              }
            </p>
          )}
        </div>

        {error ? (
          <Card className="p-8 text-center">
            <div className="text-muted-foreground mb-4">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">Failed to load platforms</h3>
              <p>There was an error loading the platforms. Please try again later.</p>
            </div>
          </Card>
        ) : isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <PlatformCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredPlatforms.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-muted-foreground mb-4">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {searchTerm ? "No platforms found" : "No platforms available"}
              </h3>
              <p>
                {searchTerm 
                  ? "Try adjusting your search terms or clearing the filter."
                  : "There are no public platforms available at this time."
                }
              </p>
            </div>
            {searchTerm && (
              <Button 
                variant="outline" 
                onClick={() => setSearchTerm("")}
                data-testid="button-clear-search"
              >
                Clear search
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPlatforms.map((platform) => (
              <PlatformCard key={platform.id} platform={platform} />
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Card className="p-6 bg-muted/30 border-dashed">
            <h3 className="text-lg font-medium mb-2">Want to start a platform in your city?</h3>
            <p className="text-muted-foreground mb-4">
              Apply to become a platform owner and help connect churches in your area.
            </p>
            <Button asChild data-testid="button-apply-new">
              <Link href="/apply-for-platform">
                <UserPlus className="h-4 w-4 mr-2" />
                Apply to Start a Platform
              </Link>
            </Button>
          </Card>
        </div>
      </main>
    </div>
  );
}
