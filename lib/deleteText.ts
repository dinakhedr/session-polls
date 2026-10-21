import { plural } from './types';

export interface Contents {
  programs?: number;
  sessions?: number;
  polls?: number;
  votes: number;
}

/** Describes what else will be deleted, e.g. "2 programs, 5 sessions and 18 polls". */
export function contentsText(c: Contents): string {
  const parts: string[] = [];
  if (c.programs !== undefined) parts.push(plural(c.programs, 'program'));
  if (c.sessions !== undefined) parts.push(plural(c.sessions, 'session'));
  if (c.polls !== undefined) parts.push(plural(c.polls, 'poll'));
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Red warning shown when responses would be lost; null when there are none. */
export function votesWarning(votes: number): string | null {
  return votes > 0
    ? `This will also permanently delete ${plural(votes, 'response')} collected from participants. This cannot be undone.`
    : null;
}
