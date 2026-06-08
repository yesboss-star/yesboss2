const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem("yesboss_user");
  if (!stored) return {};
  try {
    const user = JSON.parse(stored);
    return {
      "X-User-ID": user?.uid || "",
      "X-User-Email": user?.email || "",
    };
  } catch {
    return {};
  }
}

export async function registerPushNotifications(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }

    const vapidRes = await fetch(`${API_URL}/push/vapid-public-key`);
    if (!vapidRes.ok) return false;
    const { public_key } = await vapidRes.json();

    const newSub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key) as unknown as BufferSource,
    });

    await fetch(`${API_URL}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        endpoint: newSub.endpoint,
        keys: { p256dh: arrayBufferToBase64(newSub.getKey("p256dh")), auth: arrayBufferToBase64(newSub.getKey("auth")) },
      }),
    });

    return true;
  } catch {
    return false;
  }
}

export async function unregisterPushNotifications(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await fetch(`${API_URL}/push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
