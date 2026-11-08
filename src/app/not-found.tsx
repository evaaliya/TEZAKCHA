import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4 pt-10 text-center">
      <h1 className="font-display text-3xl tracking-tight">404</h1>
      <p className="text-sm text-[var(--muted)]">Page not found</p>
      <Link href="/" className="text-sm font-semibold text-[var(--accent-deep)]">
        Home
      </Link>
    </div>
  );
}
