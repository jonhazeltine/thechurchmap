import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import * as churchesRoute from "../app/api/churches/route";
import * as churchByIdRoute from "../app/api/churches/[id]/route";
import * as churchesByPolygonRoute from "../app/api/churches/by-polygon/route";
import * as callingsRoute from "../app/api/callings/route";
import * as areasRoute from "../app/api/areas/route";
import * as areaByIdRoute from "../app/api/areas/[id]/route";
import * as areasImportRoute from "../app/api/areas/import/route";
import * as boundariesRoute from "../app/api/boundaries/route";
import * as boundariesImportRoute from "../app/api/boundaries/import/route";
import * as boundariesSearchRoute from "../app/api/boundaries/search/route";
import * as boundariesByPointRoute from "../app/api/boundaries/by-point/route";
import * as boundaryByIdRoute from "../app/api/boundaries/[id]/route";
import * as boundariesViewportRoute from "../app/api/boundaries/viewport/route";
import * as boundariesByIdsRoute from "../app/api/boundaries/by-ids/route";
import * as ministryAreasRoute from "../app/api/ministry-areas/route";
import * as ministryAreaByIdRoute from "../app/api/ministry-areas/[id]/route";
import * as churchesBulkImportRoute from "../app/api/churches/bulk-import/route";
import * as churchesSearchRoute from "../app/api/churches/search/route";
import * as primaryMinistryAreaRoute from "../app/api/churches/[id]/primary-ministry-area/route";
import * as callingAreasRoute from "../app/api/churches/[id]/calling-areas/route";
import * as callingAreaByIdRoute from "../app/api/churches/[id]/calling-areas/[areaId]/route";
import * as callingBoundaryPreferencesRoute from "../app/api/churches/[id]/calling-boundary-preferences/route";
import * as churchTeamRoute from "../app/api/churches/[id]/team/route";
import * as teamMemberRoute from "../app/api/churches/[id]/team/[userId]/route";
import * as churchPrayersRoute from "../app/api/churches/[id]/prayers/route";
import * as churchLogoRoute from "../app/api/churches/[id]/logo/route";
import * as churchBannerRoute from "../app/api/churches/[id]/banner/route";
import * as churchDeletionImpactRoute from "../app/api/churches/[id]/deletion-impact/route";
import * as churchPrayerPostRoute from "../app/api/churches/[id]/prayer-post/route";
import * as churchPrayerRequestRoute from "../app/api/churches/[id]/church-prayer-request/route";
import * as areaIntelligenceRoute from "../app/api/churches/area-intelligence/route";
import * as collaborationOpportunitiesRoute from "../app/api/churches/collaboration-opportunities/route";
import * as collaborationLinesRoute from "../app/api/churches/collaboration-lines/route";
import * as churchesInViewportRoute from "../app/api/churches/in-viewport/route";
import * as postsRoute from "../app/api/posts/route";
import * as postByIdRoute from "../app/api/posts/[id]/route";
import * as setPrayerPostRoute from "../app/api/posts/[id]/set-prayer-post/route";
import * as postReactionsRoute from "../app/api/posts/[id]/reactions/route";
import * as postCommentsRoute from "../app/api/posts/[postId]/comments/route";
import * as commentByIdRoute from "../app/api/comments/[id]/route";
import * as commentReactionsRoute from "../app/api/comments/[id]/reactions/route";
import * as profileRoute from "../app/api/profile/route";
import * as profilePasswordRoute from "../app/api/profile/password/route";
import * as profileAvatarRoute from "../app/api/profile/avatar/route";
import * as createProfileRoute from "../app/api/auth/create-profile/route";
import * as claimCommentsRoute from "../app/api/auth/claim-comments/route";
import * as prayersRoute from "../app/api/prayers/route";
import * as prayersPublicRoute from "../app/api/prayers/public/route";
import * as prayersMapRoute from "../app/api/prayers/map/route";
import * as prayersVisibleRoute from "../app/api/prayers/visible/route";
import * as prayersPrayRoute from "../app/api/prayers/pray/route";
import * as prayersInteractionsRecentRoute from "../app/api/prayers/interactions/recent/route";
import * as prayersPromptsForAreaRoute from "../app/api/prayers/prompts-for-area/route";
import * as prayersChurchRequestsRoute from "../app/api/prayers/church-requests/route";
import * as placesSearchRoute from "../app/api/places/search/route";
import * as profilesSearchRoute from "../app/api/profiles/search/route";
import * as mentionsSearchRoute from "../app/api/mentions/search/route";
import * as linkPreviewRoute from "../app/api/link-preview/route";
import * as ogImageRoute from "../app/api/og/route";

// Formation Prayer Exchange endpoints
import * as formationPrayersRoute from "../app/api/formation/prayers/route";
import * as formationPrayersRespondRoute from "../app/api/formation/prayers/respond/route";
import * as formationPrayersSyncRoute from "../app/api/formation/prayers/sync/route";
import * as formationPrayersAnsweredRoute from "../app/api/formation/prayers/answered/route";
import * as formationPrayersPushRoute from "../app/api/formation/prayers/push/route";

// Admin endpoints (Sprint 3.0)
import * as adminAccessRoute from "../app/api/admin/access/route";
import * as adminDashboardStatsRoute from "../app/api/admin/dashboard/stats/route";
import * as adminPendingCountsRoute from "../app/api/admin/pending-counts/route";
import * as adminChurchesRoute from "../app/api/admin/churches/route";
import * as adminPrayersRoute from "../app/api/admin/prayers/route";
import * as adminPrayersCreateRoute from "../app/api/admin/prayers/create/route";
import * as adminPrayerByIdRoute from "../app/api/admin/prayers/[prayerId]/route";
import * as adminPostsRoute from "../app/api/admin/posts/route";
import * as adminPostByIdRoute from "../app/api/admin/posts/[postId]/route";
import * as adminPostsBackfillPlatformRoute from "../app/api/admin/posts/backfill-platform/route";
import * as adminCommentsRoute from "../app/api/admin/comments/route";
import * as adminCommentByIdRoute from "../app/api/admin/comments/[commentId]/route";
import * as adminUsersRoute from "../app/api/admin/users/route";
import * as adminUserByIdRoute from "../app/api/admin/users/[id]/route";
import * as adminUserRoleRoute from "../app/api/admin/users/[id]/role/route";
import * as adminUserPasswordRoute from "../app/api/admin/users/[id]/password/route";
import * as adminUserChurchesRoute from "../app/api/admin/users/[id]/churches/route";
import * as adminCallingsRoute from "../app/api/admin/callings/route";
import * as adminCallingByIdRoute from "../app/api/admin/callings/[id]/route";
import * as collaborationTaxonomyRoute from "../app/api/collaboration-taxonomy/route";
import * as adminCollaborationTagsRoute from "../app/api/admin/collaboration/tags/route";
import * as adminCollaborationTagByIdRoute from "../app/api/admin/collaboration/tags/[id]/route";
import * as adminCollaborationCleanupRoute from "../app/api/admin/collaboration/cleanup/route";
import * as adminInternalTagsRoute from "../app/api/admin/internal-tags/route";
import * as adminInternalTagByIdRoute from "../app/api/admin/internal-tags/[id]/route";
import * as adminInternalTagChurchesRoute from "../app/api/admin/internal-tags/[id]/churches/route";
import * as adminInternalTagsByChurchRoute from "../app/api/admin/internal-tags/churches/[churchId]/route";
import * as adminInternalTagsByTagsRoute from "../app/api/admin/internal-tags/by-tags/route";
import * as adminSettingsRoute from "../app/api/admin/settings/route";
import * as platformSettingsRoute from "../app/api/platform/settings/route";
import * as adminModerationRoute from "../app/api/admin/moderation/route";
import * as adminMyChurchesRoute from "../app/api/admin/my-churches/route";

