# API Contracts

## YesBoss — An AI-Powered Enterprise Intelligent System and Digital CEO Layer for Modern Organizations

| Field | Detail |
|-------|--------|
| **Document Owner** | Engineering / Backend |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | June 2026 |
| **Confidentiality** | Internal |
| **Base URL** | `http://localhost:8000/api/v1` (dev) / `https://api.yesboss.ai/api/v1` (prod) |

---

## 1. API Standards

### 1.1 General Rules

| Rule | Specification |
|------|---------------|
| **Protocol** | HTTPS (production), HTTP (development) |
| **Format** | JSON for all requests and responses |
| **Auth** | Cookie-based JWT (httpOnly, secure, sameSite=lax) |
| **CORS** | Allowed origins: `http://localhost:3000`, `https://app.yesboss.ai` |
| **Pagination** | Query params: `?page=1&limit=20` — Response includes `page`, `limit`, `total` |
| **Sorting** | Query param: `?sort=createdAt&order=desc` |
| **Filtering** | Query params for filterable fields: `?status=active&department=Engineering` |
| **Idempotency** | GET, PUT, DELETE are idempotent; POST creates new resources |
| **Rate Limiting** | 100 requests/min per user (non-AI), 20 requests/min (AI) |

### 1.2 Common Request Headers

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | Yes (for POST/PUT) |
| `Cookie` | `token=<jwt>` | Yes (for authenticated routes) |

### 1.3 Common Response Format

**Success:**
```json
{
    "ok": true,
    "data": { ... },
    "message": "Operation successful"
}
```

**Paginated Success:**
```json
{
    "ok": true,
    "data": [ ... ],
    "page": 1,
    "limit": 20,
    "total": 42,
    "message": "Tasks retrieved successfully"
}
```

**Error:**
```json
{
    "ok": false,
    "detail": "Human-readable error explanation",
    "error_code": "ERROR_CODE",
    "field": "field_name",
    "timestamp": "2026-06-20T10:00:00Z"
}
```

### 1.4 HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input, validation error |
| 401 | Unauthorized | Missing or invalid auth token |
| 403 | Forbidden | Valid auth but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, conflicting state |
| 422 | Unprocessable Entity | Validation error (Pydantic) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unhandled server error |
| 503 | Service Unavailable | AI provider or database unavailable |

### 1.5 Authentication Flow

```
All authenticated routes require a valid JWT cookie.
The cookie is set by the backend on successful login/signup.

Cookie name: token
Cookie flags: httpOnly, secure (prod), sameSite=lax
Token expiry: 30 days
Refresh: Automatic on each request (sliding expiration)

The auth dependency extract user_id and org_id from the token
and inject them into the route handler.
```

---

## 2. Authentication Routes

### 2.1 Signup

```
POST /auth/signup
```

**Description:** Register a new user with email and password.

**Auth Required:** No

**Request Body:**
```json
{
    "email": "john@company.com",
    "password": "SecurePass123",
    "displayName": "John Doe",
    "phone": "+919876543210",
    "role": "owner"
}
```

**Validation Rules:**
| Field | Rule |
|-------|------|
| email | Valid email format, max 255 chars |
| password | Min 8 chars, at least 1 uppercase and 1 number |
| displayName | Min 2, max 100 chars |
| phone | Valid phone with country code (E.164 format) |
| role | Must be `owner` or `employee` |

**Success Response (201):**
```json
{
    "ok": true,
    "data": {
        "uid": "abc123def456",
        "email": "john@company.com",
        "displayName": "John Doe",
        "role": "owner",
        "createdAt": "2026-06-20T10:00:00Z"
    },
    "message": "Account created successfully"
}
```

**Error Responses:**
| Status | error_code | Condition |
|--------|-----------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid field values |
| 409 | `EMAIL_EXISTS` | Email already registered |
| 500 | `AUTH_SERVICE_ERROR` | Firebase unavailable |

---

### 2.2 Login

```
POST /auth/login
```

**Description:** Authenticate with email and password.

**Auth Required:** No

**Request Body:**
```json
{
    "email": "john@company.com",
    "password": "SecurePass123"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "uid": "abc123def456",
        "email": "john@company.com",
        "displayName": "John Doe",
        "role": "owner",
        "orgId": "665a1b2c3d4e5f6a7b8c9d0f",
        "onboardingComplete": true
    },
    "message": "Login successful"
}
```

**Error Responses:**
| Status | error_code | Condition |
|--------|-----------|-----------|
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 429 | `RATE_LIMITED` | 5+ failed attempts |
| 503 | `AUTH_UNAVAILABLE` | Firebase auth service down |

---

### 2.3 Send OTP

```
POST /auth/send-otp
```

**Description:** Send OTP to phone number for authentication.

**Auth Required:** No

**Request Body:**
```json
{
    "phone": "+919876543210"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "verificationId": "abc123"
    },
    "message": "OTP sent successfully"
}
```

---

### 2.4 Verify OTP

```
POST /auth/verify-otp
```

**Description:** Verify OTP and authenticate user.

**Auth Required:** No

**Request Body:**
```json
{
    "verificationId": "abc123",
    "otp": "123456",
    "displayName": "John Doe",
    "email": "john@company.com",
    "role": "owner"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "uid": "abc123def456",
        "role": "owner"
    },
    "message": "OTP verified successfully"
}
```

---

### 2.5 Get Current User

```
GET /auth/me
```

