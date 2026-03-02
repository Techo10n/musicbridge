import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      setUser(data as User);
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
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s) {
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  // Creates the auth.users record and the corresponding public.users profile row
  const signUp = async (
    email: string,
    password: string,
    username: string,
    displayName: string,
  ) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('Sign-up did not return a user');

    const { error: profileError } = await supabase.from('users').insert({
      id: data.user.id,
      username,
      display_name: displayName,
    });
    if (profileError) throw profileError;
  };

  const setPrimaryService = async (service: MusicService) => {
    if (!session?.user.id) return;
    const { error } = await supabase
      .from('users')
      .update({ primary_service: service })
      .eq('id', session.user.id);
    if (error) throw error;
    setUser((prev) => (prev ? { ...prev, primary_service: service } : prev));
  };

  const refreshUser = useCallback(async () => {
    if (session?.user.id) {
      await fetchUserProfile(session.user.id);
    }
  }, [session?.user.id, fetchUserProfile]);

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
