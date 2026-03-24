import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { ChurchWithCallings } from "@shared/schema";
import type { InternalTagStyle } from "./types";
import {
  CLUSTER_SOURCE_ID, CLUSTER_LAYER_ID, CLUSTER_COUNT_LAYER_ID, UNCLUSTERED_LAYER_ID,
  getPinIconSvg,
} from "./constants";

interface ChurchPinLayerProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  draw: React.MutableRefObject<any | null>;
  markersRef: React.MutableRefObject<Map<string, mapboxgl.Marker>>;
  popupsRef: React.MutableRefObject<Map<string, mapboxgl.Popup>>;
  markerSizeUpdatersRef: React.MutableRefObject<Map<string, (selectedId?: string | null) => void>>;
  markerInteractionRef: React.MutableRefObject<boolean>;
  churches: ChurchWithCallings[];
  selectedChurchId: string | null;
  onChurchClick?: (church: ChurchWithCallings) => void;
  onChurchPrayerFocus?: (churchId: string, churchName: string) => void;
  prayerOverlayVisible: boolean;
  drawingAreaMode: boolean;
  drawingPrimaryArea: boolean;
  allocationModeActive: boolean;
  performanceMode: boolean;
  churchPinsVisible: boolean;
  platformSettings: {
    defaultPinColor: string;
    defaultPinIcon: string;
    mapBaseStyle: string;
  };
  internalTagStyles: Record<string, InternalTagStyle>;
}

