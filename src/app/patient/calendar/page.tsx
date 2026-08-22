import { auth } from "@/auth";
import { prisma } from "@/server/lib/prisma";
import { isCalendarConfigured } from "@/server/lib/google-calendar";
import { Card, CardBody, PageHeader, Alert, Badge, BTN } from "@/components/ui";
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
    select: { googleEmail: true, createdAt: true },
  });
  const configured = isCalendarConfigured();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Google Calendar"
        subtitle="Optional. Appointments work with or without it."
      />

      <div className="space-y-3">
        {!configured && (
          <Alert tone="warn">
            Calendar integration is not configured on this server. Bookings still work —
            they simply will not appear in Google Calendar.
          </Alert>
        )}
        {connected && <Alert tone="ok">Connected. New bookings will be added to your calendar.</Alert>}
        {error && <Alert tone="danger">{ERRORS[error] ?? "Could not connect Google Calendar."}</Alert>}
      </div>

      <Card className="mt-4">
        <CardBody>
          {account ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Connected</p>
                  {account.googleEmail && (
                    <p className="text-sm text-[var(--text-muted)]">{account.googleEmail}</p>
                  )}
                </div>
                <Badge tone="ok">active</Badge>
              </div>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                We can add, update and remove only the events we created. We cannot read
                anything else in your calendar.
              </p>
              <DisconnectCalendar />
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                Connect your calendar and confirmed appointments appear in it automatically,
                and disappear again if they are cancelled.
              </p>
              <a href="/api/google/connect"
                className={`mt-4 inline-flex ${configured ? BTN.primary : `${BTN.primary} pointer-events-none opacity-50`}`}>
                Connect Google Calendar
              </a>
            </>
          )}
        </CardBody>
      </Card>

      <p className="mt-4 text-xs text-[var(--text-subtle)]">
        Signing in and authorising calendar access are separate grants. Disconnecting here
        removes our stored token; you can also revoke access at myaccount.google.com/permissions.
      </p>
    </div>
  );
}
