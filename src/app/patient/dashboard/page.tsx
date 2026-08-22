import Link from "next/link";
import { auth } from "@/auth";
import SignOutButton from "@/components/SignOutButton";

export default async function PatientDashboard() {
  // Server-side session read. Middleware already checked the role, but this
  // page needs the user's details anyway -- and re-reading is free here.
  const session = await auth();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Patient dashboard</h1>
        <SignOutButton />
      </div>
      <dl className="mt-6 space-y-1 text-sm">
        <div><dt className="inline text-gray-500">Name: </dt><dd className="inline">{session?.user?.name}</dd></div>
        <div><dt className="inline text-gray-500">Email: </dt><dd className="inline">{session?.user?.email}</dd></div>
        <div><dt className="inline text-gray-500">Role: </dt><dd className="inline font-mono">{session?.user?.role}</dd></div>
        <div><dt className="inline text-gray-500">User id: </dt><dd className="inline font-mono text-xs">{session?.user?.id}</dd></div>
      </dl>
      <div className="mt-6">
        <Link href="/patient/doctors"
          className="inline-block rounded bg-black px-4 py-2 text-sm text-white">
          Find a doctor
        </Link>
      </div>
    </main>
  );
}
