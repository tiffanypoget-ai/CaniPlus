// src/hooks/useAuth.js
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[AUTH] useEffect start');
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AUTH] getSession resolved, session:', !!session);
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setLoading(false);
    }).catch(e => {
      console.error('[AUTH] getSession error:', e);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('[AUTH] onAuthStateChange event:', _event, 'session:', !!session);
      setSession(session);
      if (session) await loadProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    console.log('[AUTH] loadProfile start for', userId);
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      console.log('[AUTH] loadProfile done, data:', !!data, 'error:', error?.message);
      if (data) setProfile(data);
    } catch(e) {
      console.error('[AUTH] loadProfile exception:', e);
    } finally {
      console.log('[AUTH] loadProfile finally — setLoading(false)');
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
