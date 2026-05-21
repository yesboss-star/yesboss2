# Persona Planner — YESBOSS

## Overview
The Persona flow replaces the old hardcoded AI chat step. It's a dynamic, AI-driven conversational onboarding that builds a deep understanding of the user (owner) to create a personalized operational dashboard.

---

## Flow

```
Social Page (Continue)
        │
        ▼
┌─────────────────────┐
│  PERSONA POPUP      │
│ "Do you have time?" │
│  [Yes]    [No]      │
└────────┬────────────┘
         │
    Yes  │  No → Skip to Dashboard (create-now-later)
         ▼
┌──────────────────────┐
│  PERSONA TIME        │
│ "We need ~X minutes" │
│  [Yes]    [No]       │
└────────┬─────────────┘
         │
    Yes  │  No → Skip to Dashboard
         ▼
┌──────────────────────────┐
│  PERSONA QUESTION (xN)   │
│  AI-generated question   │
│  3 options + custom text │
│  [Select or type answer] │
└────────┬─────────────────┘
         │
    Answer submitted
         │
    ┌────┴────────────────────────────┐
    │ AI analyzes answer              │
    │ Generates NEXT question based   │
    │ on THAT specific answer         │
    │ (real-time branching)           │
    └────┬────────────────────────────┘
         │
    Need more depth? (AI decides)
         │
    Yes  │  No → Next question
         ▼
┌─────────────────────┐
│  MORE TIME CHECK    │
│ "More questions?"   │
│  [Yes]    [No]      │
└────────┬────────────┘
         │
    Yes  │  No → Save & go to Dashboard
         ▼
    Back to PERSONA QUESTION
```

---

## What's Done

### Backend (`backend/app/api/chatbot.py`)
- ✅ New endpoint: `POST /api/v1/chatbot/persona/generate-question`
- ✅ AI generates questions based on full context (org name, industry, micro-vertical, size, previous answers)
- ✅ First question: Based on company analysis only
- ✅ Follow-up questions: Based on previous answers (real-time branching)
- ✅ Returns: `question`, `options[]`, `time_estimate`, `need_more_time`, `question_number`
- ✅ Fallback questions if AI fails
- ✅ Provider: Gemini (default)

### Backend (`backend/app/api/organizations.py`)
- ✅ Added `persona_answers` field to `OrganizationCreate` model
- ✅ Added `persona_answers` field to `OrganizationUpdate` model
- ✅ Answers saved to MongoDB on dashboard navigation

### Frontend (`frontend/src/app/onboarding/owner/page.tsx`)
- ✅ Step 7: Persona Popup — "Do you have time?" (Yes/No)
- ✅ Step 8: Persona Time — "We need ~X minutes" (Yes/No)
- ✅ Step 9: Persona Question — One question per page, 3 AI options + custom text
- ✅ Step 10: Persona More Time — AI asks only when needed (not every 3 questions)
- ✅ Dynamic question loading from backend
- ✅ Answers stored in state → saved to MongoDB on dashboard
- ✅ Auto-transition after 5+ questions
- ✅ Step labels renamed: "AI Chat" → "Persona"

---

## API Contract

### Request
```json
POST /api/v1/chatbot/persona/generate-question
{
  "org_name": "Value Score",
  "industry": "Technology",
  "micro_vertical": "AI Solutions",
  "company_size": "1-10",
  "previous_answers": [
    { "question": "...", "answer": "..." }
  ],
  "question_count": 1,
  "provider": "gemini"
}
```

### Response
```json
{
  "question": "What matters most to you in how you lead your team?",
  "options": [
    "Empowering others to decide",
    "Setting clear direction myself",
    "Collaborative decision-making"
  ],
  "time_estimate": 3,
  "need_more_time": false,
  "question_number": 1
}
```

---

## AI Prompt Strategy

### First Question
- Analyzes company context (name, industry, size, website, social)
- Asks genuine leadership/priority question
- Options reflect actual leadership archetypes

### Follow-up Questions
- Reads last 5 answers
- Generates question that connects to previous answer
- Options branch differently based on what user said
- `need_more_time` set by AI when it genuinely needs more depth

### Temperature: 0.8 (conversational, not robotic)

---

## What's Pending

- [ ] Goal creation page after persona flow
- [ ] Dashboard page that uses persona answers to personalize widgets
- [ ] Persona answers → dashboard mapping logic
- [ ] Employee persona flow (separate from owner)
- [ ] Save persona answers to Qdrant for semantic retrieval
- [ ] Dashboard AI insights based on persona data

---

## Data Flow

```
User Answers → MongoDB (organizations.persona_answers)
             → Qdrant (future: semantic retrieval)
             → Dashboard (personalization engine)
```

---

## Last Updated
2026-05-21
