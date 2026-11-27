"use client";

import { useRouter } from "next/navigation";
import CaptureChat from "@/components/capture/CaptureChat";
import { DailyCheckin } from "@/components/journal/ChatNudges";
import InboxSummary from "@/components/inbox/InboxSummary";
import { useOrganizationStore } from "@/stores/organizationStore";

export default function HomePage() {
  const router = useRouter();
  const { organization } = useOrganizationStore();

  return (
    <>
      <div className="h-[calc(100dvh-7rem-var(--bar,0px))] md:h-[calc(100dvh-8rem)]">
        <CaptureChat
          topSlot={
            // once a day, one tap: everyone gets it, it is private, and it goes away after an answer or a skip
            organization?.id ? <DailyCheckin orgId={organization.id} onMore={() => router.push("/dashboard/journal?view=insights")} /> : null
          }
          extras={
            organization?.id ? (
              // your own inbox summary (Zoho, read-only, private): a slim bar until you open it
              <div className="max-h-[55%] overflow-y-auto">
                <InboxSummary orgId={organization.id} />
              </div>
            ) : null
          }
        />
      </div>
    </>
  );
}
