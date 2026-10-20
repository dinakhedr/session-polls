import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Returns the shared Supabase client. Created on first use (in the browser),
 * so the build does not fail when the environment variables are absent.
 */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Supabase calls this key "publishable" (newer projects) or "anon" (older projects).
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
      );
    }
    client = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}

/** Name of the broadcast channel shared by the presenter and participants. */
export const roomChannel = (code: string) => `room-${code}`;
