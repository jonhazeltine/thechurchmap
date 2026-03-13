import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, Home, CheckCircle2, ArrowRight, User } from "lucide-react";

interface AareConversionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  churchName: string;
}

const formSchema = z.object({
  contact_name: z.string().min(1, "Name is required"),
  contact_email: z.string().email("Valid email is required"),
  contact_phone: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AareConversionModal({
  open,
  onOpenChange,
  churchId,
  churchName,
}: AareConversionModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contact_name: user?.user_metadata?.full_name || '',
      contact_email: user?.email || '',
      contact_phone: '',
    },
  });

  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      form.setValue('contact_name', user.user_metadata.full_name);
    }
    if (user?.email) {
      form.setValue('contact_email', user.email);
    }
  }, [user, form]);

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
    }
  }, [open]);

  const submitMutation = useMutation({
    mutationFn: async (data: FormValues & { autoSubmit?: boolean }) => {
      return apiRequest("POST", "/api/aare-submissions", {
        church_id: churchId,
        contact_name: data.contact_name,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone || null,
        submission_type: 'fund_mission_page',
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      form.reset();
      toast({
        title: "Request Submitted",
        description: "We'll connect you with an AARE-affiliated agent in your area.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (values: FormValues) => {
    submitMutation.mutate(values);
  };

  const handleQuickConnect = () => {
    if (user && user.user_metadata?.full_name && user.email) {
      submitMutation.mutate({
        contact_name: user.user_metadata.full_name,
        contact_email: user.email,
        contact_phone: '',
        autoSubmit: true,
      });
    }
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[450px]">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2" data-testid="text-success-title">Request Submitted!</h2>
            <p className="text-muted-foreground mb-6" data-testid="text-success-message">
              Thank you for your interest in supporting {churchName}. An AARE-affiliated real estate professional will be in touch with you soon.
            </p>
            <Button onClick={() => onOpenChange(false)} data-testid="button-close-success">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Get Connected to an Agent
          </DialogTitle>
          <DialogDescription>
            Connect with an AARE-affiliated real estate professional who supports {churchName}'s mission.
          </DialogDescription>
        </DialogHeader>

        {user && user.user_metadata?.full_name ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium" data-testid="text-user-name">{user.user_metadata.full_name}</p>
                    <p className="text-sm text-muted-foreground" data-testid="text-user-email">{user.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button 
              onClick={handleQuickConnect}
              className="w-full"
              disabled={submitMutation.isPending}
              data-testid="button-quick-connect"
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Get Connected Now
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              We'll use your account information to connect you with an agent.
            </p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Smith" {...field} data-testid="input-aare-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} data-testid="input-aare-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 555-5555" {...field} data-testid="input-aare-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full" 
                disabled={submitMutation.isPending}
                data-testid="button-submit-aare"
              >
                {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Get Connected
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
