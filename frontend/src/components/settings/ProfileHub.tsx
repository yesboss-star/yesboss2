"use client";

import { useMemo, useState, type ElementType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell, Building2, ChevronLeft, ChevronRight, FolderOpen, LifeBuoy, Lightbulb, Link2, LogOut, MessageSquare, Monitor, Moon,
  Network, Palette, Phone, Plug, Search, Sparkles, Sun, User, Users,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Avatar, Card, CardContent } from "@/components/ui";
import UnderstandingView from "@/components/owners/UnderstandingView";
import ProfileSections, { type ProfileSection } from "@/components/settings/ProfileSections";
import SettingsSections, { type SettingsTab } from "@/components/settings/SettingsSections";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

type SectionId = ProfileSection | SettingsTab | "appearance" | "understanding";

interface Item {
  id: SectionId | "signout";
  label: string;
  hint: string;
  icon: ElementType;
  colour: string;
  group: "Account" | "Settings";
  ownerOnly?: boolean;
}

const ITEMS: Item[] = [
  { id: "profile", label: "Profile information", hint: "Name, email, department, title", icon: User, colour: "#FFD93D", group: "Account" },
  { id: "phone", label: "Phone verification", hint: "Link your phone number", icon: Phone, colour: "#B6F36B", group: "Account" },
  { id: "organization", label: "Organization", hint: "Name, domain, industry", icon: Building2, colour: "#7CC8FF", group: "Account" },
  { id: "owners", label: "Organization owners", hint: "Who owns this workspace", icon: Users, colour: "#C9A7FF", group: "Account" },
  { id: "social", label: "Social presence", hint: "LinkedIn, X, Instagram and more", icon: Link2, colour: "#FF9FD2", group: "Account", ownerOnly: true },
  { id: "appearance", label: "Appearance", hint: "Light, dark or follow the device", icon: Palette, colour: "#FFB36B", group: "Settings" },
  { id: "notifications", label: "Notifications", hint: "Sound, email, push, in-app, Zoho Cliq", icon: Bell, colour: "#7CC8FF", group: "Settings" },
  { id: "integrations", label: "Integrations", hint: "Zoho and Google", icon: Plug, colour: "#B6F36B", group: "Settings" },
  { id: "about-you", label: "About you", hint: "How you work, from your tasks", icon: Sparkles, colour: "#C9A7FF", group: "Settings" },
  { id: "data", label: "Uploaded data", hint: "Files YesBoss learns from", icon: FolderOpen, colour: "#FFD93D", group: "Settings" },
  { id: "understanding", label: "What YesBoss understands", hint: "Your business, written down", icon: Lightbulb, colour: "#FF9FD2", group: "Settings", ownerOnly: true },
  { id: "org-chart", label: "Org chart", hint: "Teams and who reports to whom", icon: Network, colour: "#FFB36B", group: "Settings" },
  { id: "feedback", label: "Send feedback", hint: "Tell us what to improve", icon: MessageSquare, colour: "#FF9FD2", group: "Settings" },
  { id: "signout", label: "Sign out", hint: "", icon: LogOut, colour: "#FF7A6B", group: "Settings" },
];

const PROFILE_IDS: SectionId[] = ["profile", "phone", "organization", "owners", "social"];
const SETTINGS_IDS: SectionId[] = ["notifications", "integrations", "about-you", "data", "org-chart", "feedback"];

const isSectionId = (value: string | null): value is SectionId => !!value && ITEMS.some((i) => i.id === value && i.id !== "signout");

