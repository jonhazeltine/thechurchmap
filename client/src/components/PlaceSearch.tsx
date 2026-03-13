import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Loader2, MapPin, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface PlaceResult {
  id: string;
  name: string;
  fullAddress: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  coordinates: [number, number]; // [lng, lat]
  type: string;
  category: string;
  context?: Array<{ id: string; text: string; short_code?: string }>;
}

interface PlaceSearchProps {
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
  stateCode?: string; // Two-letter state code (e.g., "FL", "MI") to bias search results
  proximity?: [number, number]; // [lng, lat] to bias search results toward a location
}

export function PlaceSearch({
  onSelect,
  placeholder = "Search for a church, business, or address...",
  className,
  testId = "input-place-search",
  stateCode,
  proximity
}: PlaceSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();

  const fetchPlaces = async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      let url = `/api/places/search?q=${encodeURIComponent(searchQuery)}&limit=8`;
      if (stateCode) {
        url += `&state=${encodeURIComponent(stateCode)}`;
      }
      if (proximity) {
        url += `&proximity=${proximity[0]},${proximity[1]}`;
      }
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setResults(data.results || []);
      setOpen(data.results && data.results.length > 0);
    } catch (error) {
      console.error("Place search error:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchPlaces(query);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query]);

  const handleSelect = (place: PlaceResult) => {
    onSelect(place);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const getPlaceIcon = (type: string) => {
    if (type === "poi" || type === "poi.landmark") {
      return <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
    }
    return <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
  };

  const getTypeBadge = (type: string, category: string) => {
    if (category) {
      return (
        <Badge variant="outline" className="text-xs ml-auto flex-shrink-0">
          {category}
        </Badge>
      );
    }
    if (type === "poi") {
      return (
        <Badge variant="outline" className="text-xs ml-auto flex-shrink-0">
          Business
        </Badge>
      );
    }
    if (type === "address") {
      return (
        <Badge variant="secondary" className="text-xs ml-auto flex-shrink-0">
          Address
        </Badge>
      );
    }
    return null;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={`relative ${className || ""}`}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="pl-9 pr-9"
            data-testid={testId}
            onFocus={() => {
              if (results.length > 0) setOpen(true);
            }}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[var(--radix-popover-trigger-width)] p-0" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList>
            <CommandEmpty>
              {query.length < 2 
                ? "Type at least 2 characters to search" 
                : "No places found. Try a different search."}
            </CommandEmpty>
            <CommandGroup heading="Search Results">
              {results.map((place) => (
                <CommandItem
                  key={place.id}
                  value={place.id}
                  onSelect={() => handleSelect(place)}
                  className="cursor-pointer py-3"
                  data-testid={`place-result-${place.id}`}
                >
                  <div className="flex items-start gap-3 w-full">
                    {getPlaceIcon(place.type)}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{place.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {place.fullAddress}
                      </div>
                    </div>
                    {getTypeBadge(place.type, place.category)}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
