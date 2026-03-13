import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { PlatformSwitcher } from "@/components/PlatformSwitcher";
import { Badge } from "@/components/ui/badge";
import { supabase } from "../../../lib/supabaseClient";
import {
  LayoutDashboard,
  Church,
  Users,
  Heart,
  MessageSquare,
  Tags,
  Loader2,
  PanelLeftClose,
  PanelRight,
  ArrowLeft,
  EyeOff,
  Settings,
  Globe,
  FileEdit,
  Database,
  BarChart3,
  Menu,
  Shield,
  FileText,
  Building,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Header } from "@/components/Header";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading: authLoading } = useAuth();
  const { isPlatformAdmin, isSuperAdmin, isAnyAdmin, isLoading, churchAdminChurchIds } = useAdminAccess();
  const { platform, platformId } = usePlatformContext();
  
  // Church-only admin: has church admin access but not platform/super admin
  const isChurchAdminOnly = !isSuperAdmin && !isPlatformAdmin && churchAdminChurchIds.length > 0;
  const [location, setLocation] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false); // Expanded by default on desktop
  const [mobileOpen, setMobileOpen] = useState(false);
  const { buildPlatformUrl } = usePlatformNavigation();

  // Fetch pending church claims count
  const { data: claimsData } = useQuery<{ counts: { pending: number } }>({
    queryKey: [`/api/admin/city-platforms/${platformId}/church-claims`],
    queryFn: async () => {
      if (!platformId) return { counts: { pending: 0 } };
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(`/api/admin/city-platforms/${platformId}/church-claims?status=pending`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) return { counts: { pending: 0 } };
      return response.json();
    },
    enabled: !!platformId && isAnyAdmin,
    staleTime: 60 * 1000,
  });
  const pendingClaimsCount = claimsData?.counts?.pending || 0;
  
  const handleNavClick = () => {
    setIsCollapsed(true);
    setMobileOpen(false);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (!isLoading && !isAnyAdmin && user) {
      setLocation("/");
    }
  }, [isAnyAdmin, isLoading, user, setLocation]);

  // Redirect church-admin-only users to MyChurches if they're on dashboard or other platform pages
  useEffect(() => {
    if (!isLoading && isChurchAdminOnly && user) {
      // Redirect from dashboard or platform pages to my-churches
      if (location === "/admin/dashboard" || location.startsWith("/admin/platform/")) {
        setLocation("/admin/my-churches");
      }
    }
  }, [isLoading, isChurchAdminOnly, user, location, setLocation]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!isAnyAdmin) {
    return null;
  }

  const hasPlatformSelected = !!platformId && !!platform;

  const dashboardHref = hasPlatformSelected && platformId 
    ? `/admin/platform/${platformId}` 
    : "/admin/dashboard";

  const generalNavItems: { href: string; label: string; icon: any; show: boolean }[] = [];

  const platformSettingsHref = hasPlatformSelected && platformId 
    ? `/admin/platform/${platformId}/settings` 
    : "/admin/settings";

  // Church admin nav items - shown only to church-only admins
  const churchAdminNavItems = [
    { href: "/admin/my-churches", label: "My Churches", icon: Church, show: isChurchAdminOnly, badge: 0 },
  ];

  const platformNavItems = [
    { href: dashboardHref, label: "Dashboard", icon: LayoutDashboard, show: hasPlatformSelected && !isChurchAdminOnly, badge: 0 },
    { href: "/admin/churches", label: "Churches", icon: Church, show: isSuperAdmin || isPlatformAdmin, badge: pendingClaimsCount },
    { href: "/admin/profiles-pending", label: "Pending Profiles", icon: FileEdit, show: isSuperAdmin || isPlatformAdmin, badge: 0 },
    { href: "/admin/moderation", label: "Moderation", icon: Shield, show: isSuperAdmin || isPlatformAdmin, badge: 0 },
    { href: "/admin/prayer", label: "Prayer", icon: Heart, show: isSuperAdmin || isPlatformAdmin, badge: 0 },
    { href: "/admin/community", label: "Community", icon: MessageSquare, show: isSuperAdmin || isPlatformAdmin, badge: 0 },
    { href: platformSettingsHref, label: "Platform Settings", icon: Settings, show: hasPlatformSelected && (isSuperAdmin || isPlatformAdmin), badge: 0 },
  ];

  const superAdminNavItems = [
    { href: "/admin/dashboard", label: "System Overview", icon: BarChart3, show: isSuperAdmin },
    { href: "/admin/users", label: "Users", icon: Users, show: isSuperAdmin },
    { href: "/admin/city-platforms", label: "City Platforms", icon: Globe, show: isSuperAdmin },
    { href: "/admin/partnerships", label: "Partnerships", icon: FileText, show: isSuperAdmin || isPlatformAdmin },
    { href: "/admin/data-sources", label: "Data Sources", icon: Database, show: isSuperAdmin },
    { href: "/admin/callings", label: "Callings", icon: Tags, show: isSuperAdmin },
    { href: "/admin/collaboration", label: "Collaboration", icon: Tags, show: isSuperAdmin },
    { href: "/admin/internal-tags", label: "Internal Tags", icon: EyeOff, show: isSuperAdmin || isPlatformAdmin },
    { href: "/admin/settings", label: "Settings", icon: Settings, show: isSuperAdmin },
  ];

  const NavItem = ({ href, label, icon: Icon, isActive, isMobile = false, badge = 0 }: { href: string; label: string; icon: any; isActive: boolean; isMobile?: boolean; badge?: number }) => {
    const showLabel = isMobile || !isCollapsed;
    const linkContent = (
      <Link
        href={href}
        onClick={handleNavClick}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted",
          !isMobile && isCollapsed && "justify-center px-2"
        )}
        data-testid={`link-admin-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {showLabel && <span className="flex-1">{label}</span>}
        {showLabel && badge > 0 && (
          <Badge variant="secondary" className="ml-auto bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs px-1.5 py-0.5">
            {badge}
          </Badge>
        )}
        {!showLabel && badge > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
        )}
      </Link>
    );

    if (!isMobile && isCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right">
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Header - fixed at top */}
      <div className={cn("p-4 shrink-0", !isMobile && isCollapsed ? "flex justify-center" : "")}>
        {(isMobile || !isCollapsed) ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between w-full">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold truncate">Admin Panel</h2>
                <p className="text-sm text-muted-foreground">
                  {isSuperAdmin ? "Super Admin" : isPlatformAdmin ? "Platform Admin" : "Church Admin"}
                </p>
              </div>
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="shrink-0 ml-2"
                  data-testid="button-toggle-admin-sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </Button>
              )}
            </div>
            <PlatformSwitcher />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCollapsed(!isCollapsed)}
                data-testid="button-toggle-admin-sidebar"
              >
                <PanelRight className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Expand sidebar
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="h-px bg-border mx-2 shrink-0" />

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Back to App link */}
        <div className="px-2 pb-2">
          {!isMobile && isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={buildPlatformUrl("/")}
                  onClick={handleNavClick}
                  className="flex items-center justify-center px-2 py-2 rounded-md text-sm hover-elevate transition-colors"
                  data-testid="link-back-to-app"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                Back to App
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href={buildPlatformUrl("/")}
              onClick={handleNavClick}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover-elevate transition-colors"
              data-testid="link-back-to-app"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to App
            </Link>
          )}
        </div>

        {/* General nav items */}
        <nav className="space-y-1 px-2">
          {generalNavItems
            .filter((item) => item.show)
            .map((item) => {
              const isActive = location === item.href || location.startsWith(item.href + "/");
              return (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={isActive}
                  isMobile={isMobile}
                />
              );
            })}
        </nav>

        {/* Church Admin nav items - shown only to church-only admins */}
        {churchAdminNavItems.some(item => item.show) && (
          <>
            <div className={cn("py-3", !isMobile && isCollapsed ? "px-2" : "px-4")}>
              <div className="h-px bg-border" />
            </div>
            {(isMobile || !isCollapsed) && (
              <div className="px-4 pb-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  My Churches
                </p>
              </div>
            )}
            <nav className="space-y-1 px-2">
              {churchAdminNavItems
                .filter((item) => item.show)
                .map((item) => {
                  const isActive = location === item.href || location.startsWith(item.href + "/");
                  return (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isActive={isActive}
                      isMobile={isMobile}
                      badge={item.badge}
                    />
                  );
                })}
            </nav>
          </>
        )}

        {/* Platform nav items */}
        {platformNavItems.some(item => item.show) && (
          <>
            <div className={cn("py-3", !isMobile && isCollapsed ? "px-2" : "px-4")}>
              <div className="h-px bg-border" />
            </div>
            {(isMobile || !isCollapsed) && (
              <div className="px-4 pb-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Platform
                </p>
              </div>
            )}
            <nav className="space-y-1 px-2">
              {platformNavItems
                .filter((item) => item.show)
                .map((item) => {
                  // Dashboard should only match exactly (not sub-routes like /settings)
                  const isDashboard = item.label === "Dashboard";
                  const isActive = isDashboard 
                    ? location === item.href 
                    : location === item.href || location.startsWith(item.href + "/");
                  return (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isActive={isActive}
                      isMobile={isMobile}
                      badge={item.badge}
                    />
                  );
                })}
            </nav>
          </>
        )}

        {/* Super Admin nav items */}
        {isSuperAdmin && superAdminNavItems.some(item => item.show) && (
          <>
            <div className={cn("py-3", !isMobile && isCollapsed ? "px-2" : "px-4")}>
              <div className="h-px bg-border" />
            </div>
            {(isMobile || !isCollapsed) && (
              <div className="px-4 pb-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Super Admin
                </p>
              </div>
            )}
            <nav className="space-y-1 px-2">
              {superAdminNavItems
                .filter((item) => item.show)
                .map((item) => {
                  const isActive = location === item.href || location.startsWith(item.href + "/");
                  return (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isActive={isActive}
                      isMobile={isMobile}
                    />
                  );
                })}
            </nav>
          </>
        )}
      </div>

    </div>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className={cn(
        "border-r bg-muted/20 transition-all duration-300 flex-col sticky top-0 h-screen hidden md:flex",
        isCollapsed ? "w-16" : "w-64"
      )}>
        <SidebarContent />
      </aside>
      
      <div className="md:hidden sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SidebarContent isMobile />
          </SheetContent>
        </Sheet>
        <h1 className="text-lg font-semibold truncate">
          {hasPlatformSelected ? platform?.name : "Admin Panel"}
        </h1>
      </div>
      
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header on desktop */}
        <div className="hidden md:block">
          <Header />
        </div>
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
