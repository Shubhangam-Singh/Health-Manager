// A SERVICE. Notice what is absent: no Request, no Response, no NextResponse,
// no HTTP status codes. It is a plain function returning a plain object.
// That is what makes it unit-testable and callable from anywhere -- an API
// route, a cron job, or a server component -- without faking an HTTP request.

export type HealthStatus = {
  ok: boolean;
  service: string;
  uptimeSeconds: number;
  checkedAt: string;
};

export function getHealthStatus(): HealthStatus {
  return {
    ok: true,
    service: "healthcare-appointment-manager",
    uptimeSeconds: Math.round(process.uptime()),
    checkedAt: new Date().toISOString(),
  };
}
