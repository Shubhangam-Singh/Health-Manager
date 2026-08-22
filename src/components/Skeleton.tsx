/** Shape-matched placeholders, so the layout does not jump when data arrives. */
export function SkeletonLine({ w = "w-full" }: { w?: string }) {
  return <div className={`h-3.5 ${w} animate-pulse rounded bg-gray-200`} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="space-y-2.5">
        <SkeletonLine w="w-40" />
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} w={i === lines - 1 ? "w-2/3" : "w-full"} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="h-8 w-14 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({ stats, cards = 3 }: { stats?: number; cards?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-3.5 w-72 animate-pulse rounded bg-gray-200" />
      </div>
      {stats && <SkeletonStats count={stats} />}
      <div className="space-y-3">
        {Array.from({ length: cards }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}
