# Design System

## YesBoss — An AI-Powered Enterprise Intelligent System and Digital CEO Layer for Modern Organizations

| Field | Detail |
|-------|--------|
| **Document Owner** | Design / UI Team |
| **Version** | 2.0 |
| **Status** | Final |
| **Date** | June 2026 |
| **Confidentiality** | Internal |
| **Framework** | TailwindCSS v4 + Radix UI Primitives |
| **Implementation** | `frontend/src/components/ui/` (14 primitives) |
| **Global Styles** | `frontend/src/app/globals.css` |
| **Theme** | `frontend/src/components/ThemeProvider.tsx`, `ThemeToggle.tsx` |
| **Traceability** | BRD: REQ-01–REQ-12, PRD: DS-01–DS-15 |

---

## 1. Design Principles

| Principle | Description | Applied In | Code Reference |
|-----------|-------------|------------|----------------|
| **Clarity First** | Every screen should be understandable at a glance. Data should be scannable, not overwhelming. | Dashboard, KPI cards, task lists | `frontend/src/components/DashboardLayout.tsx`, `components/owners/DashboardView.tsx` |
| **AI-Native Intelligence** | AI is embedded, not bolted on. AI insights appear contextually where users need them. | Chat bubbles, insight cards, smart suggestions | `frontend/src/components/AIInsights.tsx`, `components/AISummaryChat.tsx` |
| **Progressive Disclosure** | Show the essential first, reveal complexity on demand. Onboarding should feel light, not overwhelming. | Multi-step onboarding, collapsible sections | `frontend/src/app/onboarding/owner/page.tsx`, `app/onboarding/employee/page.tsx` |
| **Trust Through Transparency** | Users should see how AI arrived at its conclusions. Show reasoning, sources, confidence levels. | AI insight reasoning, chat source citations | `frontend/src/components/owners/MarketImpactCard.tsx`, `components/AIInsights.tsx` |
| **Consistency Across Roles** | Owner and Employee experiences share the same design language, adapted for context. | Unified components, role-aware views | `frontend/src/components/Navbar.tsx`, `components/ProtectedRoute.tsx` |

---

## 2. Color Palette

### 2.1 Brand Colors

Defined in `frontend/src/app/globals.css` via `@theme` directive (TailwindCSS v4 usage: `bg-primary-500`, `text-primary-700`, `border-primary-300`).

| Token | Hex | CSS Variable | Tailwind Utility | Usage |
|-------|-----|-------------|------------------|-------|
| **Primary-50** | #EFF6FF | `--color-primary-50` | `primary-50` | Light background |
| **Primary-100** | #DBEAFE | `--color-primary-100` | `primary-100` | Hover backgrounds |
| **Primary-200** | #BFDBFE | `--color-primary-200` | `primary-200` | Active backgrounds |
| **Primary-300** | #93C5FD | `--color-primary-300` | `primary-300` | Borders |
| **Primary-400** | #60A5FA | `--color-primary-400` | `primary-400` | Icons, accents |
| **Primary-500** | #3B82F6 | `--color-primary-500` | `primary-500` | Primary actions, links |
| **Primary-600** | #2563EB | `--color-primary-600` | `primary-600` | Button hover |
| **Primary-700** | #1D4ED8 | `--color-primary-700` | `primary-700` | Active button |
| **Primary-800** | #1E40AF | `--color-primary-800` | `primary-800` | Pressed states |
| **Primary-900** | #1E3A5F | `--color-primary-900` | `primary-900` | Dark backgrounds |

### 2.2 Neutral / Gray Scale

| Token | Hex | CSS Variable | Tailwind Utility | Usage |
|-------|-----|-------------|------------------|-------|
| **White** | #FFFFFF | `--color-white` | `white` | Card backgrounds (light mode) |
| **Gray-50** | #F9FAFB | `--color-gray-50` | `gray-50` | Page background |
| **Gray-100** | #F3F4F6 | `--color-gray-100` | `gray-100` | Section backgrounds |
| **Gray-200** | #E5E7EB | `--color-gray-200` | `gray-200` | Borders, dividers |
| **Gray-300** | #D1D5DB | `--color-gray-300` | `gray-300` | Disabled borders |
| **Gray-400** | #9CA3AF | `--color-gray-400` | `gray-400` | Placeholder text |
| **Gray-500** | #6B7280 | `--color-gray-500` | `gray-500` | Secondary text |
| **Gray-600** | #4B5563 | `--color-gray-600` | `gray-600` | Body text |
| **Gray-700** | #374151 | `--color-gray-700` | `gray-700` | Heading text |
| **Gray-800** | #1F2937 | `--color-gray-800` | `gray-800` | Strong headings |
| **Gray-900** | #111827 | `--color-gray-900` | `gray-900` | Darkest text |

### 2.3 Semantic Colors

| Token | Hex | CSS Variable | Tailwind Utility | Usage |
|-------|-----|-------------|------------------|-------|
| **Success-500** | #10B981 | `--color-success` | `emerald-500` | Completed tasks, positive metrics |
| **Success-100** | #D1FAE5 | `--color-success-bg` | `emerald-100` | Success background |
| **Warning-500** | #F59E0B | `--color-warning` | `amber-500` | Pending, medium priority |
| **Warning-100** | #FEF3C7 | `--color-warning-bg` | `amber-100` | Warning background |
| **Danger-500** | #EF4444 | `--color-danger` | `red-500` | Overdue, high priority, errors |
| **Danger-100** | #FEE2E2 | `--color-danger-bg` | `red-100` | Error background |
| **Info-500** | #3B82F6 | `--color-info` | `blue-500` | Informational |
| **Info-100** | #DBEAFE | `--color-info-bg` | `blue-100` | Info background |

### 2.4 AI / Agent Colors

Used in: `frontend/src/components/AIInsights.tsx`, `frontend/src/app/dashboard/chat/page.tsx`, `backend/app/agents/expert_agents.py`

| Agent | Hex | Tailwind Class | Usage |
|-------|-----|---------------|-------|
| **Finance** | #10B981 | `text-emerald-500`, `bg-emerald-50` | Green — money, growth |
| **Operations** | #F59E0B | `text-amber-500`, `bg-amber-50` | Amber — processes, efficiency |
| **Strategy** | #8B5CF6 | `text-purple-500`, `bg-purple-50` | Purple — vision, planning |
| **HR** | #EC4899 | `text-pink-500`, `bg-pink-50` | Pink — people, culture |
| **Sales** | #3B82F6 | `text-blue-500`, `bg-blue-50` | Blue — revenue, pipeline |
| **Product** | #14B8A6 | `text-teal-500`, `bg-teal-50` | Teal — roadmap, features |
| **Master Agent** | #6B7280 | `text-gray-500`, `bg-gray-100` | Gray — neutral orchestrator |

