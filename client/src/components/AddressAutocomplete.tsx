import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Loader2 } from "lucide-react";

interface AddressSuggestion {
  place_name: string;
  center: [number, number]; // [lng, lat]
  text: string;
  context?: Array<{
    id: string;
    text: string;
    short_code?: string;
  }>;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (address: string, coordinates?: [number, number], context?: AddressSuggestion['context']) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
  testId?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "123 Main St, City, ST 12345",
  className,
  error,
  testId
}: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();

  // Fetch address suggestions from Mapbox
  const fetchSuggestions = async (query: string) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const token = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) {
        console.warn('Mapbox token not configured');
        setSuggestions([]);
        return;
      }

      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${token}&types=address&country=us&limit=5`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Geocoding failed');

      const data = await response.json();
      setSuggestions(data.features || []);
      setOpen(data.features && data.features.length > 0);
    } catch (error) {
      console.error('Address autocomplete error:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [value]);

  const handleSelect = (suggestion: AddressSuggestion) => {
    onChange(suggestion.place_name);
    if (onSelect) {
      onSelect(suggestion.place_name, suggestion.center, suggestion.context);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={error ? "border-destructive" : ""}
            data-testid={testId}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
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
            <CommandEmpty>No addresses found.</CommandEmpty>
            <CommandGroup>
              {suggestions.map((suggestion, index) => (
                <CommandItem
                  key={index}
                  value={suggestion.place_name}
                  onSelect={() => handleSelect(suggestion)}
                  className="cursor-pointer"
                  data-testid={`address-suggestion-${index}`}
                >
                  <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">{suggestion.place_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
