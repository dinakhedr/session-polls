import { supabase } from './supabase';
import type { VoteRow } from './csv';

/** Fetches every vote for the given polls, page by page (Supabase returns 1,000 rows per request). */
export async function fetchAllVotes(pollIds: string[]): Promise<VoteRow[]> {
  if (pollIds.length === 0) return [];
  const pageSize = 1000;
  const all: VoteRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase()
      .from('votes')
      .select('poll_id, voter_id, choices, rating, answer, created_at')
      .in('poll_id', pollIds)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...((data ?? []) as VoteRow[]));
    if (!data || data.length < pageSize) break;
  }
  return all;
}
