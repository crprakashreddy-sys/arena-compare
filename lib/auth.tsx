import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { loadBlocks } from "./community";
import type { Profile } from "./types";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  profileError: string | null;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  profileError: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return; }
    // A network blip or a token refresh can fail the read. Retry, and never treat
    // "couldn't load" as "no profile", or a returning driver gets sent back to sign-up.
    // select("*") so a column added by a later SQL step can never break sign-in.
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
      if (!error) { setProfile((data as Profile) ?? null); setProfileError(null); loadBlocks(); return; }
      last = error.message;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    setProfileError(last || "Couldn't load your profile.");
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadProfile(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthState = {
    session,
    profile,
    loading,
    refreshProfile: () => loadProfile(session),
    profileError,
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** True when the person can post: signed in and has a profile. */
export function canPost(a: AuthState) {
  return !!a.session && !!a.profile;
}
