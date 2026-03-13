import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Layers, Check } from "lucide-react";

// Must match MAP_STYLES in admin/Settings.tsx and pages/profile.tsx
const MAP_STYLES = [
  { id: "standard", name: "Standard", description: "Mapbox's newest all-purpose style" },
  { id: "streets-v12", name: "Streets", description: "Classic street map with full color" },
  { id: "light-v11", name: "Light", description: "Minimal light theme for data overlays" },
  { id: "dark-v11", name: "Dark", description: "Dark theme for low-light use" },
  { id: "satellite-streets-v12", name: "Satellite", description: "Satellite imagery with street labels" },
  { id: "outdoors-v12", name: "Outdoors", description: "Topographic with trails & terrain" },
  { id: "moonlight", name: "Moonlight", description: "Minimal grey palette for data visualization" },
  { id: "blueprint", name: "Blueprint", description: "Architectural blueprint aesthetic" },
];

const LOCAL_STORAGE_KEY = "kingdom-map-style-preference";

interface MapStyleSelectorProps {
  onStyleChange?: (styleId: string) => void;
}

export function MapStyleSelector({ onStyleChange }: MapStyleSelectorProps) {
  const [platformDefault, setPlatformDefault] = useState<string>("streets-v12");
  const [currentStyle, setCurrentStyle] = useState<string>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved || "streets-v12";
  });

  // Fetch platform default on mount
  useEffect(() => {
    fetch('/api/platform/settings')
      .then(res => res.json())
      .then(data => {
        const defaultStyle = data.mapBaseStyle || 'streets-v12';
        setPlatformDefault(defaultStyle);
        // Only update current style if user has no preference
        const userPreference = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!userPreference) {
          setCurrentStyle(defaultStyle);
        }
      })
      .catch(err => {
        console.error('Failed to fetch platform settings:', err);
      });
  }, []);

  // Listen for admin default style changes - only update if user has no personal preference
  useEffect(() => {
    const handleAdminStyleChange = (e: CustomEvent) => {
      setPlatformDefault(e.detail);
      const userPreference = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!userPreference) {
        setCurrentStyle(e.detail);
      }
    };
    window.addEventListener('mapStyleChanged', handleAdminStyleChange as EventListener);
    return () => {
      window.removeEventListener('mapStyleChanged', handleAdminStyleChange as EventListener);
    };
  }, []);

  const handleStyleChange = (styleId: string) => {
    setCurrentStyle(styleId);
    localStorage.setItem(LOCAL_STORAGE_KEY, styleId);
    window.dispatchEvent(new CustomEvent('userMapStyleChanged', { detail: styleId }));
    onStyleChange?.(styleId);
  };

  const currentStyleName = MAP_STYLES.find(s => s.id === currentStyle)?.name || "Map Style";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="bg-background/95 backdrop-blur-sm shadow-md gap-2"
          data-testid="button-map-style-selector"
        >
          <Layers className="h-4 w-4" />
          <span className="hidden sm:inline">{currentStyleName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {MAP_STYLES.map((style) => (
          <DropdownMenuItem
            key={style.id}
            onClick={() => handleStyleChange(style.id)}
            className="flex items-center justify-between cursor-pointer"
            data-testid={`menu-item-style-${style.id}`}
          >
            <div className="flex flex-col">
              <span className="font-medium">{style.name}</span>
              <span className="text-xs text-muted-foreground">{style.description}</span>
            </div>
            {currentStyle === style.id && (
              <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function getUserMapStylePreference(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_KEY);
}

export function clearUserMapStylePreference(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}
