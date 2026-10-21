import type React from 'react';

export type PollKind = 'choice' | 'rating';
export type ResultsMode = 'live' | 'after_close';

export interface Partner {
  id: string;
  name: string;
  created_at: string;
}

export interface Program {
  id: string;
  partner_id: string;
  name: string;
  created_at: string;
}

export interface Session {
  id: string;
  title: string;
  code: string;
  program_id: string | null;
  active_poll_id: string | null;
  show_results: boolean;
  created_at: string;
}

export interface Poll {
  id: string;
  session_id: string;
  position: number;
  question: string;
  kind: PollKind;
  options: string[];
  allow_multiple: boolean;
  scale_max: number;
  results_mode: ResultsMode;
  is_open: boolean;
}

export interface Results {
  total: number;
  counts: number[];
  average: number | null;
}

/** Polls and responses per session, from the session_stats() function. */
export interface SessionStat {
  session_id: string;
  poll_count: number;
  vote_count: number;
}

/** What a participant's phone receives from get_live_state. */
export interface LiveState {
  session: { title: string; code: string };
  poll: {
    id: string;
    question: string;
    kind: PollKind;
    options: string[];
    allow_multiple: boolean;
    scale_max: number;
    is_open: boolean;
    results_mode?: ResultsMode;
  } | null;
  has_voted?: boolean;
  show_results?: boolean;
  results?: Results | null;
}

export const kindLabel = (p: { kind: PollKind; allow_multiple: boolean; scale_max: number }) =>
  p.kind === 'rating'
    ? `Rating 1–${p.scale_max}`
    : p.allow_multiple
      ? 'Multiple choice · several answers'
      : 'Multiple choice';

export const resultsLabel = (mode: ResultsMode | undefined) =>
  mode === 'after_close' ? 'Results after voting closes' : 'Live results';

/** Formats a join code as "123 456" for easier reading. */
export const prettyCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** "1 response", "3 responses" */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Inline style for a staggered entrance animation (CSS variable --d). */
export const delay = (d: string) => ({ '--d': d }) as React.CSSProperties;
