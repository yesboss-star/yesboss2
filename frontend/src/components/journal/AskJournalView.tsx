"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { journalApi, type SourceRef } from "@/lib/journalApi";
import { ErrorNote, Panel, SourceLinks, inputClass } from "./shared";

const SUGGESTIONS = [
  "What was I worried about last month?",
  "Have I been avoiding the same problem?",
  "What did I decide about expanding the company?",
  "Which ideas have I never acted on?",
];

interface Turn {
  question: string;
  answer: string;
  citations: SourceRef[];
}

/** Ask questions across every previous entry; answers cite the dates they came from. */
export default function AskJournalView({ orgId, onOpen }: { orgId: string; onOpen: (sessionId: string) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setQuestion("");
    try {
      const data = await journalApi<{ answer: string; citations: SourceRef[] }>("/ask", orgId, { method: "POST", body: { question: q } });
      setTurns((prev) => [...prev, { question: q, answer: data.answer, citations: data.citations }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Talk to your past self" hint="Ask anything about what you have written before. Answers come only from your own entries.">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => void ask(suggestion)}
              disabled={loading}
              className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </Panel>

      <div className="space-y-4">
        {turns.map((turn, index) => (
          <div key={`${turn.question}-${index}`} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary/10 px-4 py-3 text-sm text-foreground">{turn.question}</div>
            </div>
            <div className="max-w-[92%] rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground">
              <p className="whitespace-pre-wrap">{turn.answer}</p>
              {turn.citations.length > 0 && (
                <>
                  <p className="mt-3 text-[11px] text-text-muted">From your entries on:</p>
                  <SourceLinks sources={turn.citations} onOpen={onOpen} />
                  <ul className="mt-2 space-y-1 text-xs text-text-muted">
                    {turn.citations.slice(0, 3).map((c) => (
                      <li key={c.entry_id}>• {c.snippet}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm text-text-muted">Reading your journal…</p>}
        <ErrorNote message={error} />
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 shadow-sm">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void ask(question);
          }}
          placeholder="Ask your journal…"
          className={`${inputClass} border-0 bg-transparent px-0 focus:border-0`}
        />
        <button
          onClick={() => void ask(question)}
          disabled={!question.trim() || loading}
          aria-label="Ask"
          className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
