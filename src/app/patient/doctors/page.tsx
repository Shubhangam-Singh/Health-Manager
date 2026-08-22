import Link from "next/link";
import { searchDoctors, listSpecialisations } from "@/server/services/doctor.service";
import { Card, CardBody, PageHeader, Badge, EmptyState, INPUT, BTN } from "@/components/ui";

export const metadata = { title: "Find a doctor · Health Manager", description: "Search doctors by specialisation and book a slot." };

type Props = { searchParams: Promise<{ q?: string }> };

export default async function DoctorSearchPage({ searchParams }: Props) {
  const { q } = await searchParams;

  // Concurrent, not sequential: the page waits for the slower query, not both.
  const [doctors, specialisations] = await Promise.all([
    searchDoctors(q),
    listSpecialisations(),
  ]);

  return (
    <>
      <PageHeader title="Find a doctor" subtitle="Search by specialisation and pick a time." />

      {/* A plain GET form. Submitting sets ?q= and re-renders on the server —
          no useState, no fetch, and the search is shareable as a URL. */}
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Cardiology, skin, children…"
          className={`${INPUT} max-w-sm flex-1`} />
        <button className={BTN.primary}>Search</button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/patient/doctors"
          className={`rounded-full border px-3 py-1 text-xs transition ${!q
            ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]"
            : "border-[var(--border-strong)] bg-white text-[var(--text-muted)] hover:bg-gray-50"}`}>
          All
        </Link>
        {specialisations.map((s) => (
          <Link key={s} href={`/patient/doctors?q=${encodeURIComponent(s)}`}
            className={`rounded-full border px-3 py-1 text-xs transition ${q === s
              ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-ink)]"
              : "border-[var(--border-strong)] bg-white text-[var(--text-muted)] hover:bg-gray-50"}`}>
            {s}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {doctors.length === 0 && (
          <EmptyState title={`No doctors match “${q}”`} hint="Try a different specialisation, or browse all." />
        )}

        {doctors.map((d) => (
          <Card key={d.id}>
            <CardBody className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{d.user.name}</h2>
                  <Badge tone="brand">{d.specialisation}</Badge>
                </div>
                {d.bio && <p className="mt-1 text-sm text-[var(--text-muted)]">{d.bio}</p>}
                <p className="mt-2 text-xs text-[var(--text-subtle)]">
                  {d.slotDurationMin}-minute appointments
                  {d._count.workingHours === 0 && " · no schedule set"}
                </p>
              </div>
              <Link href={`/patient/doctors/${d.id}`} className={BTN.secondary}>
                View availability
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
