# Unified Capture - build spec

Status: Phase 1 is built (uncommitted): `backend/app/api/captures.py`, `backend/tests/test_captures.py`,
`frontend/src/stores/captureStore.ts`, `frontend/src/components/capture/`, page `/dashboard/capture`.
Phase 2 is built too (uncommitted): `backend/app/core/capture_analysis.py`, the analyze / suggestion
endpoints in `captures.py`, `backend/tests/test_capture_analysis.py`, and the analysis display in
`frontend/src/components/capture/CaptureList.tsx`. Phase 3 is built too (uncommitted):
`core/capture_metrics.py` (numbers from reports), `core/commitments.py` (evidence and states),
`core/weekly_review.py` (the review, the email, the Monday job), `api/weekly_review.py`, the
`/dashboard/review` page, and `tests/test_weekly_review.py`. Phase 4 is built too (uncommitted):
`core/capture_intake.py` + `api/capture_inbox.py` (forwarded email), the Cliq `capture:` command in
`api/zoho_cliq.py`, `core/indic.py` (Hindi / Hinglish for the rules), report trends in
`core/weekly_review.py`, the analysis sweeper, and `tests/test_capture_phase4.py`.

**Capture is now a chat (replaces the form UI).** The `/dashboard/capture` page is one chat box, a full copy of
the Let's Talk screen (`components/capture/CaptureChat.tsx`, copied from `AISummaryChat.tsx` so that Let's Talk can
be removed later without breaking it) plus a "Saved notes" tab. There is no type picker and no "who can see this":
everything is private to the person. Each new message first goes to `POST /api/v1/capture-chat/route`
(`core/capture_routing.py`: rules first, the AI model only for unclear messages, the assistant on any failure):
- `assistant` -> the unchanged Let's Talk engine (`/assistant/ask-stream`): questions, assign task / goal with the
  confirm card, book / reschedule / cancel meetings, clarifying questions, briefings, memory, KPI, file upload.
- `journal` -> `/assistant/ask` in journal mode, saved with `/journal/sync` (so it also shows on the Journal page).
- `meeting_notes` -> a private capture, analysed (Phase 2), shown as a `MeetingNotesCard` with Assign / Skip per
  action item; Assign creates the task and links the commitment (Phase 3).
Not touched: Let's Talk (Home), the Journal page, the Task page and the existing Meetings feature. The chat shares the
same conversation history as Let's Talk (same `assistant_sessions`). The composer, kind chips and sharing controls of
Phases 1-2 were removed from the UI; the backend still supports sharing but nothing in the UI uses it.

Phase 4 setup and notes:
- **Forward by email.** Set `CAPTURE_INBOUND_SECRET` (any long random string; empty = off) and
  `CAPTURE_INBOUND_DOMAIN` (the domain the mail provider receives for). Point a catch-all route for
  `capture+*@<domain>` at `POST <API>/api/v1/capture-inbox/email?secret=<the secret>` (or send the secret
  in an `X-Capture-Secret` header). It accepts Mailgun / SendGrid / Postmark-style form posts and plain
  JSON (`to`, `subject`, `text` or `html`, `message-id`, `attachments: [{filename, content_base64}]`).
  Each person's address is `capture+<their private token>@<domain>` (shown on the Capture page, can be
  replaced). Mail is routed by that token, never by the From header. Everything lands as a private capture.
- **Cliq.** A DM to the bot starting with `capture:` (or `/capture`, `#capture`) is saved; so is a voice
  note when the person has no open task conversation. Replies to a task are never captured.
- **Hindi / Hinglish.** With an AI key the model reads any language. Without one, the rules map a small
  vocabulary of Hindi and Roman-Hindi business words, units and digits to English for matching only (the
  stored text is untouched). The composer has a spoken-language choice (English India / हिन्दी / English US).
- **Trends.** The review shows the last up to eight values of each number with a streak or high/low note.
- **Sweeper.** Captures left "queued" or "processing" (a restart, a closed Cliq loop) are picked up by the
  scheduler within a few minutes.
