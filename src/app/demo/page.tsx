import Counter from "./Counter";

// NOTE: there is no "use client" at the top of this file.
// That single absence is what makes this a Server Component.
export default function DemoPage() {
  // This log appears in your TERMINAL, not the browser console.
  console.log("[SERVER] DemoPage rendered at", new Date().toISOString());

  const renderedAt = new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="space-y-6">
      <section className="rounded border border-gray-300 p-4">
        <h2 className="font-semibold">Server Component</h2>
        <p>Rendered on the server at: {renderedAt}</p>
        <p>Running on Node: {process.version}</p>
        <p className="mt-2 text-sm text-gray-600">
          `process.version` does not exist in a browser. If you can read a
          version number above, this code ran on the server.
        </p>
      </section>

      <Counter />
    </div>
  );
}
