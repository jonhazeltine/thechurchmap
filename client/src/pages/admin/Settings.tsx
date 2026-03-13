import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Settings, Map, Tag, Check, MapPin, Hand, Upload, X, Image as ImageIcon, Loader2, FileText, MessageSquare, RefreshCw, Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { uploadMedia } from "@/lib/upload";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { supabase } from "../../../../lib/supabaseClient";

// Curated set of inline SVG icons for map pins
// Using bold, simple silhouettes that are visible at any size
const PIN_ICONS = [
  { id: "", label: "None", svg: "" },
  { 
    id: "cross", 
    label: "Cross", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2z"/></svg>` 
  },
  { 
    id: "church", 
    label: "Chapel", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L4 9v12h5v-5c0-1.66 1.34-3 3-3s3 1.34 3 3v5h5V9l-8-6zm0 2.5l1 .75V8h-2V6.25l1-.75zM12 10a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>` 
  },
  { 
    id: "steeple", 
    label: "Church Steeple", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11 2h2v3h2v2h-2v2l5 4v8H6v-8l5-4V7H9V5h2V2zm1 9.5L8 14.5V19h3v-3h2v3h3v-4.5l-4-3z"/></svg>` 
  },
  { 
    id: "cathedral", 
    label: "Cathedral", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l-1 2h-.5L9 6v2H7l-4 5v7h6v-4h2v4h2v-4h2v4h6v-7l-4-5h-2V6l-1.5-2H12l-1-2h2zm0 5a1 1 0 110 2 1 1 0 010-2zm-4 6h2v3H8v-3zm6 0h2v3h-2v-3z"/></svg>` 
  },
  { 
    id: "heart", 
    label: "Heart", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>` 
  },
  { 
    id: "star", 
    label: "Star", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>` 
  },
  { 
    id: "people", 
    label: "People", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>` 
  },
  { 
    id: "hands", 
    label: "Helping Hands", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 2C9.64 2 8 4.57 8 7v3H6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2h-2V7c0-2.43-1.64-5-4.5-5zM10 7c0-1.38.84-3 2.5-3S15 5.62 15 7v3h-5V7z"/></svg>` 
  },
  { 
    id: "globe", 
    label: "Globe", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>` 
  },
  { 
    id: "book", 
    label: "Book", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>` 
  },
  { 
    id: "home", 
    label: "Home", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>` 
  },
  { 
    id: "dove", 
    label: "Dove", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-1.27 0-2.4.8-2.82 2H3v2h1.95L2 14c-.21 2 1.79 4 4 4h1v3h2v-3h2v3h2v-3h1c2.21 0 4.21-2 4-4l-2.95-7H17V5h-6.18C10.4 3.8 9.27 3 8 3h4z"/></svg>` 
  },
  { 
    id: "flame", 
    label: "Flame", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>` 
  },
  { 
    id: "shield", 
    label: "Shield", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>` 
  },
  { 
    id: "sun", 
    label: "Sun", 
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>` 
  },
];

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const MAP_STYLES = [
  { 
    id: "standard", 
    name: "Standard", 
    description: "Mapbox's newest all-purpose style",
    styleUrl: "mapbox/standard-beta",
    fallbackPreview: "bg-gradient-to-br from-slate-100 via-blue-50 to-green-50"
  },
  { 
    id: "streets-v12", 
    name: "Streets", 
    description: "Classic street map with full color",
    styleUrl: "mapbox/streets-v12"
  },
  { 
    id: "light-v11", 
    name: "Light", 
    description: "Minimal light theme for data overlays",
    styleUrl: "mapbox/light-v11"
  },
  { 
    id: "dark-v11", 
    name: "Dark", 
    description: "Dark theme for low-light use",
    styleUrl: "mapbox/dark-v11"
  },
  { 
    id: "satellite-streets-v12", 
    name: "Satellite", 
    description: "Satellite imagery with street labels",
    styleUrl: "mapbox/satellite-streets-v12"
  },
  { 
    id: "outdoors-v12", 
    name: "Outdoors", 
    description: "Topographic with trails & terrain",
    styleUrl: "mapbox/outdoors-v12"
  },
  { 
    id: "moonlight", 
    name: "Moonlight", 
    description: "Minimal grey palette for data visualization",
    styleUrl: "mapbox/cj3kbeqzo00022smj7akz3o1e"
  },
  { 
    id: "blueprint", 
    name: "Blueprint", 
    description: "Architectural blueprint aesthetic",
    styleUrl: "mslee/ciellcr9y001g5pknxuqwjhqm"
  },
];

const PIN_COLORS = [
  { hex: "#2563EB", label: "Blue" },
  { hex: "#DC2626", label: "Red" },
  { hex: "#16A34A", label: "Green" },
  { hex: "#9333EA", label: "Purple" },
  { hex: "#EA580C", label: "Orange" },
  { hex: "#0891B2", label: "Cyan" },
  { hex: "#DB2777", label: "Pink" },
  { hex: "#CA8A04", label: "Yellow" },
  { hex: "#4B5563", label: "Gray" },
  { hex: "#1F2937", label: "Dark" },
];

function MapPreviewImage({ styleUrl, alt, fallback }: { styleUrl: string; alt: string; fallback?: string }) {
  const [hasError, setHasError] = useState(false);
  const previewUrl = `https://api.mapbox.com/styles/v1/${styleUrl}/static/-85.67,42.96,11,0/200x120@2x?access_token=${MAPBOX_TOKEN}`;
  
  if (hasError && fallback) {
    return (
      <div className={`w-full h-20 rounded-md ${fallback} flex items-center justify-center`}>
        <span className="text-xs text-muted-foreground font-medium">{alt}</span>
      </div>
    );
  }
  
  return (
    <img 
      src={previewUrl}
      alt={alt}
      className="w-full h-20 rounded-md object-cover"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const { buildPlatformUrl } = usePlatformNavigation();
  const { isSuperAdmin } = useAdminAccess();
  const [mapStyle, setMapStyle] = useState("streets-v12");
  const [pinColor, setPinColor] = useState("#2563EB");
  const [pinIcon, setPinIcon] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [prayerPostImage, setPrayerPostImage] = useState<string>("");
  const [prayerPromptStyle, setPrayerPromptStyle] = useState<"data" | "context">("context");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const prayerImageInputRef = useRef<HTMLInputElement>(null);

  const tilesetMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/tileset', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate tileset');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Tileset Generation Started",
        description: `Processing ${data.churchCount?.toLocaleString()} churches. Upload ID: ${data.uploadId?.slice(0, 8)}...`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Tileset Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch all platform settings from database
  const { data: platformSettings, isLoading: isLoadingSettings } = useQuery<{
    defaultPinColor: string;
    defaultPinIcon: string;
    mapBaseStyle: string;
    defaultPrayerPostImage: string | null;
    prayerPromptStyle: "data" | "context";
  }>({
    queryKey: ['/api/platform/settings'],
    queryFn: () => fetch('/api/platform/settings').then(r => r.json()),
  });

  // Generic mutation to save any setting
  const saveSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string | null }) => {
      return apiRequest('PATCH', '/api/admin/settings', { key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error.message || "Failed to save setting",
        variant: "destructive",
      });
    },
  });

  // Sync settings from database
  useEffect(() => {
    if (platformSettings) {
      if (platformSettings.mapBaseStyle) {
        setMapStyle(platformSettings.mapBaseStyle);
      }
      if (platformSettings.defaultPinColor) {
        setPinColor(platformSettings.defaultPinColor);
      }
      if (platformSettings.defaultPinIcon !== undefined) {
        setPinIcon(platformSettings.defaultPinIcon);
      }
      if (platformSettings.defaultPrayerPostImage) {
        setPrayerPostImage(platformSettings.defaultPrayerPostImage);
      }
      if (platformSettings.prayerPromptStyle) {
        setPrayerPromptStyle(platformSettings.prayerPromptStyle);
      }
    }
  }, [platformSettings]);

  const handleSaveMapStyle = async () => {
    setIsSaving(true);
    try {
      await saveSettingMutation.mutateAsync({ key: 'mapBaseStyle', value: mapStyle });
      window.dispatchEvent(new CustomEvent('mapStyleChanged', { detail: mapStyle }));
      toast({
        title: "Default map style saved",
        description: "New users will see this map style by default. Users with personal preferences will keep their choice.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePinSettings = async () => {
    setIsSavingPin(true);
    try {
      await saveSettingMutation.mutateAsync({ key: 'defaultPinColor', value: pinColor });
      await saveSettingMutation.mutateAsync({ key: 'defaultPinIcon', value: pinIcon || '' });
      window.dispatchEvent(new CustomEvent('defaultPinStyleChanged', { 
        detail: { color: pinColor, icon: pinIcon } 
      }));
      toast({
        title: "Settings saved",
        description: "Default pin style has been updated for all users.",
      });
    } finally {
      setIsSavingPin(false);
    }
  };

  const handlePrayerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      const result = await uploadMedia(file);
      if (!result) {
        throw new Error('Upload failed');
      }
      setPrayerPostImage(result.url);
      toast({
        title: "Image uploaded",
        description: "Don't forget to save your changes!",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
      if (prayerImageInputRef.current) {
        prayerImageInputRef.current.value = '';
      }
    }
  };

  const handleSavePrayerSettings = async () => {
    try {
      await saveSettingMutation.mutateAsync({ key: 'defaultPrayerPostImage', value: prayerPostImage || null });
      await saveSettingMutation.mutateAsync({ key: 'prayerPromptStyle', value: prayerPromptStyle });
      toast({
        title: "Settings saved",
        description: "Prayer settings have been updated.",
      });
    } catch (error) {
      // Error already handled by mutation
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Settings className="w-8 h-8" />
            Platform Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure global platform settings for all users
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="w-5 h-5" />
                Default Map Style
              </CardTitle>
              <CardDescription>
                Set the default map style for new users. Users can choose their own preferred style using the map layer button. This setting applies to users who haven't set a personal preference.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup 
                value={mapStyle} 
                onValueChange={setMapStyle}
                className="grid grid-cols-2 md:grid-cols-3 gap-4"
              >
                {MAP_STYLES.map((style) => (
                  <div key={style.id} className="relative">
                    <RadioGroupItem
                      value={style.id}
                      id={style.id}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={style.id}
                      className="flex flex-col cursor-pointer rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                      data-testid={`radio-map-style-${style.id}`}
                    >
                      <div className="w-full h-20 rounded-md mb-3 relative overflow-hidden bg-muted">
                        <MapPreviewImage styleUrl={style.styleUrl} alt={style.name} fallback={style.fallbackPreview} />
                        {mapStyle === style.id && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                      <span className="font-semibold">{style.name}</span>
                      <span className="text-xs text-muted-foreground mt-1">
                        {style.description}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={handleSaveMapStyle}
                  disabled={isSaving}
                  data-testid="button-save-map-style"
                >
                  {isSaving ? "Saving..." : "Save Default Style"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Default Map Pins
              </CardTitle>
              <CardDescription>
                Customize the default appearance of church pins on the map. Churches with internal tags will override these defaults.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Pin Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {PIN_COLORS.map((color) => (
                      <button
                        key={color.hex}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          pinColor === color.hex ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-primary' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        onClick={() => setPinColor(color.hex)}
                        title={color.label}
                        data-testid={`button-pin-color-${color.hex.replace('#', '')}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Label htmlFor="custom-color" className="text-xs text-muted-foreground">Custom:</Label>
                    <input
                      id="custom-color"
                      type="color"
                      value={pinColor}
                      onChange={(e) => setPinColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border"
                      data-testid="input-custom-pin-color"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{pinColor}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Pin Icon (Optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {PIN_ICONS.map((icon) => (
                      <button
                        key={icon.id}
                        type="button"
                        className={`w-10 h-10 rounded-lg border-2 transition-all flex items-center justify-center ${
                          pinIcon === icon.id 
                            ? 'border-primary bg-primary text-primary-foreground scale-110 ring-2 ring-offset-2 ring-primary' 
                            : 'border-muted bg-muted hover:border-muted-foreground/50 hover:scale-105'
                        }`}
                        onClick={() => setPinIcon(icon.id)}
                        title={icon.label}
                        data-testid={`button-pin-icon-${icon.id || 'none'}`}
                      >
                        {icon.svg ? (
                          <div 
                            className="w-5 h-5"
                            dangerouslySetInnerHTML={{ __html: icon.svg }}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">∅</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave empty for solid circle pins, or choose an icon to display inside the pin.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <Label className="text-sm font-medium">Preview:</Label>
                <div 
                  className="w-10 h-10 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
                  style={{ backgroundColor: pinColor }}
                >
                  {pinIcon && PIN_ICONS.find(i => i.id === pinIcon)?.svg && (
                    <div 
                      className="w-5 h-5 text-white"
                      dangerouslySetInnerHTML={{ __html: PIN_ICONS.find(i => i.id === pinIcon)!.svg }}
                    />
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {pinIcon ? "Icon pin" : "Solid circle pin"}
                </span>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={handleSavePinSettings}
                  disabled={isSavingPin}
                  data-testid="button-save-pin-style"
                >
                  {isSavingPin ? "Saving..." : "Save Pin Style"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hand className="w-5 h-5" />
                Prayer Settings
              </CardTitle>
              <CardDescription>
                Configure prayer prompts and the default cover image for prayer posts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label className="text-sm font-medium">Prayer Prompt Style</Label>
                <p className="text-xs text-muted-foreground">
                  Choose how prayer prompts are generated in Prayer Mode based on community health data.
                </p>
                
                <div className="grid gap-3">
                  <div 
                    className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      prayerPromptStyle === 'data' 
                        ? 'border-primary bg-primary/5' 
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                    onClick={() => setPrayerPromptStyle('data')}
                    data-testid="button-prompt-style-data"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      prayerPromptStyle === 'data' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Data-Based Prompts</span>
                        {prayerPromptStyle === 'data' && (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Active</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Displays factual health statistics about the area. Example: "Depression affects 28.5% of this community."
                      </p>
                    </div>
                  </div>
                  
                  <div 
                    className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      prayerPromptStyle === 'context' 
                        ? 'border-primary bg-primary/5' 
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                    onClick={() => setPrayerPromptStyle('context')}
                    data-testid="button-prompt-style-context"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      prayerPromptStyle === 'context' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Context-Based Prompts</span>
                        {prayerPromptStyle === 'context' && (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Active</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Rich, pre-written prayer language with contextual descriptions. Example: "Lord, we lift up those battling depression. Bring light into their darkness..."
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 space-y-3">
                <Label className="text-sm font-medium">Default Cover Image</Label>
                
                <input
                  ref={prayerImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePrayerImageUpload}
                  className="hidden"
                  data-testid="input-prayer-image-upload"
                />
                
                {prayerPostImage ? (
                  <div className="relative w-full max-w-md">
                    <img 
                      src={prayerPostImage} 
                      alt="Prayer post cover" 
                      className="w-full h-48 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => setPrayerPostImage("")}
                      data-testid="button-remove-prayer-image"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div 
                    className="w-full max-w-md h-48 border-2 border-dashed border-muted-foreground/25 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-muted-foreground/50 transition-colors"
                    onClick={() => prayerImageInputRef.current?.click()}
                    data-testid="button-upload-prayer-image"
                  >
                    <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
                    <span className="text-sm text-muted-foreground">
                      {isUploadingImage ? "Uploading..." : "Click to upload an image"}
                    </span>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground">
                  Recommended: 16:9 aspect ratio, at least 1200x675 pixels. This image will be shown on prayer posts in the community feed.
                </p>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={handleSavePrayerSettings}
                  disabled={saveSettingMutation.isPending || isLoadingSettings}
                  data-testid="button-save-prayer-settings"
                >
                  {saveSettingMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : "Save Prayer Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                Internal Tags & Icons
              </CardTitle>
              <CardDescription>
                Manage internal admin-only tags with custom icons for church labeling. These tags are invisible to regular users but help admins organize and categorize churches.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">Manage Internal Tags</p>
                  <p className="text-sm text-muted-foreground">
                    Create, edit, and assign custom icons to internal tags
                  </p>
                </div>
                <Link href={buildPlatformUrl("/admin/internal-tags")}>
                  <Button variant="outline" data-testid="button-go-to-internal-tags">
                    Go to Internal Tags
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Super Admin Tools
                </CardTitle>
                <CardDescription>
                  System-wide administrative tools for managing the national map and data synchronization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <p className="font-medium">Refresh National Map Tileset</p>
                    <p className="text-sm text-muted-foreground">
                      Regenerate the Mapbox tileset with all approved churches. This updates the national "Explore" map view. Runs automatically every week.
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => tilesetMutation.mutate()}
                    disabled={tilesetMutation.isPending}
                    data-testid="button-refresh-tileset"
                  >
                    {tilesetMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh Tileset
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
