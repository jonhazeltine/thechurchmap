# The Church Map Platform

## Overview
The Church Map is a geospatial collaboration platform connecting churches based on ministry callings and geographic reach. Its core purpose is to facilitate church discovery, filtering, and searching within custom boundaries to foster collaboration and provide a comprehensive view of ministry coverage. The long-term vision is to establish a national, multi-city network of faith-based organizations, enhancing their collective impact and visibility as a vital resource for community impact and strategic planning.

## User Preferences
- Professional, trustworthy aesthetics (Google Maps + LinkedIn hybrid)
- Inter font for clean, modern typography
- Map-first interface with collapsible sidebar
- Beautiful empty states with custom illustrations

## System Architecture
The platform utilizes a React frontend, an Express.js backend, Supabase for database and authentication, and Mapbox GL for interactive mapping.

**UI/UX Decisions:**
- Employs Shadcn UI for a consistent design system.
- Features a map-first interface with a collapsible sidebar for filters and church details.
- Ministry callings are represented as visual tags.
- Includes a dedicated right sidebar for consolidated ministry area controls.
- A marketing landing page at `/about` details platform vision, features, benefits, and calls to action.

**Technical Implementations:**
- **Geospatial Strategy:** Leverages PostGIS with geography types, GIST indexes, and custom RPC functions for efficient spatial queries (polygon searches, GeoJSON output, boundary detection).
- **Map Integration:** Uses Mapbox GL Draw for polygon tools and displays ministry areas as GeoJSON layers, with map viewport persistence via `sessionStorage`.
- **Database & Backend:** Utilizes TypeScript schemas for core entities. The backend API is implemented with Supabase RPC functions, PostGIS, and Row Level Security (RLS) for data access control.
- **Authentication:** Supabase Auth manages user authentication, session management, and JWT verification.
- **Multi-City Architecture:** Supports localized "City Platforms" with core tables, role hierarchy, and RLS policies, enabling platform creation via an application process. Platform context is managed through path-based URLs (e.g., `/grand-rapids`).
- **Platform Management:** Includes public platform discovery, request-based membership, and owner-managed settings, with a platform switcher in the header.
- **Church Linking:** Churches are automatically linked to city platforms using a PostGIS RPC function based on boundary selection.
- **Admin Panel:** Provides role-based access for content and church management, including an enhanced dashboard and platform-scoped church claims.
- **Boundary Map Picker:** An interactive full-screen map facilitates boundary selection with PostGIS viewport queries and dynamic boundary type switching.
- **Platform Regions System:** Allows for named groupings of boundaries within city platforms (e.g., "Downtown", "East Side"), with custom-named areas, distinct colors, church counts, and optional cover images.
- **User Onboarding:** A multi-step wizard guides users through church affiliation, platform joining, and church submission.
- **Data Source Management System:** A centralized admin panel orchestrates data ingestion for various sources (Crime, Health, Demographics, Boundaries, Churches).
- **Crime Data Processing:** Aggregates crime incidents into rolling windows and calculates per-100K crime rates using `tract_fips`.
- **Content Filtering:** Provides platform-level toggles for displaying specific church denominations.
- **CDC Cache Warming Service:** Pre-fetches CDC PLACES health metrics for active city platforms on server startup.
- **Church Data Quality System:** Verifies church data against Google Places API, tracks verification status, and provides data quality scoring and automatic enrichment.
- **Google Places Import Job Tracking:** Tracks import jobs with progress, status, and resume capabilities.

**Feature Specifications:**
- **Church Discovery:** Enables filtering by ministry collaboration needs/haves and searching by polygon or geographic boundaries. Supports inline editing and platform-specific place search biasing.
- **Ministry Area Visualization & Manager:** All polygons are unified as "Ministry Areas" with named designations. Callings are preserved as tags. A filter panel and visibility toggle are available in the ViewsSidebar.
- **Prayer System (Prayer Mode 3.0):** A comprehensive tract-based prayer system where churches allocate prayer budgets geographically using census tracts. Features a map-first prayer request submission, prayer coverage visualization, and a budget wizard.
  - **Census Tract Infrastructure:** Manages `boundaries_tracts` with PostGIS geometry and population, and provides API endpoints for tract resolution, geometries, and import.
  - **Prayer Budgets & Allocations:** Churches manage daily intercessor counts and allocate prayer percentages to tracts.
  - **Prayer Coverage View:** Visualizes citywide and individual church prayer coverage with a gradient fill layer.
  - **Prayer Focus Area:** A dedicated church-owned map in the Ministry Areas tab for managing prayer allocations.
  - **Allocation Mode:** A dedicated map state for managing tract-level prayer allocations with an interactive overlay.
