'use client';

interface Props {
  words: { text: string; count: number }[];
  dark?: boolean;
  /** When set (presenter screen), each word can be clicked to remove it. */
  onRemove?: (text: string) => void;
}

/**
 * Word cloud: the most frequent answers are largest and placed in the middle,
 * using the site palette (ink / bronze / taupe on light, white / beige / taupe on dark).
 */
export default function WordCloud({ words, dark = false, onRemove }: Props) {
  if (!words.length) {
    return <p className={`wordcloud__empty${dark ? ' wordcloud__empty--dark' : ''}`}>Answers will appear here.</p>;
  }

  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));

  // Biggest words in the centre: alternate placing them to the right and left.
  const centred: typeof words = [];
  words.forEach((w, i) => (i % 2 === 0 ? centred.push(w) : centred.unshift(w)));

  const tone = (i: number) => (i === 0 ? 'a' : i % 3 === 1 ? 'b' : i % 3 === 2 ? 'c' : 'a');

  return (
    <div className={`wordcloud${dark ? ' wordcloud--dark' : ''}`}>
      {centred.map((w) => {
        const rank = words.indexOf(w);
        const scale = max === min ? 0.6 : Math.sqrt((w.count - min) / (max - min));
        const size = 1 + scale * 1.6; // 1em … 2.6em
        const label = `${w.text} — ${w.count} ${w.count === 1 ? 'answer' : 'answers'}`;
        const style = { fontSize: `${size.toFixed(2)}em` };
        const cls = `wordcloud__word wordcloud__word--${tone(rank)}`;
        return onRemove ? (
          <button key={w.text} type="button" className={`${cls} wordcloud__word--removable`} style={style} title={`${label}. Click to remove.`} onClick={() => onRemove(w.text)}>
            {w.text}
          </button>
        ) : (
          <span key={w.text} className={cls} style={style} title={label}>
            {w.text}
          </span>
        );
      })}
    </div>
  );
}
