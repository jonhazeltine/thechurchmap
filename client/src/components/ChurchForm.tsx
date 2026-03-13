import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertChurchSchema, type InsertChurch, type Calling } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { PlaceSearch, type PlaceResult } from "./PlaceSearch";
import { Badge } from "@/components/ui/badge";
import { CallingBadge } from "./CallingBadge";
import { MapPin, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

interface ChurchFormProps {
  callings: Calling[];
  onSubmit: (data: InsertChurch) => void;
  onCancel: () => void;
  isLoading?: boolean;
  platformStateCode?: string; // Two-letter state code to bias search (e.g., "FL", "MI")
  platformCenter?: [number, number]; // [lng, lat] center point to bias search
}

export function ChurchForm({ callings, onSubmit, onCancel, isLoading, platformStateCode, platformCenter }: ChurchFormProps) {
  const [detectedBoundary, setDetectedBoundary] = useState<{
    id: string;
    name: string;
    type: string;
  } | null>(null);
  const [boundaryError, setBoundaryError] = useState<string>("");
  const [detectingBoundary, setDetectingBoundary] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

  const form = useForm<InsertChurch>({
    resolver: zodResolver(insertChurchSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      denomination: "",
      website: "",
      email: "",
      phone: "",
      collaboration_have: [],
      collaboration_need: [],
    },
  });

  // Detect city boundary from coordinates
  const detectBoundary = async (
    lng: number, 
    lat: number, 
    fullAddress: string,
    context?: Array<{ id: string; text: string; short_code?: string }>
  ) => {
    setDetectingBoundary(true);
    setBoundaryError("");
    
    // Extract city, state, and ZIP from Mapbox context
    if (context) {
      const placeContext = context.find(c => c.id.startsWith('place.'));
      const regionContext = context.find(c => c.id.startsWith('region.'));
      const postcodeContext = context.find(c => c.id.startsWith('postcode.'));
      
      if (placeContext) {
        form.setValue('city', placeContext.text);
      }
      if (regionContext && regionContext.short_code) {
        // short_code format is "US-MI", extract "MI"
        const stateCode = regionContext.short_code.split('-').pop() || '';
        form.setValue('state', stateCode);
      }
      if (postcodeContext) {
        form.setValue('zip', postcodeContext.text);
      }
    }
    
    try {
      // Extract city name from context for fallback matching
      const cityName = context?.find(c => c.id.startsWith('place.'))?.text || '';
      const cityParam = cityName ? `&city=${encodeURIComponent(cityName)}` : '';
      
      const response = await fetch(`/api/boundaries/by-point?lng=${lng}&lat=${lat}&types=place${cityParam}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          const errorData = await response.json().catch(() => ({}));
          const cityName = context?.find(c => c.id.startsWith('place.'))?.text || 'this city';
          setBoundaryError(`"${cityName}" is not in our boundary database yet. You can still add this church - it just won't be linked to a city boundary.`);
          setDetectedBoundary(null);
        } else {
          throw new Error('Failed to detect city boundary');
        }
        return;
      }

      const boundary = await response.json();
      setDetectedBoundary(boundary);
      setBoundaryError("");
    } catch (error: any) {
      console.error('Boundary detection error:', error);
      setBoundaryError("Unable to detect city boundary. Please try again.");
      setDetectedBoundary(null);
    } finally {
      setDetectingBoundary(false);
    }
  };

  // Handle place selection from PlaceSearch
  const handlePlaceSelect = async (place: PlaceResult) => {
    setSelectedPlace(place);
    
    // Auto-fill form fields
    form.setValue("name", place.name);
    form.setValue("address", place.address || place.fullAddress.split(",")[0] || "");
    form.setValue("city", place.city);
    form.setValue("state", place.state);
    form.setValue("zip", place.zip);
    
    // Set location coordinates (required for schema validation)
    if (place.coordinates) {
      form.setValue("location", {
        type: "Point",
        coordinates: place.coordinates, // [lng, lat]
      });
      
      // Detect boundary from coordinates
      detectBoundary(place.coordinates[0], place.coordinates[1], place.fullAddress, place.context);
    }
  };

  // Clear selected place and reset form
  const handleClearPlace = () => {
    setSelectedPlace(null);
    setDetectedBoundary(null);
    setBoundaryError("");
    form.reset();
  };

  // Custom submit handler that includes boundary_id if available
  const handleFormSubmit = (data: InsertChurch) => {
    // Include boundary_id in submission if we have one
    const submissionData = detectedBoundary 
      ? { ...data, boundary_ids: [detectedBoundary.id] }
      : data;
    
    onSubmit(submissionData as any);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* Place Search Section */}
        <Card className="border-dashed">
          <CardContent className="pt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Quick Add - Search for a Place</h3>
                {selectedPlace && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearPlace}
                    data-testid="button-clear-place"
                  >
                    Clear & Start Over
                  </Button>
                )}
              </div>
              
              {selectedPlace ? (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="flex flex-col gap-1">
                    <span className="font-medium">{selectedPlace.name}</span>
                    <span className="text-sm text-muted-foreground">{selectedPlace.fullAddress}</span>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <PlaceSearch
                    onSelect={handlePlaceSelect}
                    placeholder="Search for a church, business, or address..."
                    testId="input-place-search"
                    stateCode={platformStateCode}
                    proximity={platformCenter}
                  />
                  <p className="text-xs text-muted-foreground">
                    Search for an existing place to auto-fill the form, or enter details manually below.
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Information</h3>
          
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Church Name *</FormLabel>
                <FormControl>
                  <Input placeholder="First Community Church" {...field} data-testid="input-church-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="denomination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Denomination</FormLabel>
                  <FormControl>
                    <Input placeholder="Non-denominational" {...field} data-testid="input-denomination" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} data-testid="input-website" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street Address *</FormLabel>
                <FormControl>
                  {selectedPlace ? (
                    <Input 
                      {...field} 
                      placeholder="123 Main Street"
                      data-testid="input-address"
                    />
                  ) : (
                    <AddressAutocomplete
                      value={field.value || ""}
                      onChange={field.onChange}
                      onSelect={(address, coordinates, context) => {
                        field.onChange(address);
                        if (coordinates) {
                          // Set location coordinates when address is selected
                          form.setValue("location", {
                            type: "Point",
                            coordinates: coordinates, // [lng, lat]
                          });
                          detectBoundary(coordinates[0], coordinates[1], address, context);
                        }
                      }}
                      placeholder="Start typing to search addresses..."
                      testId="input-address"
                    />
                  )}
                </FormControl>
                {!selectedPlace && (
                  <FormDescription>
                    Select an address from the dropdown to auto-detect the city
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Boundary Detection Status */}
          {detectingBoundary && (
            <Alert>
              <MapPin className="h-4 w-4" />
              <AlertDescription>
                Detecting city boundary...
              </AlertDescription>
            </Alert>
          )}

          {detectedBoundary && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <MapPin className="h-4 w-4 text-green-600" />
              <AlertDescription className="flex items-center gap-2">
                <span>City detected:</span>
                <Badge variant="outline" className="text-green-700 border-green-600">
                  {detectedBoundary.name}
                </Badge>
              </AlertDescription>
            </Alert>
          )}

          {boundaryError && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">{boundaryError}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Grand Rapids" {...field} data-testid="input-city" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <FormControl>
                    <Input placeholder="MI" {...field} data-testid="input-state" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="zip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code</FormLabel>
                  <FormControl>
                    <Input placeholder="49503" {...field} data-testid="input-zip" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (optional)</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="info@church.com" {...field} data-testid="input-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="(616) 555-0100" {...field} data-testid="input-phone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-submit">
            {isLoading ? "Submitting..." : "Submit Church"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