// Super Admin - city platform management
import * as adminCityPlatformsRoute from "../app/api/admin/city-platforms/route";
import * as adminCityPlatformByIdRoute from "../app/api/admin/city-platforms/[id]/route";
import * as adminCityPlatformsMapRoute from "../app/api/admin/city-platforms/map/route";
import * as adminCityPlatformBoundariesRoute from "../app/api/admin/city-platforms/[id]/boundaries/route";
import * as adminCityPlatformChurchesRoute from "../app/api/admin/city-platforms/[id]/churches/route";
import * as adminCityPlatformChurchApproveRoute from "../app/api/admin/city-platforms/[id]/churches/[churchId]/approve/route";
import * as adminCityPlatformChurchRejectRoute from "../app/api/admin/city-platforms/[id]/churches/[churchId]/reject/route";
import * as adminCityPlatformDashboardRoute from "../app/api/admin/city-platforms/[id]/dashboard/route";
import * as adminCityPlatformUsersRoute from "../app/api/admin/city-platforms/[id]/users/route";
import * as adminCityPlatformUserByIdRoute from "../app/api/admin/city-platforms/[id]/users/[userId]/route";
import * as adminCityPlatformImportChurchesRoute from "../app/api/admin/city-platforms/[id]/import-churches/route";
import * as adminCityPlatformBoundaryCleanupRoute from "../app/api/admin/city-platforms/[id]/boundary-cleanup/route";
import * as adminCityPlatformDeduplicateRoute from "../app/api/admin/city-platforms/[id]/deduplicate/route";
import * as adminCityPlatformCleanupDuplicatesRoute from "../app/api/admin/city-platforms/[id]/cleanup-duplicates/route";
import * as adminCityPlatformChurchesBulkApproveRoute from "../app/api/admin/city-platforms/[id]/churches/bulk-approve/route";
import * as adminCityPlatformVerificationSummaryRoute from "../app/api/admin/city-platforms/[id]/verification-summary/route";
import * as adminCityPlatformVerifyChurchesRoute from "../app/api/admin/city-platforms/[id]/verify-churches/route";
import * as adminCityPlatformMigrateUnverifiedRoute from "../app/api/admin/city-platforms/[id]/migrate-unverified/route";
import * as adminChurchVerificationRoute from "../app/api/admin/churches/[id]/verification/route";
import * as adminChurchByIdRoute from "../app/api/admin/churches/[id]/route";
import * as adminCityPlatformRegionsRoute from "../app/api/admin/city-platforms/[id]/regions/route";
import * as adminCityPlatformRegionsAssignRoute from "../app/api/admin/city-platforms/[id]/regions/assign/route";
import * as adminCityPlatformSetupStatusRoute from "../app/api/admin/city-platforms/[id]/setup-status/route";

// Admin migrations
import * as adminMigrationPrayerScopeRoute from "../app/api/admin/migrations/prayer-scope/route";

// Super Admin - data source management
import * as adminDataSourcesRoute from "../app/api/admin/data-sources/route";

// Super Admin - tileset management
import * as adminTilesetRoute from "../app/api/admin/tileset/route";

// Spreadsheet comparison (re-import missing churches)
import * as adminSpreadsheetCompareRoute from "../app/api/admin/spreadsheet-compare/route";
import * as adminSpreadsheetCompareAnalyzeRoute from "../app/api/admin/spreadsheet-compare/analyze/route";
import * as adminDataSourceByIdRoute from "../app/api/admin/data-sources/[id]/route";
import * as adminDataSourceTriggerRoute from "../app/api/admin/data-sources/[id]/trigger/route";
import * as adminDataSourceRunsRoute from "../app/api/admin/data-sources/[id]/runs/route";
import * as adminDataSourceDashboardRoute from "../app/api/admin/data-sources/dashboard/route";

// Health data overlay endpoints
import * as healthDataRoute from "../app/api/health-data/route";
import * as healthDataMetricsRoute from "../app/api/health-data/metrics/route";
import * as healthDataCategoriesRoute from "../app/api/health-data/categories/route";
import * as healthDataTractsRoute from "../app/api/health-data/tracts/route";

// Church claims (Phase 5E)
import * as churchClaimRoute from "../app/api/churches/[id]/claim/route";
import * as churchClaimReleaseRoute from "../app/api/churches/[id]/claim/release/route";
import * as churchPendingClaimStatusRoute from "../app/api/churches/[id]/pending-claim-status/route";
import * as adminPlatformChurchClaimsRoute from "../app/api/admin/city-platforms/[id]/church-claims/route";
import * as adminChurchClaimByIdRoute from "../app/api/admin/church-claims/[claimId]/route";
import * as churchClaimApprovedRoute from "../app/api/church-claims/approved/[churchId]/route";

// Pending profile submissions
import * as adminProfilesPendingRoute from "../app/api/admin/profiles-pending/route";
import * as adminProfilePendingByIdRoute from "../app/api/admin/profiles-pending/[id]/route";

// Platform applications (Phase 6)
import * as platformApplicationsRoute from "../app/api/platform-applications/route";
import * as platformApplicationsMyRoute from "../app/api/platform-applications/my/route";
import * as adminPlatformApplicationsRoute from "../app/api/admin/platform-applications/route";
import * as adminPlatformApplicationByIdRoute from "../app/api/admin/platform-applications/[id]/route";

// Public platforms discovery
import * as publicPlatformsRoute from "../app/api/platforms/route";
import * as publicPlatformByIdRoute from "../app/api/platforms/[id]/route";
import * as publicPlatformsMapRoute from "../app/api/platforms/map/route";
import * as publicPlatformRegionsRoute from "../app/api/platforms/[platformId]/regions/route";
import * as publicPlatformRegionByIdRoute from "../app/api/platforms/[platformId]/regions/[regionId]/route";

