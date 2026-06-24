# Database Schema

## YesBoss — An AI-Powered Enterprise Intelligent System and Digital CEO Layer for Modern Organizations

| Field | Detail |
|-------|--------|
| **Document Owner** | Engineering / Data |
| **Version** | 2.0 |
| **Status** | Final |
| **Date** | June 2026 |
| **Confidentiality** | Internal |
| **Primary DB** | MongoDB Atlas (M10+) — `yesboss_db` |
| **Vector DB** | Qdrant Cloud — 3 collections |
| **Implementation** | `backend/app/core/database.py` (MongoDB) + `backend/app/core/qdrant.py` (Qdrant) |
| **Traceability** | BRD: REQ-29–REQ-34, PRD: DB-01–DB-12 |

---

## 1. Database Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       MONGODB ATLAS (yesboss_db)                       │
│                                                                        │
│  Connection: Motor async driver (backend/app/core/database.py)         │
│  Initialization: _ensure_collections() on startup                      │
│                                                                        │
│  ┌─────────────────────┐  ┌─────────────────────┐                    │
│  │   CORE (7)          │  │   FEATURE (12)      │                    │
│  │                     │  │                     │                    │
│  │  ● users            │  │  ● goals            │                    │
│  │  ● organizations    │  │  ● tasks            │                    │
│  │  ● employees        │  │  ● workflows        │                    │
│  │  ● conversations    │  │  ● task_outcomes    │                    │
│  │  ● notifications     │  │  ● learning_patterns │                    │
│  │  ● documents        │  │  ● uploads          │                    │
│  │  ● org_chart_members │  │  ● reports          │                    │
│  │                     │  │  ● user_patterns    │                    │
│  │                     │  │  ● meetings         │                    │
│  │                     │  │  ● team_updates     │                    │
│  │                     │  │  ● calendar_events  │                    │
│  │                     │  │  ● zoho_tokens      │                    │
│  └─────────────────────┘  └─────────────────────┘                    │
│                                                                        │
│  ┌─────────────────────────────┐  ┌────────────────────────────┐     │
│  │   COMMUNICATION (3)        │  │   MAINTENANCE (3)          │     │
│  │                            │  │                            │     │
│  │  ● notification_pref      │  │  ● scheduler_logs          │     │
│  │  ● push_subscriptions     │  │  ● api_logs                │     │
│  │  ● notification_pref      │  │  ● seed_reference          │     │
│  └─────────────────────────────┘  └────────────────────────────┘     │
│                                                                        │
│  Total: 22 collections, 40+ indexes                                    │
│  Engine: MongoDB 7.0+ (Atlas M10: 2GB RAM, 10GB storage)              │
│  Drivers: Motor (async), PyMongo (sync for scripts)                   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                        QDRANT CLOUD                                   │
│                                                                        │
│  Connection: QdrantClient (backend/app/core/qdrant.py)                │
│  Embeddings: OpenAI text-embedding-3-small (1536 dimensions)          │
│  Distance: Cosine                                                      │
│                                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐                  │
│  │ documents            │  │ conversations         │                  │
│  │                      │  │                       │                  │
│  │ Payload:             │  │ Payload:              │                  │
│  │  - text (string)     │  │  - message (string)   │                  │
│  │  - org_id (string)   │  │  - org_id (string)    │                  │
│  │  - filename (string) │  │  - user_id (string)   │                  │
│  │  - chunk_index (int) │  │  - timestamp (string) │                  │
│  └──────────────────────┘  └──────────────────────┘                  │
│                                                                        │
│  ┌──────────────────────┐                                             │
│  │ workflows            │                                             │
│  │                      │                                             │
│  │ Payload:             │                                             │
│  │  - pattern_text      │                                             │
│  │  - org_id            │                                             │
│  │  - type              │                                             │
│  └──────────────────────┘                                             │
│                                                                        │
│  Total: 3 collections, auto-created at startup                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Entity Relationship Diagram (Logical)

