"use client";

import { Suspense } from "react";
import ProfileHub from "@/components/settings/ProfileHub";

/** Settings and Profile are one screen now. This address is kept for old links and the Zoho/Google sign-in return. */
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <ProfileHub initial="notifications" />
    </Suspense>
  );
}
