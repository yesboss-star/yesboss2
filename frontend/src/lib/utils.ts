import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const storedUser = localStorage.getItem("yesboss_user");
  const user = storedUser ? JSON.parse(storedUser) : {};
  return {
    "Content-Type": "application/json",
    "X-User-ID": user?.uid || "",
    "X-User-Email": user?.email || "",
  };
}