### 2.5 Dark Mode Overrides

Implemented via `frontend/src/components/ThemeProvider.tsx` using TailwindCSS v4 `dark:` variant. Toggle in `frontend/src/components/ThemeToggle.tsx`.

| Light Token | Dark Token | CSS Variable | Usage in globals.css |
|-------------|------------|-------------|---------------------|
| `bg-white` | `dark:bg-gray-900` | `--color-surface` | Card backgrounds |
| `bg-gray-50` | `dark:bg-gray-800` | `--color-background` | Page background |
| `bg-gray-100` | `dark:bg-gray-800` | `--color-surface-alt` | Section backgrounds |
| `text-gray-600` | `dark:text-gray-300` | `--color-text-body` | Body text |
| `text-gray-900` | `dark:text-gray-100` | `--color-text-heading` | Heading text |
| `border-gray-200` | `dark:border-gray-700` | `--color-border` | Borders |

**Implementation pattern:**
```tsx
// ThemeProvider.tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  // applies "dark" class to <html> element
  // all components use dark: prefix variants automatically
</ThemeProvider>
```

---

## 3. Typography

### 3.1 Font Family

Configured in `frontend/src/app/layout.tsx` via `next/font`:

| Stack | Font | Source | Tailwind Utility |
|-------|------|--------|-----------------|
| Primary | `Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif` | `next/font/local` (GeistVF.woff) | `font-sans` |
| Monospace | `Geist Mono, JetBrains Mono, SF Mono, monospace` | `next/font/local` (GeistMonoVF.woff) | `font-mono` |

### 3.2 Type Scale

Defined as TailwindCSS v4 text utilities in `globals.css`:

| Token | Size | Weight | Line Height | Letter Spacing | Tailwind Class | Usage |
|-------|------|--------|-------------|----------------|---------------|-------|
| **display** | 36px / 2.25rem | Bold (700) | 1.1 | -0.02em | `text-display` / `text-4xl font-bold` | Page titles, hero |
| **h1** | 28px / 1.75rem | Semibold (600) | 1.2 | -0.01em | `text-h1` / `text-2xl font-semibold` | Section headers |
| **h2** | 22px / 1.375rem | Semibold (600) | 1.3 | 0 | `text-h2` / `text-xl font-semibold` | Card titles |
| **h3** | 18px / 1.125rem | Medium (500) | 1.4 | 0 | `text-h3` / `text-lg font-medium` | Sub-section titles |
| **body** | 15px / 0.938rem | Regular (400) | 1.5 | 0 | `text-body` / `text-base` | Paragraphs, content |
| **body-sm** | 13px / 0.813rem | Regular (400) | 1.5 | 0 | `text-body-sm` / `text-sm` | Metadata, descriptions |
| **caption** | 12px / 0.75rem | Medium (500) | 1.3 | 0.01em | `text-caption` / `text-xs font-medium` | Labels, timestamps |
| **tiny** | 11px / 0.688rem | Semibold (600) | 1.2 | 0.02em | `text-tiny` | Badges, counters |
| **button** | 14px / 0.875rem | Medium (500) | 1 | 0 | `text-button` / `text-sm font-medium` | Buttons |
| **button-lg** | 16px / 1rem | Semibold (600) | 1 | 0 | `text-button-lg` / `text-base font-semibold` | Primary buttons |

### 3.3 Text Style Map

| Style | Font Token | Color Token | Tailwind Equivalent |
|-------|-----------|-------------|-------------------|
| Page Title | h1 | Gray-900 | `text-2xl font-semibold text-gray-900 dark:text-gray-100` |
| Section Title | h2 | Gray-800 | `text-xl font-semibold text-gray-800 dark:text-gray-200` |
| Card Title | h3 | Gray-800 | `text-lg font-medium text-gray-800 dark:text-gray-200` |
| Body Text | body | Gray-600 | `text-base text-gray-600 dark:text-gray-300` |
| Body Small | body-sm | Gray-500 | `text-sm text-gray-500 dark:text-gray-400` |
| Metric Value | display | Gray-900 | `text-4xl font-bold text-gray-900 dark:text-gray-100` |
| Label | caption | Gray-500 | `text-xs font-medium text-gray-500` |
| Link | body | Primary-500 | `text-base text-primary-500 hover:text-primary-600` |
| Error Text | body-sm | Danger-500 | `text-sm text-red-500` |
| Success Text | body-sm | Success-500 | `text-sm text-emerald-500` |

### 3.4 Responsive Type Adjustments

| Screen | h1 | h2 | body |
|--------|----|----|------|
| Desktop (1280+) | 28px (`text-2xl`) | 22px (`text-xl`) | 15px (`text-base`) |
| Tablet (768-1024) | 24px (`text-xl`) | 20px (`text-lg`) | 15px (`text-base`) |
| Mobile (<768) | 22px (`text-lg`) | 18px (`text-base`) | 14px (`text-sm`) |

**Implementation:** Use responsive prefixes: `text-xl md:text-2xl lg:text-3xl`

---

## 4. Spacing

### 4.1 Spacing Scale (TailwindCSS v4 defaults + custom)

| Token | Value | Tailwind Class | Usage |
|-------|-------|---------------|-------|
| space-0 | 0px | `p-0`, `m-0` | Reset |
| space-1 | 4px | `p-1`, `gap-1` | Tiny gaps, icon padding |
| space-2 | 8px | `p-2`, `gap-2` | Element gap, small padding |
| space-3 | 12px | `p-3`, `gap-3` | Button padding, chip padding |
| space-4 | 16px | `p-4`, `gap-4` | Card padding, section gap |
| space-5 | 20px | `p-5`, `gap-5` | Modal padding |
| space-6 | 24px | `p-6`, `gap-6` | Between sections |
| space-8 | 32px | `p-8`, `gap-8` | Section margins |
| space-10 | 40px | `p-10`, `gap-10` | Page section padding |
| space-12 | 48px | `p-12`, `gap-12` | Large section spacing |
| space-16 | 64px | `p-16`, `gap-16` | Hero section margins |

