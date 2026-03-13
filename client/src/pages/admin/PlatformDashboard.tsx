import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformAccess } from "@/hooks/useAdminAccess";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Church, 
  Users, 
  Heart, 
  MessageSquare, 
  MapPin, 
  Settings,
  ArrowLeft,
  ExternalLink,
  Loader2,
  ClipboardCheck,
  UserPlus,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { CityPlatform, Boundary } from "@shared/schema";
import { GettingStartedWizard } from "@/components/GettingStartedWizard";

interface PlatformDashboardData {
  platform: CityPlatform & {
    primary_boundary?: Pick<Boundary, 'id' | 'name' | 'type'> | null;
  };
  stats: {
    church_count: number;
    pending_church_count: number;
    boundary_count: number;
    member_count: number;
    owner_count: number;
    prayer_count: number;
    post_count: number;
  };
}

export default function PlatformDashboard() {
  const [, params] = useRoute("/admin/platform/:id");
  const platformId = params?.id;
  const { loading: authLoading } = useAuth();
  const { hasAccess, role, isSuperAdmin, isLoading: accessLoading } = usePlatformAccess(platformId);
  const { buildPlatformUrl } = usePlatformNavigation();

  const { data, isLoading } = useQuery<PlatformDashboardData>({
    queryKey: [`/api/admin/city-platforms/${platformId}/dashboard`],
    enabled: !!platformId && (hasAccess || isSuperAdmin) && !accessLoading,
  });

  if (authLoading || accessLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!hasAccess && !isSuperAdmin) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              You don't have permission to access this platform.
            </p>
            <Button asChild variant="outline">
              <Link href={buildPlatformUrl("/admin/my-platforms")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Platforms
              </Link>
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const platform = data?.platform;
  const stats = data?.stats;

  const statCards = [
    {
      title: "Churches",
      description: "Churches in this platform",
      value: stats?.church_count ?? 0,
      icon: Church,
      href: buildPlatformUrl("/admin/churches"),
      color: "text-blue-600",
    },
    {
      title: "Boundaries",
      description: "Geographic boundaries",
      value: stats?.boundary_count ?? 0,
      icon: MapPin,
      href: buildPlatformUrl(`/admin/city-platforms/${platformId}/boundaries`),
      color: "text-green-600",
    },
    {
      title: "Members",
      description: "Platform members",
      value: stats?.member_count ?? 0,
      icon: Users,
      href: buildPlatformUrl(`/admin/platform/${platformId}/members`),
      color: "text-purple-600",
    },
    {
      title: "Prayers",
      description: "Prayer requests",
      value: stats?.prayer_count ?? 0,
      icon: Heart,
      href: buildPlatformUrl(`/admin/platform/${platformId}/prayers`),
      color: "text-red-600",
    },
  ];

  return (
    <AdminLayout>
      <div className="p-4 sm:p-8">
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href={buildPlatformUrl(isSuperAdmin ? "/admin/city-platforms" : "/admin/my-platforms")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {isSuperAdmin ? "All Platforms" : "My Platforms"}
            </Link>
          </Button>
        </div>

        <GettingStartedWizard />

        <div className="mb-8">
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-5 w-48" />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold truncate" data-testid="text-platform-name">
                    Dashboard
                  </h1>
                  <Badge variant={platform?.is_active ? "default" : "secondary"} className="shrink-0">
                    {platform?.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {(role === 'platform_owner' || isSuperAdmin) && (
                  <Button variant="outline" size="sm" asChild className="shrink-0">
                    <Link href={buildPlatformUrl(`/admin/platform/${platformId}/settings`)}>
                      <Settings className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Settings</span>
                    </Link>
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {platform?.description || "Manage your city platform"}
              </p>
              {role && (
                <Badge variant="secondary" className="mt-2">
                  Your Role: {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Badge>
              )}
            </>
          )}
        </div>

        {stats && stats.pending_church_count > 0 && (
          <Link href={buildPlatformUrl("/admin/churches")}>
            <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 hover-elevate cursor-pointer" data-testid="card-pending-approvals">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/50">
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      Pending Approvals
                      <Badge variant="secondary" className="bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                        {stats.pending_church_count}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-amber-700 dark:text-amber-300">
                      {stats.pending_church_count === 1 
                        ? "1 new church submission is waiting for your review"
                        : `${stats.pending_church_count} new church submissions are waiting for your review`
                      }
                    </CardDescription>
                  </div>
                  <Button size="sm" className="shrink-0">
                    Review Now
                  </Button>
                </div>
              </CardHeader>
            </Card>
          </Link>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.title} href={card.href}>
                <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-stat-${card.title.toLowerCase()}`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                    <CardTitle className="text-sm font-medium">
                      {card.title}
                    </CardTitle>
                    <Icon className={`h-4 w-4 ${card.color} shrink-0`} />
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      <div className="text-2xl font-bold">{card.value}</div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {card.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common platform management tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={buildPlatformUrl("/admin/churches")}>
                <div className="block p-3 rounded-md hover-elevate transition-colors cursor-pointer" data-testid="link-manage-churches">
                  <div className="font-medium">Manage Churches</div>
                  <div className="text-sm text-muted-foreground">
                    Add, remove, or manage churches in this platform
                  </div>
                </div>
              </Link>
              <Link href={buildPlatformUrl(`/admin/city-platforms/${platformId}/boundaries`)}>
                <div className="block p-3 rounded-md hover-elevate transition-colors cursor-pointer" data-testid="link-manage-boundaries">
                  <div className="font-medium">Manage Boundaries</div>
                  <div className="text-sm text-muted-foreground">
                    Configure geographic boundaries
                  </div>
                </div>
              </Link>
              <Link href={buildPlatformUrl(`/admin/platform/${platformId}/members`)}>
                <div className="block p-3 rounded-md hover-elevate transition-colors cursor-pointer" data-testid="link-manage-members">
                  <div className="font-medium">Manage Members</div>
                  <div className="text-sm text-muted-foreground">
                    Invite and manage platform users
                  </div>
                </div>
              </Link>
              <Link href={buildPlatformUrl(`/admin/city-platforms/${platformId}/church-claims`)}>
                <div className="block p-3 rounded-md hover-elevate transition-colors cursor-pointer" data-testid="link-review-claims">
                  <div className="flex items-center gap-2 font-medium">
                    <ClipboardCheck className="h-4 w-4 text-orange-500" />
                    Review Church Claims
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Approve or reject church ownership requests
                  </div>
                </div>
              </Link>
              <Link href={buildPlatformUrl(`/admin/platform/${platformId}/membership-requests`)}>
                <div className="block p-3 rounded-md hover-elevate transition-colors cursor-pointer" data-testid="link-membership-requests">
                  <div className="flex items-center gap-2 font-medium">
                    <UserPlus className="h-4 w-4 text-green-500" />
                    Membership Requests
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Review and approve platform join requests
                  </div>
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform Details</CardTitle>
              <CardDescription>Information about this platform</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Slug</span>
                    <span className="text-sm font-medium">/{platform?.slug}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Primary Boundary</span>
                    <span className="text-sm font-medium">
                      {platform?.primary_boundary?.name || "Not set"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Default Zoom</span>
                    <span className="text-sm font-medium">{platform?.default_zoom || 11}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Platform Owners</span>
                    <span className="text-sm font-medium">{stats?.owner_count || 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