// Explore stats (public)
import * as exploreStatsRoute from "../app/api/explore/stats/route";

// Platform membership requests (Member Onboarding Flow)
import * as platformJoinRoute from "../app/api/platforms/[id]/join/route";
import * as platformMyMembershipRoute from "../app/api/platforms/[id]/my-membership/route";
import * as adminPlatformMembershipRequestsRoute from "../app/api/admin/platform/[id]/membership-requests/route";
import * as adminPlatformMembershipRequestByIdRoute from "../app/api/admin/platform/[id]/membership-requests/[requestId]/route";

// Platform settings management (Platform Owners)
import * as adminPlatformSettingsRoute from "../app/api/admin/platform/[id]/settings/route";
import * as adminPlatformByIdRoute from "../app/api/admin/platform/[id]/route";

// Platform allocation settings
import * as platformAllocationSettingsRoute from "../app/api/platform/[platformId]/allocation-settings/route";

// User Onboarding System
import * as onboardingStatusRoute from "../app/api/onboarding/status/route";
import * as onboardingSearchChurchesRoute from "../app/api/onboarding/search-churches/route";
import * as onboardingSelectChurchRoute from "../app/api/onboarding/select-church/route";
import * as onboardingSubmitPendingChurchRoute from "../app/api/onboarding/submit-pending-church/route";
import * as onboardingSkipRoute from "../app/api/onboarding/skip/route";

// Fund the Mission - Partnership & Sponsors
import * as partnershipApplicationsRoute from "../app/api/partnership-applications/route";
import * as aareSubmissionsRoute from "../app/api/aare-submissions/route";
import * as churchFundMissionRoute from "../app/api/churches/[id]/fund-mission/route";
import * as churchFacilityRoute from "../app/api/churches/[id]/facility/route";
import * as adminPartnershipApplicationsRoute from "../app/api/admin/partnership-applications/route";
import * as adminPartnershipApplicationByIdRoute from "../app/api/admin/partnership-applications/[id]/route";
import * as adminSponsorsRoute from "../app/api/admin/sponsors/route";
import * as adminSponsorByIdRoute from "../app/api/admin/sponsors/[id]/route";
import * as adminSponsorAssignmentsRoute from "../app/api/admin/sponsors/[id]/assignments/route";

// Document signatures
import * as signaturesRoute from "../app/api/signatures/route";
import * as signatureByIdRoute from "../app/api/signatures/[id]/route";
import * as signaturesSearchRoute from "../app/api/signatures/search/route";

// Admin - Tract management (Census data)
import * as adminTractsRoute from "../app/api/admin/tracts/route";
import * as adminTractsImportRoute from "../app/api/admin/tracts/import/route";
import * as tractsResolveRoute from "../app/api/tracts/resolve/route";
import * as tractsGeometriesRoute from "../app/api/tracts/geometries/route";
import * as tractsPopulationRoute from "../app/api/tracts/population/route";

// Prayer Budget & Allocations (Sprint 3 Stage 1)
import * as churchPrayerBudgetRoute from "../app/api/churches/[churchId]/prayer-budget/route";
import * as churchPrayerAllocationsRoute from "../app/api/churches/[churchId]/prayer-allocations/route";
import * as prayerCoverageCityRoute from "../app/api/prayer-coverage/city/route";
import * as prayerCoverageChurchRoute from "../app/api/prayer-coverage/church/[churchId]/route";

// Church Ministry Capacity
import * as churchMinistryCapacityRoute from "../app/api/churches/[churchId]/ministry-capacity/route";

// Church Ministry Allocations (Phase 3 - per-area distribution)
import * as churchMinistryAllocationsRoute from "../app/api/churches/[churchId]/ministry-allocations/route";

// Church Engagement Scores (Sprint 4)
import * as churchEngagementRoute from "../app/api/churches/[churchId]/engagement/route";

// Prayer Journeys
import * as journeysRoute from "../app/api/journeys/route";
import * as journeyByIdRoute from "../app/api/journeys/[id]/route";
import * as journeyPublishRoute from "../app/api/journeys/[id]/publish/route";
import * as journeyStepsRoute from "../app/api/journeys/[id]/steps/route";
import * as journeyStepByIdRoute from "../app/api/journeys/[id]/steps/[stepId]/route";
import * as journeyStepsReorderRoute from "../app/api/journeys/[id]/steps/reorder/route";
import * as journeyAiSuggestionsRoute from "../app/api/journeys/[id]/ai-suggestions/route";
import * as journeyAiSuggestSingleRoute from "../app/api/journeys/[id]/ai-suggest-single/route";
import * as journeyShareRoute from "../app/api/journeys/share/[shareToken]/route";

// Platform pin cache (performance optimization)
import * as adminPlatformPinsGenerateRoute from "../app/api/admin/platform-pins/generate/route";
import * as churchPinsRoute from "../app/api/churches/pins/route";
import * as churchAllGeojsonRoute from "../app/api/churches/all-geojson/route";

