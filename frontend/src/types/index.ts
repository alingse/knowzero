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

// 文档生成模式
export const GenerationMode = {
  STANDARD: "standard",
  ADVANCED: "advanced",
} as const;

export type GenerationModeValue = (typeof GenerationMode)[keyof typeof GenerationMode];

/** Parameters for milestone document generation callback. */
export interface MilestoneGenerateParams {
  milestone: RoadmapMilestoneProgress;
  sessionTopic: string;
  mode: GenerationModeValue;
  question?: string;
}

export interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: MessageTypeValue;
  related_document_id?: number;
  timestamp: string;
  // Placeholder message fields for UI state
  isPlaceholder?: boolean;
  // Extra data for rich message types (e.g., document_card with processing info)
  extra_data?: Record<string, unknown>;
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

export interface SessionCard {
  session_id: string;
  session_title: string;
  document_id: number;
  document_topic: string;
  content: string;
  created_at: string;
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

export interface MilestoneDocument {
  id: number;
  topic: string;
}

export interface RoadmapMilestoneProgress {
  id: number;
  title: string;
  description: string;
  status: "locked" | "active" | "completed";
  progress: number; // 0 to 1
  document_count: number;
  covered_topics: string[];
  documents: MilestoneDocument[];
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
  current_doc_id?: number | null; // Current document ID for follow_up/entity context
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
  // Milestone learning context for document generation
  milestone_context?: {
    milestone_id: number;
    milestone_title: string;
    document_index: number; // Which document to generate (1-4 or 5+ for advanced)
    existing_documents: { id: number; topic: string }[];
    mode: GenerationModeValue; // standard = normal progression, advanced = deep dive
  };
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
    | "progress" // Custom progress updates
    // System message events (persisted)
    | "system_message" // System notification (processing started, etc.)
    | "document_card"; // Document completion card with metadata
  data?: Record<string, unknown>;
  message?: string;
}