### 4.2 Layout Spacing Map

| Context | Token | Value | Tailwind |
|---------|-------|-------|----------|
| Page padding (desktop) | space-8 | 32px | `px-8 py-8` |
| Page padding (mobile) | space-4 | 16px | `px-4 py-4` |
| Card padding | space-4 | 16px | `p-4` |
| Card gap (grid) | space-4 | 16px | `gap-4` |
| Section margin bottom | space-8 | 32px | `mb-8` |
| Form field gap | space-4 | 16px | `space-y-4` |
| Button icon gap | space-2 | 8px | `gap-2` |
| List item padding | space-3 | 12px | `px-3 py-3` |
| Modal padding | space-5 | 20px | `p-5` |

---

## 5. Border Radius

| Token | Value | Tailwind Class | Usage |
|-------|-------|---------------|-------|
| radius-none | 0px | `rounded-none` | No rounding |
| radius-sm | 4px | `rounded-sm` | Small inputs, tags |
| radius-md | 6px | `rounded-md` | Buttons, form fields |
| radius-lg | 8px | `rounded-lg` | Cards, modals |
| radius-xl | 12px | `rounded-xl` | Large cards |
| radius-2xl | 16px | `rounded-2xl` | Hero sections |
| radius-full | 9999px | `rounded-full` | Avatars, pills, badges |

---

## 6. Shadows

| Token | Value | Tailwind Class | Usage |
|-------|-------|---------------|-------|
| shadow-xs | `0 1px 2px rgba(0,0,0,0.05)` | `shadow-xs` | Subtle dividers |
| shadow-sm | `0 1px 3px rgba(0,0,0,0.08)` | `shadow-sm` | Cards subtle |
| shadow-md | `0 4px 6px rgba(0,0,0,0.07)` | `shadow-md` | Cards, dropdowns |
| shadow-lg | `0 10px 15px rgba(0,0,0,0.08)` | `shadow-lg` | Modals, elevated |
| shadow-xl | `0 20px 25px rgba(0,0,0,0.1)` | `shadow-xl` | Dialogs, popovers |
| shadow-2xl | `0 25px 50px rgba(0,0,0,0.12)` | `shadow-2xl` | Full-screen overlays |

**Dark mode shadows** (applied via `dark:` prefix):
| Token | Value |
|-------|-------|
| shadow-sm | `0 1px 3px rgba(0,0,0,0.3)` |
| shadow-md | `0 4px 6px rgba(0,0,0,0.35)` |
| shadow-lg | `0 10px 15px rgba(0,0,0,0.4)` |
| shadow-xl | `0 20px 25px rgba(0,0,0,0.45)` |

Implementation: `<div class="shadow-sm dark:shadow-sm dark:shadow-black/30">`

---

## 7. Component Specifications

### 7.1 Buttons

**Implementation:** `frontend/src/components/ui/Button.tsx`

#### Component API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` | Visual style |
| size | `'sm' \| 'md' \| 'lg'` | `'md'` | Button dimensions |
| loading | `boolean` | `false` | Show spinner, disable |
| disabled | `boolean` | `false` | Disabled state |
| icon | `React.ReactNode` | — | Leading icon |
| children | `React.ReactNode` | — | Button label |
| onClick | `() => void` | — | Click handler |
| type | `'button' \| 'submit' \| 'reset'` | `'button'` | HTML button type |

#### Primary Button

```
┌─────────────────────────┐
│  Action Label           │
└─────────────────────────┘
```

| State | Background | Text | Border | Shadow |
|-------|-----------|------|--------|--------|
| Default | Primary-500 | White | None | None |
| Hover | Primary-600 | White | None | `shadow-sm` |
| Active | Primary-700 | White | None | None |
| Focus | Primary-500 | White | Ring: 3px Primary-200 | None |
| Disabled | Gray-200 | Gray-400 | None | None |
| Loading | Primary-500 | White + spinner | None | None |

#### Secondary Button

| State | Background | Text | Border |
|-------|-----------|------|--------|
| Default | White | Gray-700 | 1px Gray-200 |
| Hover | Gray-50 | Gray-700 | Gray-300 |
| Active | Gray-100 | Gray-700 | Gray-300 |
| Disabled | Gray-50 | Gray-300 | Gray-200 |

#### Ghost Button

| State | Background | Text |
|-------|-----------|------|
| Default | Transparent | Gray-600 |
| Hover | Gray-100 | Gray-700 |
| Active | Gray-200 | Gray-700 |
| Disabled | Transparent | Gray-300 |

#### Icon Button

| Property | Value |
|----------|-------|
| Size | 36px x 36px (touch: 44px using `min-w-[44px] min-h-[44px]`) |
| Border Radius | `rounded-lg` |
| States | Same as ghost variant |
| Variants | Primary, Ghost, Danger |

#### Button Sizes

| Size | Padding | Font | Height | Tailwind |
|------|---------|------|--------|----------|
| sm | 6px 12px | caption (12px) | 32px | `px-3 py-1.5 text-xs` |
| md | 10px 20px | button (14px) | 40px | `px-5 py-2.5 text-sm` |
| lg | 12px 24px | button-lg (16px) | 48px | `px-6 py-3 text-base` |

**Implementation pattern:** Uses `clsx` + `cva` (class-variance-authority) in `Button.tsx` for variant/size classes.

---

### 7.2 Form Inputs

#### Text Input

**Implementation:** `frontend/src/components/ui/Input.tsx`

**Component API:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| label | `string` | — | Input label |
| error | `string` | — | Error message (shows error state) |
| helperText | `string` | — | Helper text below input |
| placeholder | `string` | — | Placeholder text |
| size | `'md' \| 'lg'` | `'md'` | Input height |
| disabled | `boolean` | `false` | Disabled state |

```
┌───────────────────────────────────┐
│  Label                            │
│  ┌─────────────────────────────┐  │
│  │ Placeholder text           │  │
│  └─────────────────────────────┘  │
│  Helper text / Error message      │
└───────────────────────────────────┘
```

| State | Background | Border | Ring |
|-------|-----------|--------|------|
| Default | White | Gray-200 | None |
| Focus | White | Primary-500 | 3px Primary-100 |
| Error | White | Danger-500 | 3px Danger-100 |
| Disabled | Gray-50 | Gray-200 | None |
| Filled | White | Gray-200 | None |

#### Select Dropdown

