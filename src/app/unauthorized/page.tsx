import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="text-lg font-semibold">Not your portal</h1>
      <p className="mt-2 text-sm text-gray-600">
        You are signed in, but this area is for a different role.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        Go back
      </Link>
    </div>
  );
}