```
┌──────────────┐          ┌──────────────────┐
│    User      │          │  Organization     │
│──────────────│          │──────────────────│
│ _id (PK)     │◄────────►│ _id (PK)         │
│ uid (unique) │  N:1     │ domain (unique)  │
│ email        │          │ ownerId → User   │
│ phone        │          │ name             │
│ role         │          │ industry         │
│ orgId → Org  │          │ size             │
│ displayName  │          └────────┬─────────┘
│ createdAt    │                   │
└──────┬───────┘                   │ 1:N
       │ 1:1 (employee)            │
       │                           ▼
       ▼                   ┌──────────────────┐
┌──────────────┐           │      Goal        │
│  Employee    │           │──────────────────│
│──────────────│           │ _id (PK)         │
│ _id (PK)     │           │ orgId → Org      │
│ userId → User│           │ title            │
│ orgId → Org  │           │ department       │
│ managerId →  │           │ status           │
│   Employee   │           │ strategies[]     │
│ department   │           │ timeline         │
│ role         │           └────────┬─────────┘
│ personaAns[] │                   │ 1:N
│ createdAt    │                   │
└──────┬───────┘                   ▼
       │ 1:N               ┌──────────────────┐
       │                   │      Task        │
       ▼                   │──────────────────│
┌──────────────┐           │ _id (PK)         │
│ Notification │           │ goalId → Goal    │
│──────────────│           │ orgId → Org      │
│ _id (PK)     │           │ assigneeId → Emp │
│ userId → User│           │ reviewerId → Emp │
│ orgId → Org  │           │ title            │
│ type         │           │ status           │
│ title        │           │ priority         │
│ message      │           │ deadline         │
│ read (bool)  │           │ dependencies[]   │
│ link         │           │ comments[]       │
│ createdAt    │           │ needsApproval    │
└──────────────┘           │ approvedAt       │
                           └──────────────────┘
                               │
                               │ 1:N
                               ▼
┌──────────────────────────────────────────┐
│            Conversation                   │
│──────────────────────────────────────────│
│ _id (PK)                                 │
│ userId → User                            │
│ orgId → Org                              │
│ type (onboarding/executive/assistant)    │
│ messages[] { role, content, timestamp }  │
│ context { agents_invoked, ... }          │
│ createdAt                                │
│ updatedAt                                │
└──────────────────────────────────────────┘
```

---

## 3. Core Collection Schemas

### 3.1 users

**Implementation:** Referenced in `backend/app/api/auth.py`, `backend/app/api/organizations.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `uid` | String | Yes | Yes (unique) | Firebase Authentication UID |
| `email` | String | Yes | Yes | User email address |
| `phone` | String | Yes | No | Phone number with country code (E.164) |
| `role` | String | Yes | Yes | `"owner"` or `"employee"` |
| `displayName` | String | Yes | No | User's full name |
| `photoURL` | String | No | No | Profile photo URL (Firebase Storage) |
| `orgId` | ObjectId | No | Yes | Associated organization ID |
| `createdAt` | DateTime | Yes | No | Account creation timestamp |
| `lastLogin` | DateTime | No | No | Last login timestamp |
| `preferences` | Object | No | No | User preferences: { theme, notifications } |

**Indexes:**
- `{ uid: 1 }` (unique) — Fast user lookup by Firebase UID
- `{ email: 1 }` — Login by email
- `{ orgId: 1 }` — Find all users in an organization

---

### 3.2 organizations

**Implementation:** `backend/app/api/organizations.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `name` | String | Yes | No | Organization name |
| `domain` | String | Yes | Yes (unique) | Company email domain |
| `industry` | String | Yes | Yes | Primary industry (from taxonomy) |
| `microVertical` | String | No | No | Specific sub-industry |
| `size` | String | No | No | Company size range |
| `description` | String | No | No | AI-generated company description |
| `website` | String | No | No | Company website URL |
| `phone` | String | No | No | Company phone |
| `address` | String | No | No | Company address |
| `socialLinks` | Object | No | No | `{ linkedin, twitter, instagram, facebook, youtube }` |
| `personaAnswers` | Array | No | No | `[{ question, answer, topic, timestamp }]` |
| `onboardingComplete` | Boolean | Yes | Yes | Whether onboarding wizard is done |
| `ownerId` | ObjectId | Yes | Yes | Reference to owning user |
| `createdAt` | DateTime | Yes | No | Organization creation |
| `updatedAt` | DateTime | Yes | No | Last update |

