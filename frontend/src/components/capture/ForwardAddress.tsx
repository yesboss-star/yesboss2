"use client";

import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, MessageSquare, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

interface Address {
  enabled: boolean;
  address: string | null;
  needs_domain: boolean;
}

/** Other ways in: forward an email to your private address, or message the Cliq bot. */
export function ForwardAddress() {
  const [info, setInfo] = useState<Address | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (path: string, method: "GET" | "POST") => {
    const res = await fetch(`${API_URL}/capture-inbox${path}`, { method, headers: getAuthHeaders() });
    if (!res.ok) {
      let detail = "Could not load your address";
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {}
      throw new Error(detail);
    }
    return (await res.json()) as Address;
  }, []);

  useEffect(() => {
    call("/address", "GET")
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your address"));
  }, [call]);

  const copy = async () => {
    if (!info?.address) return;
    try {
      await navigator.clipboard.writeText(info.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to the clipboard.");
    }
  };

  const replace = async () => {
    setBusy(true);
    try {
      setInfo(await call("/address/regenerate", "POST"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not replace your address");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-2xl border border-border bg-surface p-4 group">
      <summary className="cursor-pointer text-sm font-medium text-foreground list-none flex items-center gap-2">
        <Mail className="h-4 w-4" /> Other ways to add things
        <span className="text-xs text-text-muted font-normal">forward an email · message the Cliq bot</span>
      </summary>

      <div className="mt-3 space-y-4 text-sm">
        <div className="space-y-1.5">
          <p className="font-medium text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4" /> Forward an email
          </p>
          {info?.address ? (
            <>
              <p className="text-xs text-text-muted">
                Forward any email, with its attachments, to your private address. It is saved here for you only, and the attachments
                (reports, spreadsheets, PDFs) are read too. Anyone who has this address can add to your inbox, so keep it to yourself.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-lg border border-border bg-background px-2 py-1 text-xs break-all">{info.address}</code>
                <Button size="sm" variant="secondary" onClick={copy}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <InlineConfirm
                  label="Get new address"
                  keepLabel="Keep this one"
                  warning="The old one stops working, so update any forwarding rule that uses it."
                  onConfirm={() => void replace()}
                  trigger={(arm) => (
                    <Button size="sm" variant="ghost" onClick={arm} disabled={busy}>
                      <RefreshCw className="h-3.5 w-3.5" /> New address
                    </Button>
                  )}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted">
              {info?.needs_domain
                ? "Forwarding is switched on, but the server has no mail domain yet. Ask whoever runs the server to set CAPTURE_INBOUND_DOMAIN."
                : "Forwarding by email is not set up on this server yet."}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="font-medium text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Message the Cliq bot
          </p>
          <p className="text-xs text-text-muted">
            Send the YesBoss bot a message that starts with <code>capture:</code>, for example{" "}
            <code>capture: call the supplier about the shipment</code>. A voice note sent when you are not in the middle of a task
            conversation is saved too. Either way it is private to you until you share it.
          </p>
        </div>

        {error && (
          <p className="text-xs text-rose-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
