export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-xl font-bold">Server vs Client demo</h1>
      <p className="mb-6 text-sm text-gray-600">
        This heading lives in demo/layout.tsx. It wraps every page under /demo.
      </p>
      {children}
    </div>
  );
}
