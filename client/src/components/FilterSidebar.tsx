import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CallingBadge } from "./CallingBadge";
import { IconDisplay } from "@/components/ui/icon-renderer";
import { type Calling, type ChurchFilters, type Boundary, type CollaborationTag, type ChurchWithCallings, type InternalTagWithUsage } from "@shared/schema";
import { Search, X, MapPin, Locate, Check, EyeOff, Tag, ChevronDown } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Constants outside component to prevent re-renders
const COLLAB_VISIBLE_COUNT = 10; // Show top 10 initially

interface FilterSidebarProps {
  callings: Calling[];
  filters: ChurchFilters;
  onFiltersChange: (filters: ChurchFilters) => void;
  resultsCount: number;
  searchResults?: ChurchWithCallings[];
  searchLoading?: boolean;
  onChurchSelect?: (church: ChurchWithCallings) => void;
}

export function FilterSidebar({
  callings,
  filters,
  onFiltersChange,
  resultsCount,
  searchResults = [],
  searchLoading = false,
  onChurchSelect,
}: FilterSidebarProps) {
  const [localSearchTerm, setLocalSearchTerm] = useState(filters.searchTerm || "");
  const [boundarySearchOpen, setBoundarySearchOpen] = useState(false);
  const [boundaryQuery, setBoundaryQuery] = useState("");
  const [selectedBoundaries, setSelectedBoundaries] = useState<Boundary[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Collaboration UI state - single list with Offer/Need toggle
  const [collabMode, setCollabMode] = useState<"offer" | "need">("offer");
  const [showAllCollab, setShowAllCollab] = useState(false);
  
  // Check for platform admin access
  const { isPlatformAdmin, isSuperAdmin } = useAdminAccess();
  const isAdmin = isPlatformAdmin || isSuperAdmin;
  
  // Get platform context for state-biased boundary search
  const { platform } = usePlatformContext();
  // Platform state is stored in the platform's primary state field or extracted from name
  // For now, we'll use the platform's state if available (can be enhanced later)
  const platformStateCode = (platform as any)?.state_code || null;

  // Fetch collaboration taxonomy from API
  const { data: taxonomyData, isLoading: taxonomyLoading, error: taxonomyError } = useQuery<{ tags: CollaborationTag[] }>({
    queryKey: ["/api/collaboration-taxonomy"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch internal tags (admin only) - uses default queryFn which includes auth headers
  const { data: internalTags = [], isLoading: internalTagsLoading } = useQuery<InternalTagWithUsage[]>({
    queryKey: ["/api/admin/internal-tags"],
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
    retry: false, // Don't retry on 401/403
  });

  // Fetch boundary search results - with optional state biasing from platform context
  const { data: boundaryResults = [] } = useQuery<(Boundary & { state_code?: string })[]>({
    queryKey: ["/api/boundaries/search", boundaryQuery, platformStateCode],
    queryFn: () => {
      if (!boundaryQuery || boundaryQuery.length < 2) return Promise.resolve([]);
      let url = `/api/boundaries/search?q=${encodeURIComponent(boundaryQuery)}&with_geometry=true`;
      if (platformStateCode) {
        url += `&state=${encodeURIComponent(platformStateCode)}`;
      }
      return fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        });
    },
    enabled: boundaryQuery.length >= 2,
  });

  // Fetch boundaries by IDs to rehydrate after re-renders
  const missingBoundaryIds = (filters.boundaryIds || []).filter(
    id => !selectedBoundaries.some(b => b.id === id)
  );

  const { data: fetchedBoundaries = [], isError: boundaryFetchError } = useQuery<Boundary[]>({
    queryKey: ["/api/boundaries/batch", missingBoundaryIds],
    queryFn: async () => {
      if (missingBoundaryIds.length === 0) return [];
      const results = await Promise.all(
        missingBoundaryIds.map(async (id) => {
          try {
            const res = await fetch(`/api/boundaries/${id}?with_geometry=true`);
            if (!res.ok) {
              console.warn(`Failed to fetch boundary ${id}: ${res.status}`);
              return null;
            }
            return res.json();
          } catch (error) {
            console.error(`Error fetching boundary ${id}:`, error);
            return null;
          }
        })
      );
      return results.filter((b): b is Boundary => b !== null);
    },
    enabled: missingBoundaryIds.length > 0,
    retry: 2, // Retry failed fetches
  });

  // Sync selectedBoundaries with filters.boundaryIds changes
  useEffect(() => {
    const filterIds = filters.boundaryIds || [];
    
    if (filterIds.length === 0) {
      if (selectedBoundaries.length > 0) {
        setSelectedBoundaries([]);
      }
    } else {
      if (fetchedBoundaries.length > 0) {
        setSelectedBoundaries(prev => {
          const merged = [...prev];
          fetchedBoundaries.forEach(boundary => {
            if (!merged.some(b => b.id === boundary.id)) {
              merged.push(boundary);
            }
          });
          return merged.filter(b => filterIds.includes(b.id));
        });
        
        const currentGeometries = { ...(filters.boundaryGeometries || {}) };
        let changed = false;
        fetchedBoundaries.forEach(boundary => {
          if (boundary.geometry && !currentGeometries[boundary.id]) {
            currentGeometries[boundary.id] = boundary.geometry;
            changed = true;
          }
        });
        if (changed) {
          onFiltersChange({ ...filters, boundaryGeometries: currentGeometries });
        }
      } else {
        setSelectedBoundaries(prev => prev.filter(b => filterIds.includes(b.id)));
      }
    }
  }, [filters.boundaryIds, fetchedBoundaries]);

  const handleCallingToggle = (callingId: string) => {
    const currentCallings = filters.callings || [];
    const newCallings = currentCallings.includes(callingId)
      ? currentCallings.filter((id) => id !== callingId)
      : [...currentCallings, callingId];
    
    onFiltersChange({ ...filters, callings: newCallings });
  };

  const handleCollabHaveToggle = (tag: string) => {
    const current = filters.collabHave || [];
    const updated = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    onFiltersChange({ ...filters, collabHave: updated });
  };

  const handleCollabNeedToggle = (tag: string) => {
    const current = filters.collabNeed || [];
    const updated = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    onFiltersChange({ ...filters, collabNeed: updated });
  };

  const handleInternalTagToggle = (tagId: string) => {
    const current = filters.internalTagIds || [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onFiltersChange({ ...filters, internalTagIds: updated.length > 0 ? updated : undefined });
  };


  // Get active tags from single master list (used for both "We Offer" and "We Need")
  const activeTags = (taxonomyData?.tags || []).filter(tag => tag.is_active);
  const activeInternalTags = internalTags.filter(tag => tag.is_active);
  
  // Visible collaboration tags (top N or all if expanded)
  const visibleCollabTags = useMemo(() => {
    if (showAllCollab) return activeTags;
    return activeTags.slice(0, COLLAB_VISIBLE_COUNT);
  }, [activeTags, showAllCollab]);
  
  const hasMoreCollabTags = activeTags.length > COLLAB_VISIBLE_COUNT;
  
  // Get the selected tags for current mode
  const currentCollabSelection = collabMode === "offer" 
    ? (filters.collabHave || []) 
    : (filters.collabNeed || []);
  
  // Handler to switch collaboration mode and reset expansion state
  const handleCollabModeChange = (mode: "offer" | "need") => {
    setCollabMode(mode);
    setShowAllCollab(false); // Reset expansion when switching modes
  };
  
  // Combined handler for collaboration tag toggle
  const handleCollabToggle = (slug: string) => {
    if (collabMode === "offer") {
      handleCollabHaveToggle(slug);
    } else {
      handleCollabNeedToggle(slug);
    }
  };

  const handleSearchChange = (value: string) => {
    setLocalSearchTerm(value);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout
    searchTimeoutRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, searchTerm: value });
    }, 300);
  };

  const boundaryFocusActive = filters.boundaryFilterFocus !== false;
  const boundaryLocatedActive = filters.boundaryFilterLocated === true;

  const handleToggleFocusMode = () => {
    const newFocus = !boundaryFocusActive;
    if (!newFocus && !boundaryLocatedActive) return;
    onFiltersChange({ ...filters, boundaryFilterFocus: newFocus });
  };

  const handleToggleLocatedMode = () => {
    const newLocated = !boundaryLocatedActive;
    if (!newLocated && !boundaryFocusActive) return;
    onFiltersChange({ ...filters, boundaryFilterLocated: newLocated });
  };

  const handleBoundarySelect = (boundary: Boundary) => {
    const currentIds = filters.boundaryIds || [];
    const isRemoving = currentIds.includes(boundary.id);
    const newIds = isRemoving
      ? currentIds.filter(id => id !== boundary.id)
      : [...currentIds, boundary.id];

    const currentGeometries = { ...(filters.boundaryGeometries || {}) };
    if (isRemoving) {
      delete currentGeometries[boundary.id];
    } else if (boundary.geometry) {
      currentGeometries[boundary.id] = boundary.geometry;
    }

    onFiltersChange({ 
      ...filters, 
      boundaryIds: newIds.length > 0 ? newIds : undefined,
      boundaryGeometries: Object.keys(currentGeometries).length > 0 ? currentGeometries : undefined,
    });
    setBoundaryQuery("");
  };

  const handleBoundaryRemove = (boundaryId: string) => {
    const currentIds = filters.boundaryIds || [];
    const newIds = currentIds.filter(id => id !== boundaryId);

    const currentGeometries = { ...(filters.boundaryGeometries || {}) };
    delete currentGeometries[boundaryId];

    onFiltersChange({ 
      ...filters, 
      boundaryIds: newIds.length > 0 ? newIds : undefined,
      boundaryGeometries: Object.keys(currentGeometries).length > 0 ? currentGeometries : undefined,
    });
  };

  const handleClearFilters = () => {
    setLocalSearchTerm("");
    setSelectedBoundaries([]);
    onFiltersChange({});
  };

  const hasActiveFilters = 
    (filters.callings && filters.callings.length > 0) ||
    (filters.searchTerm && filters.searchTerm.length > 0) ||
    (filters.collabHave && filters.collabHave.length > 0) ||
    (filters.collabNeed && filters.collabNeed.length > 0) ||
    (filters.boundaryIds && filters.boundaryIds.length > 0) ||
    filters.polygon;

  return (
    <ScrollArea className="h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
          <Input
            type="search"
            placeholder="Search churches..."
            value={localSearchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
          
          {/* Inline search results dropdown */}
          {localSearchTerm.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
              {searchLoading ? (
                <div className="p-3 space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="py-1">
                  {searchResults.slice(0, 8).map((church) => (
                    <button
                      key={church.id}
                      onClick={() => {
                        if (onChurchSelect) {
                          onChurchSelect(church);
                          setLocalSearchTerm("");
                          onFiltersChange({ ...filters, searchTerm: "" });
                        }
                      }}
                      className="w-full px-3 py-2 text-left hover-elevate flex items-start gap-2"
                      data-testid={`search-result-${church.id}`}
                    >
                      <IconBuildingChurch className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{church.name}</div>
                        {church.address && (
                          <div className="text-xs text-muted-foreground truncate">{church.address}</div>
                        )}
                      </div>
                    </button>
                  ))}
                  {searchResults.length > 8 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                      +{searchResults.length - 8} more results
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No churches found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Boundary/Place Filter */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Filter by Place</Label>
          
          {(filters.boundaryIds && filters.boundaryIds.length > 0) && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge
                variant="outline"
                className={`text-xs cursor-pointer toggle-elevate ${boundaryFocusActive ? 'toggle-elevated' : ''}`}
                onClick={handleToggleFocusMode}
                data-testid="toggle-boundary-focus"
              >
                <MapPin className="w-3 h-3 mr-1" />
                Focus Area
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs cursor-pointer toggle-elevate ${boundaryLocatedActive ? 'toggle-elevated' : ''}`}
                onClick={handleToggleLocatedMode}
                data-testid="toggle-boundary-located"
              >
                <Locate className="w-3 h-3 mr-1" />
                Located In
              </Badge>
            </div>
          )}

          {(filters.boundaryIds && filters.boundaryIds.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-2">
              {filters.boundaryIds.map((boundaryId) => {
                const boundary = selectedBoundaries.find(b => b.id === boundaryId);
                
                return (
                  <Badge
                    key={boundaryId}
                    variant="secondary"
                    className="flex items-center gap-1.5 pl-2 pr-1 py-1"
                    data-testid={`chip-boundary-${boundaryId}`}
                  >
                    <MapPin className="w-3 h-3" />
                    <span className="text-xs">
                      {boundary ? boundary.name : `Place ${boundaryId.substring(0, 8)}...`}
                    </span>
                    <button
                      onClick={() => handleBoundaryRemove(boundaryId)}
                      className="ml-1 rounded-sm hover-elevate active-elevate-2 p-0.5"
                      data-testid={`button-remove-boundary-${boundaryId}`}
                      aria-label={`Remove ${boundary?.name || 'boundary'}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          
          {/* Add boundary button/dropdown */}
          <Popover open={boundarySearchOpen} onOpenChange={setBoundarySearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={boundarySearchOpen}
                className="w-full justify-start text-left font-normal"
                data-testid="button-add-boundary"
              >
                <MapPin className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <span className="text-muted-foreground">
                  {selectedBoundaries.length > 0 ? "Add another place..." : "Select city, township..."}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Search places..." 
                  value={boundaryQuery}
                  onValueChange={setBoundaryQuery}
                  data-testid="input-boundary-search"
                />
                <CommandList>
                  <CommandEmpty>
                    {boundaryQuery.length < 2 
                      ? "Type at least 2 characters to search"
                      : "No places found"}
                  </CommandEmpty>
                  {boundaryResults.length > 0 && (
                    <CommandGroup>
                      {boundaryResults.map((boundary) => {
                        const isSelected = (filters.boundaryIds || []).includes(boundary.id);
                        return (
                          <CommandItem
                            key={boundary.id}
                            value={boundary.id}
                            onSelect={(value) => {
                              const selected = boundaryResults.find(b => b.id === value);
                              if (selected) handleBoundarySelect(selected);
                            }}
                            data-testid={`option-boundary-${boundary.id}`}
                          >
                            <span className="mr-2 w-5 h-4 flex items-center justify-center shrink-0 flex-none">
                              {isSelected && <Check className="h-4 w-4" />}
                            </span>
                            <MapPin className="mr-2 h-4 w-4 opacity-50 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">
                                {boundary.name}
                                {(boundary as any).state_code && (
                                  <span className="text-muted-foreground">, {(boundary as any).state_code}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{boundary.type}</div>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Internal Admin Tags - Only visible to platform admins */}
        {isAdmin && (
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-3">
              <EyeOff className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Internal Tags</Label>
              <Badge variant="outline" className="text-xs">Admin Only</Badge>
            </div>
            {internalTagsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
            ) : activeInternalTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeInternalTags.map((tag) => {
                  const isSelected = filters.internalTagIds?.includes(tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer hover-elevate active-elevate-2 gap-1"
                      style={isSelected ? { backgroundColor: tag.color_hex, borderColor: tag.color_hex } : undefined}
                      onClick={() => handleInternalTagToggle(tag.id)}
                      data-testid={`chip-internal-tag-${tag.slug}`}
                    >
                      <IconDisplay 
                        iconKey={tag.icon_key} 
                        className="w-3 h-3" 
                        fallback={<Tag className="w-3 h-3" />}
                      />
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No internal tags configured.{" "}
                <a href="/admin/internal-tags" className="text-primary underline">Create one</a>
              </p>
            )}
            {(filters.internalTagIds?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Map pins with these tags will be highlighted with custom colors/icons.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{resultsCount}</span> churches
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-7 text-xs"
              data-testid="button-clear-filters"
            >
              <X className="w-3 h-3 mr-1" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Calling Filters */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Calling</Label>
          <div className="space-y-3">
            {["place", "people", "problem", "purpose"].map((type) => {
              const typeCallings = callings.filter((c) => c.type === type);
              if (typeCallings.length === 0) return null;

              return (
                <div key={type}>
                  <p className="text-xs text-muted-foreground mb-2 capitalize">{type}</p>
                  <div className="space-y-2">
                    {typeCallings.map((calling) => (
                      <div
                        key={calling.id}
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          id={`calling-${calling.id}`}
                          checked={filters.callings?.includes(calling.id)}
                          onCheckedChange={() => handleCallingToggle(calling.id)}
                          data-testid={`checkbox-calling-${calling.id}`}
                        />
                        <label
                          htmlFor={`calling-${calling.id}`}
                          className="flex-1 cursor-pointer"
                        >
                          <CallingBadge calling={calling} size="sm" />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Collaboration Filters - Single list with Offer/Need toggle */}
        {taxonomyError ? (
          <div className="p-3 bg-muted rounded-md border" data-testid="error-collaboration-taxonomy">
            <p className="text-sm text-muted-foreground mb-2">
              Unable to load collaboration filters
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/collaboration-taxonomy"] })}
              data-testid="button-retry-collab-taxonomy"
            >
              Retry
            </Button>
          </div>
        ) : (
          <div>
            {/* Header with toggle */}
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Collaboration</Label>
              <div className="flex rounded-md border bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => handleCollabModeChange("offer")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                    collabMode === "offer"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-collab-mode-offer"
                >
                  We Offer
                </button>
                <button
                  type="button"
                  onClick={() => handleCollabModeChange("need")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                    collabMode === "need"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-collab-mode-need"
                >
                  We Need
                </button>
              </div>
            </div>
            
            {/* Selection indicator */}
            {currentCollabSelection.length > 0 && (
              <p className="text-xs text-muted-foreground mb-2" data-testid="text-collab-selection-count">
                {currentCollabSelection.length} selected for "{collabMode === "offer" ? "We Offer" : "We Need"}"
              </p>
            )}
            
            {/* Tags list */}
            {taxonomyLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-28" />
              </div>
            ) : activeTags.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {visibleCollabTags.map((tag) => (
                    <Badge
                      key={tag.slug}
                      variant={currentCollabSelection.includes(tag.slug) ? "default" : "outline"}
                      className="cursor-pointer hover-elevate active-elevate-2"
                      onClick={() => handleCollabToggle(tag.slug)}
                      data-testid={`chip-collab-${collabMode}-${tag.slug}`}
                    >
                      {tag.label}
                    </Badge>
                  ))}
                </div>
                
                {/* Show more/less button */}
                {hasMoreCollabTags && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllCollab(!showAllCollab)}
                    className="w-full mt-2 text-xs text-muted-foreground"
                    data-testid="button-collab-show-more"
                  >
                    <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${showAllCollab ? "rotate-180" : ""}`} />
                    {showAllCollab 
                      ? "Show less" 
                      : `Show ${activeTags.length - COLLAB_VISIBLE_COUNT} more`}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-no-collab-filters">
                No options available
              </p>
            )}
          </div>
        )}

        {filters.polygon && (
          <div className="p-3 bg-accent rounded-md border border-accent-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Area Selected</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFiltersChange({ ...filters, polygon: undefined })}
                data-testid="button-clear-polygon"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing churches within drawn area
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
