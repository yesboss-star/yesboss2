"use client";

import { useEffect, useState } from "react";
import { useZohoStore } from "@/stores/zohoStore";
import { Loader2, CheckCircle, XCircle, Plug, PlugZap } from "lucide-react";

export default function ZohoConnectButton() {
  const { connected, email, loading, connecting, checkStatus, connect, disconnect } = useZohoStore();
  const [localConnecting, setLocalConnecting] = useState(false);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleConnect = async () => {
    setLocalConnecting(true);
    await connect();
    setTimeout(() => setLocalConnecting(false), 3000);
  };

  const handleDisconnect = async () => {
    if (window.confirm("Disconnect Zoho integration? Tasks and calendar will stop syncing.")) {
      await disconnect();
    }
  };

  if (loading && !connected) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking Zoho connection...
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">Connected</span>
          {email && <span className="text-xs text-text-muted">({email})</span>}
        </div>
        <button
          onClick={handleDisconnect}
          className="text-xs text-text-muted hover:text-rose-400 transition-colors cursor-pointer underline underline-offset-2"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={connecting || localConnecting}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium cursor-pointer disabled:opacity-50"
    >
      {(connecting || localConnecting) ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Plug className="w-4 h-4" />
      )}
      {(connecting || localConnecting) ? "Connecting..." : "Connect Zoho"}
    </button>
  );
}
