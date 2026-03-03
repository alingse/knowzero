// Document prose classes for markdown rendering
export const DOCUMENT_PROSE_CLASSES =
  "prose prose-stone document-content prose-p:text-sm prose-p:leading-relaxed md:prose-p:text-base prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-sm md:prose-h1:text-2xl md:prose-h2:text-xl md:prose-h3:text-lg prose-pre:text-xs md:prose-pre:text-sm prose-code:text-xs md:prose-code:text-sm prose-li:text-sm md:prose-li:text-base max-w-full md:max-w-3xl";

/**
 * Design System Tokens
 *
 * Single source of truth for layout dimensions used across the app.
 *
 * These values are imported by tailwind.config.ts to generate Tailwind utility classes.
 * When updating these values, the Tailwind classes will automatically reflect the changes.
 *
 * Generated Tailwind classes:
 * - max-w-mobile-drawer, w-mobile-drawer (from drawerWidth)
 * - max-h-mobile-sheet (from sheetHeight)
 */
export const LAYOUT_TOKENS = {
  mobile: {
    /** Width of mobile side drawer (left panel) */
    drawerWidth: "280px",
    /** Height of mobile bottom sheet (leaves room for keyboard and nav) */
    sheetHeight: "85vh",
  },
} as const;