/** Settings for the person's own account and workspace on one screen: a list on the left, the chosen part on the right. */
export default function ProfileHub({ initial }: { initial: SectionId }) {
  const { user, role, signOut } = useAuth();
  const { organization, avatarUrl, avatarStyle } = useOrganizationStore();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  // coming back from the Zoho or Google sign-in page lands on Integrations
  const [oauthBack] = useState(() => typeof window !== "undefined" && /[?&](zoho|google)=connected/.test(window.location.search));

  const isOwner = role === "owner";
  const wanted = params.get("section");
  const chosen = isSectionId(wanted) ? wanted : null; // in the address when a part was opened on purpose
  const fallback: SectionId = oauthBack ? "integrations" : initial;
  const allowed = (id: SectionId) => isOwner || !ITEMS.find((i) => i.id === id)?.ownerOnly;
  const section: SectionId = chosen && allowed(chosen) ? chosen : allowed(fallback) ? fallback : "profile";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter((i) => (isOwner || !i.ownerOnly) && (!q || `${i.label} ${i.hint}`.toLowerCase().includes(q)));
  }, [isOwner, query]);

  const email = user?.email || "";
  const name = email.split("@")[0] || "You";
  const open = (id: Item["id"]) => {
    if (id === "signout") {
      void signOut();
      return;
    }
    router.push(`${pathname}?section=${id}`, { scroll: false });
  };
  const current = ITEMS.find((i) => i.id === section);

  return (
    <DashboardLayout>
      <div className="grid gap-6 lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* the list (on a phone it is the whole page until something is chosen) */}
        <div className={cn("min-w-0 space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pb-2 lg:pr-2", chosen && "hidden lg:block")}>
          <button
            type="button"
            onClick={() => open("profile")}
            className="glass flex w-full cursor-pointer items-center gap-4 rounded-3xl p-4 text-left transition-all hover:-translate-x-px hover:-translate-y-px"
          >
            <Avatar size="lg" src={avatarUrl} seed={email || undefined} dicebearStyle={avatarStyle} fallback={name.charAt(0).toUpperCase()} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-bold capitalize">{name}</span>
              <span className="block truncate text-sm text-text-muted">
                {/* until the role is known, say nothing: guessing "member" showed an owner the wrong label for a moment */}
                <span className="capitalize">{role || "…"}</span>
                {organization?.name ? ` · ${organization.name}` : ""}
              </span>
              <span className="block truncate text-sm text-text-muted">{email}</span>
            </span>
            <ChevronRight className="h-5 w-5 flex-shrink-0 text-text-muted" />
          </button>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className="w-full rounded-full border-[2.5px] border-outline bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-text-muted focus:shadow-[3px_3px_0_var(--shadow-hard)] focus:outline-none"
            />
          </div>

          {visible.length === 0 && <p className="px-2 text-sm text-text-muted">No settings match “{query}”.</p>}

          {(["Account", "Settings"] as const).map((group) => {
            const rows = visible.filter((i) => i.group === group);
            if (!rows.length) return null;
            return (
              <div key={group} className="space-y-2">
                <p className="px-2 text-xs font-extrabold uppercase tracking-wider text-text-muted">{group}</p>
                <div className="glass divide-y divide-border overflow-hidden rounded-3xl p-0" role="list">
                  {rows.map(({ id, label, hint, icon: Icon, colour }) => {
                    const active = id === section;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="listitem"
                        aria-current={active ? "page" : undefined}
                        onClick={() => open(id)}
                        className={cn("flex w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left transition-colors", active ? "bg-surface-light" : "hover:bg-surface-light")}
                      >
                        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border-2 border-outline text-[#111]" style={{ background: colour }}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{label}</span>
                          {hint && <span className="block truncate text-xs text-text-muted">{hint}</span>}
                        </span>
                        {id !== "signout" && <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-muted" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* the chosen part */}
        <div className={cn("min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pb-2 lg:pr-2", !chosen && "hidden lg:block")}>
          <button
            type="button"
            onClick={() => router.push(pathname, { scroll: false })}
            className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold lg:hidden"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="mb-4 text-2xl font-bold">{current?.label}</h1>

          {/* the profile cards stay mounted so a half-filled form survives a visit elsewhere */}
          <div hidden={!PROFILE_IDS.includes(section)}>
            <ProfileSections section={PROFILE_IDS.includes(section) ? (section as ProfileSection) : "profile"} />
          </div>
          {SETTINGS_IDS.includes(section) && <SettingsSections tab={section as SettingsTab} />}
          {section === "appearance" && <AppearanceCard />}
          {section === "understanding" && isOwner && <UnderstandingView />}
        </div>
      </div>
    </DashboardLayout>
  );
}

const LOOKS = [
  { id: "pop", label: "Pop", hint: "Bold tiles and thick outlines", dots: ["#FFD93D", "#7CC8FF", "#FF9FD2"] },
  { id: "aurora", label: "Aurora", hint: "Soft glass and a gentle glow", dots: ["#5EEAD4", "#7DD3FC", "#C4B5FD"] },
  { id: "paper", label: "Paper", hint: "Quiet, flat and easy to read", dots: ["#EADFB4", "#C8DCEC", "#EBCFD9"] },
] as const;

function AppearanceCard() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const skin = useUIStore((s) => s.skin);
  const setSkin = useUIStore((s) => s.setSkin);
  const options = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "Match my device", icon: Monitor },
  ] as const;
  return (
    <Card>
      <CardContent className="space-y-5 p-1">
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <LifeBuoy className="h-4 w-4" /> Choose how YesBoss looks. It is remembered on this device.
        </p>
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-text-muted">Look</p>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Look">
            {LOOKS.map(({ id, label, hint, dots }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={skin === id}
                onClick={() => setSkin(id)}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-2xl border-[2.5px] border-outline p-3 text-left transition-all hover:-translate-x-px hover:-translate-y-px",
                  skin === id ? "bg-highlight text-on-highlight shadow-[3px_3px_0_var(--shadow-hard)]" : "bg-surface text-foreground"
                )}
              >
                <span className="flex gap-1.5" aria-hidden="true">
                  {dots.map((c) => (
                    <span key={c} className="h-5 w-5 rounded-full border-2 border-outline" style={{ background: c }} />
                  ))}
                </span>
                <span className="block text-sm font-bold">{label}</span>
                <span className="block text-xs opacity-80">{hint}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-text-muted">Light or dark</p>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Theme">
          {options.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              onClick={() => setTheme(id)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-full border-[2.5px] border-outline px-5 py-2.5 text-sm font-bold shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px",
                theme === id ? "bg-highlight text-on-highlight" : "bg-surface text-foreground"
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