- Not done: reading email attachments beyond the first three, Qdrant-based linking, a week picker.
Phase 3 notes: the email opt-out is stored as `users.weekly_review_email` (default on), not in
`notification_preferences`, because that store is keyed by an organization that is often unknown.
The Monday job claims each person's week in `weekly_review_sent`, so a second scheduler cannot send
duplicates. A journal never produces commitments or numbers. The review covers the last seven days
(no week picker yet).
Phase 2 notes: linking is by explicit mention and keyword overlap, not embeddings (Qdrant is not
needed yet); with no AI key the built-in rules run, and a failed model call falls back to them.
Phase 1 deviations from this spec: the visibility value is `members`
(not `team`); deleting a capture deletes the journal entry it points at, but leaves uploaded files and
meetings in place (the response says so); file captures keep only the first 2,000 characters of the
file's text, because the file stays in Uploaded Data.

## 1. Goal

Merge **Let's Talk**, **Journal** and **Meeting notes (MoM)** into one feature, **Capture**.
The user adds anything (voice, text, a file, a meeting transcript). The app works out what it is,
extracts the decisions, numbers, people and dates, and links it to related goals, tasks and
earlier uploads (sales, finance and other reports). Each week it shows what was decided,
what got done, what did not, and what the newest reports say about the outcome.
Today's features keep working as views over the same store.

## 2. Decisions already made

| # | Question | Decision |
|---|---|---|
| 1 | Who uses it | Owners and employees. Owners see company-wide; employees see their own captures, captures they were named on (see decision 5), and items assigned to them. |
| 2 | Journal in team analysis | **Never.** Journal captures are fully private to the author. They are excluded from company-wide analysis, shared search, other people's reviews and any email that is not the author's own. |
| 3 | Which reports first | **No fixed order.** The AI decides the document type and which analysis to run, from what was uploaded and what the user asked. The user can override. Low confidence goes to a "needs review" list. |
| 4 | Weekly review | **Both** an in-app page and an email. Owners get the company review; employees get their own. |
| 5 | What "team" means | **A named list of people, not a department.** For a meeting, the people in the meeting; otherwise a list of members chosen by name. Only those people (plus owners) can see the capture. |
| 6 | Retention | **Kept until the user deletes it.** No automatic expiry for raw audio, files or text. |
| 7 | Weekly email opt-out | **Per person.** Each user can switch their weekly email off; the in-app review page stays available. |

## 3. What exists today (reuse, do not rebuild)

| Area | Code | Notes |
|---|---|---|
| Journal | `api/journal.py`, `core/journal_intel.py`; collections `journal_entries`, `journal_ideas`, `journal_decisions`, `journal_reminders`, `journal_patterns`, `journal_checkins`, `journal_recaps` | `PERSONAL_ENTRY_TYPES = ("journal",)` already makes `journal` entries author-only. |
| Meetings / MoM | `api/meetings.py` (`/process`, `/confirm`, `/history`); collection `meetings` | Confirm step turns extracted actions into `tasks`. |
| Chat | `api/assistant.py` (`/ask-stream`, `/sessions`, `/transcribe`, `/bulk-create-tasks`); collection `assistant_sessions` | Large file (about 4,100 lines). |
| Files | `core/file_processor.py`, `api/file_processing.py`, `api/upload.py`; collections `files`, `documents`; Qdrant | Reads PDF, DOCX, XLSX/XLS, CSV, images (OCR), TXT. Text chunks only; numbers are not stored as data. |
| Voice | `/assistant/transcribe`, `/journal/tts` | Two separate entry points. |
| Weekly jobs | `core/scheduler.py` (`send_digests`, `send_auto_reports`, `send_weekly_idea_digest`) | Scheduler now has a leader lease; see section 9. |

## 4. Data model

New collection `captures` (one document per thing the user adds):

