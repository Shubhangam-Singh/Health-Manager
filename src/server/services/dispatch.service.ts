import { getMailer } from "@/server/lib/mailer";
import { renderEmail, type NotificationPayload } from "@/server/lib/email-templates";
import {
  findDueNotifications, markSent, markFailed, MAX_ATTEMPTS,
} from "./notification.service";

export type DispatchReport = {
  considered: number;
  sent: number;
  retryScheduled: number;
  gaveUp: number;
  transport: string;
};

/**
 * One worker pass. Sends each due notification, recording success or failure
 * per row so a single bad address cannot stall the queue behind it.
 *
 * Sequential on purpose: Gmail's free SMTP is rate limited, and a burst of
 * parallel sends is the fastest way to get throttled. Batch size caps the run
 * so a serverless invocation cannot time out on a large backlog.
 */
export async function dispatchPendingNotifications(batchSize = 20): Promise<DispatchReport> {
  const mailer = getMailer();
  const due = await findDueNotifications(batchSize);

  const report: DispatchReport = {
    considered: due.length, sent: 0, retryScheduled: 0, gaveUp: 0,
    transport: mailer.describe(),
  };

  for (const n of due) {
    try {
      if (!n.user.email) throw new Error("recipient has no email address");

      const email = renderEmail(n.type, (n.payload ?? {}) as NotificationPayload, n.user.name);
      await mailer.send({ ...email, to: n.user.email });

      await markSent(n.id);
      report.sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await markFailed(n.id, n.attempts, message);
      if (n.attempts + 1 >= MAX_ATTEMPTS) report.gaveUp++;
      else report.retryScheduled++;
    }
  }

  return report;
}
