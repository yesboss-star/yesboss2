"use client";

import { create } from "zustand";
import { useUIStore } from "@/stores/uiStore";
import { refreshAuthToken } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export interface CliqStatus {
  bot: string;
  dc: string;
  enabled: boolean;
  configured: boolean;
  inputs: string[];
  followups: string;
}

interface ZohoState {
  connected: boolean;
  email: string;
  scopes: string[];
  connectedAt: string;
  /** Permission to read this person's own inbox (read-only). Separate from the normal Zoho connection. */
  mailEnabled: boolean;
  loading: boolean;
  connecting: boolean;
  cliqStatus: CliqStatus | null;
  checkStatus: () => Promise<void>;
  checkCliqStatus: () => Promise<void>;
  connect: (opts?: { mail?: boolean }) => Promise<void>;
  disconnect: () => Promise<void>;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("yesboss_id_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export const useZohoStore = create<ZohoState>()((set, get) => ({
  connected: false,
  email: "",
  scopes: [],
  connectedAt: "",
  mailEnabled: false,
  loading: false,
  connecting: false,
  cliqStatus: null,

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
          mailEnabled: !!data.mail_enabled,
        });
      }
    } catch {
      set({ connected: false });
    } finally {
      set({ loading: false });
    }
  },

  checkCliqStatus: async () => {
    try {
      const res = await fetch(`${API_URL}/zoho/cliq/bot/capabilities`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        set({ cliqStatus: await res.json() });
      }
    } catch {
      set({ cliqStatus: null });
    }
  },

  connect: async (opts) => {
    try {
      set({ connecting: true });
      await refreshAuthToken();
      const res = await fetch(`${API_URL}/zoho/auth-url${opts?.mail ? "?mail=true" : ""}`, {
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("Failed to get Zoho auth URL", res.status, body);
        useUIStore.getState().addNotification({
          type: "error",
          title: "Zoho connection failed",
          message:
            res.status === 401
              ? "Your session expired. Please sign out and back in."
              : `Couldn't start Zoho connection (${res.status}).`,
        });
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
          get().checkStatus().then(() => {
            if (opts?.mail ? get().mailEnabled : get().connected) {
              useUIStore.getState().addNotification({
                type: "success",
                title: opts?.mail ? "Inbox connected" : "Zoho Connected",
                message: opts?.mail
                  ? "YesBoss can now read your Zoho inbox to summarise it. Only you can see the summary."
                  : "Your Zoho account has been connected successfully.",
              });
            }
          });
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
      set({ connected: false, email: "", scopes: [], connectedAt: "", mailEnabled: false });
    } catch (err) {
      console.error("Zoho disconnect failed:", err);
    } finally {
      set({ loading: false });
    }
  },
}));