**Description:** Get current authenticated user's profile.

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "uid": "abc123def456",
        "email": "john@company.com",
        "displayName": "John Doe",
        "role": "owner",
        "phone": "+919876543210",
        "orgId": "665a1b2c3d4e5f6a7b8c9d0f",
        "orgName": "Acme Corp",
        "onboardingComplete": true,
        "createdAt": "2026-06-01T10:00:00Z",
        "lastLogin": "2026-06-20T09:15:00Z"
    }
}
```

---

### 2.6 Forgot Password (Send OTP)

```
POST /auth/forgot-password
```

**Description:** Send password reset OTP to email.

**Auth Required:** No

**Request Body:**
```json
{
    "email": "john@company.com"
}
```

---

### 2.7 Forgot Password (Reset)

```
POST /auth/reset-password
```

**Description:** Reset password with OTP verification.

**Auth Required:** No

**Request Body:**
```json
{
    "email": "john@company.com",
    "otp": "123456",
    "newPassword": "NewSecurePass456"
}
```

---

### 2.8 Logout

```
POST /auth/logout
```

**Description:** Clear auth cookie and end session.

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "message": "Logged out successfully"
}
```

---

## 3. Organization Routes

### 3.1 Create Organization

```
POST /organizations
```

**Auth Required:** Yes (owner)

**Request Body:**
```json
{
    "name": "Acme Corp",
    "domain": "acmecorp.com",
    "industry": "FinTech & Payments",
    "microVertical": "Digital Lending",
    "size": "51-200",
    "website": "https://acmecorp.com"
}
```

**Success Response (201):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a1b2c3d4e5f6a7b8c9d0f",
        "name": "Acme Corp",
        "domain": "acmecorp.com",
        "industry": "FinTech & Payments",
        "onboardingComplete": false,
        "createdAt": "2026-06-20T10:00:00Z"
    },
    "message": "Organization created successfully"
}
```

### 3.2 Get Organization by Domain

```
GET /organizations/by-domain?domain=acmecorp.com
```

**Auth Required:** No

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a1b2c3d4e5f6a7b8c9d0f",
        "name": "Acme Corp",
        "industry": "FinTech & Payments",
        "size": "51-200"
    }
}
```

**Error:**
| Status | error_code | Condition |
|--------|-----------|-----------|
| 404 | `ORG_NOT_FOUND` | No organization with this domain |

### 3.3 Update Organization

```
PUT /organizations/{orgId}
```

**Auth Required:** Yes (owner of org)

**Request Body:** (Partial update — only send changed fields)
```json
{
    "name": "Acme Corp Updated",
    "industry": "FinTech & Payments",
    "onboardingComplete": true
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a1b2c3d4e5f6a7b8c9d0f",
        "name": "Acme Corp Updated",
        "onboardingComplete": true
    },
    "message": "Organization updated"
}
```

### 3.4 List Employees in Organization

```
GET /organizations/{orgId}/employees?department=Engineering&page=1&limit=20
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "_id": "665a1b2c3d4e5f6a7b8c9d10",
            "userId": "...",
            "displayName": "Amit Kumar",
            "email": "amit@acmecorp.com",
            "department": "Engineering",
            "role": "Senior Engineer",
            "managerId": "...",
            "managerName": "Priya Sharma"
        }
    ],
    "page": 1,
    "limit": 20,
    "total": 15
}
```

---

## 4. Onboarding & Intelligence Routes

### 4.1 Analyze Domain (Pre-AI Intelligence)

```
POST /intelligence/analyze-domain
```

**Description:** AI analyzes a company domain to determine industry, description, size.

**Auth Required:** Yes

**Request Body:**
```json
{
    "domain": "acmecorp.com",
    "websiteContent": "Acme Corp is a leading FinTech company..."
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "companyName": "Acme Corp",
        "industry": "FinTech & Payments",
        "microVertical": "Digital Lending",
        "size": "51-200",
        "description": "Acme Corp is a FinTech company specializing in digital lending solutions...",
        "confidence": 0.85
    }
}
```

### 4.2 Scrape Website

```
POST /scrape/url
```

**Description:** Scrape company website for content and structure.

**Auth Required:** Yes

**Request Body:**
```json
{
    "url": "https://acmecorp.com"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "title": "Acme Corp — Digital Lending Solutions",
        "description": "Leading FinTech platform...",
        "pages": ["about", "services", "team", "contact"],
        "socialLinks": {
            "linkedin": "https://linkedin.com/company/acmecorp",
            "twitter": "https://twitter.com/acmecorp"
        },
        "rawText": "Full scraped text content..."
    }
}
```

### 4.3 Detect Social Presence

```
POST /social/detect
```

**Description:** Detect social media profiles for the organization.

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a1b2c3d4e5f6a7b8c9d0f",
    "website": "https://acmecorp.com",
    "name": "Acme Corp"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "linkedin": { "url": "https://linkedin.com/company/acmecorp", "status": "verified" },
        "twitter": { "url": "https://twitter.com/acmecorp", "status": "verified" },
        "instagram": { "url": null, "status": "not_found" },
        "facebook": { "url": null, "status": "not_found" },
        "youtube": { "url": null, "status": "not_found" }
    }
}
```

### 4.4 Master Agent — Initialize

```
POST /agent/init
```

**Description:** Initialize the master agent for onboarding conversation.

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a1b2c3d4e5f6a7b8c9d0f",
    "userRole": "owner"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "conversationId": "665a...",
        "message": "Hi! I'm your AI co-founder. Let me understand your business. What are your top 3 goals for this quarter?",
        "state": {
            "understanding_level": 5,
            "current_phase": "goals"
        }
    }
}
```

### 4.5 Master Agent — Chat

```
POST /agent/chat
```

**Description:** Continue onboarding conversation with master agent.

**Auth Required:** Yes

**Request Body:**
```json
{
    "conversationId": "665a...",
    "message": "We want to increase MRR by 20% and reduce churn."
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "message": "Great goals! Let's talk about MRR first. What's your current MRR and which channels drive most revenue?",
        "state": {
            "understanding_level": 25,
            "current_phase": "goals_mrr",
            "missing_info": ["current MRR", "revenue channels"]
        },
        "isComplete": false
    }
}
```

---

## 5. Goal Routes

### 5.1 Create Goal

