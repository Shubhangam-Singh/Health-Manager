import { adminOverview } from "@/server/services/dashboard.service";
import { Card, CardBody, PageHeader, ButtonLink, Badge } from "@/components/ui";

export default async function AdminDashboard() {
  const s = await adminOverview();

  const stats = [
    { label: "Doctors", value: s.doctors },
    { label: "Patients", value: s.patients },
    { label: "Confirmed appointments", value: s.appointments },
  ];

  // Delivery health: FAILED rows are kept rather than deleted precisely so
  // that an operator can see what was never delivered.
  const health = [
    { label: "Notifications queued", value: s.pendingNotifications, bad: false },
    { label: "Notifications failed", value: s.failedNotifications, bad: s.failedNotifications > 0 },
    { label: "AI summaries failed", value: s.failedSummaries, bad: s.failedSummaries > 0 },
  ];

  return (
    <>
      <PageHeader
        title="Clinic overview"
        subtitle="Manage doctors, schedules and leave."
        action={<ButtonLink href="/admin/doctors">Manage doctors</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((x) => (
          <Card key={x.label}>
            <CardBody>
              <p className="text-3xl font-semibold tracking-tight">{x.value}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{x.label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold">Delivery health</h2>
      <Card>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            {health.map((h) => (
              <div key={h.label}>
                <p className={`text-2xl font-semibold ${h.bad ? "text-[var(--danger)]" : ""}`}>{h.value}</p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{h.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
            Failed rows are kept rather than deleted, so nothing is silently lost. Emails
            retry on a 1m → 5m → 15m → 1h → 6h schedule before being marked failed.
          </p>
        </CardBody>
      </Card>

      <div className="mt-6 flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Badge tone="brand">background jobs</Badge>
        <span>
          /api/cron/notifications · /api/cron/reminders · /api/cron/calendar ·
          /api/cron/cleanup-holds — each guarded by CRON_SECRET
        </span>
      </div>
    </>
  );
}
