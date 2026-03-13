import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { supabase } from "../../../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2, X, Upload } from "lucide-react";

interface LogoUploadProps {
  churchId: string;
  churchName: string;
  currentLogoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  onUploadComplete?: (url: string | null) => void;
}

export function LogoUpload({ 
  churchId, 
  churchName, 
  currentLogoUrl, 
  size = "lg",
  onUploadComplete 
}: LogoUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const sizeClasses = {
    sm: "h-12 w-12",
    md: "h-20 w-20",
    lg: "h-32 w-32"
  };

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      
      const formData = new FormData();
      formData.append('logo', file);
      
      const response = await fetch(`/api/churches/${churchId}/logo`, {
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId] });
      toast({
        title: "Logo updated",
        description: "Your church logo has been saved.",
      });
      onUploadComplete?.(data.profile_photo_url);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/churches/${churchId}/logo`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId] });
      toast({
        title: "Logo removed",
        description: "Your church logo has been removed.",
      });
      onUploadComplete?.(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPG, PNG, GIF, etc.)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image under 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      await uploadLogoMutation.mutateAsync(file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    setIsUploading(true);
    try {
      await removeLogoMutation.mutateAsync();
    } finally {
      setIsUploading(false);
    }
  };

  const initials = churchName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const isPending = isUploading || uploadLogoMutation.isPending || removeLogoMutation.isPending;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar className={`${sizeClasses[size]} border-2 border-border`} data-testid="avatar-church-logo">
          <AvatarImage src={currentLogoUrl || undefined} alt={churchName} />
          <AvatarFallback className="text-lg font-semibold bg-muted">
            {initials}
          </AvatarFallback>
        </Avatar>
        
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-logo-file"
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          data-testid="button-upload-logo"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {currentLogoUrl ? "Change Logo" : "Upload Logo"}
        </Button>
        
        {currentLogoUrl && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRemoveLogo}
            disabled={isPending}
            data-testid="button-remove-logo"
          >
            <X className="h-4 w-4 mr-2" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
