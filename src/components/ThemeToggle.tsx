"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Light/dark switch.
 *
 * The stored value is only ever "light" or "dark". Absence means "follow the
 * operating system", which the CSS media query handles — so a user who never
 * touches this still gets dark mode if their machine is set to it.
 */
export default function ThemeToggle() {
  // Rendered as null until mounted: the server cannot know the user's choice,
  // so rendering an icon on the server would guarantee a hydration mismatch.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private browsing — the switch still works for this session */
    }
  }

  if (theme === null) {
    // Reserve the space so the header does not shift when it appears.
    return <span className="h-8 w-8" aria-hidden />;
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)]"
    >
      {dark ? (
        // Sun
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        // Moon
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />
        </svg>
      )}
    </button>
  );
}
