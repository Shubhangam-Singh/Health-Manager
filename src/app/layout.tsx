import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import RouteProgress from "@/components/RouteProgress";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Health Manager — clinic appointments",
    template: "%s · Health Manager",
  },
  description:
    "Book appointments, share symptoms in advance, and get plain-English summaries after the visit.",
};

/**
 * Applies the saved theme BEFORE first paint.
 *
 * Without this the page renders light, then React hydrates and switches to
 * dark — a visible white flash on every load for dark-mode users. It has to be
 * a blocking inline script for that reason; a React effect runs too late.
 *
 * No stored preference means no attribute, which lets the CSS media query
 * follow the operating system.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Thin bar at the top of the viewport during route transitions. */}
        <div id="route-progress" aria-hidden />
        <RouteProgress />
        {children}
      </body>
    </html>
  );
}
