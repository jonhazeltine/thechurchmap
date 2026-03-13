import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "../../../lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error("Error setting session:", error);
            setStatus("error");
            setErrorMessage(error.message);
            return;
          }

          const { data: { user } } = await supabase.auth.getUser();
          
          if (user && type === "signup") {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                const firstName = user.user_metadata?.first_name || '';
                const lastName = user.user_metadata?.last_name || '';
                const fullName = user.user_metadata?.full_name || `${firstName} ${lastName}`.trim();
                
                await fetch('/api/auth/create-profile', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    user_id: user.id,
                    email: user.email,
                    full_name: fullName,
                    first_name: firstName,
                    last_name: lastName,
                  }),
                });
              }
            } catch (profileError) {
              console.error("Error creating profile:", profileError);
            }
          }

          setStatus("success");
          
          setTimeout(() => {
            setLocation("/onboarding");
          }, 1500);
        } else {
          const errorDesc = hashParams.get("error_description");
          if (errorDesc) {
            setStatus("error");
            setErrorMessage(errorDesc);
          } else {
            setStatus("error");
            setErrorMessage("Invalid confirmation link. Please try signing up again.");
          }
        }
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setStatus("error");
        setErrorMessage(err.message || "An unexpected error occurred");
      }
    };

    handleAuthCallback();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === "loading" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <CardTitle className="text-2xl" data-testid="text-verifying">Verifying your email...</CardTitle>
            </>
          )}
          {status === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-green-700" data-testid="text-success">Email verified!</CardTitle>
            </>
          )}
          {status === "error" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl text-destructive" data-testid="text-error">Verification failed</CardTitle>
            </>
          )}
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === "loading" && (
            <p className="text-muted-foreground">Please wait while we confirm your account...</p>
          )}
          {status === "success" && (
            <p className="text-muted-foreground">Your account has been confirmed. Redirecting you to get started...</p>
          )}
          {status === "error" && (
            <>
              <p className="text-muted-foreground">{errorMessage}</p>
              <div className="flex flex-col gap-2 mt-4">
                <Button onClick={() => setLocation("/login")} data-testid="button-go-to-login">
                  Go to Login
                </Button>
                <Button variant="outline" onClick={() => setLocation("/signup")} data-testid="button-try-signup">
                  Try Signing Up Again
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
