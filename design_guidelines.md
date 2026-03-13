# The Church Map - Design Guidelines

## Design Approach

**Hybrid Approach**: Combining Google Maps' geospatial patterns + LinkedIn's professional networking UI + Material Design system for data-heavy components.

**Rationale**: This platform needs trustworthy, professional aesthetics for church collaboration while supporting complex map interactions and information-dense profiles. The design prioritizes clarity, accessibility, and efficient data discovery.

---

## Typography

**Font Stack**:
- **Primary**: Inter (via Google Fonts) - headings, UI elements, navigation
- **Secondary**: System font stack - body text, form inputs for performance

**Hierarchy**:
- **H1**: 2.5rem (40px), font-weight 700, leading-tight - Page titles
- **H2**: 2rem (32px), font-weight 600, leading-snug - Section headers
- **H3**: 1.5rem (24px), font-weight 600, leading-normal - Card titles, subsections
- **H4**: 1.25rem (20px), font-weight 500 - List headers, labels
- **Body**: 1rem (16px), font-weight 400, leading-relaxed - Primary content
- **Small**: 0.875rem (14px), font-weight 400 - Metadata, captions
- **Tiny**: 0.75rem (12px), font-weight 500 - Badges, tags

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, 8, 12, 16** for consistency
- Component padding: p-4 to p-6
- Section spacing: py-8 to py-16
- Card gaps: gap-4 to gap-6
- Element margins: m-2, m-4, m-8

**Grid System**:
- **Map + Sidebar**: 70/30 split on desktop (map takes priority)
- **Church Cards**: 3-column grid (lg), 2-column (md), 1-column (mobile)
- **Calling Filters**: Horizontal scrollable chips on mobile, wrapped grid on desktop
- **Profile Details**: 2-column layout for metadata/info sections

**Container Widths**:
- Full-width: Map canvas, navigation header
- Contained: max-w-7xl for content areas
- Narrow: max-w-3xl for forms, reading content

---

## Core Components

### Navigation Header
- **Structure**: Fixed top bar with logo left, search center, user actions right
- **Height**: h-16 (64px)
- **Search**: Prominent search bar (w-96 on desktop) with church/calling type-ahead
- **Actions**: Sign in, Add Church CTA, Profile menu
- **Implementation**: Sticky positioning, slight shadow on scroll

### Map Interface (Primary Canvas)
- **Full-viewport**: Map takes majority of screen real estate
- **Controls**: Zoom, layers toggle (callings, areas), draw polygon tool in top-right overlay
- **Markers**: Custom church pins with calling-based visual coding
- **Info Windows**: Compact church preview cards on marker click
- **Sidebar Toggle**: Collapsible left panel for search results/filters

### Church Cards
- **Compact Grid View**:
  - Church name (H3)
  - Denomination + City/State (Small text)
  - Calling badges (horizontal row, 3-4 max visible)
  - "View Profile" link
  - Hover: subtle elevation increase
  
- **Expanded Profile View**:
  - Hero section: Church photo (16:9 ratio, h-64) with blurred CTA overlay
  - Details grid: Contact info, website, description
  - Callings section: All associated ministry callings with descriptions
  - Collaboration section: Two-column "What We Have" / "What We Need" lists
  - Map widget: Small embedded map showing church location

### Ministry Calling Badges
- **Pill design**: Rounded-full, px-3 py-1
- **Typography**: Small text (0.875rem), font-weight 500
- **Interaction**: Clickable for filtering, hover opacity change
- **Categories Visual Coding**:
  - Place: Solid fill
  - People: Outlined style
  - Problem: Dashed border
  - Purpose: Solid purple background
- **Multi-select**: Checked state with checkmark icon

### Sidebar Panel
- **Width**: w-96 (384px) on desktop, full-width drawer on mobile
- **Sections**:
  - Filter controls (calling checkboxes, denomination select)
  - Search results list (scrollable)
  - Active polygon info (when polygon drawn)
- **Scroll**: Independent scroll from map
- **Toggle**: Smooth slide animation (transition-transform duration-300)

### Area Management
- **Drawing Tool**: Floating toolbar with polygon/circle/rectangle tools
- **Active Drawing**: Highlighted border with vertex handles
- **Area Cards**: Similar to church cards but with area type badge
- **Association**: Visual connection lines between areas and churches

### Forms
- **Church Profile Form**:
  - Multi-step: Basic Info → Ministry Callings → Collaboration → Confirmation
  - Progress indicator: Stepper component at top
  - Field spacing: space-y-4
  - Input style: Outlined with focus ring
  - Help text: Below each field in muted text
  
- **Claim Church**: Modal overlay, compact form with verification fields

### Empty States
- **No Search Results**: Illustration + "Try adjusting filters" message
- **No Churches in Polygon**: Map graphic + "Draw a larger area" suggestion
- **Unclaimed Church**: Banner with "Claim this church" prominent CTA

---

## Interaction Patterns

### Map Interactions
- **Click marker**: Open info window with church preview
- **Draw polygon**: Click to add vertices, double-click to complete
- **Zoom**: Mouse wheel, pinch gestures, +/- buttons
- **Pan**: Click-drag on desktop, touch-drag on mobile

### Search & Filter
- **Real-time**: Debounced search input (300ms delay)
- **Multi-filter**: Additive filtering (AND logic for multiple callings)
- **Clear filters**: Single "Reset all" button
- **Results count**: "Showing X churches" above results

### Loading States
- **Map loading**: Skeleton markers that fade in
- **Card loading**: Shimmer effect placeholders
- **Infinite scroll**: Load more as user scrolls sidebar

---

## Accessibility

- **Color contrast**: Minimum WCAG AA compliance (4.5:1 for text)
- **Focus indicators**: 2px solid ring on all interactive elements
- **Keyboard navigation**: Full support for map controls, filters, cards
- **Screen readers**: Proper ARIA labels for map markers, polygon tools
- **Touch targets**: Minimum 44x44px for all clickable elements

---

## Images

### Hero Images
- **Church Profile Pages**: Large hero image (16:9, h-64 to h-96) showing church building or community
  - Placement: Top of profile, full-width
  - Overlay: Dark gradient (bottom-to-top) for text readability
  - CTA Buttons: Blurred backdrop (backdrop-blur-sm), positioned bottom-right
  
### Card Thumbnails
- **Church Cards**: Optional thumbnail (square, 80x80px) left-aligned
- **Fallback**: Generic church icon placeholder when no photo available

### Empty States
- **Custom Illustrations**: Simple, friendly graphics for no-results scenarios
- **Map Background**: Subtle pattern or neutral satellite imagery when no data

---

## Responsive Breakpoints

- **Mobile** (<768px): Single column, drawer sidebar, stacked filters
- **Tablet** (768-1024px): 2-column grids, persistent sidebar
- **Desktop** (>1024px): Full layout with map + sidebar, 3-column grids

---

This design creates a professional, trustworthy platform that balances geospatial complexity with approachable community-building aesthetics. The hierarchy emphasizes the map as primary discovery tool while maintaining comprehensive church profiles for detailed exploration.