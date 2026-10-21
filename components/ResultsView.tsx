import type { PollKind, Results } from '@/lib/types';
import WordCloud from './WordCloud';

interface Props {
  kind: PollKind;
  options: string[];
  scaleMax: number;
  results: Results | null | undefined;
  dark?: boolean;
  /** Presenter only: remove an answer from a word cloud. */
  onRemoveWord?: (text: string) => void;
}

/** Live results: horizontal bars for multiple choice, columns + average for ratings. */
export default function ResultsView({ kind, options, scaleMax, results, dark = false, onRemoveWord }: Props) {
  const total = results?.total ?? 0;
  const counts = results?.counts ?? [];
  const cls = `results${dark ? ' results--dark' : ''}`;

  if (kind === 'words') {
    return (
      <div className={cls}>
        <WordCloud words={results?.words ?? []} dark={dark} onRemove={onRemoveWord} />
      </div>
    );
  }

  if (kind === 'rating') {
    const max = Math.max(1, ...counts);
    const cols = { gridTemplateColumns: `repeat(${scaleMax}, minmax(0, 1fr))` };
    return (
      <div className={cls}>
        <div className="rating-chart">
          <div className="rating-average">
            <span className="rating-average__value">
              {results?.average != null ? Number(results.average).toFixed(1) : '–'}
            </span>
            <span className="rating-average__scale">
              / {scaleMax} average · {total} {total === 1 ? 'response' : 'responses'}
            </span>
          </div>
          <div className="rating-chart__cols" style={cols} aria-hidden="true">
            {Array.from({ length: scaleMax }, (_, i) => {
              const c = counts[i] ?? 0;
              return (
                <div className="rating-chart__col" key={i}>
                  <span className="rating-chart__count">{c}</span>
                  <div className="rating-chart__bar" style={{ height: `${(c / max) * 100}%` }} />
                </div>
              );
            })}
          </div>
          <div className="rating-chart__labels" style={cols} aria-hidden="true">
            {Array.from({ length: scaleMax }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <ul className="visually-hidden">
            {Array.from({ length: scaleMax }, (_, i) => (
              <li key={i}>
                Rating {i + 1}: {counts[i] ?? 0}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const top = Math.max(0, ...counts);
  return (
    <div className={cls}>
      {options.map((label, i) => {
        const c = counts[i] ?? 0;
        const pct = total > 0 ? Math.round((c / total) * 100) : 0;
        return (
          <div className={`result${c > 0 && c === top ? ' result--top' : ''}`} key={i}>
            <div className="result__head">
              <span className="result__label">{label}</span>
              <span className="result__value">
                {pct}%<small>{c}</small>
              </span>
            </div>
            <div className="result__track" aria-hidden="true">
              <div className="result__bar" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
