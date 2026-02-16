// Session store with Zustand.

import { create } from "zustand";

import type {
  Document,
  FollowUpQuestion,
  Message,
  Roadmap,
  RoadmapProgress,
  Session,
} from "@/types";

interface SessionState {
  // Current session
  currentSession: Session | null;
  currentDocument: Document | null;
  documents: Document[]; // All documents in the session
  selectedDocumentId: number | null; // Currently selected document ID
  messages: Message[];
  roadmap: Roadmap | null;
  roadmapProgress: RoadmapProgress | null;

  // UI State
  isLoading: boolean;
  error: string | null;

  // Agent status
  agentStatus: "idle" | "running" | "error";
  agentStartedAt?: string;

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;

  // Async push state (entities & follow-ups arrive after document)
  followUpQuestions: FollowUpQuestion[];

  // Actions
  setCurrentSession: (session: Session | null) => void;
  setCurrentDocument: (document: Document | null) => void;
  setDocuments: (documents: Document[]) => void;
  addDocument: (document: Document) => void;
  selectDocument: (documentId: number | null) => void;
  setSelectedDocumentId: (documentId: number | null) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: number, updates: Partial<Message>) => void;
  appendStreamingContent: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearStreamingContent: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFollowUpQuestions: (questions: FollowUpQuestion[]) => void;
  updateDocumentEntities: (entities: string[]) => void;
  setAgentStatus: (status: "idle" | "running" | "error", startedAt?: string) => void;
  setRoadmap: (roadmap: Roadmap | null) => void;
  updateRoadmap: (updates: Partial<Roadmap>) => void;
  setRoadmapProgress: (progress: RoadmapProgress | null) => void;

  // Operations
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state
  currentSession: null,
  currentDocument: null,
  documents: [],
  selectedDocumentId: null,
  messages: [],
  roadmap: null,
  roadmapProgress: null,
  isLoading: false,
  error: null,
  agentStatus: "idle",
  agentStartedAt: undefined,
  isStreaming: false,
  streamingContent: "",
  followUpQuestions: [],

  // Actions
  setCurrentSession: (session) => set({ currentSession: session }),
  setCurrentDocument: (document) => {
    set({ currentDocument: document });
    // When setting current document, also select it
    if (document?.id) {
      set({ selectedDocumentId: document.id });
    }
  },
  setDocuments: (documents) => set({ documents }),
  addDocument: (document) => {
    set((state) => ({
      documents: [...state.documents.filter((d) => d.id !== document.id), document],
    }));
  },
  selectDocument: (documentId) => {
    const { documents } = get();

    if (documentId === null) {
      set({ selectedDocumentId: null });
      return;
    }

    const selectedDoc = documents.find((d) => d.id === documentId);
    if (selectedDoc) {
      set({
        selectedDocumentId: documentId,
        currentDocument: selectedDoc,
        // Update follow-up questions from the selected document
        followUpQuestions:
          (selectedDoc as Document & { follow_up_questions?: FollowUpQuestion[] })
            .follow_up_questions || [],
      });
    }
  },
  setSelectedDocumentId: (documentId) => set({ selectedDocumentId: documentId }),
  setMessages: (messages) =>
    set((state) => ({
      messages:
        typeof messages === "function"
          ? (messages as (prev: Message[]) => Message[])(state.messages)
          : messages,
    })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  appendStreamingContent: (content) =>
    set((state) => ({
      streamingContent: state.streamingContent + content,
    })),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearStreamingContent: () => set({ streamingContent: "" }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setFollowUpQuestions: (questions) => {
    console.log("[sessionStore] setFollowUpQuestions called:", questions.length, "questions");
    set({ followUpQuestions: questions });
  },
  updateDocumentEntities: (entities) =>
    set((state) => ({
      currentDocument: state.currentDocument ? { ...state.currentDocument, entities } : null,
    })),
  setAgentStatus: (status, startedAt) => set({ agentStatus: status, agentStartedAt: startedAt }),
  setRoadmap: (roadmap) => set({ roadmap }),
  updateRoadmap: (updates) =>
    set((state) => ({
      roadmap: state.roadmap ? { ...state.roadmap, ...updates } : null,
    })),
  setRoadmapProgress: (progress) => set({ roadmapProgress: progress }),

  // Operations
  clearSession: () =>
    set({
      currentSession: null,
      currentDocument: null,
      documents: [],
      selectedDocumentId: null,
      messages: [],
      roadmap: null,
      followUpQuestions: [],
      error: null,
      agentStatus: "idle",
      agentStartedAt: undefined,
      isStreaming: false,
      streamingContent: "",
    }),
}));
