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
    // IMPORTANT: on vérifie d'abord getSession() (lecture localStorage, sans réseau)
    // avant de faire un appel réseau — évite d'appeler signOut() sur la page login/inscription
    const checkSessionValid = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) return; // Pas de session locale → rien à vérifier
      const { error } = await supabase.auth.getUser(); // Vérifie côté serveur
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

  // signUp accepte maintenant un userType ('member' | 'external').
  // Par défaut = 'external' (ouverture au grand public depuis avril 2026).
  // Les inscriptions de membres du club de Ballaigues passent userType='member'.
  //
  // IMPORTANT (mai 2026) : on passe user_type et full_name dans options.data
  // pour que le trigger Postgres `handle_new_user` les recupere depuis
  // raw_user_meta_data au moment de la creation du profil. Sans ca, le trigger
  // creait le profil avec user_type='external' (DEFAULT de la table) avant que
  // notre upsert puisse ecrire la bonne valeur — bug racine de 4 problemes
  // (chien non enregistre, planning invisible, notifs bloquees, dropdown vide).
  // Le upsert reste en fallback pour les anciens projets sans le trigger.
  const signUp = async (email, password, fullName, userType = 'external') => {
    const validType = ['member', 'external'].includes(userType) ? userType : 'external';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_type: validType,
          full_name: fullName,
        },
      },
    });
    if (error) return { error };
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        email,
        role: 'member',            // role reste 'member' (RLS) — user_type distingue l'accès
        user_type: validType,
        member_since: new Date().getFullYear(),
      });
      // Notif admin : nouvelle inscription
      try {
        await supabase.functions.invoke('notify-admin', {
          body: {
            kind: 'new_member',
            title: `Nouvelle inscription · ${fullName || email}`,
            body: `${fullName ? fullName + ' (' : ''}${email}${fullName ? ')' : ''} vient de créer un compte ${validType === 'member' ? 'membre du club' : 'externe'}.`,
            metadata: { user_id: data.user.id, email, full_name: fullName, user_type: validType },
          },
        });
      } catch (_) { /* notif ne bloque pas le signup */ }
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
