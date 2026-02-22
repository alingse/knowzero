/**
 * SVG path components for the KnowZero logo (Magic Quill Pen)
 *
 * The logo depicts a magical quill pen with sparkles, representing
 * AI-powered knowledge creation. The design uses:
 * - Feather outline with rachis (center stem)
 * - Barbs (feather branches) for detail
 * - Nib (pen tip) for writing action
 * - Magic sparkles for AI enhancement
 *
 * Theme adaptability: Uses Tailwind color classes (stroke-foreground, fill-primary)
 * to automatically adapt to light/dark modes.
 */

import type { ReactElement } from "react";

export const LOGO_SVG_PATHS: ReactElement = (
  <>
    {/* Feather outline - uses currentColor for theme adaptability */}
    <path
      className="stroke-foreground"
      d="M23 3 C19 7, 13 15, 9 23 C17 19, 25 9, 23 3 Z"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />

    {/* Rachis (center stem of the feather) */}
    <path
      className="stroke-foreground"
      d="M23 3 C18 10, 12 18, 9 23"
      strokeWidth="1.3"
      strokeLinecap="round"
      fill="none"
    />

    {/* Barbs (feather branches) - using reduced opacity for depth */}
    <path
      className="stroke-foreground/50"
      d="M20 7 L17 9"
      strokeWidth="0.8"
      strokeLinecap="round"
      fill="none"
    />
    <path
      className="stroke-foreground/50"
      d="M17 12 L14 13.5"
      strokeWidth="0.8"
      strokeLinecap="round"
      fill="none"
    />
    <path
      className="stroke-foreground/50"
      d="M14 17 L11.5 18"
      strokeWidth="0.8"
      strokeLinecap="round"
      fill="none"
    />

    {/* Nib (pen tip) - thicker stroke for emphasis */}
    <path
      className="stroke-foreground"
      d="M9 23 L7 28"
      strokeWidth="1.8"
      strokeLinecap="round"
      fill="none"
    />

    {/* Magic sparkles - uses primary color accent for brand identity */}
    <path
      className="fill-primary/60"
      d="M5 24 L6 22.5 L7 24 L6 25.5 Z"
    />
    <path
      className="fill-accent/50"
      d="M2.5 20.5 L3.2 19.5 L3.9 20.5 L3.2 21.5 Z"
    />
    <path
      className="fill-primary/40"
      d="M3.5 27 L4 26.2 L4.5 27 L4 27.8 Z"
    />
  </>
);
