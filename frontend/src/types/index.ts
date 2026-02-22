export interface Session {
  id: string;
  title: string;
  description?: string;
  learning_goal?: string;
  current_document_id?: number;
  progress: Record<string, unknown>;
  agent_status: "idle" | "running" | "error";
  agent_started_at?: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export const MessageType = {
  CHAT: "chat",
  COMMENT: "comment",
  ENTITY: "entity",
  FOLLOW_UP: "follow_up",
  ENTRY: "entry",
  DOCUMENT_CARD: "document_card",
  DOCUMENT_REF: "document_ref",
  NAVIGATION: "navigation",
  NOTIFICATION: "notification",
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: MessageTypeValue;
  related_document_id?: number;
  timestamp: string;
  // Placeholder message fields for UI state
  isPlaceholder?: boolean;
}

export interface Document {
  id: number;
  session_id: string;
  topic: string;
  content: string;
  version: number;
  category_path?: string;
  entities: string[];
  prerequisites: number[];
  related: number[];
  parent_document_id?: number;
  follow_up_questions?: FollowUpQuestion[];
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: number;
  name: string;
  session_id: string;
  entity_type?: "concept" | "tool" | "library" | "technique";
  category?: string;
  status: "active" | "merged" | "deprecated";
  created_at: string;
}

export interface RelatedDocument {
  id: number;
  topic: string;
}

export interface EntityQueryResponse {
  id: number;
  name: string;
  entity_type?: string;
  summary?: string;
  has_main_doc: boolean;
  main_doc_id?: number;
  related_docs?: RelatedDocument[];
}

export interface FollowUpQuestion {
  id: number;
  question: string;
  question_type?: "basic" | "deep" | "practice";
  entity_tag?: string;
  is_clicked: boolean;
}

export interface RoadmapMilestone {
  id: number;
  title: string;
  description: string;
  topics: string[];
}

export interface RoadmapMilestoneProgress {
  id: number;
  title: string;
  description: string;
  status: "locked" | "active" | "completed";
  progress: number; // 0 to 1
  document_count: number;
  covered_topics: string[];
}

export interface RoadmapProgress {
  roadmap_id: number;
  goal: string;
  overall_progress: number; // 0 to 1
  milestones: RoadmapMilestoneProgress[];
  orphan_document_count: number;
}

export interface Roadmap {
  id: number;
  session_id: string;
  goal: string;
  milestones: RoadmapMilestone[];
  mermaid?: string;
  version: number;
  parent_roadmap_id?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  document_id: number;
  selected_text?: string;
  comment: string;
  anchor_fingerprint?: string;
  optimization_status: "pending" | "optimized" | "dismissed";
  created_at: string;
}

export type InputSource = "chat" | "comment" | "entity" | "follow_up" | "entry";

export interface ChatRequest {
  session_id: string;
  message: string;
  source: InputSource;
  comment_data?: {
    comment: string;
    selected_text: string;
    context_before?: string; // Text before selection for better context
    context_after?: string; // Text after selection for better context
    position?: { start: number; end: number };
    document_id: number;
    section_id?: string;
  };
  entity_data?: {
    entity_name: string;
    source_doc_id: number;
    entity_type?: string;
  };
  intent_hint?: string;
}

export interface StreamResponse {
  type:
    | "thinking"
    | "content"
    | "document"
    | "roadmap"
    | "document_start" // Document generation started, with topic
    | "document_token" // Document content streaming token
    | "entities"
    | "follow_ups"
    | "navigation" // Navigate to existing document
    | "error"
    | "done"
    // Streaming event types for LangGraph progress
    | "token" // LLM token streaming
    | "node_start" // Agent node execution started
    | "node_end" // Agent node execution ended
    | "tool_start" // Tool call started
    | "tool_end" // Tool call ended
    | "progress"; // Custom progress updates
  data?: Record<string, unknown>;
  message?: string;
}
