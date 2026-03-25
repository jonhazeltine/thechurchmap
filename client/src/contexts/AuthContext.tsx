import { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

// DEV BYPASS: Set to true to bypass Supabase auth when it's down
// NOTE: 503 error is likely rate limiting - check Supabase Dashboard → Logs → Auth
const DEV_BYPASS_AUTH = false;

// Mock user for dev bypass - matches your actual user
const DEV_MOCK_USER: User = {
  id: "b28081ee-f57c-446b-8190-6abc44f14baa",
  email: "jhazeltine@gmail.com",
  app_metadata: {},
  user_metadata: {
    full_name: "Jon Hazeltine",
    first_name: "Jon",
    super_admin: true,
  },
  aud: "authenticated",
  created_at: "2025-11-22T23:45:00Z",
} as User;

interface SignUpResult {
  confirmationPending?: boolean;
  userEmail?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Claim any anonymous submissions (comments and prayers) when user logs in
  const claimAnonymousSubmissions = async (accessToken: string) => {
    try {
      // Claim comments
      const storedCommentTokens = JSON.parse(localStorage.getItem('anonymous_comment_tokens') || '[]');
      let totalCommentsClaimed = 0;
      for (const token of storedCommentTokens) {
        try {
          const response = await fetch('/api/auth/claim-comments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ token, type: 'comment' }),
          });
          
          if (response.ok) {
            const result = await response.json();
            totalCommentsClaimed += result.claimed_count || 0;
          }
        } catch (e) {
          console.warn('Failed to claim comment with token:', e);
        }
      }
      localStorage.removeItem('anonymous_comment_tokens');
      
      if (totalCommentsClaimed > 0) {
        console.log(`✅ Claimed ${totalCommentsClaimed} anonymous comment(s)`);
      }

      // Claim prayers
      const storedPrayerTokens = JSON.parse(localStorage.getItem('anonymous_prayer_tokens') || '[]');
      let totalPrayersClaimed = 0;
      for (const token of storedPrayerTokens) {
        try {
          const response = await fetch('/api/auth/claim-comments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ token, type: 'prayer' }),
          });
          
          if (response.ok) {
            const result = await response.json();
            totalPrayersClaimed += result.claimed_count || 0;
          }
        } catch (e) {
          console.warn('Failed to claim prayer with token:', e);
        }
      }
      localStorage.removeItem('anonymous_prayer_tokens');
      
      if (totalPrayersClaimed > 0) {
        console.log(`✅ Claimed ${totalPrayersClaimed} anonymous prayer(s)`);
      }
    } catch (e) {
      console.warn('Could not claim anonymous submissions:', e);
    }
  };

  useEffect(() => {
    // DEV BYPASS: Skip Supabase auth when enabled
    if (DEV_BYPASS_AUTH) {
      console.log("🔓 DEV BYPASS: Using mock authentication");
      setUser(DEV_MOCK_USER);
      setSession({ access_token: "dev-bypass-token", user: DEV_MOCK_USER } as Session);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Auto-claim anonymous submissions when user logs in
      if (_event === 'SIGNED_IN' && session?.access_token) {
        claimAnonymousSubmissions(session.access_token).catch(err => {
          console.warn('[Auth] Failed to claim anonymous submissions:', err);
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, firstName: string, lastName: string): Promise<{ confirmationPending?: boolean; userEmail?: string }> => {
    // Auto-generate full name from first and last name
    const fullName = `${firstName} ${lastName}`.trim();
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (error) throw error;

    if (!data.user) {
      throw new Error('Failed to create user account');
    }

    // If email confirmation is required, session will be null but user exists
    // Return a special object instead of throwing - this is not an error
    if (!data.session) {
      return { confirmationPending: true, userEmail: data.user.email || email };
    }

    // Only create profile if we have a session (email confirmation not required)
    const response = await fetch('/api/auth/create-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.session.access_token}`,
      },
      credentials: 'include',
      body: JSON.stringify({
        user_id: data.user.id,
        email: data.user.email!,
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to create user profile';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      console.error('Error creating profile:', errorMessage);
      throw new Error(errorMessage);
    }
    
    // Auto-claim any anonymous submissions after signup
    await claimAnonymousSubmissions(data.session.access_token);
    
    return {};
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const getAccessToken = () => {
    return session?.access_token || null;
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
