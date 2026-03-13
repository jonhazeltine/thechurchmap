import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building, Home, Key, AlertCircle, CheckCircle, Info, Users, Handshake, MapPin, Pencil, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface FacilityCardProps {
  churchId: string;
  isVisible: boolean;
  canEdit?: boolean;
}

interface ApprovedClaimData {
  wizard_data?: string | FacilityData;
}

interface FacilityData {
  facilityOwnership?: 'own' | 'rent' | 'other';
  facilityAdequacy?: 'adequate' | 'needs_improvement' | 'significantly_limited';
  unmetFacilityNeeds?: string;
  seekSpace?: boolean;
  openToCoLocation?: boolean;
  shareSpace?: boolean;
  facilityNotes?: string;
}

export function FacilityCard({ churchId, isVisible, canEdit = false }: FacilityCardProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<FacilityData>({});

  const { data: claimData, isLoading } = useQuery<ApprovedClaimData | null>({
    queryKey: [`/api/church-claims/approved/${churchId}`],
    enabled: isVisible && !!churchId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FacilityData) => {
      return apiRequest("PATCH", `/api/churches/${churchId}/facility`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/church-claims/approved/${churchId}`] });
      setIsEditing(false);
      toast({
        title: "Facility information updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!isVisible) return null;
  
  if (isLoading) {
    return (
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="w-4 h-4" />
            Facility Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  let facilityData: FacilityData = {};
  
  if (claimData?.wizard_data) {
    if (typeof claimData.wizard_data === 'string') {
      try {
        facilityData = JSON.parse(claimData.wizard_data) as FacilityData;
      } catch (e) {
        console.error("Failed to parse wizard data:", e);
      }
    } else if (typeof claimData.wizard_data === 'object') {
      facilityData = claimData.wizard_data as FacilityData;
    }
  }

  const ownershipLabels: Record<string, { label: string; icon: typeof Home }> = {
    own: { label: 'Owns Building', icon: Home },
    rent: { label: 'Rents/Leases', icon: Key },
    other: { label: 'Other Arrangement', icon: Building },
  };

  const adequacyConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
    adequate: { label: 'Adequate', color: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle },
    needs_improvement: { label: 'Needs Improvement', color: 'text-amber-600 dark:text-amber-400', icon: AlertCircle },
    significantly_limited: { label: 'Significantly Limited', color: 'text-red-600 dark:text-red-400', icon: AlertCircle },
  };

  const ownership = facilityData.facilityOwnership || 'other';
  const adequacy = facilityData.facilityAdequacy || 'adequate';
  const OwnershipIcon = ownershipLabels[ownership]?.icon || Building;
  const AdequacyIcon = adequacyConfig[adequacy]?.icon || CheckCircle;

  const hasSpaceOptions = facilityData.shareSpace || facilityData.seekSpace || facilityData.openToCoLocation;
  const hasNotes = facilityData.unmetFacilityNeeds || facilityData.facilityNotes;
  const hasAnyData = facilityData.facilityOwnership || hasSpaceOptions || hasNotes;

  const handleEditClick = () => {
    setFormData({ ...facilityData });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({});
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  if (isEditing) {
    return (
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-facility-edit">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="w-4 h-4" />
              Edit Facility Information
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={handleCancel} data-testid="button-cancel-edit">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription className="flex items-center gap-1.5 text-xs">
            <Info className="w-3 h-3" />
            Visible only to church admins
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ownership">Building Ownership</Label>
              <Select
                value={formData.facilityOwnership || 'other'}
                onValueChange={(value) => setFormData({ ...formData, facilityOwnership: value as FacilityData['facilityOwnership'] })}
              >
                <SelectTrigger id="ownership" data-testid="select-ownership">
                  <SelectValue placeholder="Select ownership type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">Own the building</SelectItem>
                  <SelectItem value="rent">Rent/Lease</SelectItem>
                  <SelectItem value="other">Other arrangement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adequacy">Facility Adequacy</Label>
              <Select
                value={formData.facilityAdequacy || 'adequate'}
                onValueChange={(value) => setFormData({ ...formData, facilityAdequacy: value as FacilityData['facilityAdequacy'] })}
              >
                <SelectTrigger id="adequacy" data-testid="select-adequacy">
                  <SelectValue placeholder="Select adequacy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adequate">Adequate for our needs</SelectItem>
                  <SelectItem value="needs_improvement">Needs improvement</SelectItem>
                  <SelectItem value="significantly_limited">Significantly limited</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Space Sharing Preferences</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="shareSpace" className="text-sm font-normal">Willing to share space</Label>
                  <p className="text-xs text-muted-foreground">Open to hosting other ministries</p>
                </div>
                <Switch
                  id="shareSpace"
                  checked={formData.shareSpace || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, shareSpace: checked })}
                  data-testid="switch-share-space"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="seekSpace" className="text-sm font-normal">Looking for space</Label>
                  <p className="text-xs text-muted-foreground">Seeking a place to meet or expand</p>
                </div>
                <Switch
                  id="seekSpace"
                  checked={formData.seekSpace || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, seekSpace: checked })}
                  data-testid="switch-seek-space"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="openToCoLocation" className="text-sm font-normal">Open to co-location</Label>
                  <p className="text-xs text-muted-foreground">Interested in sharing a building with another church</p>
                </div>
                <Switch
                  id="openToCoLocation"
                  checked={formData.openToCoLocation || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, openToCoLocation: checked })}
                  data-testid="switch-co-location"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unmetNeeds">Unmet Facility Needs</Label>
            <Textarea
              id="unmetNeeds"
              placeholder="Describe any facility needs that aren't currently being met..."
              value={formData.unmetFacilityNeeds || ''}
              onChange={(e) => setFormData({ ...formData, unmetFacilityNeeds: e.target.value })}
              className="min-h-[80px]"
              data-testid="textarea-unmet-needs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any other facility-related information..."
              value={formData.facilityNotes || ''}
              onChange={(e) => setFormData({ ...formData, facilityNotes: e.target.value })}
              className="min-h-[80px]"
              data-testid="textarea-facility-notes"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleCancel} disabled={updateMutation.isPending} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save">
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasAnyData) {
    return (
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="w-4 h-4" />
              Facility Information
            </CardTitle>
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={handleEditClick} data-testid="button-edit-facility">
                <Pencil className="w-4 h-4 mr-1" />
                Add Info
              </Button>
            )}
          </div>
          <CardDescription className="flex items-center gap-1.5 text-xs">
            <Info className="w-3 h-3" />
            Visible only to church admins
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No facility information available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-facility">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="w-4 h-4" />
            Facility Information
          </CardTitle>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleEditClick} data-testid="button-edit-facility">
              <Pencil className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Info className="w-3 h-3" />
          Visible only to church admins
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Ownership</div>
            <div className="flex items-center gap-2">
              <OwnershipIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{ownershipLabels[ownership]?.label || 'Unknown'}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Adequacy</div>
            <div className="flex items-center gap-2">
              <AdequacyIcon className={cn("w-4 h-4", adequacyConfig[adequacy]?.color)} />
              <span className={cn("text-sm", adequacyConfig[adequacy]?.color)}>
                {adequacyConfig[adequacy]?.label || 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {hasSpaceOptions && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium">Space Sharing</div>
            <div className="flex flex-wrap gap-2">
              {facilityData.shareSpace && (
                <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
                  <Users className="w-3 h-3 mr-1" />
                  Willing to Share
                </Badge>
              )}
              {facilityData.seekSpace && (
                <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <MapPin className="w-3 h-3 mr-1" />
                  Looking for Space
                </Badge>
              )}
              {facilityData.openToCoLocation && (
                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <Handshake className="w-3 h-3 mr-1" />
                  Open to Co-location
                </Badge>
              )}
            </div>
          </div>
        )}

        {facilityData.unmetFacilityNeeds && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Unmet Facility Needs</div>
            <p className="text-sm">{facilityData.unmetFacilityNeeds}</p>
          </div>
        )}

        {facilityData.facilityNotes && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Additional Notes</div>
            <p className="text-sm">{facilityData.facilityNotes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
