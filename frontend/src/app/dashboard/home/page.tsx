"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Paperclip, Pencil } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import CaptureChat, { type ComposerMode } from "@/components/capture/CaptureChat";
import { VOICE_LANGUAGES, VOICE_LANG_KEY } from "@/components/capture/voice";
import { DailyCheckin } from "@/components/journal/ChatNudges";
import { useOrganizationStore } from "@/stores/organizationStore";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: ComposerMode; label: string; icon: typeof Pencil }[] = [
  { mode: "type", label: "Type", icon: Pencil },
  { mode: "upload", label: "Upload", icon: Paperclip },
  { mode: "speak", label: "Speak", icon: Mic },
];

export default function HomePage() {
  const router = useRouter();
  const { organization } = useOrganizationStore();
  // nothing is chosen when the page opens: just the mood strip and the three ways to talk
  const [mode, setMode] = useState<ComposerMode | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<string>("en-IN");

  // remember the spoken language between visits (storage can be blocked, so never rely on it)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VOICE_LANG_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage can only be read after hydration
      if (stored && VOICE_LANGUAGES.some((l) => l.code === stored)) setVoiceLang(stored);
    } catch { /* ignore */ }
  }, []);

  const chooseVoiceLang = (code: string) => {
    setVoiceLang(code);
    try { localStorage.setItem(VOICE_LANG_KEY, code); } catch { /* ignore */ }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-3 h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)]">
        {/* once a day, one tap: everyone gets it, it is private, and it goes away after an answer or a skip */}
        {organization?.id && (
          <DailyCheckin
            orgId={organization.id}
            className="flex-shrink-0"
            onMore={() => router.push("/dashboard/journal?view=insights")}
          />
        )}

        {/* the three ways to talk: each opens the chat with its own input at the bottom */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0" role="tablist" aria-label="Choose how to talk">
          {OPTIONS.map(({ mode: option, label, icon: Icon }) => {
            const active = mode === option;
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(option)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border-2 border-outline px-5 py-2 text-sm font-bold shadow-[3px_3px_0_var(--shadow-hard)] transition-all cursor-pointer",
                  "hover:-translate-x-px hover:-translate-y-px",
                  active ? "bg-highlight text-on-highlight" : "bg-surface text-foreground hover:bg-surface-light",
                  option === "speak" && listening && "!bg-rose-500 !text-white"
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            );
          })}
        </div>

        {/* the chat stays mounted while it is hidden, so it is ready the moment an option is chosen */}
        <div className={cn("flex-1 min-h-0", !mode && "hidden")}>
          <CaptureChat
            mode={mode ?? "type"}
            visible={mode !== null}
            voiceLang={voiceLang}
            onVoiceLangChange={chooseVoiceLang}
            onListeningChange={setListening}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