```
captures {
  _id, org_id, user_id,
  source:      voice | text | file | transcript | chat | email | integration,
  kind:        mom | journal | report | idea | question | note | other,   # AI-assigned, user can change
  kind_confidence: 0..1,
  visibility:  private | members | org,     # journal => always private, enforced server-side
  shared_with: [{ user_id, email, name }],  # used when visibility = members (meeting attendees or a chosen list)
  title, raw_ref (file id or text), extracted_text, summary,
  entities:    { people[], dates[], amounts[], goals[], kpis[] },
  commitments: [commitment_id],
  links:       [{ type: task|goal|capture|document, id, reason, confidence }],
  status:      queued | processing | needs_review | done | failed,
  series_key:  optional, groups a repeating report (e.g. "weekly-sales"),
  created_at, updated_at
}
```

`commitments` (extracted from MoM, chat or reports):

```
{ _id, capture_id, org_id, owner_user_id, text, due_date (ISO string, end-of-day),
  task_id (when confirmed), state: open | done | missed | no_evidence,
  evidence: [{ kind: task_completed | metric_moved | manual, ref, note, at }] }
```

`report_metrics` (structured numbers from Excel/CSV/PDF tables):
`{ capture_id, org_id, series_key, metric, period, value, unit, source_cell }`.

Rules:
- `due_date` stays an ISO string, as everywhere else; use `utils/dates.normalize_due_date`.
- Existing collections stay. Phase 1 writes a capture that **points at** the old record
  (`raw_ref`), so no data migration is needed.
- Add the new collections and their indexes in `core/database.py` (`_ensure_collections` / `_ensure_indexes`):
  `captures(org_id, user_id, created_at)`, `captures(org_id, kind, series_key)`,
  `commitments(org_id, owner_user_id, state, due_date)`, `report_metrics(org_id, series_key, period)`.

## 5. Privacy rules (must hold from the first release)

1. `kind = journal` forces `visibility = private`. The API rejects any attempt to widen it
   (the existing journal rule: "Journal entries stay private").
2. Private captures are queried only with `user_id == caller`. Owners and admins get no exception.
3. Private text is **never embedded into the shared Qdrant collections**. Use a per-user filter
   (`payload.user_id`, `payload.visibility`) on every search, or a separate collection.
   Every search call must add the filter in code; it must not depend on the prompt.
4. Company-wide and team analysis, the weekly company review and chat answers over company data
   exclude private captures. An employee's own review may include their own private captures.
5. A private capture is never placed in a prompt together with other people's data.
6. Deleting a capture deletes its embeddings, metrics, commitments and suggestions.
7. `visibility = members` is visible to the author, the people in `shared_with`, and owners of the
   organization; nobody else. Attendees come from the meeting's attendee list and must be members
   of the same organization (reuse `scope.email_is_org_member`); names are shown, but access is
   checked by user id/email, never by name. Only the author or an owner can change `shared_with`.
   Journal captures can never use `members` or `org`.
8. Retention is "until the user deletes it". The author can always delete their own capture
   (rule 6 applies); an owner can delete shared captures. Nothing expires automatically. If a user
   is removed from the organization, their private captures stay private and are not deleted
   without an explicit decision.
9. All new routers use `dependencies=[Depends(require_tenant)]`; routes that read a capture call a
   new `assert_capture_access` (same pattern as `assert_task_access`).

## 6. Processing pipeline

`capture -> extract -> classify -> analyse -> link -> propose -> (user confirms) -> store results`

1. **Extract**: reuse `file_processor.extract_text`; voice goes through the existing transcription.
   Excel/CSV also go to a table parser that fills `report_metrics`.
2. **Classify (AI decides)**: one LLM call returns `kind`, `kind_confidence`, `series_key`, a list of
   analyses worth running, and a short reason. Below a confidence threshold the capture is
   `needs_review`. No document type is hard-coded as the first priority.
3. **Analyse**: run only the chosen analyses (MoM actions, sales or finance comparison against
   the previous report in the same series, journal reflection for private entries).
