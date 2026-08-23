"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin progress bar during navigation.
 *
 * Server Components are fetched over the network when you click a link, and
 * Next gives no built-in signal while that is in flight — so a click on
 * "Calendar" can sit there for a second looking like nothing happened. This
 * starts a bar on any internal link or form activation and clears it once the
 * new route has actually rendered.
 *
 * It drives a class on <html> and lets CSS animate, so no state re-renders the
 * tree while a navigation is already in progress.
 */
function start() {
  document.documentElement.classList.add("route-loading");
}
function done() {
  document.documentElement.classList.remove("route-loading");
}

export default function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // A completed render of the new route is the signal that navigation ended.
  useEffect(() => {
    done();
  }, [pathname, searchParams]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Ignore modified clicks — those open a new tab, this one is not navigating.
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      // Only same-origin, non-hash navigations.
      if (href.startsWith("http") && !href.startsWith(window.location.origin)) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const url = new URL(href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      start();
    }

    function onSubmit() {
      start();
    }

    // Safety net: if a navigation is cancelled the effect above never fires,
    // so clear the bar when the tab is hidden or the page is being unloaded.
    function onHide() {
      if (document.visibilityState === "hidden") done();
    }

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}
