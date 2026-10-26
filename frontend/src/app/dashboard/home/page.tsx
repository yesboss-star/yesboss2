"use client";

import DashboardLayout from "@/components/DashboardLayout";
import AISummaryChat from "@/components/AISummaryChat";

export default function HomePage() {
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)]">
        <AISummaryChat />
      </div>
    </DashboardLayout>
  );
}