```
POST /goals
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a1b2c3d4e5f6a7b8c9d0f",
    "title": "Increase Monthly Recurring Revenue by 20%",
    "description": "Grow MRR from $100K to $120K",
    "department": "Sales",
    "timeline": {
        "start": "2026-06-01T00:00:00Z",
        "end": "2026-09-30T00:00:00Z"
    }
}
```

**Success Response (201):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a1b2c3d4e5f6a7b8c9d13",
        "title": "Increase Monthly Recurring Revenue by 20%",
        "status": "active",
        "createdAt": "2026-06-20T10:00:00Z"
    },
    "message": "Goal created successfully"
}
```

### 5.2 Get Goal Suggestions (AI)

```
GET /goals/suggest?orgId=665a...&department=Sales
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "title": "Increase MRR by 20%",
            "description": "Based on your growth conversation...",
            "department": "Sales",
            "rationale": "You mentioned revenue growth as priority"
        },
        {
            "title": "Reduce Customer Churn to 5%",
            "description": "...",
            "department": "Product",
            "rationale": "Churn was identified as a key challenge"
        }
    ]
}
```

### 5.3 Generate Strategies for Goal

```
POST /goals/{goalId}/generate-strategies
```

**Auth Required:** Yes (owner/manager)

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "goalId": "665a...",
        "strategies": [
            {
                "id": "strat_1",
                "title": "Launch Customer Referral Program",
                "description": "Incentivize existing customers to refer...",
                "expectedImpact": "15-20% increase in new leads"
            },
            {
                "id": "strat_2",
                "title": "Increase Pricing by 15%",
                "description": "Price optimization based on market analysis...",
                "expectedImpact": "15% direct MRR increase"
            }
        ]
    }
}
```

### 5.4 Generate Tasks from Strategy

```
POST /goals/{goalId}/generate-tasks
```

**Auth Required:** Yes (owner/manager)

**Request Body:**
```json
{
    "strategyId": "strat_1"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "goalId": "665a...",
        "strategyId": "strat_1",
        "tasks": [
            {
                "title": "Design referral program landing page",
                "description": "Create a landing page...",
                "priority": "high",
                "department": "Design",
                "suggestedDeadline": "2026-06-25"
            },
            {
                "title": "Set up referral tracking system",
                "priority": "high",
                "department": "Engineering",
                "suggestedDeadline": "2026-06-30"
            }
        ]
    }
}
```

### 5.5 Goal Chat

```
POST /goals/{goalId}/chat
```

**Description:** Goal-specific refinement chat with AI.

**Auth Required:** Yes

**Request Body:**
```json
{
    "message": "Can you help me break this goal into smaller milestones?"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "message": "Sure! For 'Increase MRR by 20%', here are suggested milestones...",
        "actionItems": ["Define Q1 milestones", "Assign owners per milestone"]
    }
}
```

---

## 6. Task Routes

### 6.1 Create Task

```
POST /tasks
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a...",
    "goalId": "665a...",
    "title": "Design referral program landing page",
    "description": "Create a landing page for the referral program",
    "assigneeId": "665a...",
    "priority": "high",
    "deadline": "2026-06-25T23:59:59Z",
    "tags": ["design", "marketing"],
    "dependencies": []
}
```

**Success Response (201):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a...",
        "title": "Design referral program landing page",
        "status": "todo",
        "createdAt": "2026-06-20T10:00:00Z"
    },
    "message": "Task created successfully"
}
```

### 6.2 List Tasks

```
GET /tasks?orgId=665a...&status=todo&assigneeId=665a...&page=1&limit=20
```

**Auth Required:** Yes

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| orgId | string | **Required.** Organization ID |
| status | string | Filter by status |
| assigneeId | string | Filter by assignee |
| goalId | string | Filter by goal |
| priority | string | Filter by priority |
| search | string | Text search on title |
| sort | string | Sort field (default: createdAt) |
| order | string | `asc` or `desc` (default: desc) |

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "_id": "665a...",
            "title": "Design landing page",
            "status": "in_progress",
            "priority": "high",
            "deadline": "2026-06-25T23:59:59Z",
            "assignee": { "_id": "...", "displayName": "Amit Kumar" },
            "goal": { "_id": "...", "title": "Increase MRR" },
            "commentCount": 2,
            "overdue": false
        }
    ],
    "page": 1,
    "limit": 20,
    "total": 12
}
```

### 6.3 Update Task Status

```
PUT /tasks/{taskId}
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "status": "in_progress"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a...",
        "status": "in_progress",
        "updatedAt": "2026-06-20T10:30:00Z"
    },
    "message": "Task updated"
}
```

### 6.4 Add Comment to Task

```
POST /tasks/{taskId}/comments
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "text": "Started working on the initial mockups"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a...",
        "userId": "665a...",
        "displayName": "Amit Kumar",
        "text": "Started working on the initial mockups",
        "createdAt": "2026-06-20T10:30:00Z"
    },
    "message": "Comment added"
}
```

### 6.5 Approve Task

```
POST /tasks/{taskId}/approve
```

**Auth Required:** Yes (manager/reviewer)

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a...",
        "status": "done",
        "approvedAt": "2026-06-20T11:00:00Z",
        "approvedBy": "665a..."
    },
    "message": "Task approved"
}
```

---

## 7. Executive Chat Routes

### 7.1 Send Message

```
POST /executive-chat/
```

**Auth Required:** Yes (owner)

**Request Body:**
```json
{
    "orgId": "665a...",
    "message": "How is our financial health this quarter?",
    "conversationId": "665a..." (optional, for follow-ups)
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "conversationId": "665a...",
        "response": "Based on your data:\n\n💰 **Finance:** Revenue is up 22% QoQ. Cash flow positive at $120K. Burn rate at $85K/month.\n\n⚙️ **Operations:** Team capacity at 78%. No critical bottlenecks detected.\n\n📈 **Strategy:** Market conditions favorable. Consider expanding to SME segment.",
        "agentsInvoked": ["finance", "operations", "strategy"],
        "actionItems": [
            {
                "type": "review",
                "title": "Review SME market expansion plan",
                "description": "Based on strategy recommendation"
            },
            {
                "type": "meeting",
                "title": "Schedule quarterly budget review"
            }
        ],
        "timestamp": "2026-06-20T10:00:00Z"
    }
}
```

### 7.2 Get Conversation History

```
GET /executive-chat/history?orgId=665a...&page=1&limit=10
```

**Auth Required:** Yes (owner)

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "conversationId": "665a...",
            "preview": "How is our financial health?...",
            "messageCount": 5,
            "lastMessageAt": "2026-06-20T10:00:00Z"
        }
    ],
    "page": 1,
    "limit": 10,
    "total": 3
}
```

