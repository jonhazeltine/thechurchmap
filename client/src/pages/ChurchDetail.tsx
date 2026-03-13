import { useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { ChurchCard } from "@/components/ChurchCard";
import { ChurchCallingsEditor } from "@/components/ChurchCallingsEditor";
import { ChurchCollaborationEditor } from "@/components/ChurchCollaborationEditor";
import { ChurchCollaborationsSection } from "@/components/ChurchCollaborationsSection";
import { ChurchBoundaryManager } from "@/components/ChurchBoundaryManager";
import { ChurchTeam } from "@/components/ChurchTeam";
import { PrayerRequestForm } from "@/components/PrayerRequestForm";
import { ChurchPrayersDisplay } from "@/components/ChurchPrayersDisplay";
import { FormationPrayerExchange } from "@/components/FormationPrayerExchange";
import { ChurchPostsFeed } from "@/components/ChurchPostsFeed";
import { AreaIntelligenceSection } from "@/components/AreaIntelligenceSection";
import { ClaimChurchButton } from "@/components/ClaimChurchButton";
import { FacilityCard } from "@/components/FacilityCard";
import { PrayerBudgetWizard } from "@/components/PrayerBudgetWizard";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { type ChurchWithCallings } from "@shared/schema";
import { ChevronLeft, Heart, HandHeart, Eye, Clock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";

interface PendingClaimStatus {
  hasPendingClaim: boolean;
}

export default function ChurchDetail() {
  // Match both national route (/church/:id) and platform-scoped route (/:platform/church/:id)
  const [matchNational, paramsNational] = useRoute("/church/:id");
  const [matchPlatform, paramsPlatform] = useRoute("/:platform/church/:id");
  const [, setLocation] = useLocation();
  const churchId = paramsNational?.id || paramsPlatform?.id;
  const { getMapUrl } = usePlatformNavigation();
  const { platformId, setPlatformId } = usePlatformContext();
  const { user, session } = useAuth();
  const { isSuperAdmin, isPlatformAdmin, churchAdminChurchIds } = useAdminAccess();
  
  // Check if user is any church admin (for FacilityCard visibility)
  const isAnyChurchAdmin = isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.length > 0;

  // Prayer budget wizard state
  const [budgetWizardOpen, setBudgetWizardOpen] = useState(false);

  // Navigate to map with health metric hotspot view
  const handleViewHotspot = useCallback((metricKey: string) => {
    if (churchId) {
      setLocation(getMapUrl({ church: churchId, metric: metricKey }));
    }
  }, [churchId, getMapUrl, setLocation]);

  const { data: church, isLoading } = useQuery<ChurchWithCallings & { platform?: { id: string; name: string; slug: string } | null }>({
    queryKey: ["/api/churches", churchId],
    queryFn: () => fetch(`/api/churches/${churchId}`).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
    enabled: !!churchId,
  });

  // Check if current user has a pending claim for this church
  const { data: pendingClaimStatus } = useQuery<PendingClaimStatus>({
    queryKey: ["/api/churches", churchId, "pending-claim-status"],
    queryFn: async () => {
      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/churches/${churchId}/pending-claim-status`, { headers });
      if (!res.ok) return { hasPendingClaim: false };
      return res.json();
    },
    enabled: !!churchId && !!user && !!session?.access_token,
  });

  const hasPendingClaim = pendingClaimStatus?.hasPendingClaim ?? false;

  // Auto-set platform context when viewing a church that belongs to a platform
  // This ensures "Back to Map", "View on Map", etc. navigate to the correct platform
  useEffect(() => {
    if (church?.platform && church.platform.id !== platformId) {
      setPlatformId(church.platform.id, church.platform.slug);
    }
  }, [church?.platform, platformId, setPlatformId]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!church) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">Church not found</h1>
            <p className="text-muted-foreground mb-6">
              The church you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild>
              <Link href={getMapUrl()}>Return Home</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Button variant="ghost" asChild data-testid="button-back">
            <Link href={getMapUrl({ church: church.id })}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Map
            </Link>
          </Button>
          
          <Button variant="outline" asChild data-testid="button-open-prayer-mode">
            <Link href={getMapUrl({ church: church.id, prayerMode: true })}>
              <Heart className="w-4 h-4 mr-2" />
              Open in Prayer Mode
            </Link>
          </Button>
          
          <span className="sparkle-border inline-block rounded-md">
            <Button variant="outline" asChild data-testid="button-fund-mission">
              <Link href={(church as any).partnership_status === 'active' 
                ? `/churches/${church.id}/mission-funding` 
                : `/church/${church.id}/fund-the-mission`}>
                <HandHeart className="w-4 h-4 mr-2" />
                {(church as any).partnership_status === 'active' ? 'Get Mission Funding' : 'Unlock Mission Funding'}
              </Link>
            </Button>
          </span>
        </div>

        {/* Pending claim banner */}
        {hasPendingClaim && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20" data-testid="alert-pending-claim">
            <Eye className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <span className="font-medium">Only you can see this profile</span> until your church claim is approved. 
              Your callings, offers, and needs are saved but not visible to others yet.
              <span className="flex items-center gap-1 mt-1 text-sm text-amber-600 dark:text-amber-400">
                <Clock className="h-3 w-3" />
                Claim pending review
              </span>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          <ChurchCard church={church} variant="full" />
          
          {/* Area Intelligence - Mission insights for this church's area */}
          <AreaIntelligenceSection churchId={church.id} onViewHotspot={handleViewHotspot} />
          
          {/* Editors for church admins */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChurchCallingsEditor 
              church={church}
              onOpenBudgetWizard={() => setBudgetWizardOpen(true)}
              onViewPrayerCoverage={() => {
                if (churchId) {
                  setLocation(getMapUrl({ church: churchId }));
                }
              }}
              onEnterAllocationMode={() => {
                if (churchId) {
                  setLocation(getMapUrl({ church: churchId, allocate: true }));
                }
              }}
            />
            <ChurchCollaborationEditor church={church} />
          </div>
          
          {/* Enhanced Collaboration Section with ranked opportunities */}
          <ChurchCollaborationsSection
            churchId={church.id}
            churchName={church.name}
            hasMinistryArea={!!church.primary_ministry_area || (church.boundaries?.some(b => (b as any).is_primary) ?? false)}
            collaborationHave={church.collaboration_have || []}
            collaborationNeed={church.collaboration_need || []}
          />

          {/* Facility Information - Any Church Admin */}
          <FacilityCard 
            churchId={church.id} 
            isVisible={isAnyChurchAdmin}
            canEdit={isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.includes(church.id)}
          />

          {/* Prayer Request Form */}
          <PrayerRequestForm churchId={church.id} churchName={church.name} />
          
          {/* Prayer Requests Display */}
          <ChurchPrayersDisplay churchId={church.id} />

          {/* Formation Prayer Exchange */}
          <FormationPrayerExchange 
            churchId={church.id} 
            formationChurchId={church.formation_church_id}
            hasFormationApiKey={!!church.formation_api_key}
            canEdit={isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.includes(church.id)}
          />
          
          {/* Community Posts */}
          <ChurchPostsFeed churchId={church.id} churchName={church.name} />

          {/* Church Team */}
          <ChurchTeam churchId={church.id} />

          {/* Boundary management */}
          <ChurchBoundaryManager church={church} />

          {/* Prayer Budget Wizard */}
          {churchId && (
            <PrayerBudgetWizard
              open={budgetWizardOpen}
              onOpenChange={setBudgetWizardOpen}
              churchId={churchId}
              churchName={church.name}
              onComplete={() => {
                setBudgetWizardOpen(false);
                if (churchId) {
                  setLocation(getMapUrl({ church: churchId, allocate: true }));
                }
              }}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
