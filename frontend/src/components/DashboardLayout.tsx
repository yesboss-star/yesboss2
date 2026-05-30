"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import {
  LayoutDashboard,
  CheckSquare,
  BarChart3,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  User,
  Building2,
  Sparkles,
  Share2,
  Zap,
  FolderOpen,
} from "lucide-react";
import { Avatar, Badge, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string;
  section?: string;
}

const ownerNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Share2, label: "Orchestration", href: "/dashboard/orchestration" },
  { icon: Zap, label: "AI Task Cascade", href: "/dashboard/task" },
  { icon: FolderOpen, label: "Uploaded Data", href: "/dashboard/data" },
];

const employeeNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "My Workspace", href: "/dashboard" },
  { icon: CheckSquare, label: "My Tasks", href: "/tasks" },
  { icon: Sparkles, label: "AI Assistant", href: "/dashboard/assistant", badge: "NEW" },
  { icon: Users, label: "Team", href: "/dashboard/team" },
  { icon: BarChart3, label: "Reports", href: "/dashboard/reports" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut } = useAuth();
  const { sidebarOpen, mobileSidebarOpen, setSidebarOpen, setMobileSidebarOpen, notifications, unreadCount } = useUIStore();
  const { organization } = useOrganizationStore();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  const navItems = role === "owner" ? ownerNavItems : employeeNavItems;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2 cursor-pointer">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">Y</span>
          </div>
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
        {navItems.map((item, i) => {
          const showSection = item.section && (!navItems[i - 1] || navItems[i - 1].section !== item.section);
          return (
            <div key={item.href}>
              {showSection && sidebarOpen && (
                <p className="px-3 pt-4 pb-2 text-xs font-medium text-text-muted uppercase tracking-wider">
                  {item.section}
                </p>
              )}
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:text-foreground hover:bg-surface"
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
          <Avatar size="sm" fallback={user?.email?.charAt(0) || (user as any)?.phone?.charAt(0) || "U"} />
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
    <div className="min-h-screen bg-background">
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full bg-surface border-r border-border transition-all duration-300 ${
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
        <header className="sticky top-0 z-30 glass border-b border-border">
          <div className="flex items-center justify-between px-4 md:px-6 py-3">
            <div className="flex items-center gap-4">
              {isMobile && (
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search anything, tasks, people..."
                  className="w-64 lg:w-96 pl-10 pr-4 py-2 rounded-xl bg-surface border border-border text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="relative p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="cursor-pointer">
                    <Avatar size="sm" fallback={user?.email?.charAt(0) || "U"} />
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
                  <DropdownMenuItem>
                    <User className="w-4 h-4" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="w-4 h-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-rose-400">
                    <LogOut className="w-4 h-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
