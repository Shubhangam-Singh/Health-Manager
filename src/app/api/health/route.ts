// A ROUTE HANDLER. The filename `route.ts` makes this path an API endpoint
// instead of a page. Its only job: call the service, shape the HTTP response.
import { NextResponse } from "next/server";
import { getHealthStatus } from "@/server/services/health.service";

export async function GET() {
  const status = getHealthStatus();
  return NextResponse.json(status, { status: 200 });
}
