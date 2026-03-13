import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Heart, Loader2, CheckCircle, Info, ChevronsUpDown, Check, ArrowRight, User, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import type { Church } from "@shared/schema";

interface ClickLocation {
  lng: number;
  lat: number;
  label?: string;
  tractId?: string;
}

interface SubmitPrayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  cityPlatformId?: string | null;
  defaultChurch?: Church | null;
  clickLocation?: ClickLocation | null;
}

const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200, "Title must be under 200 characters"),
  body: z.string().min(10, "Prayer request must be at least 10 characters").max(2000, "Prayer request must be under 2000 characters"),
  is_anonymous: z.boolean().default(false),
  guest_name: z.string().optional(),
  guest_email: z.string().optional(),
  church_id: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export function SubmitPrayerDialog({ open, onOpenChange, onSuccess, cityPlatformId, defaultChurch, clickLocation }: SubmitPrayerDialogProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [churchSearchOpen, setChurchSearchOpen] = useState(false);
  const [churchSearchQuery, setChurchSearchQuery] = useState("");
  const [selectedChurch, setSelectedChurch] = useState<Church | null>(null);
  const isAuthenticated = !!session;
  const isMapClickMode = !!clickLocation;

  // Search churches using the same API as the left panel, scoped to current platform
  const { data: churches = [], isLoading: churchesLoading } = useQuery<Church[]>({
    queryKey: ["/api/churches/search", churchSearchQuery, cityPlatformId],
    queryFn: async () => {
      if (churchSearchQuery.length < 2) return [];
      const params = new URLSearchParams({ q: churchSearchQuery });
      if (cityPlatformId) params.append("city_platform_id", cityPlatformId);
      const url = `/api/churches/search?${params}`;
      console.log(`[SubmitPrayerDialog] Church search - query: "${churchSearchQuery}", platformId: ${cityPlatformId}, url: ${url}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to search churches");
      const results = await response.json();
      console.log(`[SubmitPrayerDialog] Church search results:`, results.length, "churches");
      return results;
    },
    enabled: open && churchSearchQuery.length >= 2,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      body: "",
      is_anonymous: false,
      guest_name: "",
      guest_email: "",
      church_id: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        title: "",
        body: "",
        is_anonymous: false,
        guest_name: "",
        guest_email: "",
        church_id: defaultChurch?.id || "",
      });
      setIsSubmitted(false);
      setChurchSearchQuery("");
      setSelectedChurch(defaultChurch || null);
    }
  }, [open, form, defaultChurch]);

  const submitPrayerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const payload: Record<string, any> = {
        ...data,
        city_platform_id: cityPlatformId || undefined,
      };

      if (clickLocation) {
        payload.scope_type = 'tract';
        payload.click_lat = clickLocation.lat;
        payload.click_lng = clickLocation.lng;
        if (clickLocation.tractId) {
          payload.tract_id = clickLocation.tractId;
        }
        delete payload.church_id;
      }

      const response = await fetch("/api/prayers/public", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit prayer request");
      }

      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
      setIsSubmitted(true);

      // Store anonymous token for later account claiming
      if (result.anonymous_token && !isAuthenticated) {
        try {
          const existingTokens = JSON.parse(localStorage.getItem('anonymous_prayer_tokens') || '[]');
          existingTokens.push(result.anonymous_token);
          localStorage.setItem('anonymous_prayer_tokens', JSON.stringify(existingTokens));
        } catch (e) {
          console.warn('Could not store prayer token:', e);
        }
      }

      // For authenticated users, auto-close after a delay
      if (isAuthenticated) {
        setTimeout(() => {
          setIsSubmitted(false);
          onOpenChange(false);
          form.reset();
          onSuccess?.();
        }, 2500);
      }
      // For guests, keep the dialog open to show "Create Account" option
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: FormData) => {
    if (!isAuthenticated) {
      if (!data.guest_email) {
        form.setError("guest_email", { message: "Email is required" });
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.guest_email)) {
        form.setError("guest_email", { message: "Please enter a valid email address" });
        return;
      }
    }

    if (isAuthenticated && !data.church_id && !isMapClickMode) {
      form.setError("church_id", { message: "Please select a church" });
      return;
    }

    submitPrayerMutation.mutate(data);
  };

  const handleClose = () => {
    if (!submitPrayerMutation.isPending) {
      setIsSubmitted(false);
      form.reset({
        title: "",
        body: "",
        is_anonymous: false,
        guest_name: "",
        guest_email: "",
        church_id: defaultChurch?.id || "",
      });
      setChurchSearchQuery("");
      setSelectedChurch(defaultChurch || null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary" />
            Submit Prayer Request
          </DialogTitle>
          <DialogDescription>
            Share your prayer request with the community
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="text-center py-6" data-testid="div-prayer-submitted-success">
            <CheckCircle className="w-14 h-14 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-semibold mb-2">Prayer Request Submitted</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {isAuthenticated
                ? "Your prayer request has been submitted and will be shared with the community."
                : "Your prayer request has been submitted for review. Once approved, it will be shared with the community."}
            </p>
            
            {!isAuthenticated && (
              <div className="space-y-4 mt-6">
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <User className="h-5 w-5 text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Create an account to get your prayer approved instantly
                  </p>
                </div>

                <Link href={`/signup?redirect=${encodeURIComponent(window.location.pathname)}`}>
                  <Button 
                    className="w-full" 
                    variant="default"
                    data-testid="button-create-account-after-prayer"
                  >
                    Create Free Account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>

                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={handleClose}
                  data-testid="button-close-prayer-dialog"
                >
                  Continue as Guest
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 w-full overflow-hidden">
              {!isAuthenticated && (
                <>
                  <div className="bg-muted/50 rounded-lg p-3 mb-4">
                    <div className="flex gap-2 text-sm text-muted-foreground">
                      <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Guest submissions require approval before being displayed. 
                        <a href="/signup" className="text-primary hover:underline ml-1">
                          Sign up
                        </a>
                        {" "}for instant approval.
                      </span>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="guest_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Name (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter your name"
                            {...field}
                            data-testid="input-guest-name"
                          />
                        </FormControl>
                        <FormDescription>
                          Leave blank to submit anonymously
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="guest_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            {...field}
                            data-testid="input-guest-email"
                          />
                        </FormControl>
                        <FormDescription>
                          We'll only use this for follow-up if needed
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {isMapClickMode ? (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3" data-testid="div-prayer-location-info">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    Prayer for: <span className="font-medium text-foreground">{clickLocation?.label || "this area"}</span>
                  </span>
                </div>
              ) : (
                <FormField
                  control={form.control}
                  name="church_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col overflow-hidden">
                      <FormLabel>
                        {isAuthenticated ? "Select Church" : "Church (Optional)"}
                      </FormLabel>
                      <Popover open={churchSearchOpen} onOpenChange={setChurchSearchOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={churchSearchOpen}
                              className={cn(
                                "w-full max-w-full justify-between overflow-hidden",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="select-church"
                            >
                              <span className="flex-1 min-w-0 max-w-[calc(100%-2rem)] text-left truncate">
                                {selectedChurch
                                  ? (() => {
                                      const location = [selectedChurch.city, selectedChurch.state].filter(Boolean).join(', ');
                                      return location ? `${selectedChurch.name}, ${location}` : selectedChurch.name;
                                    })()
                                  : "Search for a church..."}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="w-[--radix-popover-trigger-width] p-0" 
                          align="start"
                        >
                          <Command shouldFilter={false}>
                            <CommandInput 
                              placeholder="Type to search churches..." 
                              value={churchSearchQuery}
                              onValueChange={setChurchSearchQuery}
                            />
                            <CommandList>
                              <CommandEmpty>
                                {churchSearchQuery.length < 2 
                                  ? "Type at least 2 characters to search..." 
                                  : churchesLoading 
                                    ? "Searching..." 
                                    : "No churches found."}
                              </CommandEmpty>
                              {churches.length > 0 && (
                                <CommandGroup>
                                  {churches.map((church) => (
                                    <CommandItem
                                      key={church.id}
                                      value={church.id}
                                      onSelect={() => {
                                        field.onChange(church.id);
                                        setSelectedChurch(church);
                                        setChurchSearchOpen(false);
                                        setChurchSearchQuery("");
                                      }}
                                      className="flex items-start"
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4 mt-0.5 shrink-0",
                                          field.value === church.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div className="flex flex-col min-w-0 flex-1">
                                        <span className="truncate">{church.name}</span>
                                        {(church.address || church.city || church.state) && (
                                          <span className="text-xs text-muted-foreground truncate">
                                            {church.address 
                                              ? `${church.address}${church.city ? `, ${church.city}` : ''}${church.state ? `, ${church.state}` : ''}`
                                              : [church.city, church.state].filter(Boolean).join(', ')
                                            }
                                          </span>
                                        )}
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        {isAuthenticated
                          ? "Your prayer will be associated with this church"
                          : "Select a church if you're a member (optional)"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Brief title for your prayer request"
                        {...field}
                        data-testid="input-prayer-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prayer Request</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Share your prayer request..."
                        className="min-h-[100px] resize-none"
                        {...field}
                        data-testid="textarea-prayer-body"
                      />
                    </FormControl>
                    <FormDescription>
                      Max 2000 characters
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_anonymous"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-prayer-anonymous"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Submit anonymously</FormLabel>
                      <FormDescription>
                        Your name will not be displayed with this prayer request
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={submitPrayerMutation.isPending}
                data-testid="button-submit-prayer-dialog"
              >
                {submitPrayerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Prayer Request"
                )}
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