- **Ministry Saturation System:** Visualizes tract-level ministry coverage computed from church capacity and geographic reach using population-weighted distribution.
  - **Ministry Capacity:** Stores church-specific community ministry volunteers, annual ministry budget, and effective_pop (total population inside ministry footprint).
  - **Polygon-Tract Intersection Engine:** Caches spatial overlaps between ministry areas and tracts with sliver filtering (overlap_frac >= 0.02). Clipped geometries use ST_Intersection for rendering within ministry boundaries only.
  - **Population-Weighted Distribution:** Each church distributes capacity to tracts proportionally to `pop_in_poly / effective_pop`, ensuring larger footprints dilute capacity across more people.
  - **Saturation Computation:** tract_saturation = SUM(church_alloc_to_tract) / tract_pop. Provides viewport-bounded, tract-level saturation values with uncovered tracts included at zero saturation for complete tooltip coverage.
  - **Map Rendering:** Displays saturation as a blue choropleth layer with opacity scaled by both saturation value and overlap_fraction, fading slivers naturally.
  - **Per-Area Allocation Sliders:** Allows administrators to adjust ministry allocation percentages per area.
  - **Contributor Tooltips:** Provides hover tooltips on saturation tracts with area labels, population, church counts, and saturation levels.
- **Global Community Feed:** A social-style feed with reactions, infinite scroll, and auto-generated prayer posts.
- **Church Profile Pages:** Enhanced with team management, prayer requests, community posts, and church branding uploads.
- **Health Data Overlay System:** Choropleth map visualization for over 45 health metrics from CDC PLACES and Census ACS.
- **Area Intelligence System:** Provides ministry area analysis, partner discovery, and collaboration matching.
- **Collaboration Ranking System:** A weighted scoring algorithm for partnership opportunities based on various factors.
- **Collaboration Map Visualization:** Displays visual connections for active collaborations on the map.
- **OG Image System:** Server-side Open Graph image generation using Satori and @resvg/resvg-js, integrating Mapbox Static Images API for map backgrounds.
- **Fund the Mission System:** A partnership activation system enabling churches to receive mission funding through real estate activity, including a workflow, sponsor system, and application process.
- **Church Engagement Scoring System:** A two-phase decay scoring system (0.0-1.0) measuring church prayer activity, influencing map coverage opacity, with UI indicators for engagement levels.
- **Formation Prayer Exchange Integration:** Facilitates prayer request exchange with The Formation App, allowing church-scoped prayers to sync between platforms. Features manual church pairing and API endpoints for fetching, responding, pushing, and syncing prayers.

## External Dependencies
- **Supabase:** Database, authentication, RLS.
- **Mapbox GL:** Interactive mapping library.
- **Mapbox GL Draw:** Map polygon drawing/editing.
- **PostGIS:** Geospatial extension for PostgreSQL.
- **Vite:** Frontend build tool.
- **Express.js:** Backend framework.
- **Shadcn UI:** React component library.
- **TipTap:** Rich text editor.
- **Framer Motion:** Animation library.
- **emoji-mart:** Emoji picker.
- **react-infinite-scroll-component:** Infinite scrolling.
- **TIGERweb API:** US geographic boundaries.
- **CDC PLACES API (Socrata endpoint):** Health metrics.
- **Census ACS API:** Demographic data.
- **Overpass API:** OpenStreetMap church data.
- **FBI Crime Data API:** National crime statistics.
- **ArcGIS Hub:** Local crime data.
- **Mapbox Static Images API:** Static map images.