---

## 8. Dashboard Routes

### 8.1 Get Dashboard Insights

```
GET /dashboard/insights?orgId=665a...
```

**Auth Required:** Yes

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| orgId | string | **Required.** Organization ID |
| module | string | Optional: `founder`, `finance`, `operations`, `productivity`, `workflow` |

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "role": "owner",
        "kpis": {
            "activeGoals": 5,
            "completionRate": 78,
            "teamSize": 12,
            "tasksDueThisWeek": 8,
            "overdueTasks": 2,
            "orgHealthScore": 74
        },
        "modules": {
            "founder": { "score": 85, "insights": ["..."], "trend": "+5%" },
            "finance": { "score": 72, "insights": ["..."], "trend": "+2%" },
            "operations": { "score": 68, "insights": ["..."], "trend": "-3%" },
            "productivity": { "score": 79, "insights": ["..."], "trend": "+8%" },
            "workflow": { "score": 71, "insights": ["..."], "trend": "+1%" }
        },
        "aiInsights": [
            {
                "type": "achievement",
                "message": "Your team completed 12 tasks this week, 20% above last week.",
                "actionUrl": "/dashboard/tasks"
            },
            {
                "type": "alert",
                "message": "Goal 'Reduce Churn' is behind schedule at 45% completion.",
                "actionUrl": "/goals/665a..."
            }
        ],
        "recentActivity": [
            { "type": "task_completed", "text": "Amit completed 'Fix login bug'", "timeAgo": "30m ago" }
        ]
    }
}
```

---

## 9. Report Routes

### 9.1 Generate Employee Report

```
POST /reports/generate
```

**Auth Required:** Yes (owner/manager)

**Request Body:**
```json
{
    "orgId": "665a...",
    "employeeId": "665a...",
    "period": {
        "start": "2026-05-01T00:00:00Z",
        "end": "2026-06-20T00:00:00Z"
    }
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "employeeName": "Amit Kumar",
        "department": "Engineering",
        "period": "May 1 - June 20, 2026",
        "overallRating": 8.2,
        "ratingLabel": "Excellent",
        "taskCompletion": {
            "completed": 12,
            "total": 14,
            "onTime": 11,
            "percentage": 87
        },
        "strengths": [
            "Consistently delivers quality work before deadlines",
            "Excellent code review participation",
            "Proactive problem identification"
        ],
        "improvements": [
            "Deadline estimation needs refinement",
            "Cross-team communication frequency could increase"
        ],
        "aiRecommendation": "Consider assigning cross-team projects to leverage technical expertise",
        "downloadUrl": "/api/v1/reports/download/665a...pdf"
    }
}
```

### 9.2 Get Org Health

```
GET /reports/org-health?orgId=665a...
```

**Auth Required:** Yes (owner)

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "overallScore": 74,
        "trend": "+5% from last month",
        "dimensions": [
            { "name": "Goal Completion", "score": 65, "weight": 25, "color": "warning" },
            { "name": "Task Quality", "score": 78, "weight": 20, "color": "good" },
            { "name": "Org Structure", "score": 60, "weight": 15, "color": "warning" },
            { "name": "Team Performance", "score": 82, "weight": 25, "color": "excellent" },
            { "name": "Market Position", "score": 75, "weight": 15, "color": "good" }
        ],
        "topRecommendation": "Improve org structure clarity with defined reporting lines"
    }
}
```

---

## 10. Market Trends Routes

### 10.1 Get Market News

```
GET /trends/news?orgId=665a...&industry=FinTech
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "title": "RBI introduces new digital lending guidelines",
            "source": "Economic Times",
            "publishedAt": "2026-06-19T10:00:00Z",
            "summary": "RBI has announced new guidelines...",
            "impact": {
                "level": "high",
                "description": "May affect your digital lending product compliance"
            }
        }
    ]
}
```

### 10.2 Get Investment Recommendations

```
GET /trends/recommendations?orgId=665a...
```

**Auth Required:** Yes (owner)

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "title": "Invest in compliance automation tool",
            "roi": "150% in 6 months",
            "timeline": "3 months",
            "risk": "low",
            "rationale": "New regulations make compliance automation critical"
        }
    ]
}
```

---

## 11. File Processing Routes

### 11.1 Upload and Process

```
POST /upload/process
```

**Auth Required:** Yes

**Request:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| file | File | Yes |
| orgId | String | Yes |

**Supported File Types:**
- PDF (application/pdf)
- DOCX (application/vnd.openxmlformats-officedocument.wordprocessingml.document)
- XLSX (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
- CSV (text/csv)
- Images (image/png, image/jpeg) — OCR via pytesseract

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "fileId": "665a...",
        "filename": "quarterly_report.pdf",
        "chunksCount": 15,
        "fileSize": 245000,
        "aiInsights": "This document contains Q2 financial results showing 22% revenue growth...",
        "message": "File processed successfully. 15 text chunks indexed for semantic search."
    }
}
```

### 11.2 Search Files

```
POST /files/search
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a...",
    "query": "revenue growth Q2",
    "limit": 5
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "text": "Revenue grew by 22% in Q2 2026 driven by...",
            "filename": "quarterly_report.pdf",
            "score": 0.92
        }
    ]
}
```

