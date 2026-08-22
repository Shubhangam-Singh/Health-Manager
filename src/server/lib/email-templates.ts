import type { Email } from "./mailer";
import type { NotificationType } from "@/generated/prisma/client";

/** Everything a template can rely on, captured when the notification was queued. */
export type NotificationPayload = {
  appointmentId?: string;
  startAt?: string;
  endAt?: string;
  timezone?: string;
  doctorName?: string;
  specialisation?: string;
  patientName?: string;
  audience?: "PATIENT" | "DOCTOR";
  reason?: string;
  alternatives?: string[];
  drugName?: string;
  dose?: string;
  instructions?: string;
};

function when(iso?: string, tz?: string): string {
  if (!iso) return "the scheduled time";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz || "Asia/Kolkata",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso)) + ` (${tz || "Asia/Kolkata"})`;
}

const shell = (title: string, body: string) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#171717">
  <h2 style="margin:0 0 16px;font-size:18px">${title}</h2>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
  <p style="font-size:12px;color:#737373;margin:0">Healthcare Appointment Manager</p>
</div>`;

const p = (t: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6">${t}</p>`;

export function renderEmail(
  type: NotificationType,
  payload: NotificationPayload,
  recipientName: string,
): Email {
  const time = when(payload.startAt, payload.timezone);
  const forDoctor = payload.audience === "DOCTOR";

  switch (type) {
    case "BOOKING_CONFIRMATION": {
      const subject = forDoctor
        ? `New appointment: ${payload.patientName} on ${time}`
        : `Appointment confirmed with ${payload.doctorName}`;
      const lines = forDoctor
        ? [`${payload.patientName} has booked an appointment with you.`, `<b>${time}</b>`,
           `Their symptom summary is on your dashboard before the visit.`]
        : [`Hello ${recipientName},`,
           `Your appointment with <b>${payload.doctorName}</b>${payload.specialisation ? ` (${payload.specialisation})` : ""} is confirmed.`,
           `<b>${time}</b>`, `Please arrive 10 minutes early.`];
      return {
        to: "", subject,
        html: shell(subject, lines.map(p).join("")),
        text: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n\n"),
      };
    }

    case "APPOINTMENT_REMINDER": {
      const subject = `Reminder: appointment ${forDoctor ? `with ${payload.patientName}` : `with ${payload.doctorName}`} tomorrow`;
      const lines = [`Hello ${recipientName},`,
        `This is a reminder of your appointment${forDoctor ? ` with ${payload.patientName}` : ` with <b>${payload.doctorName}</b>`}.`,
        `<b>${time}</b>`];
      return { to: "", subject, html: shell(subject, lines.map(p).join("")),
        text: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n\n") };
    }

    case "BOOKING_CANCELLED":
    case "DOCTOR_LEAVE_CANCELLATION": {
      const isLeave = type === "DOCTOR_LEAVE_CANCELLATION";
      const subject = isLeave
        ? `Appointment cancelled — ${payload.doctorName} is unavailable`
        : `Appointment cancelled`;
      const lines = [`Hello ${recipientName},`,
        isLeave
          ? `We are sorry — <b>${payload.doctorName}</b> is unavailable on that date, so your appointment has been cancelled.`
          : `Your appointment with <b>${payload.doctorName}</b> has been cancelled.`,
        `Cancelled appointment: <b>${time}</b>`];
      if (payload.reason) lines.push(`Reason: ${payload.reason}`);
      if (payload.alternatives?.length) {
        lines.push(`Here are the next available times:`);
        lines.push(`<ul style="font-size:14px;line-height:1.8">${payload.alternatives
          .map((a) => `<li>${when(a, payload.timezone)}</li>`).join("")}</ul>`);
        lines.push(`Please sign in to rebook.`);
      }
      return { to: "", subject, html: shell(subject, lines.map(p).join("")),
        text: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n\n") };
    }

    case "MEDICATION_REMINDER": {
      const subject = `Medication reminder: ${payload.drugName}`;
      const lines = [`Hello ${recipientName},`,
        `Time to take <b>${payload.drugName}</b>${payload.dose ? ` — ${payload.dose}` : ""}.`];
      if (payload.instructions) lines.push(payload.instructions);
      return { to: "", subject, html: shell(subject, lines.map(p).join("")),
        text: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n\n") };
    }
  }
}