**Indexes:**
- `{ domain: 1 }` (unique) — Domain lookup during signup
- `{ ownerId: 1 }` — Owner's organizations
- `{ industry: 1 }` — Industry-based queries
- `{ onboardingComplete: 1 }` — Filter incomplete orgs

---

### 3.3 employees

**Implementation:** `backend/app/api/employees.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `userId` | ObjectId | Yes | Yes (unique) | Reference to user |
| `orgId` | ObjectId | Yes | Yes | Reference to organization |
| `managerId` | ObjectId | No | Yes | Reference to manager (employee) |
| `department` | String | Yes | Yes | Department name |
| `role` | String | No | No | Job title / role |
| `personaAnswers` | Array | No | No | `[{ question, answer, topic }]` |
| `createdAt` | DateTime | Yes | No | Record creation |

**Indexes:**
- `{ userId: 1 }` (unique) — One employee record per user
- `{ orgId: 1 }` — All employees in organization
- `{ managerId: 1 }` — Reports under manager
- `{ orgId: 1, department: 1 }` — Department filtering
- `{ department: 1 }` — Department-based queries

---

### 3.4 goals

**Implementation:** `backend/app/api/goals.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Reference to organization |
| `title` | String | Yes | No | Goal title (max 200 chars) |
| `description` | String | No | No | Detailed description |
| `department` | String | Yes | Yes | Owning department |
| `strategies` | Array | No | No | `[{ id, title, description, selected }]` |
| `selectedStrategy` | String | No | No | Chosen strategy ID |
| `status` | String | Yes | Yes | `active`, `completed`, `archived` |
| `timeline` | Object | No | No | `{ start: DateTime, end: DateTime }` |
| `successCriteria` | String | No | No | How success is measured |
| `kpis` | Array | No | No | Linked KPI metric IDs |
| `progress` | Number | No | No | 0-100 percentage |
| `createdBy` | ObjectId | Yes | No | User who created the goal |
| `createdAt` | DateTime | Yes | No | Creation timestamp |
| `updatedAt` | DateTime | Yes | No | Last update |

**Indexes:**
- `{ orgId: 1, status: 1 }` — Org goals filtered by status
- `{ orgId: 1, department: 1 }` — Department-based filtering
- `{ timeline.end: 1 }` — Deadline queries
- `{ status: 1, timeline.end: 1 }` — Scheduler: goals ending soon

---

### 3.5 tasks

**Implementation:** `backend/app/api/tasks.py`, `frontend/src/stores/taskStore.ts`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `goalId` | ObjectId | No | Yes | Reference to parent goal |
| `orgId` | ObjectId | Yes | Yes | Reference to organization |
| `assigneeId` | ObjectId | No | Yes | Assigned employee ID |
| `reviewerId` | ObjectId | No | No | Reviewer/approver employee ID |
| `title` | String | Yes | No | Task title |
| `description` | String | No | No | Detailed description |
| `priority` | String | Yes | Yes | `low`, `medium`, `high`, `critical` |
| `status` | String | Yes | Yes | `todo`, `in_progress`, `review`, `done`, `blocked` |
| `deadline` | DateTime | No | Yes | Due date |
| `dependencies` | Array | No | No | Task IDs this depends on |
| `tags` | Array | No | No | Custom tags for filtering |
| `comments` | Array | No | No | `[{ userId, text, createdAt, displayName? }]` |
| `needsApproval` | Boolean | No | No | Requires manager approval |
| `approvedAt` | DateTime | No | No | Approval timestamp |
| `approvedBy` | ObjectId | No | No | Approver employee ID |
| `createdBy` | ObjectId | Yes | No | Creator user ID |
| `createdAt` | DateTime | Yes | No | Creation timestamp |
| `updatedAt` | DateTime | Yes | No | Last update |

**Indexes:**
- `{ orgId: 1, assigneeId: 1, status: 1 }` — Employee task pipeline
- `{ orgId: 1, status: 1, deadline: 1 }` — Overdue task queries
- `{ goalId: 1 }` — Tasks under a goal
- `{ deadline: 1, status: 1 }` — Scheduler: due/overdue detection
- `{ assigneeId: 1, status: 1 }` — User's active tasks
- `{ status: 1, deadline: 1 }` — Escalation checks