**Implementation:** `frontend/src/components/ui/Select.tsx` (wraps Radix Select)

```
┌──────────────────────────┬──────┐
│  Selected Option        │  ▼   │
└──────────────────────────┴──────┘
```

| Property | Value |
|----------|-------|
| States | Same as Input |
| Dropdown shadow | `shadow-lg` |
| Option hover | `bg-gray-50` |
| Selected option | `bg-primary-50 text-primary-700` |

#### Checkbox

**Implementation:** `frontend/src/components/ui/Checkbox.tsx` (wraps Radix Checkbox)

```
┌──┐
│✅│  Label text
└──┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Size | 18px x 18px | `w-[18px] h-[18px]` |
| Border Radius | radius-sm (4px) | `rounded-sm` |
| Checked BG | Primary-500 | `bg-primary-500` |
| Unchecked Border | Gray-300 | `border-gray-300` |
| Focus Ring | 3px Primary-100 | `focus-visible:ring-3 focus-visible:ring-primary-100` |

#### Toggle / Switch

**Implementation:** `frontend/src/components/ui/` (wraps Radix Switch)

```
 ○─────────────●
  Off         On
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Track Width | 44px | `w-11` |
| Track Height | 24px | `h-6` |
| Thumb Size | 20px | `w-5 h-5` |
| Track Off | Gray-200 | `bg-gray-200` |
| Track On | Primary-500 | `bg-primary-500` |
| Border Radius | Full | `rounded-full` |

#### Textarea

**Implementation:** `frontend/src/components/ui/Textarea.tsx`

Same visual properties as Input, with:
- Min height: 80px (`min-h-[80px]`)
- Resize: vertical only (`resize-y`)

---

### 7.3 Cards

**Implementation:** `frontend/src/components/ui/Card.tsx`

```
┌─────────────────────────────────────┐
│  ┌──┐                               │
│  │  │  Card Title              ⬇ 🔍 │
│  └──┘                               │
│  ───────────────────────────────────  │
│                                     │
│  Card content area                  │
│  with various elements...           │
│                                     │
└─────────────────────────────────────┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Background | White (surface) | `bg-white dark:bg-gray-900` |
| Border Radius | radius-lg (8px) | `rounded-lg` |
| Shadow | shadow-sm | `shadow-sm` |
| Padding | space-4 (16px) | `p-4` |
| Hover (clickable) | shadow-md | `hover:shadow-md cursor-pointer` |
| Divider | 1px solid Gray-100 | `border-t border-gray-100 dark:border-gray-700` |

**Component API:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | — | Card title |
| icon | `React.ReactNode` | — | Leading icon |
| actions | `React.ReactNode` | — | Action buttons in header |
| clickable | `boolean` | `false` | Hover elevation effect |
| children | `React.ReactNode` | — | Card content |
| footer | `React.ReactNode` | — | Footer section (with divider) |

#### KPI Card

Used in: `frontend/src/components/owners/DashboardView.tsx`

```
┌──────────────────────────────┐
│  📊                          │
│  78%                         │  ← display font
│  Completion Rate             │  ← body-sm
│  ↑ 12% from last month      │  ← body-sm, green
└──────────────────────────────┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Layout | Icon top-left, metric center, label below | `flex flex-col items-start gap-2` |
| Metric | Text-4xl font-bold text-gray-900 | `text-4xl font-bold text-gray-900 dark:text-gray-100` |
| Trend Up | `↑` with success color | `text-emerald-500` |
| Trend Down | `↓` with danger color | `text-red-500` |
| Width | 220px min, 1fr max | `min-w-[220px] flex-1` |

**States:**
| State | Behavior |
|-------|----------|
| Loading | Skeleton pulse on metric value (60% width, 48px height) |
| Empty | Show `—` instead of value, "No data yet" subtitle |
| Error | Show `!` icon with "Failed to load" in Danger-500 |
| Edge (negative trend) | Red color with down arrow |

---

### 7.4 Modals & Dialogs

**Implementation:** `frontend/src/components/ui/Modal.tsx` (wraps Radix Dialog)

```
┌──────────────────────────────────────┐
│  ┌──────────────────────────────────┐│
│  │  Dialog Title                ✕  ││
│  │  ─────────────────────────────  ││
│  │                                  ││
│  │  Dialog content                  ││
│  │                                  ││
│  │  ─────────────────────────────  ││
│  │  [Cancel]            [Confirm]  ││
│  └──────────────────────────────────┘│
│                                      │
│  Backdrop: rgba(0,0,0,0.5)          │
└──────────────────────────────────────┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Width | 480px (default), 640px (large), 90vw (mobile) | `w-[480px] max-w-[90vw]` |
| Border Radius | radius-xl (12px) | `rounded-xl` |
| Shadow | shadow-xl | `shadow-xl` |
| Padding | space-5 (20px) | `p-5` |
| Backdrop | Black 50% opacity | `bg-black/50` |
| Animation | Fade in + scale (200ms) | Radix Dialog default |

**Component API:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| open | `boolean` | `false` | Dialog visibility |
| onClose | `() => void` | — | Close handler |
| title | `string` | — | Dialog title |
| size | `'sm' \| 'md' \| 'lg'` | `'md'` | Width variant |
| children | `React.ReactNode` | — | Content |
| footer | `React.ReactNode` | — | Footer with actions |

---

### 7.5 Navigation Components

#### Sidebar

**Implementation:** Root layout `frontend/src/app/layout.tsx` using `DashboardLayout.tsx`

| Property | Value | Tailwind |
|----------|-------|----------|
| Width (expanded) | 250px | `w-[250px]` |
| Width (collapsed) | 60px | `w-[60px]` |
| Background | Gray-50 | `bg-gray-50 dark:bg-gray-800` |
| Border Right | 1px solid Gray-200 | `border-r border-gray-200 dark:border-gray-700` |
| Item Height | 40px | `h-10` |
| Item Padding | 8px 12px | `px-3 py-2` |
| Item Border Radius | radius-md | `rounded-md` |
| Item Hover | Gray-100 | `hover:bg-gray-100 dark:hover:bg-gray-700` |
| Item Active | Primary-50, text Primary-600 | `bg-primary-50 text-primary-600` |
| Item Icon | 20px, Gray-400 | `w-5 h-5 text-gray-400` |

#### Navbar (Top)

**Implementation:** `frontend/src/components/Navbar.tsx`

| Property | Value | Tailwind |
|----------|-------|----------|
| Height | 64px | `h-16` |
| Background | White | `bg-white dark:bg-gray-900` |
| Border Bottom | 1px solid Gray-200 | `border-b border-gray-200 dark:border-gray-700` |
| Padding | 0 space-6 | `px-6` |
| Logo Height | 32px | `h-8` |

#### Bottom Navigation (Mobile)

| Property | Value |
|----------|-------|
| Height | 56px (`h-14`) |
| Background | White (`bg-white dark:bg-gray-900`) |
| Border Top | 1px solid Gray-200 |
| Item Count | 4-5 items |
| Active Color | Primary-500 |
| Inactive Color | Gray-400 |
| Icon Size | 24px |
| Label Size | caption (11px) |

---

### 7.6 Chat Components

Used in: `frontend/src/app/dashboard/chat/page.tsx`, `frontend/src/app/dashboard/assistant/page.tsx`

#### Chat Bubble (User)

```
┌─────────────────────────────────┐
│                                 │
│  How is our financial health    │
│  this quarter?                  │
│                                 │
│                    10:32 AM     │
│                    ┌──────────┐ │
│                    │  👤 You  │ │
│                    └──────────┘ │
└─────────────────────────────────┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Align | Right | `ml-auto` |
| Background | Primary-50 | `bg-primary-50 dark:bg-primary-900` |
| Border Radius | 16px 4px 16px 16px | `rounded-tl-[16px] rounded-tr-[4px] rounded-br-[16px] rounded-bl-[16px]` |
| Max Width | 70% | `max-w-[70%]` |
| Padding | 12px 16px | `px-4 py-3` |

