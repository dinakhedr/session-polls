const PATHS = {
  present: (
    <>
      <path d="M3 4h18v12H3z" />
      <path d="M8 20h8M12 16v4" />
      <path d="M10 8l4 2-4 2z" fill="currentColor" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  rename: (
    <>
      <path d="M4 7V5h11v2M9.5 5v14M7 19h5" />
      <path d="M17 9v10M15 9h4M15 19h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

/** Icon-only action button with a tooltip label (also read by screen readers). */
export default function IconButton({
  icon,
  label,
  onClick,
  href,
  newTab,
  danger,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  href?: string;
  newTab?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const svg = (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[icon]}
    </svg>
  );
  const cls = `icon-act${danger ? ' icon-act--danger' : ''}`;
  if (href) {
    return (
      <a className={cls} href={href} aria-label={label} data-tip={label} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}>
        {svg}
      </a>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} data-tip={label} onClick={onClick} disabled={disabled}>
      {svg}
    </button>
  );
}