---

### 3.6 conversations

**Implementation:** `backend/app/api/executive_chat.py`, `backend/app/api/assistant.py`, `frontend/src/stores/chatStore.ts`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `userId` | ObjectId | Yes | Yes | User who chatted |
| `orgId` | ObjectId | Yes | Yes | Organization context |
| `type` | String | Yes | Yes | `onboarding`, `executive_chat`, `assistant`, `goal_chat` |
| `messages` | Array | Yes | No | `[{ role, content, timestamp, agentType?, actionItems? }]` |
| `context` | Object | No | No | Chat context metadata `{ agentsInvoked, ... }` |
| `createdAt` | DateTime | Yes | No | Conversation start |
| `updatedAt` | DateTime | Yes | No | Last message time |

**Indexes:**
- `{ userId: 1, type: 1, createdAt: -1 }` — User's conversations by type
- `{ orgId: 1, updatedAt: -1 }` — Recent org conversations
- `{ updatedAt: -1 }` — Recent conversations first

---

### 3.7 notifications

**Implementation:** `backend/app/api/notifications.py`, `frontend/src/stores/notificationStore.ts`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `userId` | ObjectId | Yes | Yes | Target user |
| `orgId` | ObjectId | Yes | Yes | Organization context |
| `type` | String | Yes | Yes | `task_assigned`, `task_overdue`, `task_completed`, `mention`, `goal_update`, `escalation`, `team_update` |
| `title` | String | Yes | No | Short title |
| `message` | String | Yes | No | Notification body |
| `link` | String | No | No | Deep link to related page |
| `channel` | String | No | No | `in_app`, `email`, `push` (how it was sent) |
| `read` | Boolean | Yes | Yes | Read status |
| `createdAt` | DateTime | Yes | Yes | Creation timestamp |

**Indexes:**
- `{ userId: 1, read: 1, createdAt: -1 }` — User's unread notifications
- `{ createdAt: 1 }` — TTL index (auto-delete after 90 days, via application logic)

---

### 3.8 documents

**Implementation:** `backend/app/api/file_processing.py`, `frontend/src/stores/documentStore.ts`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `userId` | ObjectId | Yes | No | Uploader |
| `filename` | String | Yes | No | Original filename |
| `fileType` | String | Yes | No | `pdf`, `docx`, `xlsx`, `csv`, `image` |
| `fileSize` | Number | Yes | No | Size in bytes |
| `filePath` | String | Yes | No | Server storage path (`/uploads/{orgId}/{filename}`) |
| `chunksCount` | Number | Yes | No | Number of vector chunks in Qdrant |
| `aiInsights` | String | No | No | AI-generated document summary |
| `createdAt` | DateTime | Yes | No | Upload timestamp |

**Indexes:**
- `{ orgId: 1, createdAt: -1 }` — Org documents sorted by upload date
- `{ userId: 1 }` — User's uploads

---

### 3.9 org_chart_members

**Implementation:** `backend/app/api/org_chart.py`, `frontend/src/stores/orgChartStore.ts`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `userId` | ObjectId | Yes | No | User reference |
| `parentId` | ObjectId | No | Yes | Parent node (manager) |
| `level` | Number | Yes | Yes | Hierarchy level (0 = CEO) |
| `position` | String | No | No | Position title |
| `department` | String | Yes | Yes | Department |
| `createdAt` | DateTime | Yes | No | Created timestamp |

**Indexes:**
- `{ orgId: 1, level: 1 }` — Org chart tree structure
- `{ parentId: 1 }` — Children of a node

---

### 3.10 meetings

**Implementation:** `backend/app/api/meetings.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `userId` | ObjectId | Yes | No | Creator |
| `title` | String | Yes | No | Meeting title |
| `transcript` | String | No | No | Meeting transcript text |
| `extractedTasks` | Array | No | No | `[{ title, assignee?, deadline? }]` — AI-extracted tasks |
| `meetingDate` | DateTime | Yes | No | When the meeting occurred |
| `createdAt` | DateTime | Yes | No | Record creation |

**Indexes:**
- `{ orgId: 1, meetingDate: -1 }` — Org meetings sorted by date

---

### 3.11 zoho_tokens

**Implementation:** `backend/app/api/zoho_auth.py`, `backend/app/core/zoho/base.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes (unique) | One token per org |
| `accessToken` | String | Yes | No | Current access token |
| `refreshToken` | String | Yes | No | Refresh token |
| `expiresAt` | DateTime | Yes | No | Token expiry |
| `scope` | String | Yes | No | Authorized scopes |
| `createdAt` | DateTime | Yes | No | Connection timestamp |
| `updatedAt` | DateTime | No | No | Last token refresh |

