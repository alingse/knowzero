// Session store with Zustand.

import { create } from "zustand";

import type { Document, FollowUpQuestion, Message, Session } from "@/types";

interface SessionState {
  // Current session
  currentSession: Session | null;
  currentDocument: Document | null;
  documents: Document[]; // All documents in the session
  selectedDocumentId: number | null; // Currently selected document ID
  messages: Message[];

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
      documents: [...state.documents.filter(d => d.id !== document.id), document],
    }));
  },
  selectDocument: (documentId) => {
    const { documents, currentDocument } = get();
    
    if (documentId === null) {
      set({ selectedDocumentId: null });
      return;
    }
    
    const selectedDoc = documents.find(d => d.id === documentId);
    if (selectedDoc) {
      set({ 
        selectedDocumentId: documentId,
        currentDocument: selectedDoc,
        // Clear follow-up questions when switching documents
        followUpQuestions: [],
      });
    }
  },
  setSelectedDocumentId: (documentId) => set({ selectedDocumentId: documentId }),
  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === 'function'
        ? (messages as (prev: Message[]) => Message[])(state.messages)
        : messages
    })),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  appendStreamingContent: (content) =>
    set((state) => ({
      streamingContent: state.streamingContent + content,
    })),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearStreamingContent: () => set({ streamingContent: "" }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setFollowUpQuestions: (questions) => set({ followUpQuestions: questions }),
  updateDocumentEntities: (entities) =>
    set((state) => ({
      currentDocument: state.currentDocument
        ? { ...state.currentDocument, entities }
        : null,
    })),
  setAgentStatus: (status, startedAt) => set({ agentStatus: status, agentStartedAt: startedAt }),

  // Operations
  clearSession: () =>
    set({
      currentSession: null,
      currentDocument: null,
      documents: [],
      selectedDocumentId: null,
      messages: [],
      followUpQuestions: [],
      error: null,
      agentStatus: "idle",
      agentStartedAt: undefined,
      isStreaming: false,
      streamingContent: "",
    }),
}));