---

## 12. Notification Routes

### 12.1 Get Notifications

```
GET /notifications?userId=665a...&read=false&page=1&limit=20
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "_id": "665a...",
            "type": "task_assigned",
            "title": "New task: Design landing page",
            "message": "John assigned you: 'Design landing page'",
            "link": "/dashboard/task/665a...",
            "read": false,
            "createdAt": "2026-06-20T10:00:00Z"
        }
    ],
    "page": 1,
    "limit": 20,
    "total": 5,
    "unreadCount": 3
}
```

### 12.2 Mark Notification Read

```
PUT /notifications/{notifId}/read
```

**Auth Required:** Yes

### 12.3 Mark All Read

```
PUT /notifications/read-all
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "userId": "665a..."
}
```

---

## 13. Zoho Integration Routes

### 13.1 Connect Zoho

```
GET /zoho/auth
```

**Description:** Redirects user to Zoho OAuth authorization page.

**Auth Required:** Yes

**Response:** HTTP 302 redirect to Zoho OAuth URL.

### 13.2 Zoho OAuth Callback

```
GET /zoho/callback?code=abc123&state=xyz
```

**Description:** Handles Zoho OAuth callback, stores tokens.

**Success Response (200):**
```json
{
    "ok": true,
    "message": "Zoho connected successfully"
}
```

### 13.3 Check Calendar Availability

```
POST /zoho/calendar/check-availability
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a...",
    "date": "2026-06-25",
    "durationMinutes": 30
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "date": "2026-06-25",
        "availableSlots": [
            { "start": "09:00", "end": "09:30" },
            { "start": "10:00", "end": "10:30" },
            { "start": "14:00", "end": "14:30" }
        ]
    }
}
```

### 13.4 Book Meeting

```
POST /zoho/calendar/book
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a...",
    "summary": "Q3 Planning Meeting",
    "description": "Quarterly planning session",
    "startTime": "2026-06-25T10:00:00Z",
    "endTime": "2026-06-25T10:30:00Z",
    "attendees": ["amit@acmecorp.com"]
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "eventId": "zoho_event_123",
        "summary": "Q3 Planning Meeting",
        "startTime": "2026-06-25T10:00:00Z",
        "endTime": "2026-06-25T10:30:00Z",
        "meetLink": "https://meet.zoho.com/..."
    },
    "message": "Meeting booked successfully"
}
```

---

## 14. AI Assistant Routes

**Implementation:** `backend/app/api/assistant.py`, `frontend/src/app/dashboard/assistant/page.tsx`, `frontend/src/stores/assistantStore.ts`

### 14.1 Send Message to AI Assistant

```
POST /assistant/chat
```

**Auth Required:** Yes (employee)

**Description:** Employee-facing AI assistant for task management, delegation, and general help.

**Request Body:**
```json
{
    "orgId": "665a...",
    "message": "Create a task to review Q3 budget by Friday",
    "conversationId": "665a..." (optional)
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "conversationId": "665a...",
        "response": "I'll create that task for you. Here's what I'll set up:\n\n**Title:** Review Q3 budget\n**Deadline:** Friday, 2026-06-27\n**Status:** Todo\n\nShall I assign it to someone?",
        "intent": "create_task",
        "confidence": 0.92,
        "actionPreview": {
            "type": "task",
            "title": "Review Q3 budget",
            "deadline": "2026-06-27T23:59:59Z"
        },
        "requiresConfirmation": true
    }
}
```

### 14.2 Confirm Assistant Action

```
POST /assistant/confirm
```

**Auth Required:** Yes (employee)

**Request Body:**
```json
{
    "conversationId": "665a...",
    "confirmationId": "cfm_123",
    "confirmed": true,
    "modifications": {
        "assigneeId": "665a..."
    }
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "action": "task_created",
        "resourceId": "665a...",
        "message": "Task 'Review Q3 budget' created and assigned to Amit Kumar"
    }
}
```

---

## 15. Chatbot Routes

**Implementation:** `backend/app/api/chatbot.py`

### 15.1 Send Message to Chatbot

```
POST /chatbot/message
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a...",
    "message": "How is my task progress?",
    "type": "employee_chat"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "response": "You have 5 tasks this week: 3 completed, 1 in progress, 1 todo. Your completion rate is 60%.",
        "quickActions": [
            { "label": "View tasks", "action": "navigate", "url": "/dashboard/task" }
        ]
    }
}
```

### 15.2 Employee Persona Chat

```
POST /chatbot/employee-persona
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a...",
    "message": "I prefer working on backend tasks",
    "conversationId": "665a..."
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "message": "Noted! I'll prioritize backend-related tasks in your recommendations.",
        "isComplete": false
    }
}
```

---

## 16. Expert Agents Routes

**Implementation:** `backend/app/api/expert_agents.py`, `backend/app/agents/expert_agents.py`

### 16.1 Query Specific Expert Agent

```
POST /expert-agents/query
```

**Auth Required:** Yes (owner)

**Request Body:**
```json
{
    "orgId": "665a...",
    "agentType": "finance",
    "query": "What's our burn rate trend?"
}
```

**Agent Types:** `finance`, `operations`, `strategy`, `hr`, `sales`, `product`

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "agentType": "finance",
        "response": "Your burn rate has decreased from $95K to $85K over the last 3 months...",
        "confidence": 0.88,
        "dataPoints": ["revenue: $120K MRR", "burn: $85K/mo", "runway: 14 months"],
        "sources": ["Q2 Financials", "P&L Statement"]
    }
}
```

---

## 17. Learning Engine Routes

**Implementation:** `backend/app/api/learning.py`, `backend/app/core/learning.py`

### 17.1 Record Learning Pattern

```
POST /learning/record-pattern
```

**Auth Required:** Yes (internal/scheduler)

**Request Body:**
```json
{
    "orgId": "665a...",
    "type": "bottleneck",
    "title": "Approval bottleneck in Engineering",
    "insight": "Tasks requiring manager approval in Engineering take 3.2x longer on average",
    "impact": "Delays project delivery by 2 days per sprint",
    "actionable": true
}
```

**Success Response (201):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a...",
        "type": "bottleneck",
        "title": "Approval bottleneck in Engineering"
    }
}
```