export function ChurchPinLayer({
  map,
  draw,
  markersRef,
  popupsRef,
  markerSizeUpdatersRef,
  markerInteractionRef,
  churches,
  selectedChurchId,
  onChurchClick,
  onChurchPrayerFocus,
  prayerOverlayVisible,
  drawingAreaMode,
  drawingPrimaryArea,
  allocationModeActive,
  performanceMode,
  churchPinsVisible,
  platformSettings,
  internalTagStyles,
}: ChurchPinLayerProps) {
  // Stable refs for values accessed inside closures
  const selectedChurchIdRef = useRef(selectedChurchId);
  selectedChurchIdRef.current = selectedChurchId;
  const drawingAreaModeRef = useRef(drawingAreaMode);
  drawingAreaModeRef.current = drawingAreaMode;
  const drawingPrimaryAreaRef = useRef(drawingPrimaryArea);
  drawingPrimaryAreaRef.current = drawingPrimaryArea;
  const prayerOverlayVisibleRef = useRef(prayerOverlayVisible);
  prayerOverlayVisibleRef.current = prayerOverlayVisible;
  const onChurchPrayerFocusRef = useRef(onChurchPrayerFocus);
  onChurchPrayerFocusRef.current = onChurchPrayerFocus;
  const onChurchClickRef = useRef(onChurchClick);
  onChurchClickRef.current = onChurchClick;
  const performanceModeRef = useRef(performanceMode);
  performanceModeRef.current = performanceMode;
  const platformSettingsRef = useRef(platformSettings);
  platformSettingsRef.current = platformSettings;
  const churchesRef = useRef(churches);
  churchesRef.current = churches;

  // Create / remove DOM markers when churches data changes
  useEffect(() => {
    if (!map.current || !churches) return;

    const currentChurchIds = new Set(churches.map(c => c.id));
    
    // Remove markers and popups for churches that no longer exist
    markersRef.current.forEach((marker, churchId) => {
      if (!currentChurchIds.has(churchId)) {
        marker.remove();
        markersRef.current.delete(churchId);
        
        // Also remove associated popup and size updater
        const popup = popupsRef.current.get(churchId);
        if (popup) {
          popup.remove();
          popupsRef.current.delete(churchId);
        }
        markerSizeUpdatersRef.current.delete(churchId);
      }
    });

    // Add markers for new churches only (don't update existing ones)
    churches.forEach((church) => {
      // Check for location - use display_lat/display_lng as fallback if no location.coordinates
      const hasLocationCoords = church.location?.coordinates;
      const hasDisplayCoords = church.display_lat != null && church.display_lng != null;
      
      if (!hasLocationCoords && !hasDisplayCoords) return;

      // Skip if marker already exists - let it stay at its position!
      if (markersRef.current.has(church.id)) {
        return;
      }

      // Create new marker with dynamic sizing based on zoom
      // Use display location for visual position if available, otherwise use real location
      const realLng = hasLocationCoords ? church.location!.coordinates[0] : church.display_lng!;
      const realLat = hasLocationCoords ? church.location!.coordinates[1] : church.display_lat!;
      const lng = church.display_lng ?? realLng;
      const lat = church.display_lat ?? realLat;
      const el = document.createElement('div');
      
      // Function to calculate marker size based on zoom level and selected state
      const getMarkerSize = (zoom: number, isSelected: boolean): number => {
        // Base sizes - regional stays good, neighborhood shrinks more
        let baseSize: number;
        if (zoom <= 7) baseSize = 18;       // Very zoomed out - small
        else if (zoom <= 9) baseSize = 22;  // Regional view
        else if (zoom <= 11) baseSize = 24; // City view (slightly smaller)
        else if (zoom <= 13) baseSize = 26; // Neighborhood view (smaller to reduce overlap)
        else if (zoom <= 15) baseSize = 30; // Street view
        else baseSize = 34;                 // Very zoomed in
        
        // Selected markers are 1.25x larger
        return isSelected ? Math.round(baseSize * 1.25) : baseSize;
      };
      
      // Function to update marker size - takes currentSelectedId as parameter to avoid stale closure
      // Optimized: removed CSS transitions during zoom to reduce GPU overhead on touch devices
      const updateMarkerSize = (currentSelectedId?: string | null) => {
        if (!map.current) return;
        const zoom = map.current.getZoom();
        const isSelected = currentSelectedId === church.id;
        const size = getMarkerSize(zoom, isSelected);
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        // No transition during rapid zoom for performance
        
        // Update icon sizes proportionally (40% of marker size, min 8px)
        const iconSize = Math.max(8, Math.round(size * 0.40));
        const icons = el.querySelectorAll('.default-pin-icon svg, .internal-tag-icon svg');
        icons.forEach(svg => {
          (svg as SVGElement).style.width = `${iconSize}px`;
          (svg as SVGElement).style.height = `${iconSize}px`;
        });
      };
      
      // Store the update function for later use when selection changes
      markerSizeUpdatersRef.current.set(church.id, updateMarkerSize);
      
      // Check if this marker should be initially selected (e.g., when navigating from church detail)
      const isInitiallySelected = selectedChurchIdRef.current === church.id;
      
      // Initial size - respect selection state on creation
      const initialSize = map.current ? getMarkerSize(map.current.getZoom(), isInitiallySelected) : 32;
      el.style.width = `${initialSize}px`;
      el.style.height = `${initialSize}px`;
      el.setAttribute('data-testid', `marker-church-${church.id}`);
      
      // Apply default pin color and icon from platform settings
      const defaultPinColor = platformSettingsRef.current.defaultPinColor || '#DC2626';
      const defaultPinIcon = platformSettingsRef.current.defaultPinIcon || '';
      
      // Set className and background color - using inline style with important to ensure it applies
      // GPU optimization: will-change hints for smoother transforms on touch devices
      el.className = 'rounded-full border-2 border-white shadow-lg cursor-pointer hover:opacity-90';
      el.style.setProperty('background-color', defaultPinColor, 'important');
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.willChange = 'transform'; // GPU acceleration hint
      el.style.contain = 'layout style'; // CSS containment for performance
      
      // Add icon if configured (using inline SVG lookup)
      if (defaultPinIcon) {
        const iconSvg = getPinIconSvg(defaultPinIcon);
        if (iconSvg) {
          const iconWrapper = document.createElement('div');
          iconWrapper.className = 'default-pin-icon';
          iconWrapper.style.zIndex = '10';
          iconWrapper.style.pointerEvents = 'none';
          iconWrapper.innerHTML = iconSvg;
          
          // Style the SVG to be visible on colored background - size is 40% of pin
          const iconSize = Math.max(8, Math.round(initialSize * 0.40));
          const svg = iconWrapper.querySelector('svg');
          if (svg) {
            svg.style.fill = 'white';
            svg.style.color = 'white';
            svg.style.width = `${iconSize}px`;
            svg.style.height = `${iconSize}px`;
          }
          
          el.appendChild(iconWrapper);
        }
      }
      
      // Apply selected styling if this is the initially selected church
      if (isInitiallySelected) {
        el.classList.add('selected-church-marker');
        console.log('[Marker Created] Applied initial selection styling to:', church.name, church.id);
      }
      
      // Hide marker if drawing primary area (clean map for drawing)
      if (drawingPrimaryAreaRef.current || drawingAreaModeRef.current) {
        el.style.visibility = 'hidden';
      }
      
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: 'center',
        pitchAlignment: 'map'
      })
        .setLngLat([lng, lat])
        .addTo(map.current!);
      
      // NOTE: Zoom-based size updates are now handled by a single throttled handler
      // instead of individual listeners per marker (performance optimization)

      markersRef.current.set(church.id, marker);

      // Hover preview popup (only at zoom level 13+)
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15,
        className: 'church-preview-popup'
      });

      // Store popup reference for cleanup
      popupsRef.current.set(church.id, popup);

      // Track touch vs click to handle mobile interactions
      let touchMoved = false;
      let popupVisible = false;

      // Touch event handlers for mobile
      el.addEventListener('touchstart', () => {
        touchMoved = false;
      });

      el.addEventListener('touchmove', () => {
        touchMoved = true;
      });

      el.addEventListener('touchend', (e) => {
        if (touchMoved) return; // Ignore if user was scrolling/panning

        e.preventDefault();
        e.stopPropagation();
        
        // Set marker interaction flag to prevent map click from deselecting
        markerInteractionRef.current = true;
        // Clear the flag after a longer delay - Mapbox click fires ~200ms after touch
        // Using 300ms to be safe and cover all timing variations
        setTimeout(() => {
          markerInteractionRef.current = false;
        }, 300);

        // In Prayer Mode: open the prayer dialog instead of church detail
        if (prayerOverlayVisibleRef.current && onChurchPrayerFocusRef.current) {
          popup.remove();
          popupVisible = false;
          onChurchPrayerFocusRef.current(church.id, church.name);
          return;
        }

        // On touch devices: tap shows/refreshes the popup tooltip
        // The popup contains a "View Profile" link for navigation
        if (map.current && map.current.getZoom() >= 11) {
          showPopup();
          popupVisible = true;
        }
        onChurchClick?.(church);
      });

      // Click handler for mouse/desktop - stop propagation to prevent map click from firing
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // In Prayer Mode: open the prayer dialog instead of church detail
        if (prayerOverlayVisibleRef.current && onChurchPrayerFocusRef.current) {
          popup.remove();
          popupVisible = false;
          onChurchPrayerFocusRef.current(church.id, church.name);
          return;
        }
        
        onChurchClick?.(church);
      });

      // Function to show popup (shared between hover and touch)
      const showPopup = () => {
        if (!map.current || map.current.getZoom() < 11) return;

        // Close all other popups first (fixes mobile issue where old popup stays open)
        popupsRef.current.forEach((p, id) => {
          if (id !== church.id) {
            p.remove();
          }
        });

        // Create popup content using DOM APIs (safe from XSS)
        const container = document.createElement('div');
        container.className = 'p-3 min-w-[220px]';

        // Header with image and title
        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex items-start gap-3 mb-2';

        const imageDiv = document.createElement('div');
        imageDiv.className = 'w-12 h-12 bg-muted rounded-md flex items-center justify-center flex-shrink-0';
        imageDiv.innerHTML = '<svg class="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>';

        const textDiv = document.createElement('div');
        textDiv.className = 'flex-1 min-w-0';

        const nameH3 = document.createElement('h3');
        nameH3.className = 'font-semibold text-sm leading-tight mb-1';
        nameH3.textContent = church.name;
        textDiv.appendChild(nameH3);

        if (church.address || church.city) {
          const addressP = document.createElement('p');
          addressP.className = 'text-xs text-muted-foreground leading-tight';
          let rawAddr = church.address || '';
          const city = church.city || '';
          const state = church.state || '';
          if (rawAddr) {
            const parts = rawAddr.split(',').map((s: string) => s.trim());
            const seen = new Set<string>();
            const unique: string[] = [];
            for (const p of parts) {
              const key = p.toLowerCase();
              if (key && !seen.has(key)) {
                seen.add(key);
                unique.push(p);
              }
            }
            rawAddr = unique.join(', ');
          }
          const cityState = [city, state].filter(Boolean).join(', ');
          if (rawAddr && city && rawAddr.toLowerCase().includes(city.toLowerCase())) {
            addressP.textContent = rawAddr;
          } else {
            addressP.textContent = [rawAddr, cityState].filter(Boolean).join(', ');
          }
          textDiv.appendChild(addressP);
        }

        if (church.phone) {
          const phoneLink = document.createElement('a');
          phoneLink.href = `tel:${church.phone}`;
          phoneLink.className = 'text-xs text-primary hover:underline mt-1 block';
          phoneLink.textContent = church.phone;
          phoneLink.setAttribute('data-testid', 'link-phone-popup');
          textDiv.appendChild(phoneLink);
        }

        headerDiv.appendChild(imageDiv);
        headerDiv.appendChild(textDiv);
        container.appendChild(headerDiv);

        // Add "View Profile" button
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'mt-3 pt-3 border-t';
        
        const profileButton = document.createElement('button');
        profileButton.className = 'w-full px-3 py-2 text-xs font-medium text-primary bg-accent hover:bg-accent/80 rounded-md transition-colors';
        profileButton.textContent = 'View Profile';
        profileButton.setAttribute('data-testid', 'button-view-profile-popup');
        profileButton.addEventListener('click', (e) => {
          e.stopPropagation();
          popup.remove();
          // Navigate to full church profile page
          window.location.href = `/church/${church.id}`;
        });
        
        buttonDiv.appendChild(profileButton);
        container.appendChild(buttonDiv);

        popup.setLngLat([lng, lat])
          .setDOMContent(container)
          .addTo(map.current!);
      };

      // Mouse hover handlers for desktop with delay to allow reaching the popup
      let hideTimeout: ReturnType<typeof setTimeout> | null = null;
      let isHoveringPopup = false;
      
      const clearHideTimeout = () => {
        if (hideTimeout) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
      };
      
      const scheduleHide = () => {
        clearHideTimeout();
        hideTimeout = setTimeout(() => {
          if (!isHoveringPopup) {
            popup.remove();
            popupVisible = false;
          }
        }, 150); // Small delay to allow mouse to reach popup
      };
      
      el.addEventListener('mouseenter', () => {
        clearHideTimeout();
        showPopup();
        popupVisible = true;
        
        // Add hover listeners to popup content after it's shown
        const popupElement = popup.getElement();
        if (popupElement) {
          popupElement.addEventListener('mouseenter', () => {
            isHoveringPopup = true;
            clearHideTimeout();
          });
          popupElement.addEventListener('mouseleave', () => {
            isHoveringPopup = false;
            scheduleHide();
          });
        }
      });

      el.addEventListener('mouseleave', () => {
        scheduleHide();
      });
    });
    // Note: onChurchClick intentionally not in deps - we use the latest via closure
  }, [churches]);

  // Church pins visibility toggle
  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.display = churchPinsVisible ? '' : 'none';
    });
    if (map.current) {
      const m = map.current;
      const visibility = churchPinsVisible ? 'visible' : 'none';
      [CLUSTER_LAYER_ID, CLUSTER_COUNT_LAYER_ID, UNCLUSTERED_LAYER_ID].forEach(layerId => {
        if (m.getLayer(layerId)) {
          m.setLayoutProperty(layerId, 'visibility', visibility);
        }
      });
    }
  }, [churchPinsVisible]);

  // Performance Mode: Layer lifecycle (only responds to performanceMode toggle)
  useEffect(() => {
    if (!map.current) return;

    const mapInstance = map.current;

    // Helper to remove cluster layers and source
    const removeClusterLayers = () => {
      if (!mapInstance) return;
      try {
        if (mapInstance.getLayer(CLUSTER_COUNT_LAYER_ID)) {
          mapInstance.removeLayer(CLUSTER_COUNT_LAYER_ID);
        }
        if (mapInstance.getLayer(CLUSTER_LAYER_ID)) {
          mapInstance.removeLayer(CLUSTER_LAYER_ID);
        }
        if (mapInstance.getLayer(UNCLUSTERED_LAYER_ID)) {
          mapInstance.removeLayer(UNCLUSTERED_LAYER_ID);
        }
        if (mapInstance.getSource(CLUSTER_SOURCE_ID)) {
          mapInstance.removeSource(CLUSTER_SOURCE_ID);
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
    };

    // Helper to show/hide DOM markers
    const setMarkersVisible = (visible: boolean) => {
      markersRef.current.forEach((marker) => {
        const el = marker.getElement();
        el.style.display = visible ? 'flex' : 'none';
      });
    };

    // Helper to create cluster layers with empty initial data
    const createClusterLayers = () => {
      if (!mapInstance || !mapInstance.isStyleLoaded()) return;
      if (mapInstance.getSource(CLUSTER_SOURCE_ID)) return; // Already exists

      mapInstance.addSource(CLUSTER_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 40,
        clusterMinPoints: 5,
      });

      // Cluster circles layer
      mapInstance.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#DC2626',
          'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 50, 40],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Cluster count labels
      mapInstance.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // Unclustered points (individual churches)
      mapInstance.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#DC2626',
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
    };

    // Cluster click handler - zoom to expand
    const handleClusterClick = (e: mapboxgl.MapMouseEvent) => {
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER_ID],
      });
      if (!features.length) return;

      const clusterId = features[0].properties?.cluster_id;
      const source = mapInstance.getSource(CLUSTER_SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (!source || !clusterId) return;

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        const geometry = features[0].geometry;
        if (geometry.type === 'Point') {
          mapInstance.easeTo({
            center: geometry.coordinates as [number, number],
            zoom: zoom ?? 14,
          });
        }
      });
    };

    // Unclustered point click handler - open church detail
    const handleUnclusteredClick = (e: mapboxgl.MapMouseEvent) => {
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: [UNCLUSTERED_LAYER_ID],
      });
      if (!features.length) return;

      const churchId = features[0].properties?.id;
      if (churchId && onChurchClickRef.current) {
        const church = churchesRef.current.find(c => c.id === churchId);
        if (church) {
          onChurchClickRef.current(church);
        }
      }
    };

    // Cursor change on hover
    const handleMouseEnter = () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    };
    const handleMouseLeave = () => {
      mapInstance.getCanvas().style.cursor = '';
    };

    // Setup or teardown based on performanceMode
    const setupPerformanceMode = () => {
      if (!mapInstance.isStyleLoaded()) return;

      if (performanceMode) {
        // Performance mode ON: hide DOM markers, create cluster layers
        setMarkersVisible(false);
        createClusterLayers();

        // Add event listeners
        mapInstance.on('click', CLUSTER_LAYER_ID, handleClusterClick);
        mapInstance.on('click', UNCLUSTERED_LAYER_ID, handleUnclusteredClick);
        mapInstance.on('mouseenter', CLUSTER_LAYER_ID, handleMouseEnter);
        mapInstance.on('mouseleave', CLUSTER_LAYER_ID, handleMouseLeave);
        mapInstance.on('mouseenter', UNCLUSTERED_LAYER_ID, handleMouseEnter);
        mapInstance.on('mouseleave', UNCLUSTERED_LAYER_ID, handleMouseLeave);
      } else {
        // Performance mode OFF: show DOM markers, remove cluster layers
        setMarkersVisible(true);
        removeClusterLayers();

        // Remove event listeners
        mapInstance.off('click', CLUSTER_LAYER_ID, handleClusterClick);
        mapInstance.off('click', UNCLUSTERED_LAYER_ID, handleUnclusteredClick);
        mapInstance.off('mouseenter', CLUSTER_LAYER_ID, handleMouseEnter);
        mapInstance.off('mouseleave', CLUSTER_LAYER_ID, handleMouseLeave);
        mapInstance.off('mouseenter', UNCLUSTERED_LAYER_ID, handleMouseEnter);
        mapInstance.off('mouseleave', UNCLUSTERED_LAYER_ID, handleMouseLeave);
      }
    };

    // Run setup when map is ready
    if (mapInstance.isStyleLoaded()) {
      setupPerformanceMode();
    } else {
      mapInstance.once('load', setupPerformanceMode);
    }

    // Also handle style changes (map style reload)
    const handleStyleLoad = () => {
      if (performanceModeRef.current) {
        createClusterLayers();
      }
    };
    mapInstance.on('style.load', handleStyleLoad);

    // Cleanup only runs when performanceMode changes or component unmounts
    return () => {
      if (mapInstance) {
        mapInstance.off('style.load', handleStyleLoad);
        mapInstance.off('click', CLUSTER_LAYER_ID, handleClusterClick);
        mapInstance.off('click', UNCLUSTERED_LAYER_ID, handleUnclusteredClick);
        mapInstance.off('mouseenter', CLUSTER_LAYER_ID, handleMouseEnter);
        mapInstance.off('mouseleave', CLUSTER_LAYER_ID, handleMouseLeave);
        mapInstance.off('mouseenter', UNCLUSTERED_LAYER_ID, handleMouseEnter);
        mapInstance.off('mouseleave', UNCLUSTERED_LAYER_ID, handleMouseLeave);
        
        // Only remove layers when turning OFF performance mode (not during re-renders)
        if (!performanceMode) {
          // We're switching to non-performance mode, cleanup is handled above
        }
      }
    };
  }, [performanceMode]);

  // Performance Mode: Data updates (only updates source data when churches change)
  useEffect(() => {
    if (!map.current || !performanceMode) return;

    const mapInstance = map.current;

    // Build GeoJSON feature collection from churches
    const featureCollection = {
      type: 'FeatureCollection' as const,
      features: churches
        .filter(church => {
          const hasLocationCoords = church.location?.coordinates;
          const lng = hasLocationCoords ? church.location!.coordinates[0] : church.display_lng;
          const lat = hasLocationCoords ? church.location!.coordinates[1] : church.display_lat;
          return lng && lat && !isNaN(lng) && !isNaN(lat);
        })
        .map(church => {
          const hasLocationCoords = church.location?.coordinates;
          const lng = hasLocationCoords ? church.location!.coordinates[0] : church.display_lng!;
          const lat = hasLocationCoords ? church.location!.coordinates[1] : church.display_lat!;
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [lng, lat] as [number, number],
            },
            properties: {
              id: church.id,
              name: church.name,
            },
          };
        }),
    };

    // Try to update the source data
    const updateSourceData = () => {
      const source = mapInstance.getSource(CLUSTER_SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData(featureCollection);
        return true;
      }
      return false;
    };

    // If source exists, update immediately
    if (updateSourceData()) return;

    // Otherwise wait for sourcedata event (source was just created)
    const handleSourceData = (e: mapboxgl.MapSourceDataEvent) => {
      if (e.sourceId === CLUSTER_SOURCE_ID && e.isSourceLoaded) {
        updateSourceData();
        mapInstance.off('sourcedata', handleSourceData);
      }
    };
    mapInstance.on('sourcedata', handleSourceData);

    // Also try on next frame in case source is being added
    const timeoutId = setTimeout(() => {
      updateSourceData();
    }, 50);

    return () => {
      mapInstance.off('sourcedata', handleSourceData);
      clearTimeout(timeoutId);
    };
  }, [churches, performanceMode]);

  // Update existing markers when platform settings change (e.g., after async fetch completes)
  useEffect(() => {
    if (!map.current || markersRef.current.size === 0) return;
    
    const defaultPinColor = platformSettings.defaultPinColor || '#DC2626';
    const defaultPinIcon = platformSettings.defaultPinIcon || '';
    
    // Update all existing markers with platform settings (unless they have internal tag styling)
    markersRef.current.forEach((marker, churchId) => {
      const el = marker.getElement();
      
      // Skip if marker has internal tag styling (admin feature)
      if (el.classList.contains('internal-tag-styled')) return;
      
      // Update background color
      el.style.setProperty('background-color', defaultPinColor, 'important');
      
      // Update icon - remove existing and add new if configured
      const existingDefaultIcon = el.querySelector('.default-pin-icon');
      if (existingDefaultIcon) {
        existingDefaultIcon.remove();
      }
      
      if (defaultPinIcon) {
        const iconSvg = getPinIconSvg(defaultPinIcon);
        if (iconSvg) {
          const iconWrapper = document.createElement('div');
          iconWrapper.className = 'default-pin-icon';
          iconWrapper.style.zIndex = '10';
          iconWrapper.style.pointerEvents = 'none';
          iconWrapper.innerHTML = iconSvg;
          
          // Style the SVG to be visible on colored background - size is 40% of pin
          const markerSize = el.offsetWidth || parseInt(el.style.width) || 24;
          const iconSize = Math.max(8, Math.round(markerSize * 0.40));
          const svg = iconWrapper.querySelector('svg');
          if (svg) {
            svg.style.fill = 'white';
            svg.style.color = 'white';
            svg.style.width = `${iconSize}px`;
            svg.style.height = `${iconSize}px`;
          }
          
          el.appendChild(iconWrapper);
        }
      }
    });
  }, [platformSettings]);

  // Highlight selected church marker and hide others when in draw mode or allocation mode
  useEffect(() => {
    if (!map.current) return;
    
    console.log('[Selection Effect] Running with selectedChurchId:', selectedChurchId, 'markerCount:', markersRef.current.size, 'allocationMode:', allocationModeActive);

    // Check if Mapbox Draw is actively in drawing mode (not simple_select)
    const isActivelyDrawing = draw.current ? draw.current.getMode() !== 'simple_select' : false;

    markersRef.current.forEach((marker, churchId) => {
      const el = marker.getElement();
      const isSelected = selectedChurchId === churchId;
      
      // Use classList to toggle selected state without affecting data-testid or recreating the element
      if (isSelected) {
        el.classList.add('selected-church-marker');
      } else {
        el.classList.remove('selected-church-marker');
      }
      
      // Update marker size when selection changes (selected markers are 1.5x larger)
      const sizeUpdater = markerSizeUpdatersRef.current.get(churchId);
      if (sizeUpdater) {
        sizeUpdater(selectedChurchId);
      }
      
      // Hide ALL markers during allocation mode for a clean map
      if (allocationModeActive) {
        el.style.visibility = 'hidden';
      }
      // When drawing primary area, hide ALL markers from the start (clean map for drawing)
      else if (drawingPrimaryArea) {
        el.style.visibility = 'hidden';
      }
      // Hide all markers except selected when actively drawing (only if a church is selected)
      // Only hide when Mapbox Draw is in drawing mode (not simple_select) to prevent hiding during zoom/pan
      else if (isActivelyDrawing && selectedChurchId) {
        if (isSelected) {
          el.style.visibility = 'visible';
        } else {
          el.style.visibility = 'hidden';
        }
      } else {
        // Show all markers when not actively drawing or when no church is selected
        el.style.visibility = 'visible';
      }
    });
  }, [selectedChurchId, drawingAreaMode, drawingPrimaryArea, allocationModeActive]);

  // Update marker colors and icons when internal tag styles change (admin-only feature)
  useEffect(() => {
    if (!map.current) return;

    const hasActiveStyles = Object.keys(internalTagStyles).length > 0;
    const styledChurchIds = Object.keys(internalTagStyles);
    const markerChurchIds = Array.from(markersRef.current.keys());
    console.log('🏷️ Internal Tag Styles Update:', {
      hasActiveStyles,
      styleCount: styledChurchIds.length,
      churchIds: styledChurchIds,
      markerCount: markersRef.current.size,
      markerIds: markerChurchIds.slice(0, 5), // first 5 marker IDs
      matchingMarkers: styledChurchIds.filter(id => markersRef.current.has(id)),
    });
    
    markersRef.current.forEach((marker, churchId) => {
      const el = marker.getElement();
      const tagStyle = internalTagStyles[churchId];
      const existingIcon = el.querySelector('.internal-tag-icon') as HTMLElement | null;
      
      if (hasActiveStyles && tagStyle) {
        // Apply color styling
        el.style.backgroundColor = tagStyle.color_hex;
        el.classList.add('internal-tag-styled');
        el.style.animation = 'internal-tag-pulse 2s ease-in-out infinite';
        
        if (tagStyle.icon_key) {
          // Convert legacy icon keys (e.g., "Fa6:FaAnchor") to simple keys (e.g., "anchor")
          let iconId = tagStyle.icon_key;
          if (iconId.includes(':')) {
            const parts = iconId.split(':');
            iconId = parts[1] || parts[0];
            iconId = iconId.replace(/^(Fa|Lu|Md|Bi|Hi|Ai|Bs|Fi|Gi|Go|Gr|Im|Io|Ri|Si|Sl|Tb|Ti|Vsc|Wi)/i, '');
          }
          iconId = iconId.toLowerCase();
          
          // Check if we need to create a new icon or just update the existing one
          const existingTagId = existingIcon?.getAttribute('data-tag-id');
          const existingIconId = existingIcon?.getAttribute('data-icon-id');
          
          if (existingIcon && existingTagId === tagStyle.tag_id && existingIconId === iconId) {
            // Same tag and icon - just update the size based on current marker dimensions
            const markerSize = el.offsetWidth || parseInt(el.style.width) || 24;
            const iconSize = Math.max(8, Math.round(markerSize * 0.40));
            const svg = existingIcon.querySelector('svg');
            if (svg) {
              (svg as SVGElement).style.width = `${iconSize}px`;
              (svg as SVGElement).style.height = `${iconSize}px`;
            }
          } else {
            // Different tag or no existing icon - remove old and create new
            if (existingIcon) {
              existingIcon.remove();
            }
            
            const iconSvg = getPinIconSvg(iconId);
            if (iconSvg) {
              const markerSize = el.offsetWidth || parseInt(el.style.width) || 24;
              const iconSize = Math.max(8, Math.round(markerSize * 0.40));
              
              const iconWrapper = document.createElement('div');
              iconWrapper.className = 'internal-tag-icon';
              iconWrapper.style.zIndex = '10';
              iconWrapper.style.pointerEvents = 'none';
              iconWrapper.setAttribute('data-tag-id', tagStyle.tag_id);
              iconWrapper.setAttribute('data-icon-id', iconId);
              iconWrapper.innerHTML = iconSvg;
              
              const svg = iconWrapper.querySelector('svg');
              if (svg) {
                svg.style.fill = 'white';
                svg.style.color = 'white';
                svg.style.width = `${iconSize}px`;
                svg.style.height = `${iconSize}px`;
              }
              
              el.appendChild(iconWrapper);
              console.log('🎯 Icon created for church:', churchId, 'markerSize:', markerSize, 'iconSize:', iconSize);
            } else {
              console.warn('Icon not found for key:', iconId, '(original:', tagStyle.icon_key, ')');
            }
          }
        } else if (existingIcon) {
          // No icon_key but has existing icon - remove it
          existingIcon.remove();
        }
      } else if (hasActiveStyles) {
        // Remove internal tag icon if present
        if (existingIcon) {
          existingIcon.remove();
        }
        // Dim churches without matching tags when filter is active
        el.style.backgroundColor = '';
        el.classList.remove('internal-tag-styled');
        el.style.animation = '';
        el.style.opacity = '0.4';
        
        // Remove default pin icon if present
        const defaultIcon = el.querySelector('.default-pin-icon');
        if (defaultIcon) {
          defaultIcon.remove();
        }
      } else {
        // Reset to default pin color/icon when no internal tag filter is active
        // Use platformSettingsRef to get correct values (not localStorage which is never set)
        const defaultPinColor = platformSettingsRef.current.defaultPinColor || '#DC2626';
        const defaultPinIcon = platformSettingsRef.current.defaultPinIcon || '';
        
        el.style.setProperty('background-color', defaultPinColor, 'important');
        el.classList.remove('internal-tag-styled');
        el.style.animation = '';
        el.style.opacity = '';
        
        // Re-add default pin icon if configured and not already present
        const existingDefaultIcon = el.querySelector('.default-pin-icon');
        if (defaultPinIcon && !existingDefaultIcon) {
          const iconSvg = getPinIconSvg(defaultPinIcon);
          if (iconSvg) {
            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'default-pin-icon';
            iconWrapper.style.zIndex = '10';
            iconWrapper.style.pointerEvents = 'none';
            iconWrapper.innerHTML = iconSvg;
            
            // Style the SVG to be visible on colored background
            const svg = iconWrapper.querySelector('svg');
            if (svg) {
              svg.style.fill = 'white';
              svg.style.color = 'white';
              svg.style.width = '14px';
              svg.style.height = '14px';
            }
            
            el.appendChild(iconWrapper);
          }
        }
      }
    });
  }, [internalTagStyles, churches]);

  return null;
}
