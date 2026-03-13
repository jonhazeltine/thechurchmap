import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { signUp, user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  
  // Memoize redirect URL to avoid recalculating on every render
  const redirectUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/';
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    // Prevent redirect loops - don't redirect back to login/signup
    if (redirect && !redirect.startsWith('/login') && !redirect.startsWith('/signup')) {
      return redirect;
    }
    return '/';
  }, []);
  
  // Check if user has a pending church claim
  const hasPendingClaim = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('pendingClaim') === 'true';
  }, []);

  useEffect(() => {
    if (user) {
      setLocation(redirectUrl);
    }
  }, [user, setLocation, redirectUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    try {
      const result = await signUp(email, password, firstName, lastName);
      
      // Check if email confirmation is required
      if (result.confirmationPending) {
        setConfirmationSent(true);
        toast({
          title: "Check your email",
          description: `We've sent a confirmation link to ${result.userEmail || email}.`,
        });
        return;
      }
      
      toast({
        title: "Success",
        description: "Account created successfully!",
      });
      // Redirect to previous page if specified, otherwise to onboarding
      if (redirectUrl && redirectUrl !== '/') {
        setLocation(redirectUrl);
      } else {
        setLocation('/onboarding');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Show confirmation sent screen
  if (confirmationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl" data-testid="text-confirmation-title">Check your email</CardTitle>
            <CardDescription className="text-base">
              We've sent a confirmation link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-muted p-4 text-left text-sm">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">What's next?</p>
                <ol className="mt-2 space-y-1 text-muted-foreground list-decimal list-inside">
                  <li>Check your inbox for the confirmation email</li>
                  <li>Click the link to verify your account</li>
                  <li>You'll be taken to the login page</li>
                </ol>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Didn't receive the email? Check your spam folder or{" "}
              <button 
                onClick={() => setConfirmationSent(false)} 
                className="text-primary hover:underline"
                data-testid="button-try-again"
              >
                try again
              </button>
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Link href="/login" data-testid="link-go-to-login">
              <Button variant="outline">Go to Login</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="text-page-title">Sign Up</CardTitle>
          <CardDescription>
            Create an account to join The Church Map community
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {hasPendingClaim && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-md border border-blue-200 dark:border-blue-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">Create an account to complete your church claim. Your information has been saved.</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-password"
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 6 characters
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-confirm-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-signup"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link href={`/login${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}${hasPendingClaim ? '&pendingClaim=true' : ''}` : (hasPendingClaim ? '?pendingClaim=true' : '')}`}>
                <a className="text-primary hover:underline" data-testid="link-login">
                  Log in
                </a>
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
