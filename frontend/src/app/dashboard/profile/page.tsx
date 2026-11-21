"use client";

import { Suspense } from "react";
import ProfileHub from "@/components/settings/ProfileHub";

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileHub initial="profile" />
    </Suspense>
  );
}