**Indexes:**
- `{ orgId: 1 }` (unique) — One Zoho connection per org

---

## 4. Feature Collection Schemas

### 4.1 workflows

**Implementation:** `backend/app/api/` (workflow tracking in scheduler)

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `type` | String | Yes | Yes | Workflow type identifier |
| `pattern_text` | String | Yes | No | Description of discovered pattern |
| `frequency` | Number | No | No | How often this pattern repeats |
| `confidence` | Number | No | No | AI confidence score (0-1) |
| `createdAt` | DateTime | Yes | No | Discovery timestamp |

**Indexes:**
- `{ orgId: 1, type: 1 }` — Patterns by org and type

---

### 4.2 task_outcomes

**Implementation:** Referenced in `backend/app/core/learning.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `taskId` | ObjectId | Yes | Yes | Reference to completed task |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `completedOnTime` | Boolean | Yes | No | Was task completed before deadline |
| `actualHours` | Number | No | No | Actual time spent |
| `estimatedHours` | Number | No | No | Original estimate |
| `qualityScore` | Number | No | No | Approval-based quality (0-100) |
| `blockers` | Array | No | No | `[string]` — What blocked completion |
| `createdAt` | DateTime | Yes | No | Record creation |

**Indexes:**
- `{ taskId: 1 }` — Link to task
- `{ orgId: 1, completedOnTime: 1 }` — Org completion metrics

---

### 4.3 learning_patterns

**Implementation:** `backend/app/core/learning.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `type` | String | Yes | Yes | `bottleneck`, `workflow`, `recommendation` |
| `title` | String | Yes | No | Pattern description |
| `insight` | String | Yes | No | AI-generated insight |
| `impact` | String | No | No | Business impact assessment |
| `actionable` | Boolean | No | No | Whether action is recommended |
| `metadata` | Object | No | No | Additional context data |
| `createdAt` | DateTime | Yes | No | Discovery timestamp |

**Indexes:**
- `{ orgId: 1, type: 1 }` — Learning patterns by type
- `{ actionable: 1 }` — Filter actionable insights

---

### 4.4 uploads

**Implementation:** `backend/app/api/upload.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `userId` | ObjectId | Yes | No | Uploader |
| `filename` | String | Yes | No | Original filename |
| `fileType` | String | Yes | No | MIME type |
| `fileSize` | Number | Yes | No | Size in bytes |
| `filePath` | String | Yes | No | Server path |
| `status` | String | Yes | Yes | `uploading`, `processing`, `ready`, `failed` |
| `errorMessage` | String | No | No | Error details if failed |
| `createdAt` | DateTime | Yes | No | Upload timestamp |

**Indexes:**
- `{ orgId: 1, createdAt: -1 }` — Org uploads
- `{ status: 1 }` — Processing queue management

---

### 4.5 reports

**Implementation:** `backend/app/api/reports.py`, `frontend/src/stores/reportStore.ts`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `employeeId` | ObjectId | Yes | Yes | Employee this report is for |
| `periodStart` | DateTime | Yes | Yes | Report period start |
| `periodEnd` | DateTime | Yes | Yes | Report period end |
| `overallRating` | Number | No | No | Score (0-10) |
| `ratingLabel` | String | No | No | `Excellent`, `Good`, `Fair`, `Needs Improvement` |
| `data` | Object | Yes | No | Full report payload |
| `pdfPath` | String | No | No | Generated PDF file path |
| `aiGenerated` | Boolean | No | No | Whether AI content is included |
| `createdAt` | DateTime | Yes | No | Generation date |

**Indexes:**
- `{ orgId: 1, employeeId: 1, periodStart: -1 }` — Employee report history
- `{ employeeId: 1 }` — All reports for an employee

---

### 4.6 user_patterns

**Implementation:** Referenced in `backend/app/core/learning.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `userId` | ObjectId | Yes | Yes | User reference |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `productivityScore` | Number | No | No | Daily productivity (0-100) |
| `peakHours` | Array | No | No | Time ranges of peak activity |
| `taskCompletionRate` | Number | No | No | Average completion rate |
| `preferredChannels` | Array | No | No | Preferred notification channels |
| `createdAt` | DateTime | Yes | No | Record creation |

