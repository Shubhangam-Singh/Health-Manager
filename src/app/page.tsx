import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import ThemeToggle from "@/components/ThemeToggle";

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

  const steps = [
    { title: "Choose a time", body: "Search by specialisation and pick a slot. It is held for ten minutes so nobody can take it while you type." },
    { title: "Describe symptoms", body: "A short form in your own words. Your doctor reads it before you arrive." },
    { title: "Get confirmed", body: "Email confirmation to you and your doctor, plus a calendar event if you connect one." },
    { title: "After the visit", body: "A plain-English summary, your prescription, and reminders for each dose." },
  ];

  const portals = [
    { role: "Patients", body: "Search doctors, hold a slot, share symptoms, and read what happened afterwards in plain language." },
    { role: "Doctors", body: "See an AI triage summary with an urgency level before each visit, then record notes and a prescription." },
    { role: "Admin", body: "Create doctor profiles, set weekly schedules, and record leave — with affected patients notified automatically." },
  ];

  const features = [
    { title: "Book in seconds", body: "Search by specialisation, pick a time, and the slot is held for you while you fill in the details." },
    { title: "Your doctor is prepared", body: "Describe your symptoms in advance and your doctor gets a concise summary before you arrive." },
    { title: "Nothing gets forgotten", body: "Email confirmations, reminders and medication schedules, plus optional Google Calendar sync." },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand)] text-sm font-bold text-[var(--on-brand)]">
              H
            </span>
            <span className="leading-tight">
              <span className="block font-semibold tracking-tight">Health Manager</span>
              <span className="block text-[10px] text-[var(--text-subtle)]">by Shubhangam</span>
            </span>
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className="text-sm font-medium text-[var(--brand)] hover:underline">
              Sign in
            </Link>
          </div>
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
            <Link href="/register" className="inline-flex items-center rounded-[8px] bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-[var(--on-brand)] transition hover:bg-[var(--brand-hover)]">
              Create a patient account
            </Link>
            <Link href="/login" className="inline-flex items-center rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium transition hover:bg-[var(--bg-subtle)]">
              Sign in
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <h2 className="text-sm font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="py-16">
          <h2 className="text-sm font-medium text-[var(--brand)]">How booking works</h2>
          <ol className="mt-5 grid gap-5 sm:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--brand)] text-xs font-semibold text-[var(--on-brand)]">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="pb-20">
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
            <h2 className="text-sm font-semibold">Three portals, one system</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-3">
              {portals.map((p) => (
                <div key={p.role}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-ink)]">{p.role}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{p.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-subtle)]">
              Demo credentials for all three are on the sign-in page.
            </p>
          </div>
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
