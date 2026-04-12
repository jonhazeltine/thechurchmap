import { Switch, Route, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { PlatformProvider } from "@/contexts/PlatformContext";
import { usePrefetchPlatformPins } from "@/hooks/usePrefetchPlatformPins";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/ErrorBoundary";
import Home from "@/pages/Home";
import ChurchDetail from "@/pages/ChurchDetail";
import MinistryAreaDetail from "@/pages/MinistryAreaDetail";
import Community from "@/pages/community";
import CommunityPost from "@/pages/community-post";
import CommunityNew from "@/pages/community-new";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import AuthCallback from "@/pages/auth-callback";
import Onboarding from "@/pages/Onboarding";
import UserProfile from "@/pages/profile";
import ApplyForPlatform from "@/pages/ApplyForPlatform";
import Platforms from "@/pages/Platforms";
import PlatformDetail from "@/pages/PlatformDetail";
import Explore from "@/pages/Explore";
import NotFound from "@/pages/not-found";
import About from "@/pages/About";
import FacilitySharing from "@/pages/FacilitySharing";
import Methodology from "@/pages/Methodology";
import AnsweredPrayers from "@/pages/AnsweredPrayers";
import FundTheMission from "@/pages/FundTheMission";
import MissionFundingPage from "@/pages/MissionFundingPage";
import SignatureVerification from "@/pages/SignatureVerification";
import ChurchContractSigning from "@/pages/ChurchContractSigning";
import AgentLandingPage from "@/pages/AgentLandingPage";

const AdminDashboard = lazyWithRetry(() => import("@/pages/admin/Dashboard"));
const AdminChurches = lazyWithRetry(() => import("@/pages/admin/Churches"));
const AdminUsers = lazyWithRetry(() => import("@/pages/admin/Users"));
const AdminUserEdit = lazyWithRetry(() => import("@/pages/admin/UserEdit"));
const AdminPrayer = lazyWithRetry(() => import("@/pages/admin/Prayer"));
const AdminContentReview = lazyWithRetry(() => import("@/pages/admin/ContentReview"));
const AdminCommunity = lazyWithRetry(() => import("@/pages/admin/Community"));
const AdminCallings = lazyWithRetry(() => import("@/pages/admin/Callings"));
const AdminCollaboration = lazyWithRetry(() => import("@/pages/admin/Collaboration"));
const AdminInternalTags = lazyWithRetry(() => import("@/pages/admin/InternalTags"));
const AdminSettings = lazyWithRetry(() => import("@/pages/admin/Settings"));
const AdminCityPlatforms = lazyWithRetry(() => import("@/pages/admin/CityPlatforms"));
const AdminCityPlatformsMap = lazyWithRetry(() => import("@/pages/admin/CityPlatformsMap"));
const AdminCreateCityPlatform = lazyWithRetry(() => import("@/pages/admin/CreateCityPlatform"));
const AdminCityPlatformBoundaries = lazyWithRetry(() => import("@/pages/admin/CityPlatformBoundaries"));
const AdminMyPlatforms = lazyWithRetry(() => import("@/pages/admin/MyPlatforms"));
const AdminPlatformDashboard = lazyWithRetry(() => import("@/pages/admin/PlatformDashboard"));
const AdminPlatformMembers = lazyWithRetry(() => import("@/pages/admin/PlatformMembers"));
const AdminChurchClaims = lazyWithRetry(() => import("@/pages/admin/ChurchClaims"));
const AdminProfilesPending = lazyWithRetry(() => import("@/pages/admin/ProfilesPending"));
const AdminMembershipRequests = lazyWithRetry(() => import("@/pages/admin/MembershipRequests"));
const AdminPlatformSettings = lazyWithRetry(() => import("@/pages/admin/PlatformSettings"));
const AdminDataSources = lazyWithRetry(() => import("@/pages/admin/DataSources"));
const AdminModeration = lazyWithRetry(() => import("@/pages/admin/Moderation"));
const AdminSpreadsheetCompare = lazyWithRetry(() => import("@/pages/admin/SpreadsheetCompare"));
const AdminPartnershipApplications = lazyWithRetry(() => import("@/pages/admin/PartnershipApplications"));
const AdminSponsors = lazyWithRetry(() => import("@/pages/admin/Sponsors"));
const AdminMissionFundingSubmissions = lazyWithRetry(() => import("@/pages/admin/MissionFundingSubmissions"));
const AdminPartnerships = lazyWithRetry(() => import("@/pages/admin/Partnerships"));
const AdminMyChurches = lazyWithRetry(() => import("@/pages/admin/MyChurches"));

// Prayer Journeys
const JourneyList = lazyWithRetry(() => import("@/pages/JourneyList"));
const JourneyBuilder = lazyWithRetry(() => import("@/pages/JourneyBuilder"));
const JourneyViewer = lazyWithRetry(() => import("@/pages/JourneyViewer"));

/**
 * Wrap a lazy import so that chunk-load failures (e.g. after a deploy
 * changes JS hashes while the user has an old HTML shell cached) trigger
 * a single page reload instead of a blank error screen. A sessionStorage
 * flag prevents infinite reload loops.
 */
function lazyWithRetry(importFn: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(async () => {
    const storageKey = 'chunk_reload_' + importFn.toString().slice(0, 80);
    try {
      const module = await importFn();
      // Clear the flag on success so future deploys can retry again
      sessionStorage.removeItem(storageKey);
      return module;
    } catch (error) {
      // Only auto-reload once per chunk to prevent infinite loops
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, '1');
        window.location.reload();
      }
      throw error;
    }
  });
}

