"use client";

import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);

  // Appears in BOTH places, and that surprises people:
  //   - once in the terminal, during the server pre-render that builds the HTML
  //   - again in the browser console, on hydration and on every click
  // "Client Component" means "ALSO runs in the browser", not "only".
  console.log("[CLIENT] Counter rendered, count =", count);

  return (
    <section className="rounded border border-gray-300 p-4">
      <h2 className="font-semibold">Client Component</h2>
      <p>Count: {count}</p>
      <button
        onClick={() => setCount(count + 1)}
        className="mt-2 rounded bg-black px-3 py-1 text-white"
      >
        Increment
      </button>
      <p className="mt-2 text-sm text-gray-600">
        This needs useState and onClick, so it is forced to run in the browser.
      </p>
    </section>
  );
}
