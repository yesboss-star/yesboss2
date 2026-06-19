"use client";

import { create } from "zustand";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface ZohoState {
  connected: boolean;
  email: string;
  scopes: string[];
  connectedAt: string;
  loading: boolean;
  connecting: boolean;
  checkStatus: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

function getAuthHeaders(): Record<string, string> {
  try {
    const stored = localStorage.getItem("yesboss_user");
    if (stored) {
      const user = JSON.parse(stored);
      const headers: Record<string, string> = {};
      if (user.uid) headers["X-User-Id"] = user.uid;
      if (user.email) headers["X-User-Email"] = user.email;
      return headers;
    }
  } catch {}
  return {};
}

export const useZohoStore = create<ZohoState>()((set, get) => ({
  connected: false,
  email: "",
  scopes: [],
  connectedAt: "",
  loading: false,
  connecting: false,

  checkStatus: async () => {
    try {
      set({ loading: true });
      const res = await fetch(`${API_URL}/zoho/status`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        set({
          connected: data.connected || false,
          email: data.email || "",
          scopes: data.scopes || [],
          connectedAt: data.connected_at || "",
        });
      }
    } catch {
      set({ connected: false });
    } finally {
      set({ loading: false });
    }
  },

  connect: async () => {
    try {
      set({ connecting: true });
      const res = await fetch(`${API_URL}/zoho/auth-url`, {
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) {
        console.error("Failed to get Zoho auth URL");
        set({ connecting: false });
        return;
      }
      const data = await res.json();
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        data.url,
        "ZohoAuth",
        `width=${width},height=${height},left=${left},top=${top},popup=yes`
      );
      const pollTimer = window.setInterval(() => {
        if (!popup || popup.closed) {
          window.clearInterval(pollTimer);
          set({ connecting: false });
          get().checkStatus();
        }
      }, 500);
    } catch (err) {
      console.error("Zoho connect failed:", err);
      set({ connecting: false });
    }
  },

  disconnect: async () => {
    try {
      set({ loading: true });
      await fetch(`${API_URL}/zoho/disconnect`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      set({ connected: false, email: "", scopes: [], connectedAt: "" });
    } catch (err) {
      console.error("Zoho disconnect failed:", err);
    } finally {
      set({ loading: false });
    }
  },
}));
