import Link from "next/link";
import { notFound } from "next/navigation";
import { getDoctor } from "@/server/services/doctor.service";
import { AppError } from "@/server/lib/errors";
import { Card, CardBody, PageHeader, Badge } from "@/components/ui";
import WorkingHoursEditor from "@/components/WorkingHoursEditor";
import LeaveManager from "@/components/LeaveManager";

export default async function AdminDoctorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let doctor;
  try {
    doctor = await getDoctor(id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <>
      <Link href="/admin/doctors" className="text-sm text-[var(--brand)] hover:underline">← All doctors</Link>

      <div className="mt-4">
        <PageHeader
          title={doctor.user.name}
          subtitle={`${doctor.user.email}${doctor.user.phone ? ` · ${doctor.user.phone}` : ""}`}
          action={
            <div className="flex gap-2">
              <Badge tone="brand">{doctor.specialisation}</Badge>
              <Badge>{doctor.slotDurationMin} min slots</Badge>
              <Badge>{doctor.timezone}</Badge>
            </div>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold">Weekly schedule</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Saving replaces the whole week in one request, so the schedule is never
              left half-applied. More than one block per day is allowed — split shifts
              are normal.
            </p>
            <WorkingHoursEditor
              doctorId={doctor.id}
              initial={doctor.workingHours.map((w) => ({
                dayOfWeek: w.dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold">Leave</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Checking a date shows exactly which appointments would be cancelled, and
              changes nothing until you confirm.
            </p>
            <LeaveManager doctorId={doctor.id} timezone={doctor.timezone} />
            {doctor.leaveDays.length > 0 && (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="text-xs font-medium text-[var(--text-muted)]">Recorded leave</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {doctor.leaveDays.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <Badge tone="warn">{l.date.toISOString().slice(0, 10)}</Badge>
                      <span className="text-[var(--text-muted)]">{l.reason ?? "No reason given"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
