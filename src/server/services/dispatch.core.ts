/**
 * Pure delivery rules. NO IMPORTS, so it is unit-testable without a database
 * or a mail server — same rule as the other *.core.ts modules.
 */

/**
 * RFC 2606 and RFC 6761 reserve these top-level names so they can NEVER
 * resolve. Attempting delivery to one is guaranteed to fail — and worse, the
 * provider ACCEPTS the message and then bounces it back to the sending
 * mailbox, so every retry produces a delivery-failure email in the operator's
 * own inbox. Seed and demo data uses these domains, so without this guard a
 * demo floods you with bounces.
 *
 * Only the reserved TOP-LEVEL names are blocked: testing.com and example.com
 * are real, registrable domains and must still be delivered to.
 */
const RESERVED_TLD = /@([^@]*\.)?(test|invalid|example|localhost)$/i;

export function isDeliverable(email: string): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e.length > 0 && !RESERVED_TLD.test(e);
}
