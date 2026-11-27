"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useNotificationStore } from "@/stores/notificationStore";
import {
  House,
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  User,
  Building2,
  Zap,
  MessageCircle,
  Download,
  Bell,
} from "lucide-react";
import { Avatar, Badge, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui";
import { ThemeToggleInline } from "@/components/ThemeToggleInline";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { LANDING_PATH } from "@/lib/landing";
import { cn } from "@/lib/utils";
import { useScrollDown } from "@/hooks/useScrollDown";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useIsPhone } from "@/hooks/useIsPhone";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  /** other addresses that belong to this item, so it stays highlighted there */
  alsoActive?: string[];
  badge?: string;
  section?: string;
  hidden?: boolean;
}

const navItems: NavItem[] = [
  // Journal has no sidebar entry and no top-bar icon: it lives in Let's Talk (the Journal chip, "My journals" with entries, reminders and ideas)
  // and the full page opens from "Open the full Journal" links there and from the brief on the Dashboard
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: House, label: "Let's Talk", href: "/dashboard/home" },
  { icon: Zap, label: "Task", href: "/dashboard/task" },
  // Profile, settings and the uploaded-data pages are one screen now
  { icon: User, label: "Profile", href: "/dashboard/profile", alsoActive: ["/dashboard/settings", "/dashboard/data"] },
];

/** On a phone everyone gets a bottom bar with Let's Talk raised in the middle. An employee has three places: Task, Let's Talk
 *  and Profile (the bell stays in the top bar). An owner has five: Dashboard, Task, Let's Talk, Alerts and Profile. */
const BAR_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: [] as string[], exact: "/dashboard", ownerOnly: true, center: false },
  { href: "/dashboard/task", label: "Task", icon: Zap, match: ["/dashboard/task"], exact: "", ownerOnly: false, center: false },
  { href: "/dashboard/home", label: "Let's Talk", icon: MessageCircle, match: ["/dashboard/home"], exact: "", ownerOnly: false, center: true },
  { href: "/dashboard/notifications", label: "Alerts", icon: Bell, match: ["/dashboard/notifications"], exact: "", ownerOnly: true, center: false },
  { href: "/dashboard/profile", label: "Profile", icon: User, match: ["/dashboard/profile", "/dashboard/settings", "/dashboard/data"], exact: "", ownerOnly: false, center: false },
];

/** Reads the role saved at sign-in, so the right layout shows on the very first paint instead of flipping after sign-in checks finish. */
function useRoleHint(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return (JSON.parse(localStorage.getItem("yesboss_user") || "null") || {}).role || null;
      } catch {
        return null;
      }
    },
    () => null
  );
}

