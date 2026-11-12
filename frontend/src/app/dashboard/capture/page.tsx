import { redirect } from "next/navigation";

// Capture is the Home page now; this keeps old links, emails and bookmarks working.
export default function CaptureRedirect() {
  redirect("/dashboard/home");
}
