export interface Session {
  id: string;
  title: string;
  description?: string;
  learning_goal?: string;
  current_document_id?: number;
  progress: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: string;
  related_document_id?: number;
  timestamp: string;
  // Placeholder message fields for UI state
  isPlaceholder?: boolean;
  placeholderType?: 'generating' | 'complete' | 'error';
  documentTitle?: string;
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

export interface FollowUpQuestion {
  id: number;
  question: string;
  question_type?: "basic" | "deep" | "practice";
  entity_tag?: string;
  is_clicked: boolean;
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
    | "follow_ups"
    | "error"
    | "done"
    // Streaming event types for LangGraph progress
    | "token"           // LLM token streaming
    | "node_start"       // Agent node execution started
    | "node_end"         // Agent node execution ended
    | "tool_start"       // Tool call started
    | "tool_end"         // Tool call ended
    | "progress";        // Custom progress updates
  data?: Record<string, unknown>;
  message?: string;
}
