import { Button } from "@/components/ui/button";
import { Plus, Users, LogOut, LogIn, User as UserIcon, Heart, Shield, ShieldCheck, Building2, Moon, Sun, BookOpen } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PlatformSwitcher } from "@/components/PlatformSwitcher";
import type { CityPlatform } from "@shared/schema";

import logoLight from "@assets/5_1764205464663.png";
import logoDark from "@assets/The Churches White on Black (Presentation)_1764205730044.png";

interface HeaderProps {
  onAddChurch?: () => void;
  showPrayerOverlay?: boolean;
  onTogglePrayerOverlay?: () => void;
  prayerModeActive?: boolean;
  platform?: CityPlatform | null;
}

export function Header({ onAddChurch, showPrayerOverlay, onTogglePrayerOverlay, prayerModeActive, platform }: HeaderProps) {
  const { user, signOut, session } = useAuth();
  const { isSuperAdmin, isAnyAdmin } = useAdminAccess();
  const { hasPlatformContext, platformId, platform: contextPlatform } = usePlatformContext();
  const { buildPlatformUrl, getMapUrl, getChurchUrl, getCommunityUrl } = usePlatformNavigation();
  const { setTheme, theme } = useTheme();
  const [location, setLocation] = useLocation();
  
  // Fetch user's church affiliation for "My Church" link
  const { data: onboardingStatus } = useQuery<{
    church_id: string | null;
    church: { id: string; name: string } | null;
  }>({
    queryKey: ['/api/onboarding/status'],
    enabled: !!user && !!session?.access_token,
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes
  });

  // Fetch pending counts for admin notification badge
  const { data: pendingCounts } = useQuery<{
    pendingChurchClaims: number;
    pendingMemberApprovals: number;
    pendingPrayers: number;
    pendingPlatformApplications: number;
    pendingComments: number;
  }>({
    queryKey: ["/api/admin/pending-counts"],
    enabled: isAnyAdmin,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const totalPending = pendingCounts
    ? pendingCounts.pendingChurchClaims +
      pendingCounts.pendingMemberApprovals +
      pendingCounts.pendingPrayers +
      pendingCounts.pendingPlatformApplications +
      pendingCounts.pendingComments
    : 0;
  
  // Determine if we're in National View (no platform selected)
  const isNationalView = !hasPlatformContext;
  
  console.log('🔧 Header render - isAnyAdmin:', isAnyAdmin, 'isSuperAdmin:', isSuperAdmin, 'user:', user?.email);
  
  // Handle "Add City Network" button click
  const handleAddCityNetwork = () => {
    if (!user) {
      // Redirect to login with return URL to the application page
      setLocation('/login?redirect=/apply-for-platform');
    } else {
      // User is logged in, go directly to application page
      setLocation('/apply-for-platform');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      // Session may already be gone - that's fine, still redirect
      console.log('SignOut completed (session may have been missing)');
    }
    // Always redirect to login after logout attempt
    window.location.href = '/login';
  };

  const getInitials = (email?: string) => {
    if (!email) return "U";
    return email.charAt(0).toUpperCase();
  };

  return (
    <header className={`sticky top-0 w-full max-w-full overflow-hidden transition-all duration-300 ${
      prayerModeActive 
        ? 'bg-transparent border-transparent z-[110] pointer-events-none' 
        : 'border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50'
    }`}>
      <div className="flex h-16 items-center px-2 sm:px-4 md:px-6 gap-2 sm:gap-4 w-full max-w-full">
        {/* Show Prayer Mode title in header during Prayer Mode - pointer-events-none to not block buttons */}
        {prayerModeActive && (
          <div className="flex-1 flex justify-center pointer-events-none absolute inset-0 z-[90]">
            <h2 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg flex items-center">
              Prayer Mode
            </h2>
          </div>
        )}
        
        {/* Hide logo during Prayer Mode */}
        {!prayerModeActive && (
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/about" data-testid="link-home">
              <div className="flex items-center justify-center h-16 hover-elevate px-2 sm:px-3 rounded-md -ml-2 sm:-ml-3 cursor-pointer shrink-0">
                <img 
                  src={logoLight} 
                  alt="The Churches" 
                  className="h-[32px] sm:h-[45px] w-auto dark:hidden" 
                />
                <img 
                  src={logoDark} 
                  alt="The Churches" 
                  className="h-[32px] sm:h-[45px] w-auto hidden dark:block" 
                />
              </div>
            </Link>
            
          </div>
        )}

        <div className="flex items-center gap-0.5 sm:gap-2 ml-auto shrink-0">
          {/* Hide nav buttons during Prayer Mode to avoid overlap with overlay controls */}
          {!prayerModeActive && (
            <>
              {/* Prayer dropdown — combines Prayer Mode + Prayer Journeys */}
              {hasPlatformContext && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={showPrayerOverlay ? "default" : "outline"}
                      size="icon"
                      className="sm:w-auto sm:px-4 gap-2"
                      data-testid="button-prayer-menu"
                    >
                      <Heart className="w-4 h-4" />
                      <span className="hidden sm:inline">Prayer</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onTogglePrayerOverlay && platform && (
                      <DropdownMenuItem onClick={onTogglePrayerOverlay} data-testid="button-toggle-prayers">
                        <Heart className="w-4 h-4 mr-2" />
                        {showPrayerOverlay ? "Exit Prayer Mode" : "Prayer Mode"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href={buildPlatformUrl('/journeys')} data-testid="button-journeys-nav">
                        <BookOpen className="w-4 h-4 mr-2" />
                        Prayer Journeys
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Show "Add Church" for guests, "Add/Claim Church" for logged-in users when viewing a platform, "Add City Network" in National View */}
              {isNationalView ? (
                <Button
                  onClick={handleAddCityNetwork}
                  size="icon"
                  className="sm:w-auto sm:px-4 gap-2"
                  data-testid="button-add-city-network"
                >
                  <Building2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Add City Network</span>
                </Button>
              ) : (
                onAddChurch && (
                  <Button
                    onClick={onAddChurch}
                    size="icon"
                    className="sm:w-auto sm:px-4 gap-2"
                    data-testid="button-add-claim-church"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">{user ? "Add/Claim Church" : "Add Church"}</span>
                  </Button>
                )
              )}

              <Link href={getCommunityUrl()}>
                <Button variant="ghost" className="px-3 gap-1.5 sm:px-4 sm:gap-2" data-testid="button-community-nav">
                  <Users className="w-4 h-4" />
                  <span className="text-xs sm:text-sm">Community</span>
                </Button>
              </Link>
            </>
          )}

          {/* Hide avatar/login during Prayer Mode */}
          {!prayerModeActive && (
            <>
              <div className="hidden sm:block">
                <PlatformSwitcher />
              </div>
              
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full relative" data-testid="button-user-menu">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
                      </Avatar>
                      {isAnyAdmin && totalPending > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                          {totalPending > 9 ? '9+' : totalPending}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium" data-testid="text-user-email">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {/* Admin pending actions */}
                    {isAnyAdmin && totalPending > 0 && (
                      <>
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                          <Bell className="h-3 w-3" />
                          Pending Actions
                        </DropdownMenuLabel>
                        {pendingCounts?.pendingChurchClaims ? (
                          <Link href={buildPlatformUrl("/admin/church-claims")}>
                            <DropdownMenuItem data-testid="link-pending-claims">
                              <span>Church Claims</span>
                              <Badge variant="secondary" className="ml-auto text-xs">{pendingCounts.pendingChurchClaims}</Badge>
                            </DropdownMenuItem>
                          </Link>
                        ) : null}
                        {pendingCounts?.pendingMemberApprovals ? (
                          <Link href={buildPlatformUrl("/admin/my-platforms")}>
                            <DropdownMenuItem data-testid="link-pending-members">
                              <span>Member Approvals</span>
                              <Badge variant="secondary" className="ml-auto text-xs">{pendingCounts.pendingMemberApprovals}</Badge>
                            </DropdownMenuItem>
                          </Link>
                        ) : null}
                        {pendingCounts?.pendingPlatformApplications ? (
                          <Link href={buildPlatformUrl("/admin/platform-applications")}>
                            <DropdownMenuItem data-testid="link-pending-platforms">
                              <span>Platform Applications</span>
                              <Badge variant="secondary" className="ml-auto text-xs">{pendingCounts.pendingPlatformApplications}</Badge>
                            </DropdownMenuItem>
                          </Link>
                        ) : null}
                        {pendingCounts?.pendingPrayers ? (
                          <Link href={buildPlatformUrl("/admin/prayer?status=pending")}>
                            <DropdownMenuItem data-testid="link-pending-prayers">
                              <span>Prayers to Review</span>
                              <Badge variant="secondary" className="ml-auto text-xs">{pendingCounts.pendingPrayers}</Badge>
                            </DropdownMenuItem>
                          </Link>
                        ) : null}
                        {pendingCounts?.pendingComments ? (
                          <Link href={buildPlatformUrl("/admin/moderation")}>
                            <DropdownMenuItem data-testid="link-pending-comments">
                              <span>Comments to Review</span>
                              <Badge variant="secondary" className="ml-auto text-xs">{pendingCounts.pendingComments}</Badge>
                            </DropdownMenuItem>
                          </Link>
                        ) : null}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <Link href={buildPlatformUrl("/profile")}>
                      <DropdownMenuItem data-testid="link-profile">
                        <UserIcon className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </DropdownMenuItem>
                    </Link>
                    {onboardingStatus?.church && (
                      <Link href={getChurchUrl(onboardingStatus.church.id)}>
                        <DropdownMenuItem data-testid="link-my-church">
                          <IconBuildingChurch className="mr-2 h-4 w-4" />
                          <span>My Church</span>
                        </DropdownMenuItem>
                      </Link>
                    )}
                    <DropdownMenuSeparator />
                    {isAnyAdmin && (
                      <>
                        {contextPlatform?.id && (
                          <Link href={`/admin/platform/${contextPlatform.id}`}>
                            <DropdownMenuItem data-testid="link-admin-panel">
                              <Shield className="mr-2 h-4 w-4" />
                              <span>Admin Panel</span>
                            </DropdownMenuItem>
                          </Link>
                        )}
                        {isSuperAdmin && (
                          <Link href="/admin/dashboard">
                            <DropdownMenuItem data-testid="link-super-admin-panel">
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              <span>Super Admin Panel</span>
                            </DropdownMenuItem>
                          </Link>
                        )}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem 
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")} 
                      data-testid="button-theme-toggle"
                    >
                      {theme === "dark" ? (
                        <Sun className="mr-2 h-4 w-4" />
                      ) : (
                        <Moon className="mr-2 h-4 w-4" />
                      )}
                      <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} data-testid="button-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-guest-menu">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-muted">
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-muted-foreground font-normal">
                      Not signed in
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <Link href="/login">
                      <DropdownMenuItem data-testid="link-login-dropdown">
                        <LogIn className="mr-2 h-4 w-4" />
                        <span>Log In</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/signup">
                      <DropdownMenuItem data-testid="link-signup-dropdown">
                        <UserIcon className="mr-2 h-4 w-4" />
                        <span>Sign Up</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")} 
                      data-testid="button-theme-toggle-guest"
                    >
                      {theme === "dark" ? (
                        <Sun className="mr-2 h-4 w-4" />
                      ) : (
                        <Moon className="mr-2 h-4 w-4" />
                      )}
                      <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
