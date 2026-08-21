import { NextResponse } from "next/server";
import { z } from "zod";
import { registerSchema } from "@/server/validation/auth.schema";
import { registerUser } from "@/server/services/auth.service";
import { AppError, HTTP_STATUS } from "@/server/lib/errors";

// A route handler is just a function: Request in, Response out. Same idea as an
// Express controller. Next wires it up by the exported name, so `POST` here
// serves POST /api/auth/register.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  try {
    const user = await registerUser(parsed.data);
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(
        { error: e.message, field: e.field },
        { status: HTTP_STATUS[e.code] },
      );
    }
    console.error("[register] unexpected", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
