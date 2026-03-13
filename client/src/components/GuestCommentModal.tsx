import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, User, ArrowRight, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";

const guestCommentFormSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
});

type GuestCommentFormValues = z.infer<typeof guestCommentFormSchema>;

interface GuestCommentSubmitResponse {
  anonymous_token?: string;
  pending?: boolean;
}

interface GuestCommentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (guestName: string, fullName: string) => Promise<GuestCommentSubmitResponse | void>;
  isPrayerPost?: boolean;
  commentBody?: string;
}

type Step = "name" | "submitting" | "success";

export function GuestCommentModal({ 
  open, 
  onClose, 
  onSubmit, 
  isPrayerPost = false,
  commentBody
}: GuestCommentModalProps) {
  const [step, setStep] = useState<Step>("name");
  const [submittedName, setSubmittedName] = useState<{ first: string; lastInitial: string } | null>(null);

  const form = useForm<GuestCommentFormValues>({
    resolver: zodResolver(guestCommentFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
    },
  });

  const handleFormSubmit = async (values: GuestCommentFormValues) => {
    const trimmedFirst = values.firstName.trim();
    const trimmedLast = values.lastName.trim();
    const lastInitial = trimmedLast.charAt(0).toUpperCase();
    const guestName = `${trimmedFirst} ${lastInitial}.`;
    const fullName = `${trimmedFirst} ${trimmedLast}`;

    setSubmittedName({ first: trimmedFirst, lastInitial });
    setStep("submitting");

    try {
      const response = await onSubmit(guestName, fullName);
      
      // Store anonymous token for auto-claim when user creates account
      if (response?.anonymous_token) {
        try {
          const existingTokens = JSON.parse(localStorage.getItem('anonymous_comment_tokens') || '[]');
          existingTokens.push(response.anonymous_token);
          localStorage.setItem('anonymous_comment_tokens', JSON.stringify(existingTokens));
        } catch (e) {
          // localStorage not available, continue without storing
          console.warn('Could not store anonymous comment token:', e);
        }
      }
      
      setStep("success");
    } catch (err: any) {
      setStep("name");
      const errorMessage = err?.message || err?.toString() || "Failed to submit. Please try again.";
      form.setError("root", { message: errorMessage });
    }
  };

  const handleClose = () => {
    setStep("name");
    setSubmittedName(null);
    form.reset();
    onClose();
  };

  const actionLabel = isPrayerPost ? "prayer" : "comment";
  const ActionIcon = isPrayerPost ? Heart : MessageSquare;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {step === "name" && (
            <motion.div
              key="name"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <DialogHeader>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <ActionIcon className="h-7 w-7 text-primary" />
                </div>
                <DialogTitle className="text-center text-xl">
                  {isPrayerPost ? "Share Your Prayer" : "Add Your Comment"}
                </DialogTitle>
                <DialogDescription className="text-center">
                  Enter your name to {isPrayerPost ? "share your prayer or encouragement" : "post your comment"}
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 mt-6">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter your first name"
                            autoFocus
                            data-testid="input-guest-comment-first-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter your last name"
                            data-testid="input-guest-comment-last-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          Only your last initial will be displayed publicly
                        </p>
                      </FormItem>
                    )}
                  />

                  {form.formState.errors.root && (
                    <p className="text-sm text-destructive" data-testid="text-guest-comment-error">
                      {form.formState.errors.root.message}
                    </p>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={form.formState.isSubmitting}
                    data-testid="button-guest-comment-submit"
                  >
                    <ActionIcon className="mr-2 h-4 w-4" />
                    {isPrayerPost ? "Submit Prayer" : "Post Comment"}
                  </Button>
                </form>
              </Form>
            </motion.div>
          )}

          {step === "submitting" && (
            <motion.div
              key="submitting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="py-12 flex flex-col items-center justify-center"
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                }}
                transition={{ 
                  duration: 1, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <ActionIcon className="h-16 w-16 text-primary" />
              </motion.div>
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                Submitting your {actionLabel}...
              </p>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <motion.div 
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Check className="h-7 w-7 text-green-600 dark:text-green-400" />
                </motion.div>
                <DialogTitle className="text-center text-xl">
                  {isPrayerPost ? "Prayer Submitted!" : "Comment Submitted!"}
                </DialogTitle>
                <DialogDescription className="text-center">
                  Your {actionLabel} has been submitted for review
                  {submittedName && (
                    <span className="block mt-1">
                      as <strong>{submittedName.first} {submittedName.lastInitial}.</strong>
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-4">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-center">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Your {actionLabel} will appear once it's approved by a moderator.
                  </p>
                </div>

                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <User className="h-5 w-5 text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Create an account to post immediately without waiting for approval
                  </p>
                </div>

                <Link href={`/signup?redirect=${encodeURIComponent(window.location.pathname)}`}>
                  <Button 
                    className="w-full" 
                    variant="default"
                    data-testid="button-create-account-after-comment"
                  >
                    Create Free Account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>

                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={handleClose}
                  data-testid="button-close-guest-comment"
                >
                  Continue as Guest
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
