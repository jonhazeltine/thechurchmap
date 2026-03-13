import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { MapPin, ExternalLink, Phone, Globe, Pencil } from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";

interface ChurchSummary {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  profile_photo_url: string | null;
  location: {
    type: "Point";
    coordinates: [number, number];
  } | null;
}

export default function MyChurches() {
  const { churchAdminChurchIds } = useAdminAccess();
  const { buildPlatformUrl } = usePlatformNavigation();

  const { data: churches = [], isLoading } = useQuery<ChurchSummary[]>({
    queryKey: ["/api/admin/my-churches", churchAdminChurchIds],
    queryFn: async () => {
      if (churchAdminChurchIds.length === 0) return [];
      
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch("/api/admin/my-churches", {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch churches");
      }
      
      return response.json();
    },
    enabled: churchAdminChurchIds.length > 0,
  });

  const formatAddress = (church: ChurchSummary) => {
    const parts = [church.address, church.city, church.state, church.zip].filter(Boolean);
    return parts.join(", ") || "No address";
  };

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-my-churches-title">My Churches</h1>
          <p className="text-muted-foreground">
            Manage the churches you are an administrator for
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : churches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Churches Found</h3>
              <p className="text-muted-foreground max-w-md">
                You are not currently an administrator of any churches. Claim a church from the map to become its administrator.
              </p>
              <Button asChild className="mt-4">
                <Link href={buildPlatformUrl("/")} data-testid="link-explore-map">
                  Explore Map
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {churches.map((church) => (
              <Card key={church.id} className="hover-elevate" data-testid={`card-church-${church.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {church.profile_photo_url ? (
                      <img
                        src={church.profile_photo_url}
                        alt={church.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                        <MapPin className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate" data-testid={`text-church-name-${church.id}`}>
                        {church.name}
                      </CardTitle>
                      <CardDescription className="text-xs truncate">
                        {formatAddress(church)}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {church.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="truncate">{church.phone}</span>
                    </div>
                  )}
                  {church.website && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Globe className="h-3.5 w-3.5" />
                      <a 
                        href={church.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="truncate hover:underline"
                      >
                        {church.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  )}
                  
                  <div className="flex gap-2 pt-2">
                    <Button asChild variant="default" size="sm" className="flex-1">
                      <Link 
                        href={buildPlatformUrl(`/?church=${church.id}`)}
                        data-testid={`link-edit-church-${church.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit Church
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link 
                        href={buildPlatformUrl(`/church/${church.id}`)}
                        data-testid={`link-view-church-${church.id}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