### 17.2 Detect Bottlenecks

```
POST /learning/detect-bottlenecks
```

**Auth Required:** Yes (owner)

**Request Body:**
```json
{
    "orgId": "665a..."
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "bottlenecks": [
            {
                "type": "approval_delay",
                "department": "Engineering",
                "severity": "high",
                "affectedTasks": 5,
                "avgDelayDays": 3.2,
                "recommendation": "Consider delegating approval authority to team leads"
            },
            {
                "type": "dependency_chain",
                "description": "3 tasks blocked by single dependency",
                "severity": "medium",
                "affectedTasks": 3,
                "recommendation": "Break dependency chain by parallelizing work"
            }
        ],
        "overallHealth": "fair"
    }
}
```

---

## 18. Org Chart Routes

**Implementation:** `backend/app/api/org_chart.py`

### 18.1 Get Org Chart Tree

```
GET /org-chart/tree?orgId=665a...
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "userId": "665a...",
            "displayName": "John Doe",
            "position": "CEO",
            "level": 0,
            "children": [
                {
                    "userId": "665a...",
                    "displayName": "Priya Sharma",
                    "position": "CTO",
                    "level": 1,
                    "children": [
                        {
                            "userId": "665a...",
                            "displayName": "Amit Kumar",
                            "position": "Senior Engineer",
                            "level": 2,
                            "children": []
                        }
                    ]
                }
            ]
        }
    ]
}
```

---

## 19. Prompt Template Routes

**Implementation:** `backend/app/api/prompt.py`, `backend/app/core/prompt_engine.py`

### 19.1 List Prompt Templates

```
GET /prompt/templates?type=expert
```

**Auth Required:** Yes (admin/developer)

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "templates": [
            {
                "name": "expert_finance",
                "type": "expert",
                "description": "Finance expert agent persona",
                "version": 2,
                "updatedAt": "2026-06-15T10:00:00Z"
            }
        ]
    }
}
```

### 19.2 Get Prompt Template Detail

```
GET /prompt/templates/{templateName}
```

**Auth Required:** Yes (admin/developer)

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "name": "expert_finance",
        "type": "expert",
        "systemPrompt": "You are a financial analyst...",
        "version": 2,
        "createdAt": "2026-06-01T10:00:00Z",
        "updatedAt": "2026-06-15T10:00:00Z"
    }
}
```

### 19.3 Update Prompt Template

```
PUT /prompt/templates/{templateName}
```

**Auth Required:** Yes (admin/developer)

**Request Body:**
```json
{
    "systemPrompt": "Updated persona prompt...",
    "version": 3
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "name": "expert_finance",
        "version": 3,
        "updatedAt": "2026-06-20T10:00:00Z"
    },
    "message": "Template updated"
}
```

---

## 20. Notification Preferences Routes

**Implementation:** `backend/app/api/notification_preferences.py`

### 20.1 Get Notification Preferences

```
GET /notification-preferences?userId=665a...
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "emailEnabled": true,
        "pushEnabled": true,
        "inAppEnabled": true,
        "types": {
            "task_assigned": true,
            "task_overdue": true,
            "task_completed": false,
            "goal_update": true,
            "mention": true,
            "escalation": true,
            "team_update": false
        },
        "quietHoursStart": "22:00",
        "quietHoursEnd": "08:00"
    }
}
```

### 20.2 Update Notification Preferences

```
PUT /notification-preferences
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "userId": "665a...",
    "pushEnabled": false,
    "types": {
        "task_assigned": true,
        "task_overdue": true,
        "team_update": false
    },
    "quietHoursStart": "23:00",
    "quietHoursEnd": "07:00"
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "data": {
        "emailEnabled": true,
        "pushEnabled": false,
        "inAppEnabled": true
    },
    "message": "Preferences updated"
}
```

---

## 21. Push Subscription Routes

**Implementation:** `backend/app/api/push_subscriptions.py`, `frontend/src/lib/pushNotifications.ts`

### 21.1 Subscribe to Push Notifications

```
POST /push/subscribe
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "userId": "665a...",
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
        "p256dh": "base64encodedkey...",
        "auth": "base64encodedauth..."
    }
}
```

**Success Response (201):**
```json
{
    "ok": true,
    "message": "Subscribed to push notifications"
}
```

### 21.2 Unsubscribe

```
POST /push/unsubscribe
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "userId": "665a...",
    "endpoint": "https://fcm.googleapis.com/..."
}
```

**Success Response (200):**
```json
{
    "ok": true,
    "message": "Unsubscribed from push notifications"
}
```

---

## 22. Meeting Routes

**Implementation:** `backend/app/api/meetings.py`

### 22.1 List Meetings

```
GET /meetings?orgId=665a...&page=1&limit=10
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "_id": "665a...",
            "title": "Sprint Planning",
            "meetingDate": "2026-06-19T10:00:00Z",
            "extractedTaskCount": 4,
            "createdAt": "2026-06-19T11:00:00Z"
        }
    ],
    "page": 1,
    "limit": 10,
    "total": 5
}
```

### 22.2 Create Meeting

```
POST /meetings
```

**Auth Required:** Yes

**Request Body:**
```json
{
    "orgId": "665a...",
    "title": "Sprint Retrospective",
    "transcript": "Full transcript text of the meeting...",
    "meetingDate": "2026-06-25T10:00:00Z"
}
```

