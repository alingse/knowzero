// Session store with Zustand.

import { create } from "zustand";

import type { Document, Message, Session } from "@/types";

interface SessionState {
  // Current session
  currentSession: Session | null;
  currentDocument: Document | null;
  messages: Message[];
  
  // UI State
  isLoading: boolean;
  error: string | null;
  
  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  
  // Actions
  setCurrentSession: (session: Session | null) => void;
  setCurrentDocument: (document: Document | null) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: number, updates: Partial<Message>) => void;
  appendStreamingContent: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearStreamingContent: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Operations
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  // Initial state
  currentSession: null,
  currentDocument: null,
  messages: [],
  isLoading: false,
  error: null,
  isStreaming: false,
  streamingContent: "",
  
  // Actions
  setCurrentSession: (session) => set({ currentSession: session }),
  setCurrentDocument: (document) => set({ currentDocument: document }),
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
  
  // Operations
  clearSession: () =>
    set({
      currentSession: null,
      currentDocument: null,
      messages: [],
      error: null,
      isStreaming: false,
      streamingContent: "",
    }),
}));