function AdminPageLoader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="space-y-4">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-8 w-64" />
      </div>
    </div>
  );
}

function LazyRoute({ component: Component }: { component: React.LazyExoticComponent<React.ComponentType<any>> }) {
  return (
    <SectionErrorBoundary name="Page">
      <Suspense fallback={<AdminPageLoader />}>
        <Component />
      </Suspense>
    </SectionErrorBoundary>
  );
}

function Router() {
  return (
    <Switch>
      {/* Static routes - must come before platform catch-all */}
      <Route path="/about" component={About} />
      <Route path="/methodology" component={Methodology} />
      <Route path="/facility-sharing" component={FacilitySharing} />
      <Route path="/prayers/answered" component={AnsweredPrayers} />
      <Route path="/signatures/verify" component={SignatureVerification} />
      <Route path="/agent-program" component={AgentLandingPage} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/profile" component={UserProfile} />
      <Route path="/apply-for-platform" component={ApplyForPlatform} />
      <Route path="/platforms" component={Platforms} />
      <Route path="/platform/:slug" component={PlatformDetail} />
      <Route path="/explore" component={Explore} />
      
      {/* Prayer Journey routes (static, before platform catch-all) */}
      <Route path="/journey/:shareToken">{() => <LazyRoute component={JourneyViewer} />}</Route>
      <Route path="/journeys">{() => <LazyRoute component={JourneyList} />}</Route>

      {/* National routes (no platform context) */}
      <Route path="/church/:id/answered-prayers" component={AnsweredPrayers} />
      <Route path="/church/:id/fund-the-mission" component={FundTheMission} />
      <Route path="/churches/:id/mission-funding" component={MissionFundingPage} />
      <Route path="/church/:churchId/sign-contract" component={ChurchContractSigning} />
      <Route path="/church/:id" component={ChurchDetail} />
      <Route path="/ministry-areas/:id" component={MinistryAreaDetail} />
      <Route path="/community/new" component={CommunityNew} />
      <Route path="/community/:id" component={CommunityPost} />
      <Route path="/community" component={Community} />
      <Route path="/admin">{() => <LazyRoute component={AdminDashboard} />}</Route>
      <Route path="/admin/dashboard">{() => <LazyRoute component={AdminDashboard} />}</Route>
      <Route path="/admin/churches">{() => <LazyRoute component={AdminChurches} />}</Route>
      <Route path="/admin/users">{() => <LazyRoute component={AdminUsers} />}</Route>
      <Route path="/admin/users/:id/edit">{() => <LazyRoute component={AdminUserEdit} />}</Route>
      <Route path="/admin/content-review">{() => <LazyRoute component={AdminContentReview} />}</Route>
      <Route path="/admin/prayer">{() => <Redirect to="/admin/content-review" />}</Route>
      <Route path="/admin/community">{() => <LazyRoute component={AdminCommunity} />}</Route>
      <Route path="/admin/callings">{() => <LazyRoute component={AdminCallings} />}</Route>
      <Route path="/admin/collaboration">{() => <LazyRoute component={AdminCollaboration} />}</Route>
      <Route path="/admin/internal-tags">{() => <LazyRoute component={AdminInternalTags} />}</Route>
      <Route path="/admin/settings">{() => <LazyRoute component={AdminSettings} />}</Route>
      <Route path="/admin/city-platforms/create">{() => <LazyRoute component={AdminCreateCityPlatform} />}</Route>
      <Route path="/admin/city-platforms/map">{() => <LazyRoute component={AdminCityPlatformsMap} />}</Route>
      <Route path="/admin/city-platforms/:id/boundaries">{() => <LazyRoute component={AdminCityPlatformBoundaries} />}</Route>
      <Route path="/admin/city-platforms">{() => <LazyRoute component={AdminCityPlatforms} />}</Route>
      <Route path="/admin/my-platforms">{() => <LazyRoute component={AdminMyPlatforms} />}</Route>
      <Route path="/admin/platform/:id">{() => <LazyRoute component={AdminPlatformDashboard} />}</Route>
      <Route path="/admin/platform/:id/members">{() => <LazyRoute component={AdminPlatformMembers} />}</Route>
      <Route path="/admin/platform/:id/membership-requests">{() => <LazyRoute component={AdminMembershipRequests} />}</Route>
      <Route path="/admin/platform/:id/settings">{() => <LazyRoute component={AdminPlatformSettings} />}</Route>
      <Route path="/admin/city-platforms/:id/church-claims">{() => <LazyRoute component={AdminChurchClaims} />}</Route>
      <Route path="/admin/church-claims">{() => <LazyRoute component={AdminChurchClaims} />}</Route>
      <Route path="/admin/profiles-pending">{() => <LazyRoute component={AdminProfilesPending} />}</Route>
      <Route path="/admin/data-sources">{() => <LazyRoute component={AdminDataSources} />}</Route>
      <Route path="/admin/moderation">{() => <Redirect to="/admin/content-review" />}</Route>
      <Route path="/admin/spreadsheet-compare">{() => <LazyRoute component={AdminSpreadsheetCompare} />}</Route>
      <Route path="/admin/partnership-applications">{() => <LazyRoute component={AdminPartnershipApplications} />}</Route>
      <Route path="/admin/sponsors">{() => <LazyRoute component={AdminSponsors} />}</Route>
      <Route path="/admin/mission-funding-submissions">{() => <LazyRoute component={AdminMissionFundingSubmissions} />}</Route>
      <Route path="/admin/partnerships">{() => <LazyRoute component={AdminPartnerships} />}</Route>
      <Route path="/admin/my-churches">{() => <LazyRoute component={AdminMyChurches} />}</Route>
      
      {/* Platform-scoped routes (/:platform/...) - platform slug is extracted by PlatformContext */}
      <Route path="/:platform/journey/:id/builder">{() => <LazyRoute component={JourneyBuilder} />}</Route>
      <Route path="/:platform/journey/:id">{() => <LazyRoute component={JourneyViewer} />}</Route>
      <Route path="/:platform/journeys">{() => <LazyRoute component={JourneyList} />}</Route>
      <Route path="/:platform/admin/content-review">{() => <LazyRoute component={AdminContentReview} />}</Route>
      <Route path="/:platform/admin/prayer">{() => <Redirect to="/:platform/admin/content-review" />}</Route>
      <Route path="/:platform/admin/moderation">{() => <Redirect to="/:platform/admin/content-review" />}</Route>
      <Route path="/:platform/churches">{() => <LazyRoute component={AdminChurches} />}</Route>
      <Route path="/:platform/church-claims">{() => <LazyRoute component={AdminChurchClaims} />}</Route>
      <Route path="/:platform/church/:id/answered-prayers" component={AnsweredPrayers} />
      <Route path="/:platform/church/:id/fund-the-mission" component={FundTheMission} />
      <Route path="/:platform/churches/:id/mission-funding" component={MissionFundingPage} />
      <Route path="/:platform/church/:churchId/sign-contract" component={ChurchContractSigning} />
      <Route path="/:platform/church/:id" component={ChurchDetail} />
      <Route path="/:platform/ministry-areas/:id" component={MinistryAreaDetail} />
      <Route path="/:platform/map" component={Home} /> {/* Platform map view */}
      <Route path="/:platform/prayer" component={Home} /> {/* Platform prayer mode */}
      <Route path="/:platform/community/new" component={CommunityNew} />
      <Route path="/:platform/community/:id" component={CommunityPost} />
      <Route path="/:platform/community" component={Community} /> {/* Backward compat alias */}
      <Route path="/:platform" component={Community} /> {/* Platform landing = community */}
      
      {/* National home (root) */}
      <Route path="/" component={Home} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

/** Invisible component that prefetches platform pins on login */
function PinPrefetcher() {
  usePrefetchPlatformPins();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <PlatformProvider>
              <PinPrefetcher />
              <TooltipProvider>
                <Toaster />
                <Router />
              </TooltipProvider>
            </PlatformProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