4. **Link**: match to goals, tasks, earlier captures and reports by explicit references first
   (names, ids, dates), then by embeddings. Save the reason and confidence with every link.
5. **Propose**: new tasks, goal changes and follow-ups are *suggestions*. They become real only
   after the user accepts, using the existing meeting `/confirm` pattern.
6. Runs in the background with a visible status. The page must never block on an LLM call.

## 7. Weekly review

Built once a week per user, and on demand.

- **Done**: commitments with a completed task (hard evidence) or a report metric that moved in the
  intended direction (soft evidence, labelled as such).
- **Open / due soon**, **Missed** (past due, no evidence), **No evidence** (cannot tell).
- **What the new reports say**: metric changes since the previous report in the same series.
- Every line shows its sources (capture, task or report) so the owner can check it.
- Owners get the company review. Employees get their own, including their own private captures.
- Delivered as an in-app page and an email (use `core/email_service.py`; template values are escaped).
- Per-person opt-out: a setting `weekly_review_email` (default on) in the user's notification
  preferences, plus an unsubscribe link in every email that works without signing in (signed,
  expiring token, same approach as `core/oauth_state.py`). Turning it off stops the email only;
  the in-app review page and the review data stay available.
- Evidence rule: "done" is only claimed from task completion or a measured metric, never from the
  model's guess alone.

## 8. UI

- One **Capture** entry point: type or paste, record voice, drop files, paste a transcript.
- Three lenses over the same store: **Talk** (ask over everything the user may see), **Journal**
  (private, mood and patterns), **Meetings** (MoM and actions). Existing pages stay reachable.
- A **Needs review** list (low-confidence classification, unclear links) and a **Weekly review** page.
- Frontend: a new Zustand store `captureStore`, following the existing one-store-per-domain layout.

## 9. Risks and dependencies

- **Qdrant**: linking relies on it, and it failed to connect from the developer machine on 2026-11-02.
  Add a keyword/regex fallback and a clear error state.
- **Scheduler duplicates**: the weekly review job must use the scheduler leader lease. Production
  does not have the lease code until the current uncommitted work is deployed; until then a second
  scheduler would send duplicate emails. Do not enable the review email before that deploy.
- **`org_id=temp` shared pool** and role-level data limits (employees can read company KPIs) are
  open issues; a unified store makes them more serious. Fix before launch.
- **Cost and latency**: one classify call plus the chosen analyses per capture; cap file size and
  batch the weekly job.
- **Accuracy**: build a test set of about 20 real MoMs and reports and measure extraction and
  linking before relying on the weekly review.

## 10. Phases

| Phase | Scope | Done when |
|---|---|---|
| 1 | `captures` collection, `/api/v1/captures` (create, list, get, delete), Capture UI that calls today's endpoints, privacy rules and tests | A voice note, a text note and a file each appear in one list; a journal capture is invisible to other users in tests |
| 2 | Classification, entity extraction, linking, suggestions with confirm, `needs_review` | A MoM and a related report are linked, with reasons |
| 3 | Commitments, `report_metrics`, evidence, weekly review page and email | A MoM decision shows done/missed next week with sources |
| 4 | Connectors (forwarded email, Cliq), report series trends, Hindi/Hinglish voice | Per connector |

## 11. Testing

- Offline tests in the style of `tests/conftest.py` (`offline_db`, mongomock): privacy matrix
  (owner, employee, other org, anonymous), classification fallbacks, linking, commitment states,
  weekly review output, delete cascade.
- LLM calls are stubbed in tests; add a small evaluation script that runs the real model over the
  real-document test set and prints accuracy.

## 12. Open questions

The earlier questions are answered (decisions 5-7). Remaining:

- Storage cost: with no expiry, raw audio and files grow without limit. Do we set a per-organization
  storage cap or show usage, without deleting anything on the user's behalf?
- When a meeting's attendee list changes after the capture was made, should the new people see
  the earlier capture?
- Can an owner see a capture that is shared only between two employees? (This spec says yes,
  because owners see company-wide.)
