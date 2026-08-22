import Link from "next/link";

/** Detail pages sit two levels deep; a back link alone loses the context. */
export default function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[var(--text-subtle)]" aria-hidden>/</span>}
          {item.href ? (
            <Link href={item.href} className="text-[var(--brand)] hover:underline">{item.label}</Link>
          ) : (
            <span className="text-[var(--text-muted)]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
