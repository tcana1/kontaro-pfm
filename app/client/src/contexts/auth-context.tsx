
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, AuthError, AuthResponse } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getAutoLoginCredentials } from '@/lib/config';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ sessionCreated: boolean }>;
  signInWithProvider: (provider: 'google' | 'github') => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateProfile: (data: { full_name?: string; avatar_url?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    // Resolve initial auth: use existing session, otherwise attempt auto sign-in.
    // isLoading stays true until this whole flow settles, so ProtectedRoute shows a
    // spinner instead of redirecting to /login mid auto-login.
    const init = async () => {
      let { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Opt-in auto-login: set AUTO_LOGIN_EMAIL + AUTO_LOGIN_PASSWORD in docker-compose env
        // (or VITE_AUTO_LOGIN_EMAIL + VITE_AUTO_LOGIN_PASSWORD in .env.local for dev).
        const creds = getAutoLoginCredentials();
        if (creds) {
          // /config.js is static and unauthenticated, so in the runtime (non-dev) path this
          // password is readable by anyone who can reach the app.
          console.warn(
            'Auto-login is enabled: AUTO_LOGIN_PASSWORD is served in cleartext at GET /config.js. ' +
              'Only use this on a network where every client is trusted.',
          );
          const { data } = await supabase.auth.signInWithPassword(creds);
          session = data.session;
        }
      }

      if (mounted) {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    };

    init();

    // Keep user in sync with later auth changes (does not touch isLoading — init owns it)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // The query cache is a singleton shared across sessions, so a different user signing in
      // on the same page would otherwise read the previous user's cached data until it goes
      // stale. Comparing ids (instead of reacting to the event name) keeps the initial session
      // and token refreshes from wiping a cache that is still valid. Cancel first: a request
      // issued under the old token can resolve after the clear and repopulate the cache.
      const userId = session?.user?.id;
      if (lastUserId.current !== undefined && lastUserId.current !== userId) {
        queryClient.cancelQueries();
        queryClient.clear();
      }
      lastUserId.current = userId;

      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const handleAuthError = (error: AuthError) => {
    toast({
      title: t("Authentication Error"),
      description: error.message,
      variant: "destructive"
    });
    throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) handleAuthError(error);
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (error) handleAuthError(error);
    return { sessionCreated: !!data.session };
  };

  const signInWithProvider = async (provider: 'google' | 'github') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (error) handleAuthError(error);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) handleAuthError(error);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    });
    if (error) handleAuthError(error);
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) handleAuthError(error);
  };

  const updateProfile = async (data: { full_name?: string; avatar_url?: string }) => {
    const { error } = await supabase.auth.updateUser({ data });
    if (error) handleAuthError(error);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      signIn,
      signUp,
      signInWithProvider,
      signOut,
      resetPassword,
      updatePassword,
      updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
