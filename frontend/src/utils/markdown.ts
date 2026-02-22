/**
 * Strip markdown syntax from text, returning plain text
 */
export function stripMarkdown(md: string): string {
  if (!md) return "";

  return (
    md
      // Remove code blocks first (preserve content inside)
      .replace(/```[\s\S]*?```/g, "[代码块]")
      // Remove inline code
      .replace(/`([^`]+)`/g, "$1")
      // Remove headers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold and italic
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/___([^_]+)___/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      // Remove strikethrough
      .replace(/~~([^~]+)~~/g, "$1")
      // Remove links, keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove bare URLs
      .replace(/https?:\/\/[^\s]+/g, "[链接]")
      // Remove images, replace with placeholder
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[图片]")
      // Remove blockquotes
      .replace(/^>\s?/gm, "")
      // Remove list markers
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      // Remove horizontal rules
      .replace(/^---+$/gm, "")
      // Remove HTML tags
      .replace(/<[^>]+>/g, "")
      // Normalize whitespace
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Truncate text at word boundary
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Find the last space before maxLength
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Create content preview from markdown
 */
export function createContentPreview(md: string, maxLength: number = 100): string {
  const plainText = stripMarkdown(md);
  return truncateText(plainText, maxLength);
}
