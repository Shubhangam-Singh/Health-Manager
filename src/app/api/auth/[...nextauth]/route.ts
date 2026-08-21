import { handlers } from "@/auth";

// The folder name [...nextauth] is a CATCH-ALL route segment: it matches
// /api/auth/signin, /api/auth/callback/credentials, /api/auth/session,
// /api/auth/csrf and the rest -- every endpoint Auth.js needs, from one file.
//
// Our own /api/auth/register sits alongside it. A more specific static segment
// always wins over a catch-all, so register is unaffected.
export const { GET, POST } = handlers;
