import Link from "next/link";
import { searchDoctors, listSpecialisations } from "@/server/services/doctor.service";

// In Next 15 `searchParams` is a PROMISE, like `params`. Await it.
type Props = { searchParams: Promise<{ q?: string }> };

export default async function DoctorSearchPage({ searchParams }: Props) {
  const { q } = await searchParams;

  // Promise.all runs both queries CONCURRENTLY. Awaiting them one after the
  // other would make the page wait for the sum of both round trips.
  const [doctors, specialisations] = await Promise.all([
    searchDoctors(q),
    listSpecialisations(),
  ]);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-bold">Find a doctor</h1>

      {/* A plain GET form. Submitting sets ?q=... and re-renders on the
          server. No useState, no fetch, no JavaScript shipped. */}
      <form className="mt-4 flex gap-2">
        <input
          name="q" defaultValue={q ?? ""} placeholder="Search specialisation…"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button className="rounded bg-black px-4 py-2 text-sm text-white">Search</button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Link href="/patient/doctors" className="rounded-full border px-3 py-1">All</Link>
        {specialisations.map((s) => (
          <Link key={s} href={`/patient/doctors?q=${encodeURIComponent(s)}`}
            className="rounded-full border px-3 py-1">{s}</Link>
        ))}
      </div>

      {doctors.length === 0 && (
        <p className="mt-8 text-sm text-gray-500">No doctors match “{q}”.</p>
      )}

      <ul className="mt-6 space-y-3">
        {doctors.map((d) => (
          <li key={d.id} className="rounded border border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{d.user.name}</h2>
              <span className="text-xs text-gray-500">{d.slotDurationMin} min slots</span>
            </div>
            <p className="text-sm text-gray-600">{d.specialisation}</p>
            {d.bio && <p className="mt-1 text-sm text-gray-500">{d.bio}</p>}
            <Link href={`/patient/doctors/${d.id}`}
              className="mt-3 inline-block text-sm underline">
              View availability →
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