**Indexes:**
- `{ userId: 1, orgId: 1 }` — User patterns lookup

---

### 4.7 team_updates

**Implementation:** Referenced in WebSocket push, dashboard feed

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `type` | String | Yes | Yes | Update type identifier |
| `text` | String | Yes | No | Update text |
| `userId` | ObjectId | No | No | Related user |
| `metadata` | Object | No | No | Additional data |
| `createdAt` | DateTime | Yes | Yes | Timestamp |

**Indexes:**
- `{ orgId: 1, createdAt: -1 }` — Org activity feed
- `{ createdAt: 1 }` — TTL via application (archive after 30 days)

---

### 4.8 calendar_events

**Implementation:** `backend/app/core/zoho/calendar.py` (synced from Zoho)

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `orgId` | ObjectId | Yes | Yes | Organization |
| `zohoEventId` | String | No | No | Zoho calendar event ID |
| `summary` | String | Yes | No | Event title |
| `description` | String | No | No | Event description |
| `startTime` | DateTime | Yes | Yes | Event start |
| `endTime` | DateTime | Yes | Yes | Event end |
| `attendees` | Array | No | No | Attendee email addresses |
| `meetLink` | String | No | No | Zoho Meet link |
| `createdAt` | DateTime | Yes | No | Record creation |

**Indexes:**
- `{ orgId: 1, startTime: -1 }` — Org calendar
- `{ zohoEventId: 1 }` — Zoho sync dedup

---

## 5. Communication & Maintenance Collections

### 5.1 notification_pref

**Implementation:** `backend/app/api/notification_preferences.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `userId` | ObjectId | Yes | Yes (unique) | User reference |
| `emailEnabled` | Boolean | Yes | No | Email notifications |
| `pushEnabled` | Boolean | Yes | No | Browser push |
| `inAppEnabled` | Boolean | Yes | No | In-app toasts |
| `types` | Object | No | No | Per-type toggles |
| `quietHoursStart` | String | No | No | HH:MM format |
| `quietHoursEnd` | String | No | No | HH:MM format |
| `createdAt` | DateTime | Yes | No | Record creation |
| `updatedAt` | DateTime | Yes | No | Last update |

**Indexes:**
- `{ userId: 1 }` (unique) — One preference record per user

---

### 5.2 push_subscriptions

**Implementation:** `backend/app/api/push_subscriptions.py`, `frontend/src/lib/pushNotifications.ts`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `userId` | ObjectId | Yes | Yes | User reference |
| `endpoint` | String | Yes | Yes (unique) | Push notification endpoint URL |
| `keys` | Object | Yes | No | `{ p256dh, auth }` — VAPID keys |
| `userAgent` | String | No | No | Browser user agent |
| `createdAt` | DateTime | Yes | No | Subscription timestamp |

**Indexes:**
- `{ userId: 1 }` — Find all subscriptions for a user
- `{ endpoint: 1 }` (unique) — Dedup subscriptions

---

### 5.3 scheduler_logs

**Implementation:** `backend/app/core/scheduler.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `type` | String | Yes | Yes | `reminder`, `escalation`, `sync`, `cleanup` |
| `status` | String | Yes | Yes | `running`, `completed`, `failed` |
| `details` | String | No | No | Execution details |
| `itemsProcessed` | Number | No | No | Count of items handled |
| `durationMs` | Number | No | No | Execution time |
| `createdAt` | DateTime | Yes | Yes | Execution timestamp |

**Indexes:**
- `{ type: 1, createdAt: -1 }` — Scheduler run history
- `{ createdAt: 1 }` — TTL: auto-delete after 30 days (application-managed)

---

### 5.4 api_logs

