"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export default function OAuthConnectedPage() {
  useEffect(() => {
    // This page is shown inside the OAuth popup after a successful connect.
    // Close it automatically; the parent tab detects the close and refreshes
    // the provider connection status.
    if (window.opener && window.opener !== window) {
      window.close();
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-4" />
      <h1 className="text-2xl font-bold mb-2">Connected!</h1>
      <p className="text-text-muted text-center max-w-sm">
        Your account has been connected successfully. You can close this window.
      </p>
    </div>
  );
}