#### Chat Bubble (AI)

```
┌─────────────────────────────────┐
│  ┌──────────┐                   │
│  │  🤖 AI   │                   │
│  └──────────┘                   │
│  Revenue is up 22% QoQ. Cash    │
│  flow is positive at $120K.     │
│                         10:32 AM│
└─────────────────────────────────┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Align | Left | `mr-auto` |
| Background | Gray-50 | `bg-gray-50 dark:bg-gray-800` |
| Border Radius | 4px 16px 16px 16px | `rounded-tl-[4px] rounded-tr-[16px] rounded-br-[16px] rounded-bl-[16px]` |
| Max Width | 75% | `max-w-[75%]` |
| Padding | 12px 16px | `px-4 py-3` |

#### Chat Input

| Property | Value | Tailwind |
|----------|-------|----------|
| Height | 56px | `h-14` |
| Background | White | `bg-white dark:bg-gray-800` |
| Border | 1px solid Gray-200 | `border border-gray-200 dark:border-gray-700` |
| Border Radius | radius-lg | `rounded-lg` |
| Send Button | Primary-500, 40px circle | `bg-primary-500 w-10 h-10 rounded-full` |

**State:**
| State | Behavior |
|-------|----------|
| Empty input | Send button disabled (opacity-50, cursor-not-allowed) |
| Typing | Send button enabled (bg-primary-500) |
| Sending | Send button shows spinner, input disabled |
| Error | Toast notification "Failed to send message" |
| Offline | Warning banner "Connection lost. Messages will be sent when reconnected." |

---

### 7.7 Notification Components

**Implementation:** `frontend/src/components/NotificationDropdown.tsx`, `NotificationToast.tsx`, `NotificationWatcher.tsx`

#### Notification Toast

```
┌──────────────────────────────────────┐
│  📝 Task assigned                    │
│  "Update homepage" by Sarah Mehta    │
│                              5m ago  │
│                                  [✕] │
└──────────────────────────────────────┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Position | Top-right (desktop), top (mobile) | `fixed top-4 right-4` |
| Width | 380px (desktop), 90vw (mobile) | `w-[380px] max-w-[90vw]` |
| Background | White | `bg-white dark:bg-gray-900` |
| Shadow | shadow-lg | `shadow-lg` |
| Border Radius | radius-lg | `rounded-lg` |
| Border Left | 4px solid (status color) | `border-l-4` |
| Animation | Slide in from right (300ms) | Tailwind animate |
| Auto-dismiss | 5 seconds | `useEffect` timer |
| Stack | Max 3 visible | Queue management |

#### Notification Bell

| Property | Value |
|----------|-------|
| Icon Size | 22px (`w-[22px] h-[22px]`) |
| Badge Size | 18px (`w-[18px] h-[18px] text-[11px]`) |
| Badge Color | Danger-500 (`bg-red-500`) |
| Badge Position | Top-right of icon (`-top-1 -right-1`) |
| Dropdown Width | 380px |
| Max Items | 5 visible, scrollable |

**States:**
| State | Behavior |
|-------|----------|
| No notifications | Dropdown shows "No notifications yet" with icon |
| Unread count >99 | Badge shows `99+` |
| Loading | Skeleton placeholder (3 rows) |
| Error | "Failed to load notifications" with retry button |

---

### 7.8 Avatar

**Implementation:** `frontend/src/components/ui/Avatar.tsx`

| Property | Value | Tailwind |
|----------|-------|----------|
| Sizes | 24px, 32px, 40px, 48px, 64px | `w-6 h-6` to `w-16 h-16` |
| Shape | Circle | `rounded-full` |
| Default | Initials in Primary-100 background | `bg-primary-100 text-primary-700 text-sm font-medium` |
| Image | Object-fit cover | `object-cover` |
| Online Indicator | 8px green dot (bottom-right) | `absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white` |

**Component API:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| src | `string` | — | Image URL |
| alt | `string` | — | Alt text (used for initials fallback) |
| size | `'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl'` | `'md'` | Size preset |
| showOnline | `boolean` | `false` | Online indicator |

---

### 7.9 Badge / Tag

**Implementation:** `frontend/src/components/ui/Badge.tsx`

