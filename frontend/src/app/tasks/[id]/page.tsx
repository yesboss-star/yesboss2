"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** The task now opens in a side panel on the Tasks page. This route stays so old links (emails, notifications,
 *  bookmarks) still land on the right task. */
export default function TaskDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(id && id !== "new" ? `/dashboard/task?task=${encodeURIComponent(id)}` : "/dashboard/task");
  }, [id, router]);

  return null;
}
