import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { insertPrayerSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Heart } from "lucide-react";

interface PrayerRequestFormProps {
  churchId: string;
  churchName: string;
}

const formSchema = insertPrayerSchema.extend({
  church_id: z.string(),
});

export function PrayerRequestForm({ churchId, churchName }: PrayerRequestFormProps) {
  const { toast } = useToast();
  const { session } = useAuth();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      body: "",
      is_anonymous: false,
      church_id: churchId,
    },
  });

  const submitPrayerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      return apiRequest("POST", "/api/prayers", data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
      toast({
        title: "Prayer request submitted",
        description: response.message || "Your prayer request has been submitted for review",
      });
      form.reset();
      setIsSubmitted(true);
      
      // Reset submitted state after 3 seconds
      setTimeout(() => setIsSubmitted(false), 3000);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5" />
            Prayer Requests
          </CardTitle>
          <CardDescription>
            Please log in to submit a prayer request
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-testid="card-prayer-request-form">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="w-5 h-5" />
          Submit Prayer Request
        </CardTitle>
        <CardDescription>
          Share a prayer request with {churchName}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isSubmitted ? (
          <div className="text-center py-8" data-testid="div-prayer-submitted">
            <Heart className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Prayer Request Submitted</h3>
            <p className="text-sm text-muted-foreground">
              Your request is being reviewed and will be shared with the community soon.
            </p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => submitPrayerMutation.mutate(data))} className="space-y-4">
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
                        className="min-h-[120px] resize-none"
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
                data-testid="button-submit-prayer"
              >
                {submitPrayerMutation.isPending ? "Submitting..." : "Submit Prayer Request"}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
