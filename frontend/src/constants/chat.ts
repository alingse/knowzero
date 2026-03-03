export interface QuickQuestion {
  id: string;
  label: string;
  message: string;
  icon: string;
}

export const EMPTY_STATE_TITLE = "你可以问我：";

export const QUICK_QUESTIONS: QuickQuestion[] = [
  {
    id: "explain",
    label: "解释当前内容",
    message: "请详细解释一下当前文档的内容",
    icon: "💡",
  },
  {
    id: "examples",
    label: "举例说明",
    message: "请举几个例子说明这个知识点",
    icon: "📝",
  },
  {
    id: "practice",
    label: "练习题",
    message: "请给我几道练习题",
    icon: "✏️",
  },
  {
    id: "deep-dive",
    label: "深入学习",
    message: "请深入讲解这个主题的更多细节",
    icon: "🔍",
  },
];