import * as fs from "fs";
import * as path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Serve GeoJSON with no-cache headers to ensure fresh data
  app.get('/all-churches-sampled.geojson', (req, res) => {
    const filePath = path.join(process.cwd(), 'public', 'all-churches-sampled.geojson');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'application/json');
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  app.get("/api/churches", churchesRoute.GET);
  app.post("/api/churches", churchesRoute.POST);
  app.post("/api/churches/bulk-import", churchesBulkImportRoute.POST);
  
  app.get("/api/churches/search", churchesSearchRoute.GET);
  
  // Area Intelligence endpoint - MUST be before /api/churches/:id to avoid route conflict
  app.get("/api/churches/area-intelligence", areaIntelligenceRoute.GET);
  
  // Collaboration opportunities endpoint
  app.get("/api/churches/collaboration-opportunities", collaborationOpportunitiesRoute.GET);
  app.post("/api/churches/collaboration-opportunities", collaborationOpportunitiesRoute.POST);
  app.patch("/api/churches/collaboration-opportunities", collaborationOpportunitiesRoute.PATCH);
  
  // Collaboration lines for map visualization
  app.get("/api/churches/collaboration-lines", collaborationLinesRoute.GET);
  
  // Churches in viewport - for map overlay display
  app.get("/api/churches/in-viewport", churchesInViewportRoute.GET);

  // Platform pin cache - all pins for a platform as GeoJSON (fast)
  app.get("/api/churches/pins/:platformId", churchPinsRoute.GET);
  app.get("/api/churches/all-geojson", churchAllGeojsonRoute.GET);
  
  app.get("/api/churches/:id", churchByIdRoute.GET);
  app.patch("/api/churches/:id", churchByIdRoute.PATCH);
  app.delete("/api/churches/:id", churchByIdRoute.DELETE);
  app.get("/api/churches/:id/deletion-impact", churchDeletionImpactRoute.GET);

  // Primary ministry area endpoints
  app.patch("/api/churches/:id/primary-ministry-area", primaryMinistryAreaRoute.PATCH);
  app.delete("/api/churches/:id/primary-ministry-area", primaryMinistryAreaRoute.DELETE);

  // Calling boundary preference toggle
  app.patch("/api/churches/:id/calling-boundary-preferences", callingBoundaryPreferencesRoute.PATCH);

  // Calling-specific ministry area endpoints
  app.get("/api/churches/:id/calling-areas", callingAreasRoute.GET);
  app.post("/api/churches/:id/calling-areas", callingAreasRoute.POST);
  app.delete("/api/churches/:id/calling-areas/:areaId", callingAreaByIdRoute.DELETE);

  // Church team endpoints
  app.get("/api/churches/:id/team", churchTeamRoute.GET);
  app.patch("/api/churches/:id/team/:userId", teamMemberRoute.PATCH);
  app.delete("/api/churches/:id/team/:userId", teamMemberRoute.DELETE);
  
  // Church prayers endpoint
  app.get("/api/churches/:id/prayers", churchPrayersRoute.GET);

  // Church prayer post endpoints (community-prayer integration)
  app.get("/api/churches/:id/prayer-post", churchPrayerPostRoute.GET);
  app.post("/api/churches/:id/prayer-post", churchPrayerPostRoute.POST);
  app.patch("/api/churches/:id/prayer-post", churchPrayerPostRoute.PATCH);

  // Church prayer requests (church-initiated prayer needs)
  app.post("/api/churches/:id/church-prayer-request", churchPrayerRequestRoute.POST);

  // Church logo endpoints
  app.post("/api/churches/:id/logo", churchLogoRoute.POST);
  app.delete("/api/churches/:id/logo", churchLogoRoute.DELETE);

  // Church banner endpoints
  app.post("/api/churches/:id/banner", churchBannerRoute.POST);
  app.delete("/api/churches/:id/banner", churchBannerRoute.DELETE);

  app.post("/api/churches/by-polygon", churchesByPolygonRoute.POST);

  app.get("/api/callings", callingsRoute.GET);
  app.post("/api/callings", callingsRoute.POST);

  app.get("/api/areas", areasRoute.GET);
  app.post("/api/areas", areasRoute.POST);
  app.post("/api/areas/import", areasImportRoute.POST);

  app.delete("/api/areas/:id", areaByIdRoute.DELETE);
  app.patch("/api/areas/:id", areaByIdRoute.PATCH);

  // Boundaries endpoints (for large-scale datasets - cities, counties, ZIPs, etc.)
  // These are NOT rendered in the UI - they're for search/lookup only
  app.get("/api/boundaries", boundariesRoute.GET);
  app.post("/api/boundaries/import", boundariesImportRoute.POST);
  app.get("/api/boundaries/search", boundariesSearchRoute.GET);
  app.get("/api/boundaries/by-point", boundariesByPointRoute.GET);
  app.get("/api/boundaries/viewport", boundariesViewportRoute.GET);
  app.get("/api/boundaries/by-ids", boundariesByIdsRoute.GET);
  app.get("/api/boundaries/:id", boundaryByIdRoute.GET);

  // Ministry areas endpoints (Sprint 1.9 - Ministry Area Manager)
  app.get("/api/ministry-areas", ministryAreasRoute.GET);
  app.post("/api/ministry-areas", ministryAreasRoute.POST);
  
  app.get("/api/ministry-areas/:id", ministryAreaByIdRoute.GET);
  app.put("/api/ministry-areas/:id", ministryAreaByIdRoute.PUT);
  app.delete("/api/ministry-areas/:id", ministryAreaByIdRoute.DELETE);

  // Posts endpoints (Sprint 4.0 - Global Community Feed)
  app.get("/api/posts", postsRoute.GET);
  app.post("/api/posts", postsRoute.POST);
  
  app.get("/api/posts/:id", postByIdRoute.GET);
  app.patch("/api/posts/:id", postByIdRoute.PATCH);
  app.delete("/api/posts/:id", postByIdRoute.DELETE);

  // Set post as prayer post endpoint
  app.get("/api/posts/:id/set-prayer-post", setPrayerPostRoute.GET);
  app.post("/api/posts/:id/set-prayer-post", setPrayerPostRoute.POST);

  // Post reactions endpoints
  app.get("/api/posts/:id/reactions", postReactionsRoute.GET);
  app.post("/api/posts/:id/reactions", postReactionsRoute.POST);

  // Post comments endpoints (Sprint 4.0)
  app.get("/api/posts/:postId/comments", postCommentsRoute.GET);
  app.post("/api/posts/:postId/comments", postCommentsRoute.POST);

  // Comment management endpoints (Sprint 4.0)
  app.patch("/api/comments/:id", commentByIdRoute.PATCH);
  app.delete("/api/comments/:id", commentByIdRoute.DELETE);
  app.get("/api/comments/:id/reactions", commentReactionsRoute.GET);
  app.post("/api/comments/:id/reactions", commentReactionsRoute.POST);

  // Auth endpoints (Sprint 2.0)
  app.post("/api/auth/create-profile", createProfileRoute.POST);
  app.post("/api/auth/claim-comments", claimCommentsRoute.POST);

  // Profile endpoints (Sprint 2.0)
  app.get("/api/profile", profileRoute.GET);
  app.patch("/api/profile", profileRoute.PATCH);
  app.post("/api/profile/password", profilePasswordRoute.POST);
  app.post("/api/profile/avatar", profileAvatarRoute.uploadMiddleware, profileAvatarRoute.POST);

  // User onboarding endpoints
  app.get("/api/onboarding/status", onboardingStatusRoute.GET);
  app.get("/api/onboarding/search-churches", onboardingSearchChurchesRoute.GET);
  app.post("/api/onboarding/select-church", onboardingSelectChurchRoute.POST);
  app.post("/api/onboarding/submit-pending-church", onboardingSubmitPendingChurchRoute.POST);
  app.post("/api/onboarding/skip", onboardingSkipRoute.POST);

  // Prayer endpoints (Sprint 2.1)
  app.post("/api/prayers", prayersRoute.POST);
  app.post("/api/prayers/public", prayersPublicRoute.POST);
  app.get("/api/prayers/map", prayersMapRoute.GET);
  app.get("/api/prayers/visible", prayersVisibleRoute.GET);
  app.post("/api/prayers/pray", prayersPrayRoute.POST);
  app.get("/api/prayers/interactions/recent", prayersInteractionsRecentRoute.GET);
  app.get("/api/prayers/prompts-for-area", prayersPromptsForAreaRoute.GET);
  app.get("/api/prayers/church-requests", prayersChurchRequestsRoute.GET);

  // Formation Prayer Exchange endpoints
  app.get("/api/formation/prayers", formationPrayersRoute.GET);
  app.post("/api/formation/prayers/respond", formationPrayersRespondRoute.POST);
  app.get("/api/formation/prayers/sync", formationPrayersSyncRoute.GET);
  app.post("/api/formation/prayers/sync", formationPrayersSyncRoute.POST);
  app.patch("/api/formation/prayers/answered", formationPrayersAnsweredRoute.PATCH);
  app.post("/api/formation/prayers/push", formationPrayersPushRoute.POST);

  // Places search (Mapbox geocoding/POI)
  app.get("/api/places/search", placesSearchRoute.GET);

  // Profile search for @mentions
  app.get("/api/profiles/search", profilesSearchRoute.GET);
  
  // Combined mentions search (users + churches)
  app.get("/api/mentions/search", mentionsSearchRoute.GET);

  // Link preview for URL metadata
  app.get("/api/link-preview", linkPreviewRoute.GET);

  // OG image generation endpoint
  app.get("/api/og", ogImageRoute.GET);

  // Admin endpoints (Sprint 3.0)
  app.get("/api/admin/access", adminAccessRoute.GET);
  app.get("/api/admin/dashboard/stats", adminDashboardStatsRoute.GET);
  app.get("/api/admin/pending-counts", adminPendingCountsRoute.GET);
  
  // Admin church management
  app.get("/api/admin/churches", adminChurchesRoute.GET);
  
  // Admin moderation (unified view)
  app.get("/api/admin/moderation", adminModerationRoute.GET);
  
  // Church admin - my churches
  app.get("/api/admin/my-churches", adminMyChurchesRoute.GET);
  
  // Admin prayer moderation
  app.get("/api/admin/prayers", adminPrayersRoute.GET);
  app.post("/api/admin/prayers/create", adminPrayersCreateRoute.POST);
  app.patch("/api/admin/prayers/:prayerId", adminPrayerByIdRoute.PATCH);
  app.delete("/api/admin/prayers/:prayerId", adminPrayerByIdRoute.DELETE);
  
  // Admin post moderation
  app.get("/api/admin/posts", adminPostsRoute.GET);
  app.patch("/api/admin/posts/:postId", adminPostByIdRoute.PATCH);
  app.post("/api/admin/posts/backfill-platform", adminPostsBackfillPlatformRoute.POST);
  
  // Admin comment moderation
  app.get("/api/admin/comments", adminCommentsRoute.GET);
  app.patch("/api/admin/comments/:commentId", adminCommentByIdRoute.PATCH);
  app.delete("/api/admin/comments/:commentId", adminCommentByIdRoute.DELETE);
  
  // Super Admin - user management
  app.get("/api/admin/users", adminUsersRoute.GET);
  app.get("/api/admin/users/:id", adminUserByIdRoute.GET);
  app.patch("/api/admin/users/:id", adminUserByIdRoute.PATCH);
  app.delete("/api/admin/users/:id", adminUserByIdRoute.DELETE);
  app.patch("/api/admin/users/:id/role", adminUserRoleRoute.PATCH);
  app.patch("/api/admin/users/:id/password", adminUserPasswordRoute.PATCH);
  app.post("/api/admin/users/:id/churches", adminUserChurchesRoute.POST);
  app.delete("/api/admin/users/:id/churches/:churchId", adminUserChurchesRoute.DELETE);
  
  // Super Admin - calling management
  app.get("/api/admin/callings", adminCallingsRoute.GET);
  app.post("/api/admin/callings", adminCallingsRoute.POST);
  app.patch("/api/admin/callings/:id", adminCallingByIdRoute.PATCH);
  app.delete("/api/admin/callings/:id", adminCallingByIdRoute.DELETE);

  // Public collaboration taxonomy (for church editors and filters)
  app.get("/api/collaboration-taxonomy", collaborationTaxonomyRoute.GET);
  
  // Super Admin - collaboration tag management
  app.get("/api/admin/collaboration/tags", adminCollaborationTagsRoute.GET);
  app.post("/api/admin/collaboration/tags", adminCollaborationTagsRoute.POST);
  app.patch("/api/admin/collaboration/tags/:id", adminCollaborationTagByIdRoute.PATCH);
  app.delete("/api/admin/collaboration/tags/:id", adminCollaborationTagByIdRoute.DELETE);
  app.get("/api/admin/collaboration/cleanup", adminCollaborationCleanupRoute.GET);
  app.post("/api/admin/collaboration/cleanup", adminCollaborationCleanupRoute.POST);

  // Platform Admin - internal tags management (invisible to regular users)
  app.get("/api/admin/internal-tags", adminInternalTagsRoute.GET);
  app.post("/api/admin/internal-tags", adminInternalTagsRoute.POST);
  app.patch("/api/admin/internal-tags/:id", adminInternalTagByIdRoute.PATCH);
  app.delete("/api/admin/internal-tags/:id", adminInternalTagByIdRoute.DELETE);
  app.post("/api/admin/internal-tags/:id/churches", adminInternalTagChurchesRoute.POST);
  app.delete("/api/admin/internal-tags/:id/churches", adminInternalTagChurchesRoute.DELETE);
  app.get("/api/admin/internal-tags/churches/:churchId", adminInternalTagsByChurchRoute.GET);
  app.get("/api/admin/internal-tags/by-tags", adminInternalTagsByTagsRoute.GET);
  
  // Platform settings (admin)
  app.get("/api/admin/settings", adminSettingsRoute.GET);
  app.patch("/api/admin/settings", adminSettingsRoute.PATCH);
  
  // Platform settings (public - no auth required)
  app.get("/api/platform/settings", platformSettingsRoute.GET);

  // Platform allocation settings
  app.get("/api/platform/:platformId/allocation-settings", platformAllocationSettingsRoute.GET);
  app.patch("/api/platform/:platformId/allocation-settings", platformAllocationSettingsRoute.PATCH);

  // Super Admin - city platform management
  app.get("/api/admin/city-platforms", adminCityPlatformsRoute.GET);
  app.post("/api/admin/city-platforms", adminCityPlatformsRoute.POST);
  app.get("/api/admin/city-platforms/map", adminCityPlatformsMapRoute.GET);
  app.get("/api/admin/city-platforms/:id", adminCityPlatformByIdRoute.GET);
  app.patch("/api/admin/city-platforms/:id", adminCityPlatformByIdRoute.PATCH);
  app.delete("/api/admin/city-platforms/:id", adminCityPlatformByIdRoute.DELETE);
  app.get("/api/admin/city-platforms/:id/boundaries", adminCityPlatformBoundariesRoute.GET);
  app.post("/api/admin/city-platforms/:id/boundaries", adminCityPlatformBoundariesRoute.POST);
  app.patch("/api/admin/city-platforms/:id/boundaries", adminCityPlatformBoundariesRoute.PATCH);
  
  // City platform churches management
  app.get("/api/admin/city-platforms/:id/churches", adminCityPlatformChurchesRoute.GET);
  app.post("/api/admin/city-platforms/:id/churches", adminCityPlatformChurchesRoute.POST);
  app.patch("/api/admin/city-platforms/:id/churches", adminCityPlatformChurchesRoute.PATCH);
  app.post("/api/admin/city-platforms/:id/churches/bulk-approve", adminCityPlatformChurchesBulkApproveRoute.POST);
  app.post("/api/admin/city-platforms/:id/churches/:churchId/approve", adminCityPlatformChurchApproveRoute.POST);
  app.post("/api/admin/city-platforms/:id/churches/:churchId/reject", adminCityPlatformChurchRejectRoute.POST);
  app.get("/api/admin/city-platforms/:id/import-churches", adminCityPlatformImportChurchesRoute.GET);
  app.post("/api/admin/city-platforms/:id/import-churches", adminCityPlatformImportChurchesRoute.POST);
  app.delete("/api/admin/city-platforms/:id/import-churches", adminCityPlatformImportChurchesRoute.DELETE);
  app.patch("/api/admin/city-platforms/:id/import-churches", adminCityPlatformImportChurchesRoute.PATCH);
  app.post("/api/admin/city-platforms/:id/boundary-cleanup", adminCityPlatformBoundaryCleanupRoute.POST);
  app.get("/api/admin/city-platforms/:id/deduplicate", adminCityPlatformDeduplicateRoute.GET);
  app.post("/api/admin/city-platforms/:id/deduplicate", adminCityPlatformDeduplicateRoute.POST);
  app.get("/api/admin/city-platforms/:id/cleanup-duplicates", adminCityPlatformCleanupDuplicatesRoute.GET);
  app.post("/api/admin/city-platforms/:id/cleanup-duplicates", adminCityPlatformCleanupDuplicatesRoute.POST);
  app.get("/api/admin/city-platforms/:id/dashboard", adminCityPlatformDashboardRoute.GET);
  
  // City platform verification endpoints (Data Quality System)
  app.get("/api/admin/city-platforms/:id/verification-summary", adminCityPlatformVerificationSummaryRoute.GET);
  app.post("/api/admin/city-platforms/:id/verify-churches", adminCityPlatformVerifyChurchesRoute.POST);
  app.post("/api/admin/city-platforms/:id/migrate-unverified", adminCityPlatformMigrateUnverifiedRoute.POST);
  
  // City platform regions management
  app.get("/api/admin/city-platforms/:id/regions", adminCityPlatformRegionsRoute.GET);
  app.post("/api/admin/city-platforms/:id/regions", adminCityPlatformRegionsRoute.POST);
  app.patch("/api/admin/city-platforms/:id/regions", adminCityPlatformRegionsRoute.PATCH);
  app.delete("/api/admin/city-platforms/:id/regions", adminCityPlatformRegionsRoute.DELETE);
  app.post("/api/admin/city-platforms/:id/regions/assign", adminCityPlatformRegionsAssignRoute.POST);
  
  // City platform setup status (for Getting Started Wizard)
  app.get("/api/admin/city-platforms/:id/setup-status", adminCityPlatformSetupStatusRoute.GET);
  
  // Church verification endpoint (individual church)
  app.get("/api/admin/churches/:id/verification", adminChurchVerificationRoute.GET);
  app.post("/api/admin/churches/:id/verification", adminChurchVerificationRoute.POST);
  app.patch("/api/admin/churches/:id", adminChurchByIdRoute.PATCH);
  
  // City platform users management
  app.get("/api/admin/city-platforms/:id/users", adminCityPlatformUsersRoute.GET);
  app.post("/api/admin/city-platforms/:id/users", adminCityPlatformUsersRoute.POST);
  app.patch("/api/admin/city-platforms/:id/users/:userId", adminCityPlatformUserByIdRoute.PATCH);
  app.delete("/api/admin/city-platforms/:id/users/:userId", adminCityPlatformUserByIdRoute.DELETE);

  // Church claims (Phase 5E)
  app.get("/api/churches/:id/claim", churchClaimRoute.GET);
  app.post("/api/churches/:id/claim", churchClaimRoute.POST);
  app.post("/api/churches/:id/claim/release", churchClaimReleaseRoute.POST);
  app.get("/api/churches/:id/pending-claim-status", churchPendingClaimStatusRoute.GET);
  app.delete("/api/churches/:id/claim", churchClaimRoute.DELETE);
  app.get("/api/admin/city-platforms/:id/church-claims", adminPlatformChurchClaimsRoute.GET);
  app.get("/api/admin/church-claims/:claimId", adminChurchClaimByIdRoute.GET);
  app.patch("/api/admin/church-claims/:claimId", adminChurchClaimByIdRoute.PATCH);
  app.get("/api/church-claims/approved/:churchId", churchClaimApprovedRoute.GET);

  // Facility information (editable by church admins)
  app.patch("/api/churches/:id/facility", churchFacilityRoute.PATCH);

  // Pending profile submissions
  app.get("/api/admin/profiles-pending", adminProfilesPendingRoute.GET);
  app.get("/api/admin/profiles-pending/:id", adminProfilePendingByIdRoute.GET);
  app.patch("/api/admin/profiles-pending/:id", adminProfilePendingByIdRoute.PATCH);
  app.delete("/api/admin/profiles-pending/:id", adminProfilePendingByIdRoute.DELETE);

  // Platform applications (Phase 6)
  app.post("/api/platform-applications", platformApplicationsRoute.POST);
  app.get("/api/platform-applications/my", platformApplicationsMyRoute.GET);
  app.get("/api/admin/platform-applications", adminPlatformApplicationsRoute.GET);
  app.get("/api/admin/platform-applications/:id", adminPlatformApplicationByIdRoute.GET);
  app.patch("/api/admin/platform-applications/:id", adminPlatformApplicationByIdRoute.PATCH);

  // Public platforms discovery
  app.get("/api/platforms", publicPlatformsRoute.GET);
  app.get("/api/platforms/map", publicPlatformsMapRoute.GET);
  app.get("/api/platforms/:platformId/regions", publicPlatformRegionsRoute.GET);
  app.get("/api/platforms/:platformId/regions/:regionId", publicPlatformRegionByIdRoute.GET);
  app.get("/api/platforms/:id", publicPlatformByIdRoute.GET);

  // Explore stats (public - no auth required)
  app.get("/api/explore/stats", exploreStatsRoute.GET);

  // Platform membership requests (Member Onboarding Flow)
  app.post("/api/platforms/:id/join", platformJoinRoute.POST);
  app.get("/api/platforms/:id/my-membership", platformMyMembershipRoute.GET);
  app.get("/api/admin/platform/:id/membership-requests", adminPlatformMembershipRequestsRoute.GET);
  app.get("/api/admin/platform/:id/membership-requests/:requestId", adminPlatformMembershipRequestByIdRoute.GET);
  app.patch("/api/admin/platform/:id/membership-requests/:requestId", adminPlatformMembershipRequestByIdRoute.PATCH);

  // Platform settings management (Platform Owners)
  app.get("/api/admin/platform/:id/settings", adminPlatformSettingsRoute.GET);
  app.patch("/api/admin/platform/:id/settings", adminPlatformSettingsRoute.PATCH);

  // Platform deletion (Super Admin only)
  app.get("/api/admin/platform/:id", adminPlatformByIdRoute.GET);
  app.delete("/api/admin/platform/:id", adminPlatformByIdRoute.DELETE);

  // Super Admin - data source management
  app.get("/api/admin/data-sources", adminDataSourcesRoute.GET);
  app.post("/api/admin/data-sources", adminDataSourcesRoute.POST);
  app.get("/api/admin/data-sources/dashboard", adminDataSourceDashboardRoute.GET);
  app.get("/api/admin/data-sources/:id", adminDataSourceByIdRoute.GET);
  app.patch("/api/admin/data-sources/:id", adminDataSourceByIdRoute.PATCH);
  app.delete("/api/admin/data-sources/:id", adminDataSourceByIdRoute.DELETE);
  app.post("/api/admin/data-sources/:id/trigger", adminDataSourceTriggerRoute.POST);
  app.get("/api/admin/data-sources/:id/runs", adminDataSourceRunsRoute.GET);

  // Super Admin - tileset management
  app.post("/api/admin/tileset", adminTilesetRoute.POST);
  app.get("/api/admin/tileset", adminTilesetRoute.GET);

  // Admin - platform pin cache generation
  app.post("/api/admin/platform-pins/generate", adminPlatformPinsGenerateRoute.POST);

  // Admin migrations
  app.post("/api/admin/migrations/prayer-scope", adminMigrationPrayerScopeRoute.POST);
  app.put("/api/admin/tileset", adminTilesetRoute.PUT);

  // Spreadsheet comparison (re-import missing churches)
  app.get("/api/admin/spreadsheet-compare", adminSpreadsheetCompareRoute.GET);
  app.post("/api/admin/spreadsheet-compare", adminSpreadsheetCompareRoute.POST);
  app.post("/api/admin/spreadsheet-compare/analyze", adminSpreadsheetCompareAnalyzeRoute.POST);

  // Health data overlay endpoints
  app.get("/api/health-data", healthDataRoute.GET);
  app.post("/api/health-data", healthDataRoute.POST);
  app.get("/api/health-data/metrics", healthDataMetricsRoute.GET);
  app.post("/api/health-data/metrics", healthDataMetricsRoute.POST);
  app.get("/api/health-data/categories", healthDataCategoriesRoute.GET);
  app.get("/api/health-data/tracts", healthDataTractsRoute.GET);
  app.post("/api/health-data/tracts", healthDataTractsRoute.POST);

  // Fund the Mission - Partnership & Sponsors
  app.post("/api/partnership-applications", partnershipApplicationsRoute.POST);
  app.post("/api/aare-submissions", aareSubmissionsRoute.POST);
  app.get("/api/churches/:id/fund-mission", churchFundMissionRoute.GET);
  
  // Admin - Partnership Applications
  app.get("/api/admin/partnership-applications", adminPartnershipApplicationsRoute.GET);
  app.get("/api/admin/partnership-applications/:id", adminPartnershipApplicationByIdRoute.GET);
  app.patch("/api/admin/partnership-applications/:id", adminPartnershipApplicationByIdRoute.PATCH);
  
  // Admin - Sponsors
  app.get("/api/admin/sponsors", adminSponsorsRoute.GET);
  app.post("/api/admin/sponsors", adminSponsorsRoute.POST);
  app.get("/api/admin/sponsors/:id", adminSponsorByIdRoute.GET);
  app.patch("/api/admin/sponsors/:id", adminSponsorByIdRoute.PATCH);
  app.delete("/api/admin/sponsors/:id", adminSponsorByIdRoute.DELETE);
  app.get("/api/admin/sponsors/:id/assignments", adminSponsorAssignmentsRoute.GET);
  app.post("/api/admin/sponsors/:id/assignments", adminSponsorAssignmentsRoute.POST);
  app.delete("/api/admin/sponsors/:id/assignments", adminSponsorAssignmentsRoute.DELETE);

  // Document signatures endpoints
  app.post("/api/signatures", signaturesRoute.POST);
  app.get("/api/signatures/search", signaturesSearchRoute.GET);
  app.get("/api/signatures/:id", signatureByIdRoute.GET);

  // Admin - Tract management (Census data)
  app.post("/api/admin/tracts/import", adminTractsImportRoute.POST);
  app.get("/api/admin/tracts", adminTractsRoute.GET);
  app.get("/api/tracts/resolve", tractsResolveRoute.GET);
  app.get("/api/tracts/geometries", tractsGeometriesRoute.GET);
  app.get("/api/tracts/population", tractsPopulationRoute.GET);

  // Prayer Budget & Allocations (Sprint 3 Stage 1)
  app.get("/api/churches/:churchId/prayer-budget", churchPrayerBudgetRoute.GET);
  app.post("/api/churches/:churchId/prayer-budget", churchPrayerBudgetRoute.POST);
  app.get("/api/churches/:churchId/ministry-capacity", churchMinistryCapacityRoute.GET);
  app.post("/api/churches/:churchId/ministry-capacity", churchMinistryCapacityRoute.POST);
  app.get("/api/churches/:churchId/prayer-allocations", churchPrayerAllocationsRoute.GET);
  app.put("/api/churches/:churchId/prayer-allocations", churchPrayerAllocationsRoute.PUT);
  app.get("/api/prayer-coverage/city", prayerCoverageCityRoute.GET);
  app.get("/api/prayer-coverage/church/:churchId", prayerCoverageChurchRoute.GET);
  app.get("/api/prayer-coverage/churches", async (req, res) => {
    try {
      const churchIds = await storage.getChurchIdsWithPrayerBudgets();
      res.json({ church_ids: churchIds });
    } catch (error) {
      console.error("Error fetching prayer churches:", error);
      res.status(500).json({ error: "Failed to fetch prayer churches" });
    }
  });

  // Prayer Journeys
  app.get("/api/journeys", journeysRoute.GET);
  app.post("/api/journeys", journeysRoute.POST);
  app.get("/api/journeys/share/:shareToken", journeyShareRoute.GET);
  app.get("/api/journeys/:id", journeyByIdRoute.GET);
  app.patch("/api/journeys/:id", journeyByIdRoute.PATCH);
  app.delete("/api/journeys/:id", journeyByIdRoute.DELETE);
  app.post("/api/journeys/:id/publish", journeyPublishRoute.POST);
  app.get("/api/journeys/:id/steps", journeyStepsRoute.GET);
  app.post("/api/journeys/:id/steps", journeyStepsRoute.POST);
  app.put("/api/journeys/:id/steps/reorder", journeyStepsReorderRoute.PUT);
  app.patch("/api/journeys/:id/steps/:stepId", journeyStepByIdRoute.PATCH);
  app.delete("/api/journeys/:id/steps/:stepId", journeyStepByIdRoute.DELETE);
  app.post("/api/journeys/:id/ai-suggestions", journeyAiSuggestionsRoute.POST);
  app.post("/api/journeys/:id/ai-suggest-single", journeyAiSuggestSingleRoute.POST);

  // Ministry Saturation (viewport-bounded)
  app.get("/api/ministry-saturation/city", async (req, res) => {
    try {
      const bbox = req.query.bbox as string;
      if (!bbox) {
        return res.status(400).json({ error: "bbox query parameter required (west,south,east,north)" });
      }
      const parts = bbox.split(',');
      if (parts.length !== 4 || parts.some(p => isNaN(Number(p)))) {
        return res.status(400).json({ error: "bbox must be 4 comma-separated numbers: west,south,east,north" });
      }
      const platformId = req.query.platformId as string | undefined;
      const data = await storage.getMinistryAreaSaturation(bbox, platformId);
      res.json({ tracts: data });
    } catch (error) {
      console.error("Error fetching ministry saturation:", error);
      res.status(500).json({ error: "Failed to fetch ministry saturation" });
    }
  });

  app.get("/api/ministry-saturation/baseline", async (req, res) => {
    try {
      const bbox = req.query.bbox as string;
      if (!bbox) {
        return res.status(400).json({ error: "bbox query parameter required (west,south,east,north)" });
      }
      const parts = bbox.split(',');
      if (parts.length !== 4 || parts.some(p => isNaN(Number(p)))) {
        return res.status(400).json({ error: "bbox must be 4 comma-separated numbers: west,south,east,north" });
      }
      const data = await storage.getMinistryBaselineSaturation(bbox);
      res.json({ tracts: data });
    } catch (error) {
      console.error("Error fetching ministry baseline saturation:", error);
      res.status(500).json({ error: "Failed to fetch ministry baseline saturation" });
    }
  });

  app.get("/api/ministry-saturation/clipped", async (req, res) => {
    try {
      const bbox = req.query.bbox as string;
      const platformId = req.query.platform_id as string | undefined;
      if (!bbox) {
        return res.status(400).json({ error: "bbox query parameter required (west,south,east,north)" });
      }
      const parts = bbox.split(',');
      if (parts.length !== 4 || parts.some(p => isNaN(Number(p)))) {
        return res.status(400).json({ error: "bbox must be 4 comma-separated numbers: west,south,east,north" });
      }
      const geojson = await storage.getClippedSaturationGeoJSON(bbox, platformId);
      res.json(geojson);
    } catch (error) {
      console.error("Error fetching clipped ministry saturation:", error);
      res.status(500).json({ error: "Failed to fetch clipped ministry saturation" });
    }
  });

  // Ministry Saturation Backfill (admin one-time task)
  app.post("/api/admin/ministry-saturation/backfill", async (req, res) => {
    try {
      const { supabaseServer } = await import("../lib/supabaseServer");
      const { computeAreaTractOverlaps } = await import("./services/ministry-saturation");
      const supabase = supabaseServer();

      const { data: areas, error: areasError } = await supabase.rpc("get_areas");
      if (areasError) {
        return res.status(500).json({ error: "Failed to fetch areas: " + areasError.message });
      }

      const { data: primaryAreaChurches, error: primaryError } = await supabase.rpc(
        'fn_get_primary_ministry_areas',
        { p_platform_id: null }
      );
      if (primaryError) {
        console.error("Error fetching primary ministry areas for backfill:", primaryError);
      }

      let processed = 0;
      const errors: string[] = [];

      for (const area of (areas || [])) {
        if (!area.geometry || !area.church_id) continue;
        let geometry = area.geometry;
        if (typeof geometry === 'string') {
          try { geometry = JSON.parse(geometry); } catch (e) {
            errors.push(`Area ${area.id}: failed to parse geometry`);
            continue;
          }
        }
        try {
          await computeAreaTractOverlaps(String(area.id), geometry, area.church_id);
          processed++;
        } catch (err: any) {
          errors.push(`Area ${area.id}: ${err.message}`);
        }
      }

      for (const church of (primaryAreaChurches || [])) {
        if (!church.primary_ministry_area || !church.id) continue;
        let geometry = church.primary_ministry_area;
        if (typeof geometry === 'string') {
          try { geometry = JSON.parse(geometry); } catch (e) {
            errors.push(`Primary area for church ${church.id}: failed to parse geometry`);
            continue;
          }
        }
        const areaId = `primary-${church.id}`;
        try {
          await computeAreaTractOverlaps(areaId, geometry, church.id);
          processed++;
        } catch (err: any) {
          errors.push(`Primary area ${areaId}: ${err.message}`);
        }
      }

      console.log(`[backfill] Processed ${processed} areas, ${errors.length} errors`);
      res.json({ processed, errors });
    } catch (error: any) {
      console.error("Error in ministry saturation backfill:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/ministry-saturation/cleanup-orphans", async (req, res) => {
    try {
      const { verifyAuth } = await import("../lib/authMiddleware");
      const auth = await verifyAuth(req);
      if (!auth.authenticated || !auth.isSuperAdmin) {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const { cleanupOrphanedOverlaps } = await import("./services/ministry-saturation");
      const result = await cleanupOrphanedOverlaps();
      res.json(result);
    } catch (error: any) {
      console.error("Error cleaning up orphaned overlaps:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Church Ministry Allocations (Phase 3 - per-area distribution)
  app.get("/api/churches/:churchId/ministry-allocations", churchMinistryAllocationsRoute.GET);
  app.post("/api/churches/:churchId/ministry-allocations", churchMinistryAllocationsRoute.POST);

  // Church Engagement Scores (Sprint 4)
  app.get("/api/churches/:churchId/engagement", churchEngagementRoute.GET);
  app.post("/api/churches/:churchId/engagement", churchEngagementRoute.POST);

  const httpServer = createServer(app);

  return httpServer;
}