```
┌──────────────┐
│  High Priority│
└──────────────┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Border Radius | radius-sm (4px) | `rounded-sm` |
| Padding | 2px 8px | `px-2 py-0.5` |
| Font | caption (12px, Medium) | `text-xs font-medium` |
| Height | 22px | `h-[22px]` |

**Variants:**

| Variant | Background | Text | Tailwind |
|---------|-----------|------|----------|
| Gray | Gray-100 | Gray-600 | `bg-gray-100 text-gray-600` |
| Primary | Primary-100 | Primary-700 | `bg-primary-100 text-primary-700` |
| Success | Emerald-100 | Emerald-700 | `bg-emerald-100 text-emerald-700` |
| Warning | Amber-100 | Amber-700 | `bg-amber-100 text-amber-700` |
| Danger | Red-100 | Red-700 | `bg-red-100 text-red-700` |

#### Priority Badge Colors

| Priority | Background | Text | Tailwind |
|----------|------------|------|----------|
| Critical | Danger-100 | Danger-700 | `bg-red-100 text-red-700` |
| High | Warning-100 | Warning-700 | `bg-amber-100 text-amber-700` |
| Medium | Primary-100 | Primary-700 | `bg-primary-100 text-primary-700` |
| Low | Gray-100 | Gray-600 | `bg-gray-100 text-gray-600` |

---

### 7.10 Progress Bar

**Implementation:** `frontend/src/components/ui/` (Radix Progress primitive)

```
┌──────────────────────────────────────┐
│  Goal Completion             78%     │
│  ████████████████████████░░░░░░░░░░  │
└──────────────────────────────────────┘
```

| Property | Value | Tailwind |
|----------|-------|----------|
| Height | 8px | `h-2` |
| Border Radius | Full | `rounded-full` |
| Track Color | Gray-200 | `bg-gray-200 dark:bg-gray-700` |
| Fill Color | Primary-500 | `bg-primary-500` |
| Animation | Smooth width transition | `transition-all duration-500` |

**States:**
| State | Behavior |
|-------|----------|
| Loading | `0%` width (invisible) |
| 0% | Empty track (no fill) |
| 100% | Full fill, color changes to Emerald-500 |
| Error | Not applicable (internal component) |

---

## 8. Iconography

### 8.1 Icon Library

| Library | Usage | Sizing |
|---------|-------|--------|
| Lucide React | All UI icons (`import { Plus, Bell, ... } from 'lucide-react'`) | 16px, 20px, 24px, 32px |

### 8.2 Icon Size Map

| Context | Size | Tailwind | Example |
|---------|------|----------|---------|
| Sidebar navigation | 20px | `w-5 h-5` | LayoutDashboard |
| Button icon | 16px | `w-4 h-4` | Plus |
| Notification | 22px | `w-[22px] h-[22px]` | Bell |
| KPI Card | 28px | `w-7 h-7` | TrendingUp |
| Empty State | 64px | `w-16 h-16` | FolderOpen |
| Chat action item | 18px | `w-[18px] h-[18px]` | Paperclip |

---

## 9. Component State Coverage Matrix

Every data-displaying component must handle these states. References implementation in the respective component files.

| Component | Loading | Empty | Error | Edge Cases |
|-----------|---------|-------|-------|------------|
| **KPI Card** (`DashboardView.tsx`) | Skeleton pulse (gray, 60% width) | Show `—` metric, "No data yet" | Red border, error icon, retry button | Overflow: truncate text; Zero values: show 0; Negative trend: red |
| **Task List** (`TaskView.tsx`, `taskStore.ts`) | 5-row skeleton with shimmer | "No tasks yet" with CTA "Create first task" | "Failed to load tasks" + retry | 100+ tasks: pagination; Overdue: red badge; Blocked: orange badge |
| **Kanban Board** (`TaskView.tsx`) | Each column shows skeleton cards | Each column: "No tasks in {status}" | Error banner above board | Long title: truncate after 2 lines; 20+ cards per column: scroll |
| **Goal List** (`goals/[id]/page.tsx`) | Skeleton cards (3) | "No goals yet. Let AI suggest goals" | Error toast | Archived: gray, strikethrough; Overdue: red indicator |
| **Chat History** (`chat/page.tsx`, `chatStore.ts`) | Spinner in chat area | "Start a conversation" with suggestion chips | "Message failed to send" with retry | Long messages: collapsible; Code blocks: syntax highlight; Links: clickable |
| **AI Insights** (`AIInsights.tsx`) | Shimmer card rows | "No insights yet. Data needs 7+ days." | "AI unavailable" with fallback text | Urgent insights: red border; Positive: green border |
| **Notifications** (`NotificationDropdown.tsx`) | 3 skeleton rows | "No notifications yet" with bell icon | "Failed to load" + retry | 99+ badge shows 99+; Long title: truncate |
| **Dashboard** (`DashboardView.tsx`, `dashboardStore.ts`) | Full-page skeleton grid | Empty state per module | Per-module error (isolated) | Large screen: max 4 columns; Mobile: single column |
| **Market Trends** (`market/page.tsx`, `marketTrendsStore.ts`) | Card skeletons | "No news for your industry" | "Market data unavailable" | Stale data: show timestamp "Updated X hours ago" |
| **Reports** (`reports/page.tsx`, `reportStore.ts`) | Loading spinner | "Select employee to generate report" | "Generation failed" + retry | No task data: "Insufficient data for analysis" |
| **Org Chart** (`orchestration/page.tsx`, `orgChartStore.ts`) | Tree skeleton | "Add employees to build org chart" | "Could not load org structure" | Large org (>50): collapsible levels; Circular reference: show warning |
| **File Upload** (`onboarding/owner/page.tsx`) | Progress bar during upload | "Drag files here or click to browse" | File type error / size error / upload failed | Large file (>25MB): reject; Multiple files: queue |
| **Employee Select** (`reports/page.tsx`) | Spinner | "No employees in this organization" | "Could not load employee list" | Large team: searchable dropdown |
| **Goal Chat** (`GoalDetailChat.tsx`) | Typing indicator | Empty chat with suggestions | "AI response failed" + retry | Context overflow: summarize old messages |

### 9.1 Loading State Implementation Pattern

All loading states use `frontend/src/components/ui/Skeleton.tsx` (reusable skeleton component):
```tsx
// Implementation pattern in every data-fetching component:
if (isLoading) return <Skeleton variant="card" count={3} />;
if (error) return <ErrorState message={error} onRetry={refetch} />;
if (!data || data.length === 0) return <EmptyState type="tasks" onAction={createFirst} />;
return <DataView data={data} />;
```

### 9.2 Empty State Icons by Context

| Context | Icon (Lucide) | Message |
|---------|--------------|---------|
| Tasks | `ClipboardList` | "No tasks yet" |
| Goals | `Target` | "No goals defined" |
| Chat | `MessageSquare` | "Start a conversation" |
| Notifications | `Bell` | "No notifications" |
| Documents | `FileText` | "No files uploaded" |
| Market | `Newspaper` | "No market news" |
| Employees | `Users` | "No team members" |
| Reports | `BarChart3` | "No reports generated" |

---

## 10. Data Visualization

### 10.1 Charts (Recharts)

Configured in dashboard and report components:
`frontend/src/components/owners/DashboardView.tsx`, `frontend/src/app/dashboard/reports/page.tsx`

| Chart Type | Usage | Default Height | Implementation |
|------------|-------|----------------|----------------|
| Line Chart | Trends over time | 300px | `<LineChart width={width} height={300}>` |
| Bar Chart | Comparison data | 300px | `<BarChart width={width} height={300}>` |
| Pie Chart | Distribution | 250px | `<PieChart width={width} height={250}>` |
| Area Chart | Cumulative metrics | 300px | `<AreaChart width={width} height={300}>` |
| Radar Chart | Multi-dimension scores | 300px | `<RadarChart width={width} height={300}>` |

### 10.2 Chart Colors

| Data Series | Color | Tailwind |
|-------------|-------|----------|
| Series 1 | Primary-500 (#3B82F6) | `#3B82F6` |
| Series 2 | Success-500 (#10B981) | `#10B981` |
| Series 3 | Purple-500 (#8B5CF6) | `#8B5CF6` |
| Series 4 | Warning-500 (#F59E0B) | `#F59E0B` |
| Series 5 | Pink-500 (#EC4899) | `#EC4899` |

### 10.3 Org Health Gauge

Used in: `frontend/src/components/owners/OrgHealthWidget.tsx`

```
        85/100
    ┌─────────┐
    │  █████  │
    │  █████  │
    │  █████  │
    │  ██░░░  │
    │  ░░░░░  │
    └─────────┘
   Excellent
```

| Score Range | Label | Color | Tailwind |
|-------------|-------|-------|----------|
| 80-100 | Excellent | Success-500 | `text-emerald-500` |
| 60-79 | Good | Primary-500 | `text-blue-500` |
| 40-59 | Fair | Warning-500 | `text-amber-500` |
| 0-39 | Needs Attention | Danger-500 | `text-red-500` |

---

## 11. Animation & Motion

### 11.1 Durations

Configured in `frontend/src/app/globals.css` as custom properties:

| Token | Duration | Tailwind | Usage |
|-------|----------|----------|-------|
| fast | 150ms | `duration-150` | Hover, active states |
| normal | 200ms | `duration-200` | Button click, toggle |
| slow | 300ms | `duration-300` | Modal open/close, panel expand |
| xslow | 500ms | `duration-500` | Page transitions |

### 11.2 Easing

| Token | Curve | Tailwind | Usage |
|-------|-------|----------|-------|
| ease-out | `cubic-bezier(0.16, 1, 0.3, 1)` | `ease-out` | Enter animations |
| ease-in-out | `cubic-bezier(0.65, 0, 0.35, 1)` | `ease-in-out` | Transitions |
| spring | `cubic-bezier(0.34, 1.56, 0.64, 1)` | custom | Bouncy micro-interactions |

### 11.3 Key Animations

Defined in `frontend/src/app/globals.css`:

| Animation | Timing | CSS/Tailwind | Element |
|-----------|--------|-------------|---------|
| Fade In | 200ms ease-out | `animate-fadeIn` | Modals, toasts |
| Slide In Right | 300ms ease-out | `animate-slideInRight` | Sidebar, notifications |
| Slide In Up | 200ms ease-out | `animate-slideInUp` | Cards entering viewport |
| Scale In | 200ms spring | `animate-scaleIn` | Modal open |
| Pulse | 2s infinite | `animate-pulse` | Loading skeleton |
| Spin | 1s infinite | `animate-spin` | Loading spinner |
| Skeleton shimmer | 1.5s infinite | `animate-shimmer` | Content loading |

---

## 12. Responsive Breakpoints

**Framework:** TailwindCSS v4 defaults (`frontend/tailwind.config` equivalent via CSS `@theme`)

| Breakpoint | Min Width | Tailwind Prefix | Target |
|------------|-----------|-----------------|--------|
| xs | 0px | (default) | Mobile |
| sm | 640px | `sm:` | Large mobile |
| md | 768px | `md:` | Tablet |
| lg | 1024px | `lg:` | Small desktop |
| xl | 1280px | `xl:` | Desktop |
| 2xl | 1536px | `2xl:` | Large desktop |

### 12.1 Layout Grid

| Screen | Columns | Gutter | Margin |
|--------|---------|--------|--------|
| Mobile | 4 | 16px (`gap-4`) | 16px (`px-4`) |
| Tablet | 8 | 24px (`gap-6`) | 24px (`px-6`) |
| Desktop | 12 | 24px (`gap-6`) | 32px (`px-8`) |

**Implementation:** CSS Grid with responsive column count:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
```

---

## 13. Print Styles

Defined in `frontend/src/app/globals.css`:

```css
@media print {
  nav, .sidebar, .notification-toast, button, .no-print { display: none; }
  body { background: white !important; color: black !important; }
  a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; }
  table { page-break-inside: auto; }
  thead { display: table-header-group; }
  .print-only { display: block; }
}
```

| Element | Style |
|---------|-------|
| Hide | Navbar, sidebar, buttons, modals, toasts |
| Page | Background: white, text: black |
| Links | Show URL after text |
| Tables | Repeat header on each page |
| Font Size | body: 12pt |
| Margins | 0.75in all sides |

---

## 14. Accessibility (a11y)

### 14.1 Global Requirements

| Requirement | Implementation | File Reference |
|-------------|---------------|----------------|
| Color Contrast | All text meets WCAG AA (4.5:1 for body, 3:1 for large text) | Verified in `Button.tsx`, `Card.tsx`, all text components |
| Focus Indicators | 3px ring on all interactive elements | `focus-visible:ring-3 focus-visible:ring-primary-200` on all interactive classes |
| Keyboard Navigation | Tab/Enter/Escape for all actions | Radix UI handles kbd nav natively for all primitives |
| Screen Reader Labels | `aria-label` on icon-only buttons | Enforced in `Button.tsx` when only icon is provided |
| Form Validation | Error messages via `aria-describedby` | Implemented in `Input.tsx`, `Select.tsx` |
| Heading Hierarchy | h1 → h2 → h3 (no skips) | Enforced in page components |
| Touch Targets | Min 44x44px for mobile | Icon button mobile override in `Button.tsx` |
| Reduced Motion | Respect `prefers-reduced-motion` | `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; } }` |

### 14.2 Component-Level a11y

| Component | Requirements | File |
|-----------|-------------|------|
| Button | Focus visible ring, aria-label when icon-only, role="button", disabled attr | `ui/Button.tsx` |
| Input | label → htmlFor, aria-describedby for errors, aria-invalid, required indicator | `ui/Input.tsx` |
| Select | aria-expanded, aria-haspopup="listbox", role="combobox" | `ui/Select.tsx` (Radix) |
| Checkbox | role="checkbox", aria-checked, aria-labelledby | `ui/Checkbox.tsx` (Radix) |
| Switch | role="switch", aria-checked | `ui/` (Radix Switch) |
| Modal | role="dialog", aria-modal="true", aria-labelledby, focus trap | `ui/Modal.tsx` (Radix) |
| Card | role="button" when clickable, tabIndex={0}, onKeyDown for Enter/Space | `ui/Card.tsx` |
| Avatar | role="img", aria-label with initials or name | `ui/Avatar.tsx` |
| Badge | aria-label describing the badge content | `ui/Badge.tsx` |
| Toast | role="alert", aria-live="polite"/"assertive" | `NotificationToast.tsx` |

---

## 15. Component Architecture

### 15.1 File Structure (Actual Codebase Paths)

```
frontend/src/
├── app/                           # 24 page routes
│   ├── layout.tsx                 # Root layout: ThemeProvider, Navbar, Sidebar
│   ├── page.tsx                   # Landing page
│   ├── login/page.tsx             # Login (email + phone OTP)
│   ├── signup/page.tsx            # Multi-step signup
│   ├── forgot-password/page.tsx   # Password reset flow
│   ├── onboarding/
│   │   ├── owner/page.tsx         # 10-step owner wizard
│   │   └── employee/page.tsx      # 4-step employee wizard
│   └── dashboard/
│       ├── page.tsx               # Owner/Employee dashboard
│       ├── chat/page.tsx          # Executive Chat UI
│       ├── assistant/page.tsx     # AI Assistant
│       ├── task/page.tsx          # Task pipeline
│       ├── reports/page.tsx       # Reports
│       ├── market/page.tsx        # Market trends
│       ├── notifications/page.tsx # Notifications page
│       ├── settings/page.tsx      # Settings
│       ├── team/page.tsx          # Team management
│       ├── orchestration/page.tsx # Org chart
│       └── ai/page.tsx            # AI features hub
├── components/
│   ├── ui/                        # 14 primitives (Radix wrappers)
│   │   ├── Button.tsx             # cva-based variant system
│   │   ├── Input.tsx              # Label + input + error
│   │   ├── Select.tsx             # Radix Select wrapper
│   │   ├── Card.tsx               # Configurable card
│   │   ├── Modal.tsx              # Radix Dialog wrapper
│   │   ├── Badge.tsx              # Status/priority badges
│   │   ├── Avatar.tsx             # Image + initials fallback
│   │   ├── Checkbox.tsx           # Radix Checkbox wrapper
│   │   ├── Tabs.tsx               # Radix Tabs wrapper
│   │   ├── Textarea.tsx           # Resizable textarea
│   │   ├── Tooltip.tsx            # Radix Tooltip wrapper
│   │   ├── DropdownMenu.tsx       # Radix Dropdown wrapper
│   │   ├── Label.tsx              # Form label
│   │   └── index.ts              # Barrel exports
│   ├── owners/                    # 13 owner-specific composites
│   │   ├── DashboardView.tsx      # Owner dashboard with KPI grid
│   │   ├── TaskView.tsx           # Kanban + list task views
│   │   ├── GoalDetailChat.tsx     # Goal-specific AI chat
│   │   ├── OrgHealthWidget.tsx    # Health gauge chart
│   │   ├── ZohoCalendarBooking.tsx # Calendar integration
│   │   ├── ZohoConnectButton.tsx  # Zoho OAuth connector
│   │   └── ...                   # Other owner components
│   └── (22 top-level components) # Shared composites
│       ├── AIInsights.tsx         # AI insight cards
│       ├── AISummaryChat.tsx      # Contextual AI chat
│       ├── Navbar.tsx             # Top navigation
│       ├── DashboardLayout.tsx    # Sidebar + main content
│       ├── ThemeProvider.tsx       # Dark/light theme context
│       ├── ThemeToggle.tsx        # Theme switcher button
│       ├── NotificationDropdown.tsx # Bell + dropdown
│       ├── NotificationToast.tsx  # Toast notifications
│       ├── NotificationWatcher.tsx # WebSocket notification receiver
│       ├── ProtectedRoute.tsx     # Auth guard wrapper
│       └── ...                   # Landing page components
├── stores/                        # 16 Zustand stores
│   ├── taskStore.ts               # Task CRUD + persist
│   ├── goalStore.ts               # Goal CRUD + persist
│   ├── chatStore.ts               # Chat messages + persist
│   ├── organizationStore.ts       # Org data + persist
│   └── ...                       # Other stores
└── app/globals.css                # Tailwind v4 + custom styles
```

### 15.2 Theme Implementation

**File:** `frontend/src/components/ThemeProvider.tsx`, `ThemeToggle.tsx`, `frontend/src/app/globals.css`

ThemeProvider wraps the entire application and applies `dark` class to `<html>` element based on system preference or manual toggle.

```tsx
// ThemeProvider.tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
export function ThemeProvider({ children }) {
  return <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>{children}</NextThemesProvider>;
}
```

Dark mode storage: persisted in `localStorage` via `next-themes`.

### 15.3 Component Naming Convention

| Pattern | Example | File |
|---------|---------|------|
| PascalCase for components | `DashboardView.tsx` | All component files |
| camelCase for utilities | `utils.ts`, `firebase.ts` | `lib/` folder |
| kebab-case for CSS classes | `task-card`, `kpi-grid` | Within `globals.css` |
| `.tsx` for React components | `Button.tsx` | All component files |
| `.ts` for pure logic | `taskStore.ts`, `auth.ts` | `stores/`, `lib/` |

### 15.4 Props Pattern

All components follow the pattern:
1. Define TypeScript interface for props
2. Use default values for optional props
3. Use `clsx`/`tailwind-merge` for conditional classes
4. Spread remaining props to underlying element

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}
```

---

*End of Design System — YesBoss v2.0*
