/**
 * Roadmap progress color utilities.
 *
 * Provides color mappings based on mastery depth (completion level):
 * - 0% - 99%: Primary color (in progress)
 * - 100% - 149%: Green (completed)
 * - 150% - 199%: Blue (proficient)
 * - 200%+: Purple (mastered)
 */

/**
 * Progress level thresholds.
 */
export const PROGRESS_THRESHOLD = {
  COMPLETED: 1.0,   // 100%
  PROFICIENT: 1.5,  // 150%
  MASTERED: 2.0,    // 200%
} as const;

/**
 * Get progress dot/button color classes for the timeline view.
 * Returns combined border, background, and text color classes.
 */
export function getProgressButtonColor(progress: number): string {
  if (progress >= PROGRESS_THRESHOLD.MASTERED) {
    return "border-purple-500 bg-purple-500 text-white";  // 200%+: 精通
  }
  if (progress >= PROGRESS_THRESHOLD.PROFICIENT) {
    return "border-blue-500 bg-blue-500 text-white";   // 150%+: 熟练
  }
  if (progress >= PROGRESS_THRESHOLD.COMPLETED) {
    return "border-green-500 bg-green-500 text-white";  // 100%+: 完成
  }
  return "border-primary bg-primary text-primary-foreground";  // 进行中
}

/**
 * Get progress icon/text color for milestone node.
 * Returns text color class only.
 */
export function getProgressTextColor(progress: number): string {
  if (progress >= PROGRESS_THRESHOLD.MASTERED) {
    return "text-purple-500";  // 200%+: 精通
  }
  if (progress >= PROGRESS_THRESHOLD.PROFICIENT) {
    return "text-blue-500";   // 150%+: 熟练
  }
  if (progress >= PROGRESS_THRESHOLD.COMPLETED) {
    return "text-green-500";  // 100%+: 完成
  }
  return "text-primary";  // 进行中
}

/**
 * Get completed milestone card border and background style.
 * Returns combined border and background color classes.
 */
export function getCompletedCardStyle(progress: number): string {
  if (progress >= PROGRESS_THRESHOLD.MASTERED) {
    return "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20";
  }
  if (progress >= PROGRESS_THRESHOLD.PROFICIENT) {
    return "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20";
  }
  return "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20";
}

/**
 * Get completed milestone title text color.
 * Returns text color class for dark mode support.
 */
export function getCompletedTitleColor(progress: number): string {
  if (progress >= PROGRESS_THRESHOLD.MASTERED) {
    return "text-purple-600 dark:text-purple-400";
  }
  if (progress >= PROGRESS_THRESHOLD.PROFICIENT) {
    return "text-blue-600 dark:text-blue-400";
  }
  return "text-green-600 dark:text-green-400";
}

/**
 * Get completed progress badge style.
 * Returns background and text color classes.
 */
export function getCompletedBadgeStyle(progress: number): string {
  if (progress >= PROGRESS_THRESHOLD.MASTERED) {
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
  }
  if (progress >= PROGRESS_THRESHOLD.PROFICIENT) {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  }
  return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
}
