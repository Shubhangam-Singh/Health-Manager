import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActiveHold } from "@/server/services/hold.service";
import { Card, CardBody, PageHeader, Badge } from "@/components/ui";
import SymptomFormCard from "@/components/SymptomFormCard";

export const metadata = { title: "Describe your symptoms · Health Manager", description: "Tell your doctor what is wrong before the visit." };

export default async function BookPage() {
  const session = await auth();
  const hold = await getActiveHold(session!.user.id);

  // SERVER-SIDE GATE. No live hold means it expired or was never taken. The
  // same check runs again inside the booking transaction, because a hold can
  // expire between rendering this page and submitting the form.
  if (!hold) redirect("/patient/doctors");

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: hold.doctor.timezone, weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Describe your symptoms"
        subtitle="Your doctor reads this before the visit, so the appointment starts already informed."
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{hold.doctor.user.name}</p>
            <p className="text-sm text-[var(--text-muted)]">{hold.doctor.specialisation}</p>
            <p className="mt-1 text-sm">{fmt.format(hold.startAt)}</p>
          </div>
          <Badge tone="brand">slot held</Badge>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SymptomFormCard holdId={hold.id} expiresAt={hold.expiresAt.toISOString()} />
        </CardBody>
      </Card>
    </div>
  );
}