/** An employee's bell on a phone: it opens the Alerts page, the same one an owner reaches from the bottom bar. */
function AlertsBell() {
  const unreadCount = useNotificationStore((st) => st.unreadCount);
  return (
    <Link
      href="/dashboard/notifications"
      aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} unread` : "Alerts"}
      className="relative cursor-pointer rounded-full border-2 border-outline bg-surface p-2 text-foreground shadow-[3px_3px_0_var(--shadow-hard)] transition-transform active:scale-95"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-accent px-1 text-[10px] font-bold leading-none text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

function PhoneBottomBar({ pathname, isEmployee }: { pathname: string | null; isEmployee: boolean }) {
  const items = BAR_ITEMS.filter((i) => isEmployee ? !i.ownerOnly : true);
  const unreadCount = useNotificationStore((st) => st.unreadCount); // kept fresh by NotificationWatcher for the whole app
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t-[2.5px] border-outline bg-surface px-2 pt-2"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {items.map(({ href, label, icon: Icon, match, exact, center }) => {
        const badge = href === "/dashboard/notifications" ? unreadCount : 0;
        const active = exact ? pathname === exact : match.some((m) => pathname === m || !!pathname?.startsWith(m + "/"));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className="flex min-w-0 flex-1 cursor-pointer select-none flex-col items-center gap-1 pb-0.5 transition-transform duration-150 active:scale-95">
            {center ? (
              <span className={cn("-mt-8 grid h-16 w-16 place-items-center rounded-full border-[2.5px] border-outline bg-highlight text-on-highlight shadow-[3px_3px_0_var(--shadow-hard)] transition-all duration-200", active && "-translate-y-0.5 ring-4 ring-highlight/30 tab-pop")}>
                <Icon className="h-7 w-7" strokeWidth={active ? 2.6 : 2.2} />
              </span>
            ) : (
              <span className={cn("relative grid h-8 w-14 place-items-center rounded-2xl border-[2.5px] transition-all duration-200", active ? "border-outline bg-highlight text-on-highlight shadow-[2px_2px_0_var(--shadow-hard)] tab-pop" : "border-transparent text-text-muted")}>
                <Icon className="h-5 w-5" strokeWidth={active ? 2.6 : 2.2} />
                {badge > 0 && (
                  <span className="absolute -right-0.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-accent px-1 text-[10px] font-bold leading-none text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
            )}
            <span className={cn("max-w-full truncate text-[11px] leading-tight", active || center ? "font-extrabold text-foreground" : "font-bold text-text-muted")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut } = useAuth();
  const { sidebarOpen, mobileSidebarOpen, setSidebarOpen, setMobileSidebarOpen } = useUIStore();
  const { organization, avatarUrl, avatarStyle, setAvatarUrl } = useOrganizationStore();
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsPhone();
  const roleHint = useRoleHint();
  // An employee has no Dashboard: Task, Let's Talk and Profile. On a phone everyone uses a bottom bar instead of the sidebar.
  const isEmployee = (role ?? roleHint) === "employee";
  const phoneBar = isMobile;
  // on a phone the top bar slides away while the page scrolls down and comes back when it scrolls up
  const hideTop = useScrollDown(phoneBar);
  const { canInstall, install } = useInstallPrompt();
  // The name is always at the top left: in the top bar on a phone or when the computer sidebar is collapsed, otherwise in the sidebar's own header
  const showBrand = isMobile || !sidebarOpen;
  // On a computer the sidebar has no Profile entry; it lives in the avatar menu (top right). On a phone an owner still finds it in the sidebar.
  const visibleNavItems = navItems.filter((item) => !item.hidden && !(isEmployee && item.href === "/dashboard") && (isMobile || item.href !== "/dashboard/profile"));

  useEffect(() => {
    if (isEmployee && pathname === "/dashboard") router.replace(LANDING_PATH);
  }, [isEmployee, pathname, router]);

  // Load avatar from DB on mount — always source from API, not stale local state
  useEffect(() => {
    if (!user?.email) return;
    // Clean up stale blob URLs from previous sessions
    if (avatarUrl && avatarUrl.startsWith("blob:")) {
      setAvatarUrl(undefined);
    }
    // Clean up stale double-/api/v1 URLs from a previous bug
    if (avatarUrl && avatarUrl.includes("/api/v1/api/v1/")) {
      setAvatarUrl(undefined);
    }
    // Fetch avatar from API
    const avatarApiUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1"}/employees/avatar/${encodeURIComponent(user.email)}`;
    fetch(avatarApiUrl, { method: "HEAD" })
      .then((r) => {
        if (r.ok) setAvatarUrl(avatarApiUrl);
      })
      .catch(() => {});
  }, [user?.email]);


  const isActive = (item: NavItem) => {
    const matches = (href: string) => (href === "/dashboard" ? pathname === href : pathname === href || !!pathname?.startsWith(href + "/"));
    return matches(item.href) || (item.alsoActive ?? []).some(matches);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2 cursor-pointer">
          <img src="/yesboss-logo.svg" alt="YesBoss" className="w-8 h-8 flex-shrink-0" />
          {sidebarOpen && (
            <span className="text-lg font-bold whitespace-nowrap">
              Yes<span className="text-primary">Boss</span>
            </span>
          )}
        </Link>
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
        {isMobile && (
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {organization && sidebarOpen && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{organization.name}</p>
              <p className="text-xs text-text-muted truncate">{organization.industry}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {visibleNavItems.map((item, i) => {
          const showSection = item.section && (!visibleNavItems[i - 1] || visibleNavItems[i - 1].section !== item.section);
          return (
            <div key={item.href}>
              {showSection && sidebarOpen && (
                <p className="px-3 pt-4 pb-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                  {item.section}
                </p>
              )}
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border-2 text-sm font-bold transition-all cursor-pointer ${
                  isActive(item)
                    ? "border-outline bg-highlight text-on-highlight shadow-[3px_3px_0_var(--shadow-hard)]"
                    : "border-transparent text-foreground hover:bg-surface-light hover:border-outline"
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <Badge variant="default" className="ml-auto">
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className={`flex items-center gap-3 ${sidebarOpen ? "px-3 py-2" : "justify-center"}`}>
          <Avatar size="sm" src={avatarUrl} seed={user?.email || (user as any)?.phone} dicebearStyle={avatarStyle} fallback={(user as any)?.user_metadata?.full_name || user?.email || "U"} />
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.email || (user as any)?.phone}</p>
              <p className="text-xs text-text-muted capitalize">{role}</p>
            </div>
          )}
          {sidebarOpen && (
            <button
              onClick={signOut}
              className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background" style={{ ["--bar" as string]: phoneBar ? "5.5rem" : "0px", ["--hdr" as string]: hideTop ? "0px" : "4rem" }}>
      {isMobile && !phoneBar && mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        hidden={phoneBar}
        className={`fixed top-0 left-0 z-50 h-full bg-surface border-r-[2.5px] border-outline transition-all duration-300 ${
          isMobile
            ? `w-72 ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : sidebarOpen
            ? "w-64"
            : "w-20"
        }`}
      >
        {sidebarContent}
      </aside>

      <div
        className={`transition-all duration-300 ${
          isMobile ? "ml-0" : sidebarOpen ? "ml-64" : "ml-20"
        }`}
      >
        <header className={cn("sticky top-0 z-30 bg-surface border-b-[2.5px] border-outline transition-transform duration-200", hideTop && "-translate-y-full")}>
          <div className="flex items-center justify-between px-4 md:px-6 py-3">
            <div className="flex items-center gap-4">
              {isMobile && !phoneBar && (
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
              {showBrand && (
                <Link href={isEmployee ? LANDING_PATH : "/dashboard"} className="flex items-center gap-2 cursor-pointer">
                  <img src="/yesboss-logo.svg" alt="YesBoss" className="w-8 h-8 flex-shrink-0" />
                  <span className="text-lg font-bold whitespace-nowrap">
                    Yes<span className="text-primary">Boss</span>
                  </span>
                </Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              {!phoneBar && <ThemeToggleInline />}
              {canInstall && (
                <button
                  onClick={() => void install()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-surface px-3 py-1.5 text-sm font-bold text-foreground hover:bg-primary/10"
                >
                  <Download className="h-4 w-4" /> Install app
                </button>
              )}
              {phoneBar ? (isEmployee && <AlertsBell />) : <NotificationDropdown />}

              {!phoneBar && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="cursor-pointer">
                    <Avatar size="sm" src={avatarUrl} seed={(user?.email as string | undefined) || undefined} dicebearStyle={avatarStyle} fallback={user?.email?.charAt(0) || "U"} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user?.email || (user as any)?.phone}</span>
                      <span className="text-xs text-text-muted capitalize">{role} role</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/profile">
                      <User className="w-4 h-4" /> Profile
                    </Link>
                  </DropdownMenuItem>
                  {/* the Profile page already holds the settings, so on a computer this menu has just Profile and Sign out */}
                  {isMobile && (
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/settings">
                        <Settings className="w-4 h-4" /> Settings
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-rose-400">
                    <LogOut className="w-4 h-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </div>
          </div>
        </header>

        <main className={cn("p-4 md:p-6", phoneBar && "pb-28")}>{children}</main>
      </div>

      {phoneBar && <PhoneBottomBar pathname={pathname} isEmployee={isEmployee} />}
    </div>
  );
}