**Success Response (201):**
```json
{
    "ok": true,
    "data": {
        "_id": "665a...",
        "title": "Sprint Retrospective",
        "extractedTasks": [
            { "title": "Improve CI pipeline speed", "assignee": null },
            { "title": "Add more unit tests", "assignee": null }
        ],
        "message": "Meeting saved. 2 tasks extracted from transcript."
    }
}
```

---

## 23. File Management Routes

**Implementation:** `backend/app/api/file_processing.py`, `frontend/src/stores/documentStore.ts`

### 23.1 List Uploaded Files

```
GET /files/list?orgId=665a...&page=1&limit=20
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "data": [
        {
            "_id": "665a...",
            "filename": "quarterly_report.pdf",
            "fileType": "pdf",
            "fileSize": 245000,
            "aiInsights": "This document contains Q2 financial results...",
            "createdAt": "2026-06-20T10:00:00Z"
        }
    ],
    "page": 1,
    "limit": 20,
    "total": 8
}
```

### 23.2 Delete File

```
DELETE /files/{fileId}
```

**Auth Required:** Yes

**Success Response (200):**
```json
{
    "ok": true,
    "message": "File deleted successfully (including vector embeddings)"
}
```

---

## 24. Health Check Routes

**Implementation:** `backend/app/api/health.py`

### 24.1 Health Check

```
GET /health
```

**Auth Required:** No

**Success Response (200):**
```json
{
    "ok": true,
    "status": "healthy",
    "version": "1.0.0",
    "services": {
        "database": { "status": "connected", "latencyMs": 12 },
        "qdrant": { "status": "connected", "latencyMs": 45 },
        "ai": { "status": "available", "provider": "xAI" },
        "firebase": { "status": "connected" }
    },
    "uptimeSeconds": 3600,
    "timestamp": "2026-06-20T10:00:00Z"
}
```

---

## 25. WebSocket Events

**Implementation:** `backend/app/api/websocket.py`, `backend/app/core/socket_manager.py`, `frontend/src/hooks/useWebSocket.ts`

### 25.1 Connection

```
WebSocket: wss://api.yesboss.ai/ws?token={jwt}&org_id={orgId}
```

**Connection Lifecycle:**
1. Auth: Verify JWT, extract user_id + org_id
2. Register: `socket_manager.register(org_id, user_id, websocket)`
3. Events: Bidirectional JSON messages
4. Reconnect: Exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max)
5. Fallback: 30s polling when WebSocket unavailable

### 25.2 Server → Client Events

| Event | Payload | Description | Frontend Handler |
|-------|---------|-------------|------------------|
| `task:created` | `{ taskId, title, assigneeId, orgId }` | New task assigned | `taskStore.addTask()`, toast notification |
| `task:updated` | `{ taskId, status, updatedBy, orgId }` | Task status changed | `taskStore.updateTask()` |
| `task:deleted` | `{ taskId, orgId }` | Task removed | `taskStore.removeTask()` |
| `task:overdue` | `{ taskId, title, daysOverdue, orgId }` | Task became overdue | `notificationStore.add()`, toast |
| `goal:updated` | `{ goalId, title, status, orgId }` | Goal status changed | `goalStore.updateGoal()` |
| `notification:new` | `{ notificationId, type, title, message, link }` | New notification | `notificationStore.add()`, toast |
| `team:update` | `{ type, text, timestamp, orgId }` | Team activity update | `dashboardStore.addActivity()` |
| `system:alert` | `{ level, message, orgId }` | System-level alert | Global alert banner |

### 25.3 Client → Server Events

| Event | Payload | Description | Backend Handler |
|-------|---------|-------------|-----------------|
| `task:status:change` | `{ taskId, newStatus, orgId }` | User changed task status | `tasks.py` → update status → broadcast |
| `notification:read` | `{ notificationId, userId }` | User read a notification | `notifications.py` → mark read |
| `ping` | `{}` | Keep-alive | `socket_manager.py` → respond `pong` |

### 25.4 Rate Limits

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Non-AI endpoints | 100 requests | 1 minute |
| AI endpoints | 20 requests | 1 minute |
| Auth endpoints | 10 requests (login) | 1 minute (5 failed → 5 min block) |
| Upload endpoints | 10 requests | 1 minute |
| WebSocket messages | 60 messages | 1 minute |

---

## 26. API Route Map (All 28 Modules)

