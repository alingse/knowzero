import type {
  ChatRequest,
  Document,
  EntityQueryResponse,
  Message,
  Roadmap,
  RoadmapProgress,
  Session,
} from "@/types";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Sessions
export const sessionsApi = {
  create: (data: { title: string; description?: string }) =>
    fetchJson<Session>("/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  get: (id: string) => fetchJson<Session>(`/sessions/${id}`),

  getMessages: (id: string) => fetchJson<Message[]>(`/sessions/${id}/messages`),

  restore: (id: string) =>
    fetchJson<{
      session: Session;
      messages: Message[];
      current_document?: Document & { follow_up_questions?: import("@/types").FollowUpQuestion[] };
      documents?: (Document & { follow_up_questions?: import("@/types").FollowUpQuestion[] })[];
      roadmap?: Roadmap;
      agent_status?: Session["agent_status"];
      agent_started_at?: string | null;
    }>(`/sessions/${id}/restore`),

  chat: (id: string, data: ChatRequest) =>
    fetchJson<{ type: string; message?: string }>(`/sessions/${id}/chat`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Documents
export const documentsApi = {
  create: (data: { topic: string; content: string; session_id: string }) =>
    fetchJson<Document>("/documents", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchJson<Document>(`/documents/${id}`),

  update: (id: number, data: Partial<Document>) =>
    fetchJson<Document>(`/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Entities
export const entitiesApi = {
  query: (name: string, sessionId: string) =>
    fetchJson<EntityQueryResponse>(
      `/entities/query?name=${encodeURIComponent(name)}&session_id=${encodeURIComponent(sessionId)}`
    ),
};

// Roadmaps
export const roadmapsApi = {
  getActive: (sessionId: string) => fetchJson<Roadmap>(`/roadmaps/active/${sessionId}`),

  list: (sessionId: string) => fetchJson<Roadmap[]>(`/roadmaps/session/${sessionId}`),

  get: (id: number) => fetchJson<Roadmap>(`/roadmaps/${id}`),

  getProgress: (id: number) => fetchJson<RoadmapProgress>(`/roadmaps/${id}/progress`),

  update: (id: number, data: Partial<Roadmap>) =>
    fetchJson<Roadmap>(`/roadmaps/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Health
export const healthApi = {
  check: () => fetchJson<{ status: string; version: string }>("/health"),
};
