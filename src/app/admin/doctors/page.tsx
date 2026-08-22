import Link from "next/link";
import { listDoctors } from "@/server/services/doctor.service";
import { Card, CardBody, PageHeader, Badge, EmptyState } from "@/components/ui";
import { IconUsers } from "@/components/icons";
import CreateDoctorForm from "@/components/CreateDoctorForm";

export const metadata = { title: "Doctors · Health Manager", description: "Create and manage doctor profiles." };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function AdminDoctorsPage() {
  const doctors = await listDoctors();

  return (
    <>
      <PageHeader title="Doctors" subtitle="Create profiles, set working hours and record leave." />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {doctors.length === 0 && (
            <EmptyState
              icon={<IconUsers className="h-5 w-5" />}
              title="No doctors yet"
              hint="Create the first profile using the form, then set their working hours so patients can book."
            />
          )}

          {doctors.map((d) => (
            <Card key={d.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{d.user.name}</p>
                    <p className="text-sm text-[var(--text-muted)]">{d.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="brand">{d.specialisation}</Badge>
                    <Badge>{d.slotDurationMin} min</Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.workingHours.length === 0 && (
                    <span className="text-xs text-[var(--text-subtle)]">No working hours set</span>
                  )}
                  {d.workingHours.map((w) => (
                    <span key={w.id} className="rounded-md bg-gray-100 px-2 py-1 text-xs text-[var(--text-muted)]">
                      {DAYS[w.dayOfWeek]} {hhmm(w.startMinute)}–{hhmm(w.endMinute)}
                    </span>
                  ))}
                </div>

                <Link href={`/admin/doctors/${d.id}`}
                  className="mt-3 inline-block text-sm font-medium text-[var(--brand)] hover:underline">
                  Manage →
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>

        <div>
          <Card>
            <CardBody>
              <h2 className="text-sm font-semibold">Add a doctor</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Doctors cannot self-register — an account with this role is a claim about
                the real world that a public form cannot verify.
              </p>
              <CreateDoctorForm />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
