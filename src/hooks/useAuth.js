// src/hooks/useAuth.js
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [session, setSession]         = useState(null);
  const [profile, setProfile]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const loadingRef              = useRef(false); // évite les appels simultanés

  const loadProfile = async (userId) => {
    if (loadingRef.current) return;           // déjà en cours → on ignore
    loadingRef.current = true;
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) setProfile(data);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    // onAuthStateChange émet INITIAL_SESSION au démarrage.
    // IMPORTANT: ne pas appeler supabase.from() directement dans ce callback —
    // cela provoque un deadlock avec le mutex de session de Supabase v2.
    // On diffère l'appel à loadProfile via setTimeout pour sortir du verrou.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      if (sess) {
        setTimeout(() => loadProfile(sess.user.id), 0);
      } else {
        setProfile(null);
        setLoading(false);
        loadingRef.current = false;
      }
    });

    // Vérifie côté serveur que la session est toujours valide
    // (détecte si le compte a été supprimé par l'admin)
    const checkSessionValid = async () => {
      const { error } = await supabase.auth.getUser();
      if (error) {
        // Session invalide (compte supprimé, token expiré, etc.)
        await supabase.auth.signOut();
      }
    };

    // Vérifie à chaque fois que l'app reprend le focus
    const onVisibilityChange = () => {
      if (!document.hidden) checkSessionValid();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', checkSessionValid);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', checkSessionValid);
    };
  }, []); // eslint-disable-line

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    // Créer le profil avec le nom complet
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        email,
        role: 'member',
        member_since: new Date().getFullYear(),
      });
    }
    return { data, error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      loadingRef.current = false; // autorise le rechargement
      await loadProfile(session.user.id);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, passwordRecovery, setPasswordRecovery, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
