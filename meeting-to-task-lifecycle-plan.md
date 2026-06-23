# Meeting → Task Lifecycle Plan

## Overview
Close the loop from meeting booking → MoM upload → task creation → followup → escalation → weekly report. Integrate TAZ reminders, Yes Boss notifications, manager escalation, and check-ins.

---

## 1. Meeting Booking → Reminder to Upload MoM

**Trigger**: When a meeting is booked (Zoho Calendar event created)
**Target**: Meeting participants (TAZ + Yes Boss notification)

```
[Meeting Booked]
      │
      ├── TAZ: "📅 Meeting '{title}' at {time} — upload MoM after"
      │     (reminder set for meeting end time + 1hr)
      │
      └── Yes Boss notification: "Meeting '{title}' scheduled — don't forget to upload MoM"
            (link to /dashboard with upload pre-filled with zoho_event_id)
```

**Backend work**:
- `backend/app/core/zoho/taz.py` — TAZ reminder API wrapper
- `backend/app/api/meetings.py` — `POST /meetings/book` endpoint that creates calendar event + schedules reminders
- `backend/app/core/scheduler.py` — scheduled job to check recently-ended meetings without MoM and nudge

**DB impact**:
- `meetings` collection: add `zoho_event_id`, `reminder_sent` flag
- `calendar_events` collection: add `mom_uploaded` boolean (already partially exists)

---

## 2. MoM Upload → Linked to Meeting

**Trigger**: MoM upload with `zoho_event_id`
**What happens**:
- MoM is linked to the specific calendar event
- All tasks created get `source_meeting_id` pointing to both the meeting record and the calendar event
- Meeting status updated to `mom_uploaded`

**Already works**: `process_meeting` endpoint accepts `zoho_event_id` and links to calendar event

**Needs**:
- UI: show linked MoM in calendar event detail view
- UI: show calendar event link in meeting history
- Mark `calendar_events.mom_uploaded = true` post-upload

---

## 3. Task Creation → Assignee with Deadline

**Trigger**: MoM processed
**What happens**:

```
[Mom Processed]
      │
      ├── AI extracts tasks + suggested_assignee + suggested_deadline
      │
      ├── If suggested_deadline exists:
      │     ├── Set task due_date
      │     ├── TAZ reminder for assignee (24hr before, at due time)
      │     └── Yes Boss notification to assignee
      │
      └── If suggested_deadline is empty:
            ├── Yes Boss notification to assigner (task creator):
            │   "Task '{title}' has no deadline — please set one"
            └── Task status: "pending_deadline" (hidden from active views until set)
```

**Already works**:
- AI extraction with `suggested_assignee` and `suggested_deadline`
- Task creation with due date
- Zoho ToDo push (just fixed)

**Needs**:
- `pending_deadline` status filter in task queries
- Deadline fallback notification
- TAZ reminder scheduling for task deadlines

---

## 4. Followup & Reminders

### Nearing Deadline (24hr before)
```
TAZ: "⏰ Task '{title}' due tomorrow — update status or request extension"
Yes Boss: in-app notification with link to task
```

### At Deadline
```
TAZ: "📌 Task '{title}' is due today"
Yes Boss: notification
```

### Overdue (first day)
```
TAZ: "🚨 Task '{title}' is overdue — escalate?"
Yes Boss: notification + mark escalation_level = 1
Assignee's manager gets: "⚠️ {assignee} has overdue task '{title}'"
```

### Chronically Overdue (3+ days)
```
TAZ to Manager: "🚩 {assignee} has {n} tasks overdue by {days}d"
Yes Boss: owner dashboard alert
escalation_level = 2, owner_escalated = true
```

**Needs**:
- `backend/app/core/scheduler.py` — extend `check_deadline_reminders()` with TAZ integration
- `backend/app/core/zoho/taz.py` — create/update/cancel TAZ reminders

---

## 5. Manager Escalation

**Flow**:
```
Task overdue (1d)
      │
      ├── Find assignee email → org_chart_members.email
      ├── Find manager via org_chart_members.manager_email
      ├── If manager exists:
      │     ├── Yes Boss notification to manager
      │     ├── TAZ reminder to manager
      │     └── task.escalation_level = 1
      │
      └── If no manager or still overdue after 3d:
            ├── task.owner_escalated = true
            └── Owner notified
```

**Already works**:
- `task.escalation_level` and `task.owner_escalated` fields exist
- Org chart has `manager_email`

**Needs**:
- `backend/app/core/escalation.py` — escalation chain logic
- Integrate with scheduler deadline checks

---

## 6. Weekly Report — Feedback Integration

**Trigger**: Weekly report generation (existing button on dashboard)
**What the report includes**:
```
Weekly Report for {org} — {date_range}
─────────────────────────────────────
...
[Escalated Tasks]  (NEW SECTION)
  - {assignee}: "{task}" overdue {n}d, escalated to {manager}
  - {assignee}: "{task}" overdue {n}d, owner flagged
  
[Employee Feedback]  (NEW SECTION)
  - {name}: {n} tasks completed, {n} overdue, {n} escalated
  - Manager note: {manager_comment or "No issues"}
...
```

**Already works**:
- Report generation endpoint exists
- `reports` collection with existing schema

**Needs**:
- Extend report generator to query escalated/overdue tasks
- Add feedback per employee based on escalation history
- Store feedback in `reports` collection linked to check-in cycles

---

## 7. Check-Ins Integration

Existing check-in system (weekly owner review) should include task health:

```
Check-In Prompt:
  "This week: {n} tasks completed, {n} overdue, {n} escalated
   Team members behind: {names}
   Recommend: extend deadlines / reassign / 1-on-1"
```

**Already works**:
- `check_in_service.py` — generates check-in, stores in `check_ins` collection
- Scheduler runs `check_owner_check_ins()` daily at 3am UTC
- Check-in data includes goal snapshot

**Needs**:
- Add task health metrics to check-in data (completions, overdue, escalations)
- Extend `generate_check_in()` to include task stats per assignee
- Add manager feedback field to check-in response
- Link check-in → weekly report (report includes check-in notes)

---

## Implementation Order

| Phase | What | Depends On |
|-------|------|------------|
| 1 | Deadline fallback (notify assigner when missing) | None |
| 2 | Scheduler: extended deadline reminders (TAZ + Yes Boss) | #1 |
| 3 | Escalation chain (manager notification on overdue) | #2 |
| 4 | Check-in: add task health metrics | #2 |
| 5 | Weekly report: escalation + feedback sections | #3, #4 |
| 6 | TAZ reminder module | None (parallel) |
| 7 | Meeting booking → MoM reminder | #6 |

---

## Existing Files Reference

- `backend/app/core/scheduler.py` — daily deadline checks, check-in scheduler
- `backend/app/core/check_in_service.py` — check-in generation, storage
- `backend/app/core/zoho/calendar.py` — Zoho Calendar API
- `backend/app/core/zoho/mail_tasks.py` — Zoho Mail Tasks API
- `backend/app/api/meetings.py` — meeting processing, task creation
- `backend/app/api/reports.py` — report generation
- `backend/app/api/org_chart.py` — org chart with manager_email
