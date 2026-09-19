import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { unregisterPushToken } from '../lib/notifications';
import { MusicService, User } from '../types';

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

  const refreshUser = useCallback(async () => {
    if (sessionUserId) {
      await fetchUserProfile(sessionUserId);
    }
  }, [sessionUserId, fetchUserProfile]);

  return (
    <AuthContext.Provider
      value={{ session, user, loading, signIn, signOut, signUp, setPrimaryService, refreshUser }}
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
