import DashboardLayout from "@/components/DashboardLayout";

// One layout for every page under /dashboard. It stays on screen while a person moves between Task, Let's Talk and
// Profile, so only the page itself changes. Before this each page built its own top bar, side or bottom bar, which made
// the whole screen redraw (and flicker) on every tap.
export default function DashboardSectionLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