| # | Route Prefix | File | Endpoints Count | Auth | Key Features |
|---|-------------|------|:--------------:|:----:|-------------|
| 1 | `/api/v1/health` | `health.py` | 1 | No | Service health status |
| 2 | `/api/v1/auth` | `auth.py` | 8 | Mixed | Signup, login, OTP, logout, forgot/reset password |
| 3 | `/api/v1/organizations` | `organizations.py` | 4 | Mixed | CRUD org, domain lookup, list employees |
| 4 | `/api/v1/employees` | `employees.py` | 4 | Yes | CRUD employees, department/manager assignment |
| 5 | `/api/v1/goals` | `goals.py` | 7 | Yes | CRUD goals, AI suggestions, strategies, tasks, goal chat |
| 6 | `/api/v1/tasks` | `tasks.py` | 7 | Yes | CRUD tasks, comments, approval, status transitions |
| 7 | `/api/v1/dashboard` | `dashboard.py` | 1 | Yes | Dashboard insights with KPIs and modules |
| 8 | `/api/v1/executive-chat` | `executive_chat.py` | 2 | Yes (owner) | Multi-agent chat, history |
| 9 | `/api/v1/assistant` | `assistant.py` | 2 | Yes (employee) | AI assistant, action confirmation |
| 10 | `/api/v1/chatbot` | `chatbot.py` | 2 | Yes | General chatbot, employee persona |
| 11 | `/api/v1/agent` | `master_agent.py` | 3 | Yes | Init/chat/state for onboarding master agent |
| 12 | `/api/v1/expert-agents` | `expert_agents.py` | 1 | Yes (owner) | Query specific expert agent |
| 13 | `/api/v1/intelligence` | `intelligence.py` | 2 | Yes | Domain analysis, industry detection |
| 14 | `/api/v1/scrape` | `scrape.py` | 1 | Yes | Website scraping |
| 15 | `/api/v1/social` | `social.py` | 1 | Yes | Social media presence detection |
| 16 | `/api/v1/upload` | `upload.py` | 1 | Yes | File upload with validation |
| 17 | `/api/v1/files` | `file_processing.py` | 3 | Yes | List, search, delete files |
| 18 | `/api/v1/reports` | `reports.py` | 3 | Yes | Generate reports, org health, download PDF |
| 19 | `/api/v1/trends` | `market_trends.py` | 2 | Yes | Market news, investment recommendations |
| 20 | `/api/v1/notifications` | `notifications.py` | 3 | Yes | List, mark read, mark all read |
| 21 | `/api/v1/notification-preferences` | `notification_preferences.py` | 2 | Yes | Get/update notification preferences |
| 22 | `/api/v1/push` | `push_subscriptions.py` | 2 | Yes | Subscribe/unsubscribe push notifications |
| 23 | `/api/v1/meetings` | `meetings.py` | 2 | Yes | List/create meetings with transcript extraction |
| 24 | `/api/v1/organizations/org-chart` | `org_chart.py` | 1 | Yes | Org chart tree |
| 25 | `/api/v1/learning` | `learning.py` | 2 | Yes | Record patterns, detect bottlenecks |
| 26 | `/api/v1/prompt` | `prompt.py` | 3 | Yes (admin) | List/get/update prompt templates |
| 27 | `/api/v1/zoho` | `zoho_auth.py`, `zoho_calendar.py` | 4 | Yes | OAuth, calendar availability, book, task sync |
| 28 | `/ws` | `websocket.py` | 1 | Yes (token) | Real-time WebSocket connection |

---

## 27. Complete Error Codes Reference

| Code | HTTP Status | Description | Raised By |
|------|-------------|-------------|-----------|
| `AUTH_INVALID_TOKEN` | 401 | JWT token missing, expired, or invalid | `backend/app/dependencies/auth.py` |
| `AUTH_INSUFFICIENT_ROLE` | 403 | User role doesn't have permission | `backend/app/dependencies/auth.py` |
| `VALIDATION_ERROR` | 422 | Request body failed Pydantic validation | All routes via Pydantic schemas |
| `RESOURCE_NOT_FOUND` | 404 | Requested resource doesn't exist | All CRUD routes |
| `RESOURCE_CONFLICT` | 409 | Resource already exists (duplicate) | `auth.py`, `organizations.py` |
| `RATE_LIMITED` | 429 | Too many requests | Rate limiting middleware in `main.py` |
| `AI_PROVIDER_DOWN` | 503 | All AI providers unavailable | `backend/app/core/ai_client.py` |
| `AI_TIMEOUT` | 504 | AI response took too long (>30s) | `backend/app/core/ai_client.py` |
| `DB_TIMEOUT` | 503 | Database query timeout (>5s) | `backend/app/core/database.py` |
| `FILE_TOO_LARGE` | 400 | Upload exceeds max file size (25MB) | `backend/app/api/upload.py` |
| `UNSUPPORTED_FILE_TYPE` | 400 | File format not supported | `backend/app/core/file_processor.py` |
| `SCRAPE_BLOCKED` | 400 | Website blocked scraping attempt | `backend/app/core/scraper.py` |
| `ZOHO_API_ERROR` | 502 | Zoho API returned error | `backend/app/core/zoho/base.py` |
| `ZOHO_TOKEN_EXPIRED` | 401 | Zoho token needs re-authentication | `backend/app/core/zoho/base.py` |
| `EXTERNAL_SERVICE_DOWN` | 503 | Third-party service unavailable | Various |
| `GOAL_INVALID_STATUS` | 400 | Invalid goal status transition | `backend/app/api/goals.py` |
| `TASK_INVALID_TRANSITION` | 400 | Invalid task status transition | `backend/app/api/tasks.py` |
| `TASK_DEPENDENCY_BLOCKED` | 400 | Task dependencies not met | `backend/app/api/tasks.py` |
| `INSUFFICIENT_DATA` | 400 | Not enough data for AI analysis | `backend/app/api/reports.py` |
| `ONBOARDING_INCOMPLETE` | 400 | Onboarding must be completed first | `backend/app/api/` middleware |

---

## 28. API Security & Compliance

| Aspect | Specification | Implementation |
|--------|---------------|----------------|
| **Authentication** | Cookie-based JWT (httpOnly, secure, sameSite=lax, 30-day expiry) | `backend/app/dependencies/auth.py` |
| **Authorization** | Role-based access (owner/manager/employee) + org-scoped | `require_role()` decorator |
| **CORS** | Allowed: `localhost:3000`, `app.yesboss.ai` | `backend/app/main.py` → `CORSMiddleware` |
| **Rate Limiting** | Tiered: 100/min (non-AI), 20/min (AI), 10/min (auth) | In-memory counter in middleware |
| **Request Validation** | Pydantic v2 schemas on all POST/PUT/PATCH bodies | `backend/app/schemas/` |
| **Response Validation** | Pydantic response models on all endpoints | Inline in route definitions |
| **Idempotency** | GET/PUT/DELETE idempotent; POST creates new resources | REST convention enforced |
| **Pagination** | `?page=1&limit=20` — default 20, max 100 | `backend/app/dependencies/pagination.py` |
| **Sorting** | `?sort=field&order=asc|desc` | Per-route query param handling |
| **Filtering** | Query params for filterable fields | Per-route query param handling |
| **Error Responses** | Unified `{ ok, detail, error_code, field, timestamp }` | Global exception handlers in `main.py` |

---

*End of API Contracts — YesBoss v2.0*
