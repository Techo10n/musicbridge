import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { unregisterPushToken } from '../lib/notifications';
import { MusicService, User } from '../types';

/** Thrown when the user backs out of a provider sheet. Callers stay silent. */
export const AUTH_CANCELLED = 'auth_cancelled';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName: string,
  ) => Promise<void>;
  setPrimaryService: (service: MusicService) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Native Sign in with Apple. iOS only. */
  signInWithApple: () => Promise<void>;
  /** Google through the system browser, returning to museaic://callback. */
  signInWithGoogle: () => Promise<void>;
  /** Emails a six-digit code. Creates the account if there isn't one. */
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  /** Takes the placeholder username from migration 014 and makes it the user's. */
  claimProfile: (username: string, displayName: string) => Promise<void>;
  /** True until the user has picked a username of their own. */
  needsUsername: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionUserId = session?.user.id;

  /**
   * Loads the `public.users` row for a session. The row is created by the
   * `on_auth_user_created` trigger, which can still be running right after
   * sign-up, so a missing row is retried a few times before giving up.
   * Written as a loop rather than recursion — a self-referencing useCallback
   * reads its own binding during render, which the React compiler rejects.
   */
  const fetchUserProfile = useCallback(async (userId: string, attempts = 4) => {
    try {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (!error) {
          setUser(data as User);
          return;
        }

        // PGRST116 means zero rows were found — the trigger may still be running.
        if (error.code !== 'PGRST116') throw error;

        if (attempt < attempts) {
          console.log(`Profile not found yet, retrying... (${attempts - attempt} retries left)`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        // Out of retries and still no profile row. This user is broken (the
        // sign-up trigger failed), so sign them out rather than leave them stuck.
        console.error('CRITICAL: User has auth session but no profile row. Logging out.');
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        fetchUserProfile(s.user.id);
      } else {
        setLoading(false);
      }
    });

    // Keep session in sync with Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (s) {
        // TOKEN_REFRESHED only updates the session token — the user profile hasn't
        // changed, so skip the profile re-fetch and loading flash entirely.
        if (event === 'TOKEN_REFRESHED') return;
        setLoading(true);
        await fetchUserProfile(s.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const currentUser = user;
    if (currentUser?.id) {
      try {
        await unregisterPushToken(currentUser.id);
      } catch (err) {
        console.warn('[useAuth] unregisterPushToken failed during sign-out:', err);
      }
    }
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
  };

  // Creates the auth.users record and the corresponding public.users profile row
  const signUp = async (
    email: string,
    password: string,
    username: string,
    displayName: string,
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, display_name: displayName } },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Sign-up did not return a user');
    // Profile row is created by the on_auth_user_created trigger (migration 002)
  };

  const setPrimaryService = async (service: MusicService) => {
    if (!session?.user.id) throw new Error('No active session — cannot set primary service');
    const { error } = await supabase
      .from('users')
      .update({ primary_service: service })
      .eq('id', session.user.id);
    if (error) throw error;
    setUser((prev) => (prev ? { ...prev, primary_service: service } : prev));
  };

  const signInWithApple = useCallback(async () => {
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Error(AUTH_CANCELLED);
      throw err;
    }

    if (!credential.identityToken) throw new Error('Apple did not return an identity token');

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;

    // Apple sends the name only on the very first authorization, and never
    // again. Capture it now or it is gone; the profile step can still edit it.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (fullName) {
      await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => {});
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'museaic', path: 'callback' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Supabase did not return a Google sign-in URL');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') throw new Error(AUTH_CANCELLED);

    // How the session comes back depends on the client's flowType, which is
    // not pinned here: the implicit flow puts tokens in the URL fragment, PKCE
    // puts a code on the query string. Handle both so changing that setting
    // later cannot silently break sign-in.
    const url = new URL(result.url);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));

    const denied = url.searchParams.get('error_description') ?? fragment.get('error_description');
    if (denied) throw new Error(denied);

    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) throw new Error('Google sign-in returned no session');

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, []);

  const sendEmailCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    if (error) throw error;
  }, []);

  const claimProfile = useCallback(async (username: string, displayName: string) => {
    if (!sessionUserId) throw new Error('No active session — cannot set a username');
    const cleaned = username.trim().toLowerCase();

    const { error } = await supabase
      .from('users')
      .update({
        username: cleaned,
        display_name: displayName.trim() || cleaned,
        username_claimed: true,
      })
      .eq('id', sessionUserId);

    // 23505 is a unique violation: someone took the name between the
    // availability check and this write.
    if (error) {
      throw new Error(error.code === '23505' ? 'That username was just taken' : error.message);
    }

    setUser((prev) => (prev
      ? { ...prev, username: cleaned, display_name: displayName.trim() || cleaned, username_claimed: true }
      : prev));
  }, [sessionUserId]);

  const refreshUser = useCallback(async () => {
    if (sessionUserId) {
      await fetchUserProfile(sessionUserId);
    }
  }, [sessionUserId, fetchUserProfile]);

  return (
    <AuthContext.Provider
      value={{
        session, user, loading, signIn, signOut, signUp, setPrimaryService, refreshUser,
        signInWithApple, signInWithGoogle, sendEmailCode, verifyEmailCode, claimProfile,
        // Absent on rows created before migration 014, which are all real usernames.
        needsUsername: !!user && user.username_claimed === false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