**Implementation:** Middleware in `backend/app/main.py`

| Field | Type | Required | Indexed | Description |
|-------|------|----------|---------|-------------|
| `_id` | ObjectId | Auto | PK | MongoDB document ID |
| `method` | String | Yes | Yes | HTTP method |
| `path` | String | Yes | No | Request path |
| `statusCode` | Number | Yes | Yes | Response status |
| `durationMs` | Number | Yes | No | Request duration |
| `userId` | String | No | Yes | Authenticated user ID |
| `orgId` | String | No | Yes | Organization ID |
| `ip` | String | No | No | Client IP |
| `userAgent` | String | No | No | Client user agent |
| `createdAt` | DateTime | Yes | Yes | Request timestamp |

**Indexes:**
- `{ createdAt: -1 }` — Recent requests
- `{ statusCode: 1 }` — Error analysis
- `{ path: 1, createdAt: -1 }` — Per-endpoint performance
- TTL: 30 days retention (application cleanup)

---

## 6. Qdrant Vector Collections

### 6.1 Collection: documents

| Parameter | Value |
|-----------|-------|
| **Name** | `documents` |
| **Vector Dimension** | 1536 |
| **Distance Metric** | Cosine |
| **Payload Fields** | `text` (string), `org_id` (string), `filename` (string), `chunk_index` (integer) |
| **Created By** | `backend/app/core/qdrant.py` — `ensure_collection()` |
| **Purpose** | Semantic search over uploaded file content |

---

### 6.2 Collection: conversations

| Parameter | Value |
|-----------|-------|
| **Name** | `conversations` |
| **Vector Dimension** | 1536 |
| **Distance Metric** | Cosine |
| **Payload Fields** | `message` (string), `org_id` (string), `user_id` (string), `timestamp` (string) |
| **Purpose** | Semantic search over chat history for context retrieval |

---

### 6.3 Collection: workflows

| Parameter | Value |
|-----------|-------|
| **Name** | `workflows` |
| **Vector Dimension** | 1536 |
| **Distance Metric** | Cosine |
| **Payload Fields** | `pattern_text` (string), `org_id` (string), `type` (string) |
| **Purpose** | Storing learned workflow patterns for continuous learning |

---

## 7. Collection Relationship Matrix

| Collection | References | Referenced By |
|------------|------------|---------------|
| `users` | orgId → organizations | employees (userId), conversations (userId), notifications (userId), documents (userId), push_subscriptions (userId), notification_pref (userId), user_patterns (userId), meetings (userId), org_chart_members (userId) |
| `organizations` | ownerId → users | users (orgId), employees (orgId), goals (orgId), tasks (orgId), conversations (orgId), notifications (orgId), documents (orgId), reports (orgId), meetings (orgId), zoho_tokens (orgId), org_chart_members (orgId), workflows (orgId), learning_patterns (orgId), team_updates (orgId), calendar_events (orgId), uploads (orgId), task_outcomes (orgId) |
| `employees` | userId → users, orgId → organizations, managerId → employees | tasks (assigneeId, reviewerId), org_chart_members (userId), reports (employeeId) |
| `goals` | orgId → organizations, createdBy → users | tasks (goalId) |
| `tasks` | goalId → goals, orgId → organizations, assigneeId → employees | task_outcomes (taskId) |
| `conversations` | userId → users, orgId → organizations | — |
| `notifications` | userId → users, orgId → organizations | — |
| `documents` | orgId → organizations, userId → users | — |
| `meetings` | orgId → organizations, userId → users | — |
| `org_chart_members` | orgId → organizations, userId → users | — |
| `zoho_tokens` | orgId → organizations | — |
| `reports` | orgId → organizations, employeeId → employees | — |

---

## 8. Data Validation Rules

