// Lives in a ROUTE GROUP: the (auth) folder name is invisible to the URL.
// It exists only so /login and /register can share this centred-card shell.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-900">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-gray-900 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold">Healthcare Portal</h1>
        {children}
      </div>
    </div>
  );
}
