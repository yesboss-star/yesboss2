import { redirect } from "next/navigation";

/** "My Data" moved into Profile. This address is kept so old links and bookmarks still land in the right place. */
export default function MyDataPage() {
  redirect("/dashboard/profile?section=data");
}
