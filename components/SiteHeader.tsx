import Link from 'next/link';

export default function SiteHeader({
  href = '/',
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href={href} className="site-header__logo" aria-label="Session Polls home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Dina Khedr" width={146} height={40} />
        </Link>
        {children ? <nav className="site-header__nav">{children}</nav> : null}
      </div>
    </header>
  );
}
