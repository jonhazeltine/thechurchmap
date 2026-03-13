import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, MapPin } from "lucide-react";
import { clearSessionConflictFlag } from "@/lib/queryClient";

export default function Login() {
  const [, setLocation] = useLocation();
  const { signIn, user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Clear session conflict flag and any stale Supabase session on login page load
  useEffect(() => {
    clearSessionConflictFlag();
    // Also clear any stale Supabase session data from localStorage
    // This ensures a clean login state
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.startsWith('sb-') || key.includes('supabase')
    );
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }, []);
  
  // Check if user was redirected due to session expiration
  const sessionExpired = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('reason') === 'session_expired';
  }, []);
  
  // Check if user has a pending church claim
  const hasPendingClaim = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('pendingClaim') === 'true';
  }, []);
  
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

  useEffect(() => {
    if (user) {
      setLocation(redirectUrl);
    }
  }, [user, setLocation, redirectUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signIn(email, password);
      toast({
        title: "Success",
        description: "You've successfully logged in!",
      });
      setLocation(redirectUrl);
    } catch (error: any) {
      console.error("Login error:", error);
      const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || "Failed to log in";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="text-page-title">Log In</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {sessionExpired && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">Your session has expired. Please log in again.</span>
              </div>
            )}
            {hasPendingClaim && !sessionExpired && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-md border border-blue-200 dark:border-blue-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">Log in to complete your church claim. Your information has been saved.</span>
              </div>
            )}
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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? "Logging in..." : "Log In"}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Don't have an account?{" "}
              <Link 
                href={`/signup${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}${hasPendingClaim ? '&pendingClaim=true' : ''}` : (hasPendingClaim ? '?pendingClaim=true' : '')}`}
                className="text-primary hover:underline"
                data-testid="link-signup"
              >
                Sign up
              </Link>
            </div>
            <Link 
              href="/"
              className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-back-to-map"
            >
              <MapPin className="w-4 h-4" />
              Back to Map
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
