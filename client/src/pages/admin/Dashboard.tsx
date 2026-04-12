import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Building2, Users, Heart, MessageSquare, Link2, Globe, FileText, Activity, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DashboardStats {
  pendingChurchClaims: number;
  pendingMemberApprovals: number;
  pendingPrayers: number;
  recentPostsCount: number;
  totalChurches: number;
  platformLinkedChurches: number;
  pendingPlatformApplications: number;
  totalPlatformMembers: number;
  activePlatforms: number;
}

export default function AdminDashboard() {
  const { data: stats, isLoading, isError, refetch } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard/stats"],
  });
  const { buildPlatformUrl } = usePlatformNavigation();

  // Platform overview stats - primary metrics
  const platformStats = [
    {
      title: "Total Churches",
      description: "All churches in the system",
      value: stats?.totalChurches ?? 0,
      icon: Building2,
      href: buildPlatformUrl("/admin/churches"),
      color: "text-blue-600",
    },
    {
      title: "Platform-Linked Churches",
      description: "Churches connected to platforms",
      value: stats?.platformLinkedChurches ?? 0,
      icon: Link2,
      href: buildPlatformUrl("/admin/city-platforms"),
      color: "text-indigo-600",
    },
    {
      title: "Active Platforms",
      description: "Live city platforms",
      value: stats?.activePlatforms ?? 0,
      icon: Globe,
      href: buildPlatformUrl("/admin/city-platforms"),
      color: "text-teal-600",
    },
    {
      title: "Platform Members",
      description: "Total members across all platforms",
      value: stats?.totalPlatformMembers ?? 0,
      icon: Users,
      href: buildPlatformUrl("/admin/users"),
      color: "text-cyan-600",
    },
  ];

  // Pending action items
  const pendingStats = [
    {
      title: "Pending Church Claims",
      description: "Profile submissions awaiting review",
      value: stats?.pendingChurchClaims ?? 0,
      icon: Building2,
      href: buildPlatformUrl("/admin/church-claims"),
      color: "text-orange-600",
    },
    {
      title: "Pending Applications",
      description: "Platform applications awaiting review",
      value: stats?.pendingPlatformApplications ?? 0,
      icon: FileText,
      href: buildPlatformUrl("/admin/platform-applications"),
      color: "text-amber-600",
    },
    {
      title: "Pending Member Approvals",
      description: "Membership requests awaiting approval",
      value: stats?.pendingMemberApprovals ?? 0,
      icon: Users,
      href: buildPlatformUrl("/admin/my-platforms"),
      color: "text-purple-600",
    },
    {
      title: "Pending Prayers",
      description: "Prayers awaiting moderation",
      value: stats?.pendingPrayers ?? 0,
      icon: Heart,
      href: buildPlatformUrl("/admin/prayer?status=pending"),
      color: "text-red-600",
    },
  ];

  // Activity stats
  const activityStats = [
    {
      title: "Recent Community Posts",
      description: "Posts from the last 7 days",
      value: stats?.recentPostsCount ?? 0,
      icon: MessageSquare,
      href: buildPlatformUrl("/admin/community"),
      color: "text-green-600",
    },
  ];

  const renderStatCard = (card: typeof platformStats[0]) => {
    const Icon = card.icon;
    return (
      <Link 
        key={card.title} 
        href={card.href}
        data-testid={`card-stat-${card.title.toLowerCase().replace(/\s+/g, '-')}`}
        className="block"
      >
        <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {card.title}
            </CardTitle>
            <Icon className={`h-4 w-4 ${card.color} shrink-0`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : isError ? (
              <div className="text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Failed to load
              </div>
            ) : (
              <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {card.description}
            </p>
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Platform overview and pending items
          </p>
        </div>

        {isError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Failed to load dashboard stats. The server may be restarting.</span>
              <button
                onClick={() => refetch()}
                className="ml-4 text-sm underline hover:no-underline"
              >
                Retry
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Platform Overview Stats */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            Platform Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {platformStats.map(renderStatCard)}
          </div>
        </div>

        {/* Pending Actions */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Pending Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {pendingStats.map(renderStatCard)}
          </div>
        </div>

        {/* Activity & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                Recent Activity
              </CardTitle>
              <CardDescription>Community engagement metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={buildPlatformUrl("/admin/community")} className="block" data-testid="link-community-posts">
                <div className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors">
                  <div>
                    <div className="font-medium">Community Posts</div>
                    <div className="text-sm text-muted-foreground">Last 7 days</div>
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : isError ? (
                    <div className="text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="text-2xl font-bold text-green-600">
                      {stats?.recentPostsCount ?? 0}
                    </div>
                  )}
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common administrative tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={buildPlatformUrl("/admin/churches")} className="block p-3 rounded-md hover:bg-muted transition-colors" data-testid="link-manage-churches">
                <div className="font-medium">Manage Churches</div>
                <div className="text-sm text-muted-foreground">
                  Approve churches, assign labels, manage profiles
                </div>
              </Link>
              <Link href={buildPlatformUrl("/admin/city-platforms")} className="block p-3 rounded-md hover:bg-muted transition-colors" data-testid="link-manage-platforms">
                <div className="font-medium">Manage Platforms</div>
                <div className="text-sm text-muted-foreground">
                  Configure city platforms and boundaries
                </div>
              </Link>
              <Link href={buildPlatformUrl("/admin/platform-applications")} className="block p-3 rounded-md hover:bg-muted transition-colors" data-testid="link-review-applications">
                <div className="font-medium">Review Applications</div>
                <div className="text-sm text-muted-foreground">
                  Process platform applications
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>Platform health and metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm text-muted-foreground">All Systems</span>
                  <span className="text-sm font-medium text-green-600">Operational</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm text-muted-foreground">Last Updated</span>
                  <span className="text-sm font-medium">{new Date().toLocaleTimeString()}</span>
                </div>
                <div className="pt-2 border-t">
                  <Link href={buildPlatformUrl("/admin/prayer")} className="block p-2 rounded-md hover:bg-muted transition-colors" data-testid="link-moderate-prayer">
                    <div className="text-sm font-medium">Moderate Prayer</div>
                  </Link>
                  <Link href={buildPlatformUrl("/admin/community")} className="block p-2 rounded-md hover:bg-muted transition-colors" data-testid="link-moderate-community">
                    <div className="text-sm font-medium">Moderate Community</div>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
