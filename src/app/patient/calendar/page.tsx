import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/server/lib/prisma";
import { isCalendarConfigured } from "@/server/lib/google-calendar";
import DisconnectCalendar from "@/components/DisconnectCalendar";

type Props = { searchParams: Promise<{ connected?: string; error?: string }> };

const ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Google consent screen.",
  state_mismatch: "That sign-in did not match your session. Please try again.",
  missing_code: "Google did not return an authorisation code.",
};

export default async function CalendarPage({ searchParams }: Props) {
  const { connected, error } = await searchParams;
  const session = await auth();
  const account = await prisma.googleAccount.findUnique({
    where: { userId: session!.user.id },
    select: { googleEmail: true, createdAt: true, scope: true },
  });
  const configured = isCalendarConfigured();

  return (
    <main className="mx-auto max-w-lg p-8">
      <Link href="/patient/dashboard" className="text-sm underline">← Dashboard</Link>
      <h1 className="mt-4 text-xl font-bold">Google Calendar</h1>

      {!configured && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Calendar integration is not configured on this server. Appointments still
          work; they simply will not appear in Google Calendar.
        </p>
      )}

      {connected && (
        <p className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          Connected. New bookings will be added to your calendar.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {ERRORS[error] ?? "Could not connect Google Calendar."}
        </p>
      )}

      <section className="mt-6 rounded border border-gray-200 p-4">
        {account ? (
          <>
            <p className="text-sm">
              Connected{account.googleEmail ? ` as ${account.googleEmail}` : ""}.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              We can add, update and remove events we created. We cannot read your
              other calendar entries.
            </p>
            <DisconnectCalendar />
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              Connect your calendar and confirmed appointments will appear in it
              automatically, and disappear if they are cancelled.
            </p>
            <a href="/api/google/connect"
              className={`mt-3 inline-block rounded px-4 py-2 text-sm text-white ${configured ? "bg-black" : "pointer-events-none bg-gray-400"}`}>
              Connect Google Calendar
            </a>
          </>
        )}
      </section>
    </main>
  );
}
