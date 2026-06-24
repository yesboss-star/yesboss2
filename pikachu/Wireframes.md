# Wireframes

## YesBoss — AI-Powered Enterprise Intelligent System and Digital CEO Layer

| Field | Value |
|-------|-------|
| **Document ID** | UX-YB-002 |
| **Document Owner** | UX / Product Design |
| **Version** | 1.0 |
| **Status** | Final Draft |
| **Date** | June 2026 |
| **Classification** | Internal — Confidential |
| **Related Docs** | DS-YB-001 (`pikachu/Design-System.md`), PRD-YB-001 (`pikachu/PRD.md`) |

---

## Table of Contents

1. Layout Structure & Grid
2. Landing Page
3. Authentication Screens
4. Owner Onboarding Wizard
5. Dashboard (Owner + Employee)
6. Executive Chat
7. Task Pipeline (Board + List)
8. Goal Detail
9. AI Assistant
10. Notifications
11. Reports
12. Settings & Zoho Integration
13. Mobile Responsive Adaptations
14. Component States Per Screen
15. Codebase File Map

---

## 1. Layout Structure & Grid

### 1.1 App Shell (All Authenticated Pages)

```
┌──────────────────────────────────────────────────────────────┐
│  NAVBAR (fixed top, h=64px)                                  │
│  [YESBOSS Logo 32px]    [Dashboard] [Chat] [Goals] [Tasks]   │
│  [Data] [Market]                              🔔 (badge) 👤  │
├────────────────┬─────────────────────────────────────────────┤
│                │                                              │
│  SIDEBAR       │  MAIN CONTENT AREA (flexible, scroll)        │
│  w=250px       │  padding: 32px desktop / 16px mobile         │
│  bg=Gray-50    │                                              │
│  border-right   │  ┌─ KPI Card ─┐ ┌─ KPI Card ─┐ ┌─ KPI ─┐  │
│  Gray-200      │  │ w=220px    │ │ w=220px    │ │ w=220 │  │
│                │  │ h=120px    │ │ h=120px    │ │ h=120 │  │
│  [Dashboard] 🏠│  └────────────┘ └────────────┘ └───────┘  │
│  [Chat]      💬│                                              │
│  [Goals]     🎯│  ┌─ Insight Card (full width) ────────────┐ │
│  [Tasks]     ✅│  │ h=auto, min-h=80px                       │ │
│  [Data]      📁│  └──────────────────────────────────────────┘ │
│  [Market]    📊│                                              │
│  [Reports]   📋│  ┌─── Module ───┐ ┌─── Module ───┐          │
│  [Team]      👥│  │ w=1fr       │ │ w=1fr       │          │
│  [Settings]  ⚙│  │ h=200px     │ │ h=200px     │          │
│                │  └──────────────┘ └──────────────┘          │
├────────────────┴─────────────────────────────────────────────┤
│  FOOTER (minimal, h=48px) "© 2026 YesBoss. All rights reserved."│
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Responsive Breakpoints

| Device | Width | Nav | Sidebar | Columns | Gutter | Margin |
|--------|-------|-----|---------|---------|--------|--------|
| Mobile | 360-428px | Bottom nav (56px, 5 tabs) | Hidden | 1 | 16px | 16px |
| Tablet | 768-1024px | Top nav (64px) | Collapsed (icons only, 60px) | 2 | 24px | 24px |
| Desktop | 1280-1536px | Top nav (64px) | Expanded (250px) | 3-4 | 24px | 32px |

### 1.3 Spacing Grid (4px Base)

| Token | Value | Usage |
|-------|-------|-------|
| space-1 | 4px | Icon padding, tiny gaps |
| space-2 | 8px | Element gaps, button icon spacing |
| space-3 | 12px | Button padding, chip padding |
| space-4 | 16px | Card padding, section gaps |
| space-5 | 20px | Modal padding |
| space-6 | 24px | Between sections |
| space-8 | 32px | Page padding (desktop), section margins |
| space-10 | 40px | Page section padding |
| space-12 | 48px | Large section spacing |

**Touch targets:** All interactive elements ≥44×44px on mobile (WCAG 2.5.5).

---

## 2. Landing Page

### 2.1 Desktop Layout (1280px+)

```
┌──────────────────────────────────────────────────────────────────┐
│  NAVBAR (h=72px, bg=transparent → solid on scroll, z-50)         │
│  [YESBOSS Logo]  Features ▼  Pricing  About    [Login] [Get Start│
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ HERO ──────────────────────────────────────────────────────┐  │
│  │  padding: 80px 32px (top/bottom=80px)                        │  │
│  │                                                               │  │
│  │  "An AI-Powered Enterprise Intelligent System" // h1, 36px   │  │
│  │  "and Digital CEO Layer for Modern Organizations"  // h1      │  │
│  │                                                               │  │
│  │  "AI that understands your business deeply" // body, Gray-500 │  │
│  │                                                               │  │
│  │  [Get Started Free — Primary btn, lg]  [Watch Demo — Ghost   │  │
│  │                                                               │  │
│  │  ┌── Social Proof ────────────┐  ┌── Stats ───────────┐      │  │
│  │  │ ★★★★★ 4.8/5 from 200+     │  │ 10K+ Businesses    │      │  │
│  │  └────────────────────────────┘  └────────────────────┘      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ FEATURES ──────────────────────────────────────────────────┐  │
│  │  padding: 64px 32px  h2: "Everything you need"              │  │
│  │                                                             │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────┐ │  │
│  │  │ AI COO      │ │ AI Tasks    │ │ Org Health  │ │Exec  │ │  │
│  │  │ icon=64px   │ │ icon=64px   │ │ icon=64px   │ │Chat  │ │  │
│  │  │ body-sm     │ │ body-sm     │ │ body-sm     │ │      │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └──────┘ │  │
│  │  gap=24px, 4 columns desktop, 2 tablet, 1 mobile          │  │
│  │                                                             │  │
│  │  [Feature Highlight Card — full width, h=320px]            │  │
│  │  "Set up in minutes. AI scans, detects, learns."           │  │
│  │  [Image: onboarding flow screenshot]                       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ DASHBOARD PREVIEW ────────────────────────────────────────┐  │
│  │  padding: 64px 32px  "See your business health at a glance" │  │
│  │  [Dashboard screenshot/mockup — w=100%, max-h=500px]        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ INTEGRATIONS ─────────────────────────────────────────────┐  │
│  │  padding: 48px 32px  logo row (Zoho, Google, etc.)          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ TESTIMONIALS ─────────────────────────────────────────────┐  │
│  │  3 cards: w=380px each, avatar+name+quote+rating            │  │
│  │  desktop: 3 columns, tablet: 1 row scroll, mobile: 1 col   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ FAQ ──────────────────────────────────────────────────────┐  │
│  │  padding: 48px 32px  5+ items, accordion, Radix Collapsible │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ CTA ──────────────────────────────────────────────────────┐  │
│  │  padding: 64px 32px  bg=Primary-50                         │  │
│  │  "Ready to transform how you run your business?"           │  │
│  │  [Get Started Free] [Talk to Sales]                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ FOOTER ────────────────────────────────────────────────────┐  │
│  │  padding: 32px 32px  4 columns: Logo, Product, Company, Legal│ │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Mobile Layout (<640px)

```
┌──────────────────────┐
│ [≡]  YESBOSS  [Login]│  // h=56px, burger opens nav drawer
├──────────────────────┤
│                       │
│ "An AI-Powered        │  // h1, 28px, centered
│ Enterprise            │
│ Intelligent System    │
│ and Digital CEO Layer"│
│                       │
│ [Get Started Free]    │  // full-width button (w=100%)
│                       │
│ ┌─ Feature ────────┐  │  // single column, stacked
│ │ AI COO           │  │  // h=auto, min-h=180px
│ └──────────────────┘  │
│ ┌─ Feature ────────┐  │
│ │ AI Tasks         │  │
│ └──────────────────┘  │
│ ┌─ Feature ────────┐  │
│ │ Org Health       │  │
│ └──────────────────┘  │
│ ┌─ Feature ────────┐  │
│ │ Exec Chat        │  │
│ └──────────────────┘  │
│                       │
│ [Get Started Free]    │  // full-width
│                       │
│ Footer (collapsed)    │
└──────────────────────┘
```

---

## 3. Authentication Screens

### 3.1 Signup — Step 1: Phone (w=480px max, centered)

```
┌──────────────────────────────────────┐
│  ← Back                    Step 1/4  │  // h=48px, back button left
│                                      │
│  [YESBOSS Logo — h=40px]            │
│                                      │
│  "Create your account"     // h1     │
│  "Start your 14-day free trial"//body│
│                                      │
│  Full Name                           │  // label, caption font
│  ┌──────────────────────────────────┐│  // Input, h=40px
│  │ John Doe                         ││
│  └──────────────────────────────────┘│
│                                      │
│  Phone Number                        │
│  ┌────────┬─────────────────────────┐│
│  │ +91 ▼  │ 98765 43210             ││  // country code: 80px, dropdown
│  └────────┴─────────────────────────┘│  // phone: flex-1
│                                      │
│  [Send OTP]                          │  // Primary btn, lg, w=100%
│                                      │
│  ──── or continue with ────          │  // divider
│                                      │
│  [Google] [Email]                    │  // ghost buttons, icon+text
│                                      │
│  Already have an account? [Login]    │  // body-sm, link
│  └────────────────────────────────────┘
```

### 3.2 Signup — Step 2: OTP

```
┌──────────────────────────────────────┐
│  ← Back                    Step 2/4  │
│                                      │
│  "Verify your phone"                 │  // h1
│  "Enter the code sent to +91 98765•••"│ // body
│                                      │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐     │  // 6 boxes, 48×48px each
│  │  │ │  │ │  │ │  │ │  │ │  │     │  // border radius-md
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘     │  // focus: primary ring
│                                      │
│  "Resend OTP in 45s"                │  // body-sm, Gray-500
│                                      │
│  [Verify OTP]                        │  // disabled until 6 digits
│                                      │
│  "Didn't receive? [Resend OTP]"      │  // link, enabled after 30s
└──────────────────────────────────────┘
```

### 3.3 Signup — Step 4: Role Selection

```
┌──────────────────────────────────────┐
│  ← Back                    Step 4/4  │
│                                      │
│  [YESBOSS Logo]                      │
│                                      │
│  "You're almost there!"              │  // h1
│  "How will you use YesBoss?"        │  // body
│                                      │
│  ┌── Owner Card ───────────────────┐ │  // h=160px, border radius-lg
│  │  👑 Icon (48px)                  │ │  // hover: shadow-md, cursor: pointer
│  │  "I'm a Business Owner"          │ │  // h3
│  │  "I want to manage my org"       │ │  // body-sm
│  │  [Selected: Primary-500 border 2px]│
│  └──────────────────────────────────┘ │
│                                      │
│  ┌── Employee Card ────────────────┐ │
│  │  👤 Icon (48px)                  │ │
│  │  "I'm an Employee"              │ │
│  │  "My company uses YesBoss"      │ │
│  └──────────────────────────────────┘ │
│                                      │
│  [Continue]                          │  // disabled until selection
└──────────────────────────────────────┘
```

### 3.4 Login

```
┌──────────────────────────────────────┐
│  [YESBOSS Logo]                      │
│                                      │
│  "Welcome back"                      │  // h1
│                                      │
│  ┌────────────────┐┌────────────────┐│  // Tabs, Radix Tabs
│  │  Email Login   ││  Phone OTP    ││  // selected: bottom border 2px Primary
│  └────────────────┘└────────────────┘│
│                                      │
│  [Tab: Email]                        │
│  Email                               │
│  ┌──────────────────────────────────┐│
│  │ john@company.com                 ││
│  └──────────────────────────────────┘│
│                                      │
│  Password                            │
│  ┌────────────────────────┬─────────┐│
│  │  •••••••••••••••••••  │ 👁 show  ││  // show/hide toggle
│  └────────────────────────┴─────────┘│
│                                      │
│  [Forgot Password?]                  │  // link, right-aligned
│                                      │
│  [Login]                             │  // Primary btn, w=100%
│                                      │
│  Don't have an account? [Sign Up]    │
│                                      │
│  [Tab: Phone OTP]                    │
│  Same as signup OTP flow            │
└──────────────────────────────────────┘
```

### 3.5 Forgot Password — Step 1

```
┌──────────────────────────────────────┐
│  ← Back                              │
│                                      │
│  [YESBOSS Logo]                      │
│                                      │
│  "Reset your password"               │  // h1
│  "Enter your email to receive OTP"   │  // body
│                                      │
│  Email                               │
│  ┌──────────────────────────────────┐│
│  │ john@company.com                 ││
│  └──────────────────────────────────┘│
│                                      │
│  [Send OTP]                          │  // Primary btn, w=100%
│                                      │
│  ← Back to [Login]                   │
└──────────────────────────────────────┘
```

---

## 4. Owner Onboarding Wizard

### 4.1 Step 1: Domain Analysis — Loading State

```
┌──────────────────────────────────────────────────────────┐
│  YESBOSS              Step 1 of 10  ●○○○○○○○○○            │  // stepper
├──────────────────────────────────────────────────────────┤
│                                                           │
│  "Analyzing your business..."                  // h1      │
│                                                           │
│  ┌── Progress ────────────────────────────────────────┐   │
│  │  ████████████░░░░░░░░░░░░░░░░░░  45%                │   │  // ProgressBar
│  │  [Skeleton shimmer animation]                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                           │
│  ┌── Step 1: 🔍 Scanning website ──────────────────────┐   │
│  │  Found: company.com, /about, /services               │   │  // ✅ complete
│  └─────────────────────────────────────────────────────┘   │
│                                                           │
│  ┌── Step 2: ◌ Detecting industry ─────────────────────┐   │
│  │  Analyzing content...  [spinner]                     │   │  // ◌ in progress
│  └─────────────────────────────────────────────────────┘   │
│                                                           │
│  ┌── Step 3: ◌ Finding social profiles ────────────────┐   │
│  │  Searching 6 platforms...                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                           │
│  ! No website: manual form appears below                  │
│  ! Scrape blocked: "Using search fallback"               │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Step 1: Domain Analysis — Results (Success State)

```
┌──────────────────────────────────────────────────────────┐
│  YESBOSS              Step 1 of 10  ●○○○○○○○○○            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ✅ "We found your company!"                    // h1     │
│                                                           │
│  ┌── Company Info ────────────────────────────────────┐   │
│  │  Name:    [Acme Corp                         ▼]     │   │  // editable input
│  │  Website: [https://acmecorp.com               ▼]    │   │
│  │  Industry:[FinTech & Payments              ▼]       │   │  // dropdown
│  │  Size:    [51-200 employees               ▼]        │   │
│  │                                                     │   │
│  │  Description (AI-generated):                        │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │ Acme Corp is a FinTech company specializing  │   │   │  // Textarea
│  │  │ in digital lending solutions for SMBs...     │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  "Edit any field if needed"                     // body-sm│
│  [Looks Good — Continue →]                // Primary btn  │
│                                                           │
│  ! No website found: manual form [Name] [Website] ...     │
└──────────────────────────────────────────────────────────┘
```

### 4.3 Step 5: Industry Selection

```
┌──────────────────────────────────────────────────────────┐
│  YESBOSS              Step 5 of 10  ●●●●○●●○○○○            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  "Confirm your industry"                        // h1     │
│                                                           │
│  ┌── Industry ─────────────────────────────────────────┐  │
│  │  ⭐ AI Suggestion: FinTech & Payments                │  │  // confidence badge
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │ FinTech & Payments                         ▼ │   │  │  // Select
│  │  └───────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌── Micro-Vertical ──────────────────────────────────┐  │
│  │  ⭐ AI Suggestion: Digital Lending                  │  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │ Digital Lending                            ▼ │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  [Continue →]                                             │
│                                                           │
│  ! Confidence <0.6: "We're not sure" + top 3 suggestions  │
│  ! AI unavailable: full taxonomy dropdown                 │
└──────────────────────────────────────────────────────────┘
```

### 4.4 Step 6: Social Detection

```
┌──────────────────────────────────────────────────────────┐
│  YESBOSS              Step 6 of 10  ●●●●●○●●○○○            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  "Connect your social presence"                  // h1    │
│                                                           │
│  ┌── Social Profiles ─────────────────────────────────┐  │
│  │                                                      │  │
│  │  ✅ LinkedIn     /company/acmecorp      [Verified]   │  │  // green
│  │  ✅ Twitter/X    @acmecorp                [Verified]  │  │
│  │  ⚠ Instagram    @acmecorpp               [Edit]      │  │  // yellow
│  │  ✗ Facebook     Not found                 [Add]      │  │  // grey
│  │  ✗ YouTube      Not found                 [Add]      │  │
│  │                                                      │  │
│  │  [Detecting] → [Complete] → user confirms/edits     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  [Continue →]                                             │
│                                                           │
│  ! All failed: "We couldn't find profiles" + manual form  │
└──────────────────────────────────────────────────────────┘
```

### 4.5 Step 7: AI Persona Chat

```
┌──────────────────────────────────────────────────────────┐
│  YESBOSS              Step 6 of 10  ●●●●●●○●●○            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌── Chat Container ──────────────────────────────────┐   │
│  │  max-h=480px, overflow-y=scroll                     │   │
│  │                                                     │   │
│  │  ┌── AI Bubble ─────────────────────────────────┐   │   │
│  │  │  🤖 Hi! I'm your AI co-founder.               │   │   │
│  │  │  What are your top 3 goals for this quarter?  │   │   │
│  │  │  ──────────────────────────────────────────   │   │   │
│  │  │  Avatar: 40px circle, AI icon                │   │   │
│  │  │  bg: Gray-50, border-radius: 4px 16px 16px   │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │  ┌── User Bubble ───────────────────────────────┐   │   │
│  │  │  👤 We want to increase MRR by 20%, reduce    │   │   │
│  │  │  churn from 8% to 5%, and hire 5 engineers.  │   │   │
│  │  │  bg: Primary-50, border-radius: 16px 4px     │   │   │
│  │  │  16px 16px, max-width: 70%                   │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │  ┌── AI Bubble (follow-up) ──────────────────────┐  │   │
│  │  │  🤖 Great goals! Let's talk about MRR first.  │   │   │
│  │  │  What's your current MRR and which channels   │   │   │
│  │  │  drive most revenue?                           │   │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                                     │   │
│  │  ┌── Chat Input ────────────────────────────────┐   │   │
│  │  │  [Type your message...              ] [Send] │   │   │
│  │  │  h=56px, border Gray-200, radius-lg          │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │  Profile Understanding: ████████████░░░░░ 65%      │   │  // ProgressBar
│  │  [Progress: understanding_level from LangGraph]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                           │
│  ! AI retry: "Let me think about that..."                 │
│  ! Skip: "Almost there! Just a few more."                │
│  ! Network interrupt: state preserved in store            │
└──────────────────────────────────────────────────────────┘
```

### 4.6 Step 8: Goal Suggestions

```
┌──────────────────────────────────────────────────────────┐
│  YESBOSS              Step 8 of 10  ●●●●●●●○○○            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  "Based on our conversation, I recommend:"      // h1    │
│                                                           │
│  ┌── Goal 1 ──────────────────────────────────────────┐  │
│  │  📈 "Increase Monthly Recurring Revenue by 20%"     │  │  // h3
│  │  "Based on your growth priority conversation..."    │  │  // body-sm
│  │  [Accept ✅] [Edit ✏️] [Reject ❌]                   │  │  // buttons
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌── Goal 2 ──────────────────────────────────────────┐  │
│  │  🎯 "Reduce Customer Churn Rate to under 5%"        │  │
│  │  "...your churn concern identified in chat..."      │  │
│  │  [Accept] [Edit] [Reject]                           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌── Goal 3 ──────────────────────────────────────────┐  │
│  │  👥 "Hire 5 Senior Engineers for Product Team"      │  │
│  │  "...team structure expansion need identified..."   │  │
│  │  [Accept] [Edit] [Reject]                           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  [+ Add Custom Goal]                       // ghost btn  │
│                                                           │
│  [Generate Strategies →]      // Primary btn, disabled    │
│  ! enabled when ≥1 goal accepted                          │
│                                                           │
│  ! AI returns <3: pad with defaults                       │
│  ! AI fails: manual creation mode                         │
└──────────────────────────────────────────────────────────┘
```

### 4.7 Step 10: Welcome

```
┌──────────────────────────────────────────────────────────┐
│  YESBOSS              Step 10 of 10 ●●●●●●●●●●            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  🎉 "Congratulations!"                           // h1    │
│  "Your AI-powered business intelligence system is ready!" │
│                                                           │
│  ┌── Summary Cards (2×2 grid, gap=16px) ──────────────┐  │
│  │                                                      │  │
│  │  ┌──────┐  ┌──────┐                                 │  │
│  │  │ 📊   │  │ 📋   │                                 │  │
│  │  │ 3    │  │ 12   │   // display font (36px)        │  │
│  │  │Goals │  │Tasks │   // body-sm                     │  │
│  │  │Crtd  │  │Gen'd │                                 │  │
│  │  └──────┘  └──────┘                                 │  │
│  │                                                      │  │
│  │  ┌──────┐  ┌──────┐                                 │  │
│  │  │ 👥   │  │ 📁   │                                 │  │
│  │  │ 0    │  │ 5    │                                 │  │
│  │  │Team  │  │Docs  │                                 │  │
│  │  │Membrs│  │Proc'd│                                 │  │
│  │  └──────┘  └──────┘                                 │  │
│  │  [Invite Teammates →]                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  [🚀 Go to My Dashboard]  // Primary btn, lg              │
│                                                           │
│  "Your dashboard is personalized based on your inputs."   │
│  ! Save fails: retry with exponential backoff             │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Dashboard

### 5.1 Owner Dashboard — Desktop (1280px)

```
┌──────────────────────────────────────────────────────────────────┐
│  YESBOSS                                    🔔 3  John ▼        │
├────────────┬─────────────────────────────────────────────────────┤
│ SIDEBAR    │  MAIN (padding: 32px)                                │
│ 250px      │                                                      │
│            │  "Good morning, John!" // h1                         │
│ Dashboard  │  "Here's your business at a glance" // body          │
│ 🔍 Chat    │                                                      │
│ 🎯 Goals   │  ┌── KPI Row ─────────────────────────────────────┐  │
│ ✅ Tasks   │  │  gap=16px, 4 columns (→2 tablet →1 mobile)    │  │
│ 📁 Data    │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │  │
│ 📊 Market  │  │  │ 📊   │ │ ✅   │ │ 👥   │ │ 📋   │         │  │
│ 📋 Reports │  │  │ 5    │ │ 78%  │ │ 12   │ │ 8    │         │  │
│ 👥 Team    │  │  │Goals │ │Cmpltn│ │Team  │ │Tasks │         │  │
│ ⚙ Settings │  │  │      │ │Rate  │ │Size  │ │Due   │         │  │
│            │  │  │      │ │↑12%  │ │      │ │      │         │  │
│            │  │  └──────┘ └──────┘ └──────┘ └──────┘         │  │
│            │  └────────────────────────────────────────────────┘  │
│            │                                                      │
│            │  ┌─ AI Insight Card ──────────────────────────────┐  │
│            │  │  💡 Your team completed 12 tasks this week,    │  │
│            │  │  20% above last week. Goal "Reduce Churn"     │  │
│            │  │  is on track at 72%. [Chat about this →]      │  │
│            │  └────────────────────────────────────────────────┘  │
│            │                                                      │
│            │  ┌── Modules ─────────────────────────────────────┐  │
│            │  │  [Founder][Finance][Operations][Productivity]  │  │  // Tabs
│            │  │  [Workflow]                                    │  │
│            │  │                                                 │  │
│            │  │  ┌──────┐ ┌──────┐ ┌───────────────────┐      │  │
│            │  │  │Foundr│ │Financ│ │ Operations        │      │  │
│            │  │  │ 85   │ │ 72   │ │ 68                │      │  │  // Score cards
│            │  │  │+5%   │ │+2%   │ │ -3%               │      │  │
│            │  │  └──────┘ └──────┘ └───────────────────┘      │  │
│            │  └────────────────────────────────────────────────┘  │
│            │                                                      │
│            │  ┌── Right Panel ─────────────────────────────────┐  │
│            │  │  ┌── Org Health Gauge ──────────────────┐     │  │
│            │  │  │       74/100                         │     │  │  // semicircular
│            │  │  │    ████████████████░░░░░░░           │     │  │  // gauge
│            │  │  │    "Good" — Color: Primary-500       │     │  │
│            │  │  └──────────────────────────────────────┘     │  │
│            │  │                                                 │  │
│            │  │  ┌── AI Summary Chat ──────────────────────┐   │  │
│            │  │  │ "Ask me anything..."                [→] │   │  │
│            │  │  └────────────────────────────────────────┘   │  │
│            │  └───────────────────────────────────────────────┘  │
│            │                                                      │
│            │  ! No data: KPIs show "0" with label                │
│            │  ! DB timeout: cached values + "Data may be delayed"│
└────────────┴──────────────────────────────────────────────────────┘
```

### 5.2 Employee Dashboard — Desktop

```
┌──────────────────────────────────────────────────────────────────┐
│  YESBOSS                                    🔔 1  Amit ▼        │
├────────────┬─────────────────────────────────────────────────────┤
│            │  "Welcome back, Amit!"                    // h1    │
│ Dashboard  │  "You have 4 tasks due this week" // body          │
│ 💬 Assist  │                                                      │
│ 🎯 Goals   │  ┌── My Tasks ────────────────────────────────────┐  │
│ ✅ Tasks   │  │  ○ Update homepage copy        Due: Jun 22    │  │
│ 📁 Data    │  │  ○ Review Q3 proposal          Due: Jun 23    │  │
│ 👥 Team    │  │  ● Fix login bug (IN PROGRESS) Due: Jun 24    │  │
│ ⚙ Settings │  │  ○ Prepare weekly report        Due: Jun 25    │  │
│            │  │  max 10 shown, sorted by deadline asc          │  │
│            │  │  "View All" → /tasks                          │  │
│            │  └───────────────────────────────────────────────┘  │
│            │                                                      │
│            │  ┌── Pending Reviews ─────────────────────────────┐  │
│            │  │  2 tasks awaiting your approval                │  │
│            │  │  [Review →]                                    │  │
│            │  └───────────────────────────────────────────────┘  │
│            │                                                      │
│            │  ┌── Team Updates ───────────────────────────────┐  │
│            │  │  🎯 Sarah completed "Design new landing page" │  │
│            │  │  📋 3 tasks created in Engineering dept       │  │
│            │  │  ⏰ Reminder: Standup in 15 min               │  │
│            │  │  [View All →]                                 │  │
│            │  └───────────────────────────────────────────────┘  │
│            │                                                      │
│            │  ┌── AI Insight ──────────────────────────────────┐  │
│            │  │  💡 "You complete most tasks before noon.      │  │
│            │  │  Schedule deep work in the morning."          │  │
│            │  └───────────────────────────────────────────────┘  │
│            │                                                      │
│            │  ! No tasks: "No tasks assigned" + CTA              │
└────────────┴──────────────────────────────────────────────────────┘
```

### 5.3 Dashboard — Mobile (360px)

```
┌─────────────────────┐
│ [≡] YESBOSS    🔔 3 │  // Top nav, h=56px
├─────────────────────┤
│                     │
│ "Good morning!"     │  // h1, 22px
│                     │
│ ┌── KPI Row ──────┐ │  // 2×2 grid, gap=8px
│ │ ┌────┐ ┌────┐   │ │
│ │ │ 5  │ │ 78%│   │ │
│ │ │Gls │ │Cmplt│  │ │
│ │ └────┘ └────┘   │ │
│ │ ┌────┐ ┌────┐   │ │
│ │ │ 12 │ │ 8  │   │ │
│ │ │Team│ │Dues│   │ │
│ │ └────┘ └────┘   │ │
│ └─────────────────┘ │
│                     │
│ ┌─ Insight ───────┐ │
│ │ 💡 Team completed│ │
│ │ 12 tasks this   │ │
│ │ week (+20%)     │ │
│ └─────────────────┘ │
│                     │
│ ┌─ Module ────────┐ │
│ │ Founder: 85     │ │  // single card, tap to switch
│ │ ↑5%             │ │
│ └─────────────────┘ │
│                     │
│ [Bottom Nav]        │  // h=56px, 5 tabs
│ [🏠][💬][🎯][✅][⚙] │  // Home, Chat, Goals, Tasks, More
└─────────────────────┘
```

---

## 6. Executive Chat

### 6.1 Desktop Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  YESBOSS                         Executive Chat    John ▼       │
├──────────────────────────────────────────────────────────────────┤
│  ┌── Chat Container ──────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌── User Message ──────────────────────────────────────┐  │  │
│  │  │  "How is our financial health this quarter?"        │  │  │
│  │  │  10:32 AM                                    👤 You │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌── AI Typing Indicator ──────────────────────────────┐  │  │
│  │  │  🤖 Consulting Finance, Operations, Strategy...     │  │  │
│  │  │  [animated dots ●●○]                                │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌── AI Response ───────────────────────────────────────┐  │  │
│  │  │  🤖 Here's your financial overview:                  │  │  │
│  │  │                                                       │  │  │
│  │  │  ┌── 💰 Finance (collapsible) ───────────────────┐   │  │  │
│  │  │  │  Revenue: +22% QoQ to $500K                    │   │  │  │
│  │  │  │  Cash flow: Positive at $120K                  │   │  │  │
│  │  │  │  Burn rate: $85K/month                         │   │  │  │
│  │  │  └──────────────────────────────────────────────┘   │  │  │
│  │  │                                                       │  │  │
│  │  │  ┌── ⚙️ Operations (collapsible) ─────────────────┐  │  │  │
│  │  │  │  Team capacity: 78% — No critical bottlenecks  │  │  │  │
│  │  │  └──────────────────────────────────────────────┘  │  │  │
│  │  │                                                       │  │  │
│  │  │  ┌── 📈 Strategy (collapsible) ───────────────────┐  │  │  │
│  │  │  │  Market conditions favorable. Consider SME     │  │  │  │
│  │  │  │  segment expansion based on your data.         │  │  │  │
│  │  │  └──────────────────────────────────────────────┘  │  │  │
│  │  │                                                       │  │  │
│  │  │  ┌── Action Items ───────────────────────────────┐   │  │  │
│  │  │  │  📝 [Add as Task] "Review SME market expansion"│  │  │  │
│  │  │  │  📝 [Add as Task] "Schedule budget review"    │  │  │  │
│  │  │  └──────────────────────────────────────────────┘   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌── Chat Input ──────────────────────────────────────┐   │  │
│  │  │  [Type your message...                     ] [Send]│  │  │
│  │  │  h=56px, radius-lg, Gray-200 border                │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌── Right Panel ────────────────────────────────────────────┐  │
│  │  Expert Agents:                                            │  │
│  │  [💰 Finance] [⚙️ Ops] [📈 Strategy]                     │  │
│  │  [👥 HR] [📊 Sales] [📦 Product]                         │  │
│  │                                                             │  │
│  │  Quick Questions:                                           │  │
│  │  [How is cash flow?]                                       │  │
│  │  [Any bottlenecks?]                                        │  │
│  │  [Team performance?]                                       │  │
│  │  [Revenue trends?]                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                │
│  ! All agents fail: "I'm unable to respond right now" + retry  │
│  ! Long response: collapsed with "Show more"                  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Mobile Chat

```
┌─────────────────────┐
│ ← Executive Chat    │  // back, h=56px
├─────────────────────┤
│                     │
│ User bubble (right) │
│ AI bubble (left)    │
│                     │
│ ┌── Action Items ─┐│
│ │ 📝 Review...    ││
│ └─────────────────┘│
│                     │
│ ┌─────────────────┐│
│ │ Message... [→]   ││
│ └─────────────────┘│
└─────────────────────┘
```

---

## 7. Task Pipeline

### 7.1 Board View (Desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│  YESBOSS                        Tasks    Board ▼      + New Task│
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  Filters: [Status: All ▼] [Priority: All ▼] [Assignee: ▼]   ││
│  │  [Search tasks...                            🔍]             ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐   │
│  │  Todo   │ │ In Prog │ │ Review  │ │  Done   │ │ Blocked  │   │
│  │    3    │ │    2    │ │    1    │ │    5    │ │    0     │   │
│  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤ ├──────────┤   │
│  │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │          │   │
│  │ │Task │ │ │ │Task │ │ │ │Task │ │ │ │Task │ │ │  (empty) │   │
│  │ │Card │ │ │ │Card │ │ │ │Card │ │ │ │Card │ │ │          │   │
│  │ │     │ │ │ │     │ │ │ │     │ │ │ │     │ │ │          │   │
│  │ │🔴   │ │ │ 🟡   │ │ │ │ 🔵  │ │ │ │ ✅  │ │ │          │   │
│  │ │Titl │ │ │Titl  │ │ │ │Titl │ │ │ │Titl │ │ │          │   │
│  │ │Jun25│ │ │Jun27 │ │ │ │Jun28│ │ │ │Jun20│ │ │          │   │
│  │ │ 👤  │ │ │ 👤   │ │ │ │ 👤  │ │ │ │ 👤  │ │ │          │   │
│  │ └─────┘ │ └─────┘ │ └─────┘ │ │ └─────┘ │ │          │   │
│  │ ┌─────┐ │ ┌─────┐ │ ┌─────┐ │ │ ┌─────┐ │ │          │   │
│  │ │Task │ │ │Task │ │ │ │     │ │ │ │Task │ │ │          │   │
│  │ │Card │ │ │Card │ │ │ │     │ │ │ │Card │ │ │          │   │
│  │ └─────┘ │ └─────┘ │ └─────┘ │ │ └─────┘ │ │          │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────────┘   │
│                                                                   │
│  Task Card (w=240px, h=auto):                                    │
│  ┌────────────────────────┐                                      │
│  │ 🟡 "Update homepage"   │  // priority dot + title             │
│  │ Due: Jun 23     OVERDUE│  // deadline + red badge if overdue  │
│  │ 👤 Amit                │  // assignee avatar (24px) + name    │
│  │ 📎 Q3 Product Launch   │  // goal tag                         │
│  └────────────────────────┘                                      │
│                                                                   │
│  ! Empty column: "No tasks" + CTA                                │
│  ! Drag invalid: toast with error message                        │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 List View

```
┌──────────────────────────────────────────────────────────────────┐
│  [Status: All ▼] [Priority: ▼] [Assignee: ▼] [Search...] 📋📊  │
├──────────────────────────────────────────────────────────────────┤
│  ☐ Title                    Status    Priority  Assignee  Due   │
│  ──────────────────────────────────────────────────────────────  │
│  ☐ Update homepage copy    In Prog   🟡 High   Amit      Jun 22│
│  ☐ Review Q3 proposal      Todo      🔵 Med    Priya     Jun 23│
│  ☐ Fix login bug           Review    🔴 Crit   Raj       Jun 20│  // overdue
│  ☐ Prepare weekly report   Todo      ⚪ Low    Amit      Jun 25│
│                                                                   │
│  Page 1 of 3  [< Prev] [1] [2] [3] [Next >]                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Goal Detail Page

```
┌──────────────────────────────────────────────────────────────────┐
│  YESBOSS                           Goals    ← Back to Goals    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  🎯 "Increase MRR by 20%"            Status: ● Active           │
│  Sales Dept  |  Jun 1 — Sep 30, 2026                              │
│                                                                   │
│  "Grow MRR from $100K to $120K through expansion revenue..."     │
│                                                                   │
│  ┌── Progress ────────────────────────────────────────────────┐  │
│  │  Task Completion: 5/12 tasks done (42%)                    │  │
│  │  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  42%              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌── Strategies ──────────────────────────────────────────────┐  │
│  │  ✅ Selected: Launch referral program                        │  │
│  │  [Generate New Strategies] [Chat About Goal]                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌── Tasks ───────────────────────────────────────────────────┐  │
│  │  📋 "Design referral program landing page" — In Progress   │  │
│  │  📋 "Set up referral tracking system" — Todo               │  │
│  │  📋 "Create referral email templates" — Todo               │  │
│  │  [Add Task] [Generate Tasks from AI]                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  [Edit] [Archive] [Delete]                                       │
│                                                                   │
│  ! Archived: all fields immutable                                │
│  ! Delete: confirmation with active task warning                  │
│  ! Empty: "No strategies yet" + CTA                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. AI Assistant (Employee)

```
┌──────────────────────────────────────────────────────────────────┐
│  YESBOSS                        AI Assistant    Amit ▼          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌── Chat ────────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  ┌── User ──────────────────────────────────────────────┐   │  │
│  │  │  "Create a task titled 'Update homepage copy' for    │   │  │
│  │  │  Q3 Launch project, high priority, due next Friday"  │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌── AI Clarification ──────────────────────────────────┐   │  │
│  │  │  "Who should be assigned to this task?"              │   │  │
│  │  │  [Self] [John] [Sarah] [Type name...]               │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌── Confirmation Card ─────────────────────────────────┐   │  │
│  │  │  ┌──────────────────────────────────────────────┐     │  │  │
│  │  │  │  Task Preview                                 │     │  │  │
│  │  │  │  Title: Update homepage copy                  │     │  │  │
│  │  │  │  Priority: High                               │     │  │  │
│  │  │  │  Goal: Q3 Product Launch                      │     │  │  │
│  │  │  │  Assignee: Self                               │     │  │  │
│  │  │  │  Deadline: Jun 28                             │     │  │  │
│  │  │  └──────────────────────────────────────────────┘     │  │  │
│  │  │  [Confirm] [Edit] [Cancel]                            │  │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌── Success ───────────────────────────────────────────┐   │  │
│  │  │  ✅ "Task 'Update homepage copy' created!"           │   │  │
│  │  │  "Priority: High | Due: Jun 28 | Goal: Q3 Launch"   │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌────────────────────────────────────────────────────┐     │  │
│  │  │  [Ask me anything — create a task, find info...]   │     │  │
│  │  └────────────────────────────────────────────────────┘     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ! Intent unclear: "I'm not sure. Could you clarify?"            │
│  ! Cancel mid-flow: "Cancelled. Let me know if you need anything"│
└──────────────────────────────────────────────────────────────────┘
```

---

## 10. Notifications

```
┌──────────────────────────────────────┐
│  🔔 Notifications          [Mark All│
├──────────────────────────────────────┤
│                                      │
│  ┌── Unread ───────────────────────┐ │
│  │  ● 📝 New task: "Update copy"  │ │  // unread dot + icon
│  │    John assigned you — 5m ago  │ │  // body-sm, Gray-500
│  │    ─────────────────────────────│ │
│  │  ● ⏰ Task overdue: "Fix bug"  │ │
│  │    Due was Jun 18 — 2d ago     │ │  // red text for overdue
│  │    ─────────────────────────────│ │
│  │  ● ✅ Task approved: "Design"   │ │
│  │    Approved by Priya — 1h ago  │ │
│  └──────────────────────────────────┘ │
│                                      │
│  ┌── Read ─────────────────────────┐ │
│  │  ○ 📊 Goal update: "MRR 20%"   │ │  // read: grey, no dot
│  │    Status changed to active     │ │
│  │    ─────────────────────────────│ │
│  │  ○ 👥 Sarah joined Engineering  │ │
│  │    2d ago                       │ │
│  └──────────────────────────────────┘ │
│                                      │
│  Page 1 of 2  [1] [2]               │
│                                      │
│  ! Empty: "No notifications yet"    │
└──────────────────────────────────────┘
```

---

## 11. Reports

```
┌──────────────────────────────────────────────────────────────────┐
│  YESBOSS                        Reports                         │
├──────────────────────────────────────────────────────────────────┤
│  [Employee Report] [Org Health] [Summary]                       │
│                                                                   │
│  [Tab: Employee Report]                                           │
│                                                                   │
│  Employee: [Select ▼]    Period: [Last 30 days ▼]               │
│                                                                   │
│  [Generate Report]                                                │
│                                                                   │
│  ┌── Report Card ─────────────────────────────────────────────┐  │
│  │  Amit Kumar — Engineering — May 20 — Jun 20, 2026          │  │
│  │                                                              │  │
│  │  Overall Rating: ● 8.2 / 10 — "Excellent"                  │  │  // gauge
│  │                                                              │  │
│  │  Task Completion: 87% (12/14 tasks completed on time)      │  │  // ProgressBar
│  │                                                              │  │
│  │  Strengths:                                                  │  │
│  │  ✅ Consistently delivers quality work before deadlines     │  │
│  │  ✅ Excellent code review participation                      │  │
│  │  ✅ Proactive problem identification                        │  │
│  │                                                              │  │
│  │  Improvements:                                               │  │
│  │  📈 Deadline estimation needs refinement                    │  │
│  │  📈 Cross-team communication frequency could increase       │  │
│  │                                                              │  │
│  │  AI Recommendation:                                          │  │
│  │  "Consider assigning cross-team projects to leverage        │  │
│  │  technical expertise across departments."                   │  │
│  │                                                              │  │
│  │  [Download PDF] [Share with Employee]                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ! No data: "No task data for this period"                       │
│  ! Generating: skeleton report layout + shimmer                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 12. Settings & Zoho Integration

```
┌──────────────────────────────────────────────────────────────────┐
│  YESBOSS                        Settings                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌── Integrations ────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  ┌── Zoho Card ──────────────────────────────────────────┐  │  │
│  │  │  Zoho — Connect your workspace                       │  │  │
│  │  │  [Connect Zoho]                                      │  │  │  // or "Connected ✓"
│  │  │  "Connect your Zoho account to sync calendar,        │  │  │
│  │  │  emails, and tasks across platforms."                │  │  │
│  │  │                                                       │  │  │
│  │  │  (When connected:)                                   │  │  │
│  │  │  ✅ Connected: admin@acmecorp.com                    │  │  │
│  │  │  ┌── Check Availability ──────────────────────────┐  │  │  │
│  │  │  │  Date: [📅 Jun 25, 2026]  Duration: [30 min ▼]  │  │  │  │
│  │  │  │  [Check Availability]                           │  │  │  │
│  │  │  │  Available slots:                               │  │  │  │
│  │  │  │  • 09:00 - 09:30  [Book]                       │  │  │  │
│  │  │  │  • 10:00 - 10:30  [Book]                       │  │  │  │
│  │  │  │  • 14:00 - 14:30  [Book]                       │  │  │  │
│  │  │  └────────────────────────────────────────────────┘  │  │  │
│  │  │  [Disconnect] (danger button)                       │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌── Notification Preferences ───────────────────────────────┐  │
│  │  Channels: In-app [●]  Email [●]  Push [●]                │  │
│  │  Events:                                                   │  │
│  │  Task assigned      [●] [●] [●]                           │  │
│  │  Task overdue       [●] [●] [●]                           │  │
│  │  Mention            [●] [●] [●]                           │  │
│  │  Goal update        [●] [○] [○]                           │  │
│  │  Team update        [●] [○] [○]                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ! Zoho token expired: "Reconnect Zoho" prompt                   │
│  ! Zoho API down: "Zoho is temporarily unavailable"              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 13. Mobile Responsive Adaptations

| Screen | Mobile Adaptation | Breakpoint |
|--------|-------------------|------------|
| Dashboard | 2×2 KPI grid, modules as vertical stack, bottom nav | <768px |
| Chat | Full-width input, expert sidebar hidden (accessible via icon), response sections collapsed | <768px |
| Task Board | Single column horizontal scroll (swipe columns), cards simplified | <768px |
| Task List | Truncated columns (priority + title only), swipe to change status | <768px |
| Goal Detail | Single column, strategies below tasks, chat minimized | <768px |
| Reports | Full-width cards, share via OS share sheet | <768px |
| Notifications | Bottom sheet on bell tap, full page on "View All" | <768px |
| Settings | Category accordion, full-width toggles | <768px |
| Landing Page | Single column, full-width CTAs, hamburger menu | <640px |
| Onboarding | Full-screen steps (no sidebar), simplified progress indicator | <768px |

---

## 14. Component States Per Screen

### 14.1 State Coverage Matrix

| Screen | Loading State | Empty State | Error State | Edge Cases |
|--------|---------------|-------------|-------------|------------|
| Landing Page | Skeleton hero + feature cards | N/A (public page) | N/A | Slow 3G: show critical CSS |
| Login | Button spinner "Logging in..." | N/A | Inline error, toast for network | Caps lock warning |
| Signup | Button spinner + OTP countdown | N/A | Inline field errors | Duplicate email, weak password |
| Forgot Password | Per-step spinner | N/A | Inline + toast | OTP expired mid-flow |
| Owner Onboarding | Skeleton per step + progress bar | Manual form when no data found | Retry per API call + overall error | Browser back, network drop |
| Dashboard | 5 skeleton KPI cards + gauge | KPIs show "0" with labels | "Could not load" + retry | Cached data fallback |
| Executive Chat | Typing animation "Consulting experts..." | Quick chips visible | "Some experts unavailable" | Long response collapsed |
| AI Assistant | Typing indicator | Empty input + hint | "Couldn't do that. Rephrase?" | Cancel mid-flow |
| Tasks (Board) | 5 skeleton columns (3 cards each) | "No tasks" + "Create Task" CTA | Section retry | Drag invalid → toast |
| Tasks (List) | Skeleton table (5 rows) | "No tasks" + CTA | Retry | Overdue badge, long titles |
| Goal Detail | Skeleton sections | "No strategies" + "Generate" CTA | Retry | Archived immutable |
| Reports | Skeleton report layout | "No data for period" | "Could not generate" + retry | PDF >10MB compressed |
| Market | 5 skeleton news cards | "No news for your industry" | "Market unavailable" + retry | No industry configured → CTA |
| Files | Per-file progress bar | Drop zone + "Upload first file" | Per-file failure badge | Same filename, corrupt file |
| Notifications | Skeleton list | "No notifications yet" | Retry | Max 99+ badge count |
| Settings | Skeleton sections | Default values | Toast on save failure | Zoho token expired |
| Zoho Calendar | Skeleton slots | "Check availability to see slots" | "Zoho unavailable" + retry | Timeslot no longer available |

### 14.2 Loading Animation Specs

| Element | Animation | Duration | Implementation |
|---------|-----------|----------|----------------|
| Skeleton card | Shimmer (moving gradient) | 1.5s loop | CSS `@keyframes shimmer` |
| Button spinner | Spin | 1s infinite | Lucide `Loader2` icon |
| AI typing | Bouncing dots ●●○ | 1s loop | CSS `@keyframes bounce` |
| Page transition | Fade in | 200ms | CSS `transition: opacity` |
| Toast | Slide from right | 300ms ease-out | CSS `transform: translateX` |
| Modal | Scale up + fade | 200ms spring | Radix Dialog animation |

---

## 15. Codebase File Map

| Component | Path |
|-----------|------|
| Landing page | `frontend/src/app/page.tsx` |
| Login | `frontend/src/app/login/page.tsx` |
| Signup | `frontend/src/app/signup/page.tsx` |
| Forgot password | `frontend/src/app/forgot-password/page.tsx` |
| Owner onboarding | `frontend/src/app/onboarding/owner/page.tsx` |
| Employee onboarding | `frontend/src/app/onboarding/employee/page.tsx` |
| Dashboard | `frontend/src/app/dashboard/page.tsx` |
| Executive chat | `frontend/src/app/dashboard/chat/page.tsx` |
| AI Assistant | `frontend/src/app/dashboard/assistant/page.tsx` |
| Tasks | `frontend/src/app/tasks/page.tsx` |
| Task detail | `frontend/src/app/tasks/[id]/page.tsx` |
| Goal detail | `frontend/src/app/goals/[id]/page.tsx` |
| Reports | `frontend/src/app/dashboard/reports/page.tsx` |
| Market | `frontend/src/app/dashboard/market/page.tsx` |
| Data / Files | `frontend/src/app/dashboard/data/page.tsx` |
| Settings | `frontend/src/app/dashboard/settings/page.tsx` |
| Notifications | `frontend/src/app/dashboard/notifications/page.tsx` |
| Team | `frontend/src/app/dashboard/team/page.tsx` |
| Profile | `frontend/src/app/dashboard/profile/page.tsx` |
| UI components | `frontend/src/components/ui/` (14 files) |
| Owner components | `frontend/src/components/owners/` (13 files) |
| Shared components | `frontend/src/components/` (24 files) |

---

*End of Wireframes — YesBoss v1.0*
