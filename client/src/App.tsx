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
import { ErrorBoundary } from "@/components/ErrorBoundary";
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

const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminChurches = lazy(() => import("@/pages/admin/Churches"));
const AdminUsers = lazy(() => import("@/pages/admin/Users"));
const AdminUserEdit = lazy(() => import("@/pages/admin/UserEdit"));
const AdminPrayer = lazy(() => import("@/pages/admin/Prayer"));
const AdminContentReview = lazy(() => import("@/pages/admin/ContentReview"));
const AdminCommunity = lazy(() => import("@/pages/admin/Community"));
const AdminCallings = lazy(() => import("@/pages/admin/Callings"));
const AdminCollaboration = lazy(() => import("@/pages/admin/Collaboration"));
const AdminInternalTags = lazy(() => import("@/pages/admin/InternalTags"));
const AdminSettings = lazy(() => import("@/pages/admin/Settings"));
const AdminCityPlatforms = lazy(() => import("@/pages/admin/CityPlatforms"));
const AdminCityPlatformsMap = lazy(() => import("@/pages/admin/CityPlatformsMap"));
const AdminCreateCityPlatform = lazy(() => import("@/pages/admin/CreateCityPlatform"));
const AdminCityPlatformBoundaries = lazy(() => import("@/pages/admin/CityPlatformBoundaries"));
const AdminMyPlatforms = lazy(() => import("@/pages/admin/MyPlatforms"));
const AdminPlatformDashboard = lazy(() => import("@/pages/admin/PlatformDashboard"));
const AdminPlatformMembers = lazy(() => import("@/pages/admin/PlatformMembers"));
const AdminChurchClaims = lazy(() => import("@/pages/admin/ChurchClaims"));
const AdminProfilesPending = lazy(() => import("@/pages/admin/ProfilesPending"));
const AdminMembershipRequests = lazy(() => import("@/pages/admin/MembershipRequests"));
const AdminPlatformSettings = lazy(() => import("@/pages/admin/PlatformSettings"));
const AdminDataSources = lazy(() => import("@/pages/admin/DataSources"));
const AdminModeration = lazy(() => import("@/pages/admin/Moderation"));
const AdminSpreadsheetCompare = lazy(() => import("@/pages/admin/SpreadsheetCompare"));
const AdminPartnershipApplications = lazy(() => import("@/pages/admin/PartnershipApplications"));
const AdminSponsors = lazy(() => import("@/pages/admin/Sponsors"));
const AdminMissionFundingSubmissions = lazy(() => import("@/pages/admin/MissionFundingSubmissions"));
const AdminPartnerships = lazy(() => import("@/pages/admin/Partnerships"));
const AdminMyChurches = lazy(() => import("@/pages/admin/MyChurches"));

// Prayer Journeys
const JourneyList = lazy(() => import("@/pages/JourneyList"));
const JourneyBuilder = lazy(() => import("@/pages/JourneyBuilder"));
const JourneyViewer = lazy(() => import("@/pages/JourneyViewer"));

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
    <Suspense fallback={<AdminPageLoader />}>
      <Component />
    </Suspense>
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
