import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { 
  Building, 
  MapPin, 
  ExternalLink, 
  Loader2,
  Globe,
} from "lucide-react";

export default function MyPlatforms() {
  const { loading: authLoading } = useAuth();
  const { userPlatforms, isSuperAdmin, isLoading } = useAdminAccess();
  const { buildPlatformUrl } = usePlatformNavigation();

  if (authLoading || isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (isSuperAdmin) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold" data-testid="text-page-title">My Platforms</h1>
            <p className="text-muted-foreground mt-2">
              As a Super Admin, you have access to all platforms.
            </p>
          </div>
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Super Admin Access</h3>
                <p className="text-muted-foreground mb-4">
                  You can manage all platforms from the City Platforms page.
                </p>
                <Button asChild>
                  <Link href={buildPlatformUrl("/admin/city-platforms")}>
                    View All Platforms
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  if (!userPlatforms || userPlatforms.length === 0) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold" data-testid="text-page-title">My Platforms</h1>
            <p className="text-muted-foreground mt-2">
              Platforms you have access to manage
            </p>
          </div>
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Platforms Yet</h3>
                <p className="text-muted-foreground">
                  You haven't been assigned to any city platforms yet.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">My Platforms</h1>
          <p className="text-muted-foreground mt-2">
            Platforms you have access to manage
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {userPlatforms.map((platform) => (
            <Card 
              key={platform.platform_id} 
              className="hover-elevate"
              data-testid={`card-platform-${platform.platform_id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{platform.platform_name}</CardTitle>
                    <CardDescription>/{platform.platform_slug}</CardDescription>
                  </div>
                  <Badge 
                    variant={platform.is_active ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {platform.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {platform.role === 'platform_owner' ? 'Owner' : 'Admin'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild className="flex-1">
                      <Link href={`/admin/platform/${platform.platform_id}`}>
                        <Building className="h-4 w-4 mr-2" />
                        Manage
                      </Link>
                    </Button>
                    <Button variant="outline" size="icon" asChild>
                      <Link href={`/p/${platform.platform_slug}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
