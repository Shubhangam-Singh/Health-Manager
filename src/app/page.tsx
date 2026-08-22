import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  // One rule, on the server: everyone lands here, and gets routed by role.
  if (session?.user) {
    switch (session.user.role) {
      case "ADMIN": redirect("/admin/dashboard");
      case "DOCTOR": redirect("/doctor/dashboard");
      default: redirect("/patient/dashboard");
    }
  }

  const features = [
    { title: "Book in seconds", body: "Search by specialisation, pick a time, and the slot is held for you while you fill in the details." },
    { title: "Your doctor is prepared", body: "Describe your symptoms in advance and your doctor gets a concise summary before you arrive." },
    { title: "Nothing gets forgotten", body: "Email confirmations, reminders and medication schedules, plus optional Google Calendar sync." },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--brand)] text-xs font-bold text-white">H</span>
            Health Manager
          </span>
          <Link href="/login" className="text-sm font-medium text-[var(--brand)] hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-16 sm:py-24">
          <p className="text-sm font-medium text-[var(--brand)]">Clinic appointments, handled properly</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Book an appointment, and arrive already understood.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-[var(--text-muted)]">
            Share your symptoms before the visit, get a plain-English summary after it,
            and let reminders take care of the rest.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="inline-flex items-center rounded-[8px] bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--brand-hover)]">
              Create a patient account
            </Link>
            <Link href="/login" className="inline-flex items-center rounded-[8px] border border-[var(--border-strong)] bg-white px-5 py-2.5 text-sm font-medium transition hover:bg-gray-50">
              Sign in
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <h2 className="text-sm font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6">
        <p className="mx-auto max-w-5xl px-6 text-xs text-[var(--text-subtle)]">
          Demo application. Not for real clinical use.
        </p>
      </footer>
    </div>
  );
}
