import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChurchHeader } from "./ChurchHeader";
import { ChurchContactInfo } from "./ChurchContactInfo";
import { ClaimChurchButton } from "./ClaimChurchButton";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { type ChurchWithCallings } from "@shared/schema";
import { Globe, MapIcon, Edit2, Check, X } from "lucide-react";
import { Link } from "wouter";

interface ChurchCardProps {
  church: ChurchWithCallings;
  variant?: "compact" | "full";
  onViewOnMap?: (church: ChurchWithCallings) => void;
  onSelect?: (church: ChurchWithCallings) => void;
}

export function ChurchCard({ church, variant = "compact", onViewOnMap, onSelect }: ChurchCardProps) {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin, churchAdminChurchIds } = useAdminAccess();
  const { getChurchUrl } = usePlatformNavigation();
  const [editedName, setEditedName] = useState(church.name);
  const [editingContact, setEditingContact] = useState(false);
  const [editedAddress, setEditedAddress] = useState(church.address || "");
  const [editedPhone, setEditedPhone] = useState(church.phone || "");
  const [editedWebsite, setEditedWebsite] = useState(church.website || "");
  const [addressError, setAddressError] = useState<string>("");

  // Check if user can edit this specific church
  const canEdit = isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.includes(church.id);

  // Validate US address format - requires street number and street name
  const isValidAddress = (address: string): boolean => {
    if (!address || address.trim().length < 5) return false;
    // Pattern: starts with digit(s), followed by street name (letters/numbers/spaces/punctuation)
    const addressPattern = /^\d+\s+[a-zA-Z0-9\s,.-]+$/;
    return addressPattern.test(address.trim());
  };

  const updateChurchMutation = useMutation({
    mutationFn: async (data: { name?: string; address?: string; phone?: string; website?: string }) => {
      return apiRequest("PATCH", `/api/churches/${church.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      setEditingContact(false);
      toast({
        title: "Church updated",
        description: "Church information has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (variant === "full") {
    return (
      <Card className="overflow-hidden" data-testid={`card-church-${church.id}`}>
        <CardHeader className="pb-2">
          <div className="space-y-4">
            <ChurchHeader 
              church={church} 
              variant="large" 
              showAllCallings={true} 
              canEdit={canEdit} 
              showBanner={true}
              bannerHeight="lg"
              rightContent={
                <div className="flex items-center gap-2 flex-wrap">
                  <ClaimChurchButton churchId={church.id} churchName={church.name} church={church} />
                  {church.website && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      data-testid="button-visit-website"
                    >
                      <a href={church.website} target="_blank" rel="noopener noreferrer">
                        <Globe className="w-4 h-4 mr-2" />
                        Visit Website
                      </a>
                    </Button>
                  )}
                </div>
              }
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {church.description && (
            <div>
              <h4 className="font-medium mb-2">About</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {church.description}
              </p>
            </div>
          )}

          {editingContact ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-medium">Edit Church Info</h4>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Church Name</label>
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    placeholder="Church name"
                    data-testid="input-edit-church-name"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Address</label>
                  <AddressAutocomplete
                    value={editedAddress}
                    onChange={(value) => {
                      setEditedAddress(value);
                      if (value.trim() && !isValidAddress(value)) {
                        setAddressError("Please enter a valid address (e.g., 123 Main St, City, ST 12345)");
                      } else {
                        setAddressError("");
                      }
                    }}
                    onSelect={(address) => {
                      setEditedAddress(address);
                      setAddressError(""); // Clear any errors when selecting from autocomplete
                    }}
                    placeholder="123 Main St, City, ST 12345"
                    error={!!addressError}
                    testId="input-edit-church-address"
                  />
                  {addressError && (
                    <p className="text-xs text-destructive mt-1">{addressError}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Phone</label>
                  <Input
                    value={editedPhone}
                    onChange={(e) => setEditedPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    data-testid="input-edit-church-phone"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Website</label>
                  <Input
                    value={editedWebsite}
                    onChange={(e) => setEditedWebsite(e.target.value)}
                    placeholder="https://example.com"
                    data-testid="input-edit-church-website"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (editedAddress.trim() && !isValidAddress(editedAddress)) {
                      setAddressError("Please enter a valid address");
                      return;
                    }
                    updateChurchMutation.mutate({ 
                      name: editedName,
                      address: editedAddress,
                      phone: editedPhone,
                      website: editedWebsite
                    });
                  }}
                  disabled={updateChurchMutation.isPending || (!!editedAddress.trim() && !!addressError)}
                  data-testid="button-save-contact"
                >
                  {updateChurchMutation.isPending ? "Saving..." : <Check className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingContact(false);
                    setEditedName(church.name);
                    setEditedAddress(church.address || "");
                    setEditedPhone(church.phone || "");
                    setEditedWebsite(church.website || "");
                    setAddressError("");
                  }}
                  data-testid="button-cancel-contact"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-start gap-2 mb-2">
                <h4 className="font-medium">Contact Info</h4>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingContact(true);
                      setEditedName(church.name);
                      setEditedAddress(church.address || "");
                      setEditedPhone(church.phone || "");
                      setEditedWebsite(church.website || "");
                    }}
                    data-testid="button-edit-church"
                    className="flex-shrink-0"
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
              <ChurchContactInfo
                address={church.address}
                city={church.city}
                state={church.state}
                zip={church.zip}
                email={church.email}
                phone={church.phone}
                website={church.website}
                layout="full"
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (!onSelect) return;
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button')) {
      return;
    }
    onSelect(church);
  };

  return (
    <Card 
      className={`hover-elevate transition-all ${onSelect ? 'cursor-pointer' : ''}`} 
      data-testid={`card-church-${church.id}`}
      onClick={handleCardClick}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <ChurchHeader church={church} variant="compact" maxCallings={4} />
            <p className="text-sm text-muted-foreground mt-2">
              {[church.city, church.state].filter(Boolean).join(", ")}
            </p>
          </div>
          {church.website && (
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0"
              asChild
              data-testid="button-website-compact"
            >
              <a href={church.website} target="_blank" rel="noopener noreferrer">
                <Globe className="w-4 h-4" />
              </a>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardFooter className="flex gap-2">
        <Button 
          variant="ghost" 
          size="sm" 
          className="flex-1" 
          asChild 
          data-testid="button-view-profile"
        >
          <Link href={getChurchUrl(church.id)}>View Profile</Link>
        </Button>
        {onViewOnMap && church.location?.coordinates && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onViewOnMap(church)}
            data-testid="button-view-on-map"
          >
            <MapIcon className="w-4 h-4 mr-2" />
            View on Map
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
