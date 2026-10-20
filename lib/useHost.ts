'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Protects host pages: redirects to /login when nobody is signed in. */
export function useHost() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const sb = supabase();
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) router.replace('/login');
      else setUser(data.session.user);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/login');
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return { user, ready: user !== null };
}
