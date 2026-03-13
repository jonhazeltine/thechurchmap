import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, Info, CheckCircle2 } from "lucide-react";

interface PartnershipApplicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  churchName: string;
  initialPath?: 'explore' | 'authorize';
}

const baseFormSchema = z.object({
  applicant_name: z.string().min(1, "Name is required"),
  applicant_email: z.string().email("Valid email is required"),
  applicant_role: z.string().min(1, "Your role at the church is required"),
  applicant_phone: z.string().optional(),
});

const exploreFormSchema = baseFormSchema.extend({
  has_authority_affirmation: z.literal(false).default(false),
});

const authorizeFormSchema = baseFormSchema.extend({
  has_authority_affirmation: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you have authority to activate this partnership" }),
  }),
});

type ExploreFormValues = z.infer<typeof exploreFormSchema>;
type AuthorizeFormValues = z.infer<typeof authorizeFormSchema>;

export function PartnershipApplicationModal({
  open,
  onOpenChange,
  churchId,
  churchName,
  initialPath = 'explore',
}: PartnershipApplicationModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'explore' | 'authorize'>(initialPath);

  // Sync active tab with initialPath when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialPath);
    }
  }, [open, initialPath]);

  // Fetch user profile to get the stored name
  const { data: profile } = useQuery<{ full_name?: string; first_name?: string }>({
    queryKey: ['/api/profile'],
    enabled: !!user && open,
  });

  const exploreForm = useForm<ExploreFormValues>({
    resolver: zodResolver(exploreFormSchema),
    defaultValues: {
      applicant_name: user?.user_metadata?.full_name || '',
      applicant_email: user?.email || '',
      applicant_role: '',
      applicant_phone: '',
      has_authority_affirmation: false,
    },
  });

  const authorizeForm = useForm<AuthorizeFormValues>({
    resolver: zodResolver(authorizeFormSchema),
    defaultValues: {
      applicant_name: user?.user_metadata?.full_name || '',
      applicant_email: user?.email || '',
      applicant_role: '',
      applicant_phone: '',
      has_authority_affirmation: undefined as any,
    },
  });

  // Auto-fill form with user data when modal opens
  useEffect(() => {
    if (open && user) {
      // Get name from profile (preferred) or user_metadata as fallback
      const name = profile?.full_name || user.user_metadata?.full_name || '';
      const email = user.email || '';
      
      // Only update if the fields are currently empty or have placeholder text
      const currentExploreName = exploreForm.getValues('applicant_name');
      const currentAuthorizeName = authorizeForm.getValues('applicant_name');
      
      if ((!currentExploreName || currentExploreName === 'John Smith') && name) {
        exploreForm.setValue('applicant_name', name);
      }
      if (!exploreForm.getValues('applicant_email') && email) {
        exploreForm.setValue('applicant_email', email);
      }
      if ((!currentAuthorizeName || currentAuthorizeName === 'John Smith') && name) {
        authorizeForm.setValue('applicant_name', name);
      }
      if (!authorizeForm.getValues('applicant_email') && email) {
        authorizeForm.setValue('applicant_email', email);
      }
    }
  }, [open, user, profile, exploreForm, authorizeForm]);

  const submitMutation = useMutation({
    mutationFn: async (data: { path: 'explore' | 'authorize'; values: ExploreFormValues | AuthorizeFormValues }) => {
      return apiRequest("POST", "/api/partnership-applications", {
        church_id: churchId,
        path: data.path,
        applicant_name: data.values.applicant_name,
        applicant_role: data.values.applicant_role,
        applicant_email: data.values.applicant_email,
        applicant_phone: data.values.applicant_phone || null,
        has_authority_affirmation: data.path === 'authorize',
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "fund-mission"] });
      onOpenChange(false);
      
      if (variables.path === 'authorize') {
        // Redirect to contract signing with pre-filled signer data
        const signerParams = new URLSearchParams({
          name: variables.values.applicant_name,
          title: variables.values.applicant_role,
          email: variables.values.applicant_email,
        });
        setLocation(`/church/${churchId}/sign-contract?${signerParams.toString()}`);
        toast({
          title: "Application Submitted",
          description: "Please sign the partnership contract to complete activation.",
        });
      } else {
        toast({
          title: "Application Submitted",
          description: "Thank you for your interest! We'll send you more information about partnership.",
        });
      }
      
      exploreForm.reset();
      authorizeForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit application. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleExploreSubmit = (values: ExploreFormValues) => {
    submitMutation.mutate({ path: 'explore', values });
  };

  const handleAuthorizeSubmit = (values: AuthorizeFormValues) => {
    submitMutation.mutate({ path: 'authorize', values });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Partnership Application</DialogTitle>
          <DialogDescription>
            Start a mission funding partnership for {churchName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'explore' | 'authorize')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="explore" className="flex items-center gap-2" data-testid="tab-explore">
              <Info className="w-4 h-4" />
              Learn More
            </TabsTrigger>
            <TabsTrigger value="authorize" className="flex items-center gap-2" data-testid="tab-authorize">
              <CheckCircle2 className="w-4 h-4" />
              Activate
            </TabsTrigger>
          </TabsList>

          <TabsContent value="explore" className="mt-4">
            <Form {...exploreForm}>
              <form onSubmit={exploreForm.handleSubmit(handleExploreSubmit)} className="space-y-4">
                <FormField
                  control={exploreForm.control}
                  name="applicant_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Smith" {...field} data-testid="input-explore-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={exploreForm.control}
                  name="applicant_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} data-testid="input-explore-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={exploreForm.control}
                  name="applicant_role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Role at Church</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Pastor, Elder, Member" {...field} data-testid="input-explore-role" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={exploreForm.control}
                  name="applicant_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 555-5555" {...field} data-testid="input-explore-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-explore"
                >
                  {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Send Me Information
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="authorize" className="mt-4">
            <Form {...authorizeForm}>
              <form onSubmit={authorizeForm.handleSubmit(handleAuthorizeSubmit)} className="space-y-4">
                <FormField
                  control={authorizeForm.control}
                  name="applicant_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Smith" {...field} data-testid="input-authorize-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorizeForm.control}
                  name="applicant_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} data-testid="input-authorize-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorizeForm.control}
                  name="applicant_role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Role at Church</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Pastor, Elder, Board Member" {...field} data-testid="input-authorize-role" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorizeForm.control}
                  name="applicant_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 555-5555" {...field} data-testid="input-authorize-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorizeForm.control}
                  name="has_authority_affirmation"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-authority"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          I have authority to authorize this partnership
                        </FormLabel>
                        <FormDescription>
                          I confirm that I have the authority to activate this partnership on behalf of {churchName}.
                        </FormDescription>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-authorize"
                >
                  {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Activate Partnership
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
