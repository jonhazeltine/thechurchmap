import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hand, User, ArrowRight, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "wouter";

interface GuestPrayerSubmitResponse {
  anonymous_token?: string;
  pending?: boolean;
}

interface GuestPrayerModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (guestName: string, fullName: string) => Promise<GuestPrayerSubmitResponse | void>;
  prayerTitle?: string;
  churchName?: string;
}

type Step = "name" | "submitting" | "success";

export function GuestPrayerModal({ 
  open, 
  onClose, 
  onSubmit, 
  prayerTitle,
  churchName 
}: GuestPrayerModalProps) {
  const [step, setStep] = useState<Step>("name");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (trimmedFirst.length < 2) {
      setError("Please enter your first name (at least 2 characters)");
      return;
    }

    if (trimmedLast.length < 2) {
      setError("Please enter your last name (at least 2 characters)");
      return;
    }

    const lastInitial = trimmedLast.charAt(0).toUpperCase();
    const guestName = `${trimmedFirst} ${lastInitial}.`;
    const fullName = `${trimmedFirst} ${trimmedLast}`;

    setStep("submitting");

    try {
      const response = await onSubmit(guestName, fullName);
      
      // Store anonymous token for auto-claim when user creates account
      if (response?.anonymous_token) {
        try {
          const existingTokens = JSON.parse(localStorage.getItem('anonymous_prayer_tokens') || '[]');
          existingTokens.push(response.anonymous_token);
          localStorage.setItem('anonymous_prayer_tokens', JSON.stringify(existingTokens));
        } catch (e) {
          console.warn('Could not store anonymous prayer token:', e);
        }
      }
      
      setStep("success");
    } catch (err) {
      setStep("name");
      setError("Failed to record prayer. Please try again.");
    }
  };

  const handleClose = () => {
    setStep("name");
    setFirstName("");
    setLastName("");
    setError(null);
    onClose();
  };

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
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                  <Hand className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                </div>
                <DialogTitle className="text-center text-xl">
                  Join Us in Prayer
                </DialogTitle>
                <DialogDescription className="text-center">
                  {prayerTitle && (
                    <span className="block mt-1 text-sm italic">
                      "{prayerTitle}"
                    </span>
                  )}
                  {churchName && (
                    <span className="block text-xs text-muted-foreground mt-1">
                      for {churchName}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="Enter your first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoFocus
                    data-testid="input-guest-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Enter your last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    data-testid="input-guest-last-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    Only your last initial will be displayed publicly
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-destructive" data-testid="text-guest-prayer-error">
                    {error}
                  </p>
                )}

                <Button 
                  type="submit" 
                  className="w-full"
                  data-testid="button-guest-pray-submit"
                >
                  <Hand className="mr-2 h-4 w-4" />
                  Pray Now
                </Button>
              </form>
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
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ 
                  duration: 1, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <Hand className="h-16 w-16 text-amber-600 dark:text-amber-400" />
              </motion.div>
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                Recording your prayer...
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
                  Thank You for Praying!
                </DialogTitle>
                <DialogDescription className="text-center">
                  Your prayer has been recorded
                  {firstName && (
                    <span className="block mt-1">
                      as <strong>{firstName}{lastName ? ` ${lastName.charAt(0).toUpperCase()}.` : ''}</strong>
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-4">
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <Heart className="h-5 w-5 text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Want to track your prayers and connect with your community?
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
                  data-testid="button-close-guest-prayer"
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
