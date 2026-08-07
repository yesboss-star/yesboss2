import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("yesboss_id_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

const inflightFetches = new Map<string, Promise<Response>>();

export function fetchDeduped(url: string, init?: RequestInit): Promise<Response> {
  const headers = init?.headers;
  const auth =
    headers instanceof Headers
      ? headers.get("Authorization")
      : (headers as Record<string, string> | undefined)?.["Authorization"] || "";
  const body = init?.body ? JSON.stringify(init.body) : "";
  const key = `${init?.method || "GET"}|${url}|${body}|${auth ? "auth" : "noauth"}`;
  const existing = inflightFetches.get(key);
  if (existing) return existing.then((r) => r.clone());
  const promise = fetch(url, init).finally(() => {
    inflightFetches.delete(key);
  });
  inflightFetches.set(key, promise);
  return promise.then((r) => r.clone());
}
