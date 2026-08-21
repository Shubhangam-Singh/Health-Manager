import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";

// A SERVER COMPONENT. `auth()` reads and verifies the session cookie on the
// server, so no JavaScript is needed for this decision and the routing rule
// lives in exactly one place.
export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    // redirect() throws internally to stop rendering -- nothing after it runs.
    switch (session.user.role) {
      case "ADMIN":
        redirect("/admin/dashboard");
      case "DOCTOR":
        redirect("/doctor/dashboard");
      default:
        redirect("/patient/dashboard");
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-bold">Healthcare Appointment Manager</h1>
      <p className="mt-2 text-sm text-gray-600">
        Book appointments, share symptoms in advance, get reminders.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/login" className="rounded bg-black px-4 py-2 text-sm text-white">
          Sign in
        </Link>
        <Link href="/register" className="rounded border border-gray-300 px-4 py-2 text-sm">
          Register
        </Link>
      </div>
    </main>
  );
}
