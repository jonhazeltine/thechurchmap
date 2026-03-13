import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "../../../lib/supabaseClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CallingBadge } from "./CallingBadge";
import { ImageCropper } from "./ImageCropper";
import { useToast } from "@/hooks/use-toast";
import { type ChurchWithCallings } from "@shared/schema";
import churchPlaceholder from "@assets/generated_images/church_placeholder_icon.png";
import { Camera, Loader2, ImageIcon } from "lucide-react";

interface ChurchHeaderProps {
  church: ChurchWithCallings;
  variant?: "compact" | "medium" | "large";
  maxCallings?: number;
  showAllCallings?: boolean;
  canEdit?: boolean;
  showBanner?: boolean;
  bannerHeight?: "sm" | "md" | "lg";
  rightContent?: React.ReactNode;
}

export function ChurchHeader({ 
  church, 
  variant = "medium",
  maxCallings,
  showAllCallings = false,
  canEdit = false,
  showBanner = false,
  bannerHeight = "sm",
  rightContent,
}: ChurchHeaderProps) {
  const { toast } = useToast();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  
  const [logoCropFile, setLogoCropFile] = useState<File | null>(null);
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null);
  const [showLogoCropper, setShowLogoCropper] = useState(false);
  const [showBannerCropper, setShowBannerCropper] = useState(false);
  const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());
  
  const avatarSize = variant === "large" ? "w-16 h-16" : variant === "medium" ? "w-16 h-16" : "w-12 h-12";
  const nameSize = variant === "large" ? "text-2xl" : variant === "medium" ? "text-xl" : "text-lg";
  const denomSize = "text-sm";
  
  const callings = church.callings || [];
  const displayedCallings = showAllCallings || !maxCallings 
    ? callings 
    : callings.slice(0, maxCallings);
  const remainingCount = maxCallings && callings.length > maxCallings 
    ? callings.length - maxCallings 
    : 0;

  const uploadLogoMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      
      const formData = new FormData();
      formData.append('logo', blob, 'logo.jpg');
      
      const response = await fetch(`/api/churches/${church.id}/logo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      setImageCacheBuster(Date.now());
      queryClient.refetchQueries({ queryKey: ["/api/churches"], type: 'active' });
      queryClient.refetchQueries({ queryKey: ["/api/churches", church.id], type: 'active' });
      toast({
        title: "Logo updated",
        description: "Your church logo has been saved.",
      });
      setShowLogoCropper(false);
      setLogoCropFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadBannerMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      
      const formData = new FormData();
      formData.append('banner', blob, 'banner.jpg');
      
      const response = await fetch(`/api/churches/${church.id}/banner`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      setImageCacheBuster(Date.now());
      queryClient.refetchQueries({ queryKey: ["/api/churches"], type: 'active' });
      queryClient.refetchQueries({ queryKey: ["/api/churches", church.id], type: 'active' });
      toast({
        title: "Banner updated",
        description: "Your church banner has been saved.",
      });
      setShowBannerCropper(false);
      setBannerCropFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const validateFile = (file: File): boolean => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPG, PNG, GIF, etc.)",
        variant: "destructive",
      });
      return false;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image under 5MB.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleLogoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !validateFile(file)) {
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }
    setLogoCropFile(file);
    setShowLogoCropper(true);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleBannerFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !validateFile(file)) {
      if (bannerInputRef.current) bannerInputRef.current.value = '';
      return;
    }
    setBannerCropFile(file);
    setShowBannerCropper(true);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const handleLogoCropComplete = async (croppedBlob: Blob) => {
    setIsUploadingLogo(true);
    try {
      await uploadLogoMutation.mutateAsync(croppedBlob);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleBannerCropComplete = async (croppedBlob: Blob) => {
    setIsUploadingBanner(true);
    try {
      await uploadBannerMutation.mutateAsync(croppedBlob);
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleAvatarClick = () => {
    if (canEdit && !isUploadingLogo) {
      logoInputRef.current?.click();
    }
  };

  const handleBannerClick = () => {
    if (canEdit && !isUploadingBanner) {
      bannerInputRef.current?.click();
    }
  };

  const handleLogoCropperClose = () => {
    setShowLogoCropper(false);
    setLogoCropFile(null);
  };

  const handleBannerCropperClose = () => {
    setShowBannerCropper(false);
    setBannerCropFile(null);
  };

  const bannerHeightClass = bannerHeight === "lg" ? "h-48" : bannerHeight === "md" ? "h-40" : "h-32";

  return (
    <div className="space-y-4">
      {showBanner && (
        <div 
          className={`relative w-full ${bannerHeightClass} rounded-lg overflow-hidden bg-muted ${canEdit ? 'cursor-pointer group' : ''}`}
          onClick={handleBannerClick}
          data-testid="banner-church-image"
        >
          {church.banner_image_url ? (
            <img 
              src={`${church.banner_image_url}?t=${imageCacheBuster}`} 
              alt={`${church.name} banner`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-r from-primary/10 to-primary/5">
              <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            </div>
          )}
          {canEdit && (
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/70 hover:bg-black/80 rounded-md text-white text-xs font-medium backdrop-blur-sm transition-colors">
                {isUploadingBanner ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                <span>Change Banner</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-3">
        <div 
          className={`relative flex-shrink-0 ${canEdit ? 'cursor-pointer group' : ''}`}
          onClick={handleAvatarClick}
          data-testid="avatar-church-logo"
        >
          <Avatar className={avatarSize}>
            <AvatarImage src={church.profile_photo_url ? `${church.profile_photo_url}?t=${imageCacheBuster}` : undefined} alt={church.name} />
            <AvatarFallback>
              <img src={churchPlaceholder} alt="Church" className="w-full h-full object-cover opacity-50" />
            </AvatarFallback>
          </Avatar>
          {canEdit && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              {isUploadingLogo ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
          )}
          {isUploadingLogo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            </div>
          )}
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoFileSelect}
          className="hidden"
          data-testid="input-logo-file"
        />
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          onChange={handleBannerFileSelect}
          className="hidden"
          data-testid="input-banner-file"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3 className={`${nameSize} font-semibold mb-1 leading-tight`} data-testid="text-church-name">
                {church.name}
              </h3>
              {church.denomination && (
                <p className={`${denomSize} text-muted-foreground`}>{church.denomination}</p>
              )}
            </div>
            {rightContent && (
              <div className="flex-shrink-0">
                {rightContent}
              </div>
            )}
          </div>
        </div>
      </div>

      {displayedCallings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {displayedCallings.map((calling) => (
            <CallingBadge key={calling.id} calling={calling} size="sm" />
          ))}
          {remainingCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              +{remainingCount} more
            </Badge>
          )}
        </div>
      )}

      <ImageCropper
        open={showLogoCropper}
        onClose={handleLogoCropperClose}
        imageFile={logoCropFile}
        aspectRatio={1}
        title="Crop Church Logo"
        onCropComplete={handleLogoCropComplete}
        isUploading={isUploadingLogo}
      />

      <ImageCropper
        open={showBannerCropper}
        onClose={handleBannerCropperClose}
        imageFile={bannerCropFile}
        aspectRatio={3}
        title="Crop Church Banner"
        onCropComplete={handleBannerCropComplete}
        isUploading={isUploadingBanner}
      />
    </div>
  );
}