| Collection | Field | Rule | Enforced In |
|------------|-------|------|-------------|
| users | email | Valid email format, max 255 chars | `backend/app/dependencies/auth.py` |
| users | phone | 10-15 digits with country code (E.164) | `backend/app/api/auth.py` |
| users | role | Must be `owner` or `employee` | Pydantic schema |
| organizations | domain | Must be valid domain format (no protocol) | `backend/app/api/organizations.py` |
| organizations | industry | Must be from predefined taxonomy | `backend/app/core/taxonomy_store.py` |
| goals | status | Must be `active`, `completed`, or `archived` | Enforced in route handler |
| goals | title | Max 200 characters | Pydantic schema |
| goals | timeline.end | Must be after timeline.start | `backend/app/api/goals.py` |
| tasks | status | Must be `todo`, `in_progress`, `review`, `done`, or `blocked` | Enforced in route handler |
| tasks | priority | Must be `low`, `medium`, `high`, or `critical` | Pydantic schema |
| tasks | deadline | Must be a future date on create | `backend/app/api/tasks.py` |
| tasks | dependencies | Must reference existing task IDs | `backend/app/api/tasks.py` |
| tasks | status transitions | `blocked` → `todo` → `in_progress` → `review` → `done` | `backend/app/api/tasks.py` |
| notifications | type | Must be from predefined types | Pydantic schema |
| documents | fileType | Must be `pdf`, `docx`, `xlsx`, `csv`, `image` | `backend/app/core/file_processor.py` |
| documents | fileSize | Max 25MB (26,214,400 bytes) | `backend/app/api/upload.py` |
| uploads | status | Must be `uploading`, `processing`, `ready`, `failed` | Enforced in route handler |
| employees | department | Cannot be empty string | `backend/app/api/employees.py` |
| reports | overallRating | Must be 0.0–10.0 | `backend/app/core/report_generator.py` |

---

## 9. Index Management & Data Migration

### 9.1 Index Creation

Indexes are managed in `backend/app/core/database.py` → `_ensure_collections()`, called during application startup. Each collection's indexes are defined in a dictionary and created via `Motor`'s `create_indexes()`.

| Strategy | Detail |
|----------|--------|
| **Schema Migration** | Application-level (no enforced MongoDB schema). New fields added with defaults in code. |
| **Index Creation** | At startup in `_ensure_collections()` — idempotent |
| **Index Changes** | Manual intervention required for index modification |
| **Data Backfill** | One-time scripts for adding new fields to existing documents |
| **Historical Data** | Conversations archived after 12 months; notifications after 90 days |

### 9.2 Data Archival Strategy

| Collection | Retention | Action | Trigger |
|------------|-----------|--------|---------|
| `notifications` | 90 days | Soft-delete (set `archived: true`) | Daily scheduler |
| `conversations` | 12 months | Move to archive collection | Monthly scheduler |
| `api_logs` | 30 days | Delete documents | Daily scheduler |
| `scheduler_logs` | 30 days | Delete documents | Daily scheduler |
| `team_updates` | 30 days | Delete documents | Weekly scheduler |
| `task_outcomes` | 24 months | Keep for analysis | No archival |
| `reports` | 36 months | Keep for compliance | No archival |

### 9.3 Seed Data

| File | Purpose |
|------|---------|
| `data/custom_taxonomies.json` | Industry/micro-vertical taxonomy (used by `backend/app/core/taxonomy_store.py`) |
| Persona templates | Defined in `backend/app/core/prompt_engine.py` (20+ persona strings) |

---

## 10. Query Performance Notes

| Pattern | Collection | Index Used | Expected Latency |
|---------|-----------|-----------|------------------|
| Auth: find by UID | users | `{ uid: 1 }` (unique) | <5ms |
| Dashboard: active goals | goals | `{ orgId: 1, status: 1 }` | <10ms |
| Task pipeline: user's tasks | tasks | `{ assigneeId: 1, status: 1 }` | <10ms |
| Overdue tasks for alerts | tasks | `{ deadline: 1, status: 1 }` | <20ms |
| Notifications list | notifications | `{ userId: 1, read: 1, createdAt: -1 }` | <10ms |
| Org chart by level | org_chart_members | `{ orgId: 1, level: 1 }` | <5ms |
| Conversations history | conversations | `{ userId: 1, type: 1, createdAt: -1 }` | <15ms |
| Department employees | employees | `{ orgId: 1, department: 1 }` | <5ms |
| Employee reports | reports | `{ employeeId: 1, periodStart: -1 }` | <10ms |
| Zoho token lookup | zoho_tokens | `{ orgId: 1 }` (unique) | <5ms |

---

*End of Database Schema — YesBoss v2.0*
