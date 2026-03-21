import { useState, useEffect, useRef } from "react";
import { Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { Boundary } from "@shared/schema";

const STATE_FIPS_TO_ABBR: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR', '78': 'VI',
};

function getStateAbbr(stateFips: string | undefined | null): string {
  if (!stateFips) return '';
  return STATE_FIPS_TO_ABBR[stateFips] || '';
}

interface BoundarySearchProps {
  onSelect: (boundary: Boundary) => void;
  onHover?: (boundary: Boundary | null) => void;
  className?: string;
  placeholder?: string;
  allowedTypes?: string[];
}

export function BoundarySearch({ 
  onSelect, 
  onHover, 
  className = "",
  placeholder = "Search for a City or Region",
  allowedTypes = ["place", "county", "zip"]
}: BoundarySearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch search results with geometry when query changes
  const { data: results = [], isLoading } = useQuery<Boundary[]>({
    queryKey: ["/api/boundaries/search", query],
    queryFn: () => {
      if (!query || query.length < 2) return Promise.resolve([]);
      return fetch(`/api/boundaries/search?q=${encodeURIComponent(query)}&with_geometry=true`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: Boundary[]) => {
          // Filter by allowed types and deduplicate
          const filtered = data.filter(b => allowedTypes.includes(b.type));
          return deduplicateBoundaries(filtered);
        });
    },
    enabled: query.length >= 2,
  });

  function deduplicateBoundaries(boundaries: Boundary[]): Boundary[] {
    const seen = new Set<string>();
    const result: Boundary[] = [];
    for (const b of boundaries) {
      if (!seen.has(b.id)) {
        seen.add(b.id);
        result.push(b);
      }
    }
    return result;
  }

  // Show dropdown when we have results
  useEffect(() => {
    setIsOpen(results.length > 0 && query.length >= 2);
  }, [results, query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (boundary: Boundary) => {
    onSelect(boundary);
    setQuery("");
    setIsOpen(false);
    onHover?.(null); // Clear hover when selecting
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0 && query.length >= 2) {
              setIsOpen(true);
            }
          }}
          className="pl-9"
          data-testid="input-boundary-search"
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No boundaries found
            </div>
          ) : (
            <div className="py-1">
              {results.map((boundary) => (
                <button
                  key={boundary.id}
                  onClick={() => handleSelect(boundary)}
                  onMouseEnter={() => onHover?.(boundary)}
                  onMouseLeave={() => onHover?.(null)}
                  className="w-full px-4 py-2 text-left hover-elevate active-elevate-2 flex items-start gap-3"
                  data-testid={`button-boundary-${boundary.id}`}
                >
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {boundary.name}{boundary.type !== 'zip' && getStateAbbr(boundary.state_fips) && `, ${getStateAbbr(boundary.state_fips)}`}
                    </div>
                    <div className="text-xs text-muted-foreground">{boundary.type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
