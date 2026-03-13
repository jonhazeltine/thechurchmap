import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, User, Lock, Mail, Check, AlertCircle, ArrowLeft, Map, Globe, ExternalLink } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ImageCropper } from "@/components/ImageCropper";
import { useLocation } from "wouter";
import type { Profile } from "@shared/schema";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Must match MAP_STYLES in admin/Settings.tsx
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

function getMapPreviewUrl(styleUrl: string): string {
  return `https://api.mapbox.com/styles/v1/${styleUrl}/static/-98.5,39.8,3,0/200x100@2x?access_token=${MAPBOX_TOKEN}`;
}

const MAP_STYLE_STORAGE_KEY = "kingdom-map-style-preference";

export default function UserProfile() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { platformId, getChurchUrl } = usePlatformNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [fullName, setFullName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mapLink = useMemo(() => {
    return platformId ? `/${platformId}` : '/';
  }, [platformId]);
  
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Map style preference
  const [mapStyle, setMapStyle] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(MAP_STYLE_STORAGE_KEY) || '';
    }
    return '';
  });
  const [platformDefaultStyle, setPlatformDefaultStyle] = useState<string>('streets-v12');

  // Fetch platform default map style
  useEffect(() => {
    fetch('/api/platform/settings')
      .then(res => res.json())
      .then(data => {
        if (data.mapBaseStyle) {
          setPlatformDefaultStyle(data.mapBaseStyle);
        }
      })
      .catch(err => {
        console.error('Failed to fetch platform settings:', err);
      });
  }, []);

  const { data: profile, isLoading } = useQuery<Profile>({
    queryKey: ['/api/profile'],
    enabled: !!session?.access_token,
    meta: {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
      },
    },
  });

  // Fetch onboarding status to get church info
  const { data: onboardingStatus } = useQuery<{
    church_id: string | null;
    church: { id: string; name: string; address: string | null; city: string | null; state: string | null } | null;
    pending_church: { id: string; name: string; status: string } | null;
    platform: { id: string; name: string; slug: string } | null;
  }>({
    queryKey: ['/api/onboarding/status'],
    enabled: !!session?.access_token,
    meta: {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
      },
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { full_name?: string; first_name?: string; avatar_url?: string }) => {
      return apiRequest('PATCH', '/api/profile', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      toast({
        title: "Profile updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return apiRequest('POST', '/api/profile/password', data);
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setFirstName(profile.first_name || "");
    }
  }, [profile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      setCropperOpen(true);
    }
    e.target.value = '';
  };

  const handleCropComplete = useCallback(async (croppedBlob: Blob) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', croppedBlob, 'avatar.jpg');

      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload avatar');
      }

      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      
      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated.",
      });
      
      setCropperOpen(false);
      setSelectedFile(null);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload avatar",
        variant: "destructive",
      });
      // Close dialog on error too so user doesn't have to hit cancel
      setCropperOpen(false);
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  }, [session?.access_token, toast]);

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      full_name: fullName,
      first_name: firstName,
    });
  };

  const handleMapStyleChange = (styleId: string) => {
    setMapStyle(styleId);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, styleId);
    // Dispatch event so MapView picks up the change
    window.dispatchEvent(new CustomEvent('userMapStyleChanged', { detail: styleId }));
    toast({
      title: "Map style updated",
      description: "Your map style preference has been saved.",
    });
  };

  const handleClearMapStyle = () => {
    setMapStyle('');
    localStorage.removeItem(MAP_STYLE_STORAGE_KEY);
    // Dispatch event to reset to platform default
    window.dispatchEvent(new CustomEvent('userMapStyleChanged', { detail: '' }));
    toast({
      title: "Map style reset",
      description: "The map will now use the platform default style.",
    });
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords don't match",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  const getInitials = (name?: string | null, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  useEffect(() => {
    if (!user) {
      setLocation('/login');
    }
  }, [user, setLocation]);

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-2xl mx-auto py-8 px-4">
        <button
          onClick={() => setLocation(mapLink)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          data-testid="button-back-to-map"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Map</span>
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-profile-title">Profile Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account settings and preferences</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Picture
              </CardTitle>
              <CardDescription>
                Upload a profile picture that will be shown across the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-2xl">
                      {getInitials(profile?.full_name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    data-testid="button-change-avatar"
                  >
                    <Camera className="w-6 h-6 text-white" />
                  </button>
                </div>
                <div className="flex-1">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-avatar"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Change Photo
                  </Button>
                  <p className="text-sm text-muted-foreground mt-2">
                    JPG, PNG or GIF. Max 5MB.
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-avatar-file"
              />
            </CardContent>
          </Card>

          {/* My Church Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconBuildingChurch className="w-5 h-5" />
                My Church
              </CardTitle>
              <CardDescription>
                Your primary church affiliation
              </CardDescription>
            </CardHeader>
            <CardContent>
              {onboardingStatus?.church ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-lg" data-testid="text-my-church-name">
                        {onboardingStatus.church.name}
                      </p>
                      {(onboardingStatus.church.city || onboardingStatus.church.state) && (
                        <p className="text-sm text-muted-foreground">
                          {[onboardingStatus.church.city, onboardingStatus.church.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {onboardingStatus.church.address && (
                        <p className="text-sm text-muted-foreground">
                          {onboardingStatus.church.address}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(getChurchUrl(onboardingStatus.church!.id))}
                      className="gap-2"
                      data-testid="button-view-church"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View
                    </Button>
                  </div>
                  
                  {onboardingStatus.platform && (
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <Globe className="w-5 h-5 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Member of {onboardingStatus.platform.name}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/${onboardingStatus.platform!.slug || onboardingStatus.platform!.id}`)}
                        data-testid="button-view-platform"
                      >
                        View Network
                      </Button>
                    </div>
                  )}
                </div>
              ) : onboardingStatus?.pending_church ? (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <p className="font-medium" data-testid="text-pending-church-name">
                      {onboardingStatus.pending_church.name}
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                      Your church submission is pending review
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <IconBuildingChurch className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground mb-4">
                    You haven't selected a church yet
                  </p>
                  <Button
                    onClick={() => setLocation('/onboarding')}
                    className="gap-2"
                    data-testid="button-select-church"
                  >
                    <IconBuildingChurch className="w-4 h-4" />
                    Find My Church
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Update your name and personal details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  value={user.email || ''}
                  disabled
                  className="bg-muted"
                  data-testid="input-email"
                />
                <p className="text-xs text-muted-foreground">
                  Contact support to change your email address
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter your first name"
                  data-testid="input-first-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  data-testid="input-full-name"
                />
              </div>

              <Button 
                onClick={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
                data-testid="button-save-profile"
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  data-testid="input-current-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  data-testid="input-new-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  data-testid="input-confirm-password"
                />
              </div>

              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  Passwords don't match
                </p>
              )}

              <Button 
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                data-testid="button-change-password"
              >
                {changePasswordMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4 mr-2" />
                )}
                Change Password
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="w-5 h-5" />
                Map Preferences
              </CardTitle>
              <CardDescription>
                Choose your preferred map style. This preference will be remembered across sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Map Style</Label>
                  {mapStyle && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearMapStyle}
                      className="text-muted-foreground"
                      data-testid="button-reset-map-style"
                    >
                      Reset to default
                    </Button>
                  )}
                </div>
                <RadioGroup
                  value={mapStyle}
                  onValueChange={handleMapStyleChange}
                  className="grid grid-cols-2 md:grid-cols-3 gap-3"
                >
                  {MAP_STYLES.map((style) => (
                    <div key={style.id} className="relative">
                      <RadioGroupItem
                        value={style.id}
                        id={`style-${style.id}`}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={`style-${style.id}`}
                        className="flex flex-col cursor-pointer rounded-lg border-2 border-muted bg-popover overflow-hidden hover:border-muted-foreground/50 transition-colors peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                        data-testid={`radio-map-style-${style.id}`}
                      >
                        <div className="w-full h-20 bg-muted overflow-hidden relative">
                          {MAPBOX_TOKEN && !style.fallbackPreview ? (
                            <img
                              src={getMapPreviewUrl(style.styleUrl)}
                              alt={`${style.name} map style preview`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className={`w-full h-full ${style.fallbackPreview || 'bg-gradient-to-br from-slate-100 via-blue-50 to-green-50'}`}>
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="text-center">
                                  <Map className="w-6 h-6 mx-auto text-muted-foreground/50" />
                                  <span className="text-[10px] text-muted-foreground/70 mt-1 block">3D Style</span>
                                </div>
                              </div>
                            </div>
                          )}
                          {platformDefaultStyle === style.id && (
                            <Badge 
                              variant="secondary" 
                              className="absolute top-1 right-1 text-xs py-0 px-1.5"
                            >
                              Default
                            </Badge>
                          )}
                          {mapStyle === style.id && (
                            <div className="absolute top-1 left-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <span className="font-medium text-sm">{style.name}</span>
                          <span className="text-xs text-muted-foreground block">{style.description}</span>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {!mapStyle && (
                  <p className="text-sm text-muted-foreground">
                    No preference set. Using platform default style.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <ImageCropper
        open={cropperOpen}
        onClose={() => {
          setCropperOpen(false);
          setSelectedFile(null);
        }}
        imageFile={selectedFile}
        aspectRatio={1}
        title="Crop Profile Picture"
        onCropComplete={handleCropComplete}
        isUploading={isUploading}
      />
    </div>
  );
}
