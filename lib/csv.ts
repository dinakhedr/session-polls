import type { Poll } from './types';

export interface VoteRow {
  poll_id: string;
  voter_id: string;
  choices: number[] | null;
  rating: number | null;
  answer?: string | null;
  created_at: string;
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Builds a CSV of all responses (one row per vote), readable in Excel and Google Sheets. */
export function buildCsv(
  sessionTitle: string,
  polls: Poll[],
  votes: VoteRow[],
  context: { partner?: string; program?: string } = {}
): string {
  const pollIndex = new Map(polls.map((p, i) => [p.id, i]));
  const rows: (string | number)[][] = [
    ['Partner', 'Program', 'Session', 'Poll #', 'Question', 'Type', 'Answer', 'Participant', 'Time (UTC)'],
  ];
  const sorted = [...votes].sort(
    (a, b) =>
      (pollIndex.get(a.poll_id) ?? 0) - (pollIndex.get(b.poll_id) ?? 0) ||
      a.created_at.localeCompare(b.created_at)
  );
  for (const v of sorted) {
    const i = pollIndex.get(v.poll_id);
    if (i === undefined) continue;
    const p = polls[i];
    const answer =
      p.kind === 'words'
        ? v.answer ?? ''
        : p.kind === 'rating'
        ? String(v.rating ?? '')
        : (v.choices ?? []).map((c) => p.options[c] ?? `#${c + 1}`).join(' | ');
    rows.push([
      context.partner ?? '',
      context.program ?? '',
      sessionTitle,
      i + 1,
      p.question,
      p.kind === 'words' ? 'Word cloud' : p.kind === 'rating' ? `Rating 1-${p.scale_max}` : 'Multiple choice',
      answer,
      `P-${v.voter_id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}`,
      v.created_at.replace('T', ' ').slice(0, 19),
    ]);
  }
  // The leading BOM makes Excel open the file as UTF-8.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
