# Onboarding Organization - Current Changes

## Overview
This document tracks all changes made to the owner onboarding flow to handle company detection, industry auto-fill, and web scraping.

---

## How to Check Commits on GitHub

### Step 1: Go to Repository
1. Open https://github.com/yesboss-star/yesboss2

### Step 2: Check Commits
1. Click on **"commits"** link (below the repo name)
2. You'll see the commit history
3. Our latest commit: `d63f9fb` - "Fix onboarding: dropdown selection and database TLS"

### Step 3: View Commit Details
1. Click on any commit to see:
   - Which files changed
   - Lines added/removed
   - Full diff of changes

---

## Auto-Sync Script for Team Collaboration

### Files Created:
- `auto-sync.ps1` - PowerShell script for Windows
- `auto-sync.sh` - Bash script for Mac/Linux
- `auto-sync-readme.md` - Setup instructions

### How to Use:
```powershell
# Windows - Run in project folder
.\auto-sync.ps1

# Or run in background
Start-Process powershell -ArgumentList "-File", ".\auto-sync.ps1" -WindowStyle Hidden
```

### What it does:
- Checks for new commits every 30 seconds
- Auto-pulls if changes exist
- Shows notification when updated
- No conflicts handled (keep this in mind)

---

## Changes Summary

### 1. Personal Email Detection
**File:** `frontend/src/app/onboarding/owner/page.tsx`

- Added `PERSONAL_EMAIL_DOMAINS` array to detect Gmail, Outlook, Yahoo, etc.
- If user has personal email, they can:
  - Enter company website manually
  - Or skip and enter details manually
- Company emails (with real domain) trigger automatic web scraping

### 2. Domain Analysis
**File:** `backend/app/core/intelligence.py`

- `analyze_company_from_domain()` - Analyzes company domain and returns:
  - `company_name` - From website title/meta
  - `industry` - AI-detected from website content
  - `micro_vertical` - AI-detected niche/sub-category
  - `website_url` - Full URL with https://
  - `size` - Company size estimate
  - `description` - AI-generated description

### 3. Company Search
**File:** `backend/app/core/intelligence.py`

- `/intelligence/company/search` endpoint
- AI searches by company name
- Returns company details + attempts web scraping

### 4. Web Scraping
**File:** `backend/app/core/scraper.py`

- `scrape_company()` - Scrapes website for:
  - Company name (from `<title>`, `og:title`, `<h1>`)
  - Homepage content
  - About section
  - Services
  - Social media links

### 5. Frontend Org-Details Page (FIXED)
**File:** `frontend/src/app/onboarding/owner/page.tsx`

**FIXED ISSUES:**
- Industry dropdown: Changed `onClick` → `onMouseDown` with `e.preventDefault()` for suggestion buttons (fixes blur closing dropdown before click registers)
- Micro-vertical dropdown: Same fix applied
- Micro-vertical display: Now shows selected micro-vertical as a purple chip/tag with X button to remove
- Suspense boundary: Added `Suspense` wrapper for `useSearchParams()` to fix Next.js build error
- Social links error handling: Added proper error logging

**Features:**
- Industry: Searchable dropdown with suggestions, multiple can be added
- Micro-Vertical: Searchable dropdown with suggestions, shows as purple chip when selected
- Website URL: Full URL (https://...)
- All fields auto-fill from:
  - Company email domain analysis
  - Company name suggestions

---

## API Endpoints

### Analyze Domain
```
POST /api/v1/intelligence/analyze/domain
Body: { "domain": "google.com" }
Response: {
  "domain": "google.com",
  "website_url": "https://google.com",
  "company_name": "Google",
  "industry": "Technology",
  "micro_vertical": "Search Engine & AI",
  "size": "500+",
  "description": "..."
}
```

### Company Search
```
POST /api/v1/intelligence/company/search
Body: { "email": "google" }
Response: {
  "name": "Google",
  "domain": "www.google.com",
  "website_url": "https://www.google.com",
  "industry": "Technology",
  "micro_vertical": "Search Engine & AI",
  "size": "500+",
  "description": "...",
  "found": true
}
```

---

## State Variables

**File:** `frontend/src/app/onboarding/owner/page.tsx`

```typescript
const [domainAnalyzed, setDomainAnalyzed] = useState(false);
const [companySuggestions, setCompanySuggestions] = useState<any[]>([]);
const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
const [showIndustrySuggestions, setShowIndustrySuggestions] = useState(false);
const [showMicroVerticalSuggestions, setShowMicroVerticalSuggestions] = useState(false);
const [industryInput, setIndustryInput] = useState("");
const [microVerticalInput, setMicroVerticalInput] = useState("");

const [orgData, setOrgData] = useState({
  name: "",
  domain: "",
  website_url: "",
  industries: [] as string[],  // Array for multiple industries
  size: "1-10",
  micro_vertical: "",
});
```

---

## Flow

### Company Email Flow
1. User enters email like `krisha@value-score.co.in`
2. System extracts domain: `value-score.co.in`
3. If NOT personal email → triggers `analyzeIndustryFromDomain()`
4. AI scrapes website + analyzes
5. All fields auto-fill
6. User can edit any field
7. Continues to AI scan or dashboard

### Personal Email Flow
1. User enters email like `krisha@gmail.com`
2. System detects personal email
3. Shows option to enter company website OR skip
4. User can type company name for suggestions
5. If suggestion clicked → auto-fills
6. If no suggestion → manual entry
7. Skips AI scan, goes directly to dashboard

---

## Test Commands

### Test Backend API
```powershell
# Domain analysis
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/intelligence/analyze/domain" -Method POST -ContentType "application/json" -Body '{"domain":"google.com"}'

# Company search
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/intelligence/company/search" -Method POST -ContentType "application/json" -Body '{"email":"google"}'
```

---

## Frontend Console Logs

Check browser console (F12) for debugging:
- `API Response:` - Shows raw API response
- `Company search response:` - Shows company search results
- `Setting micro_vertical:` - Shows when micro-vertical is set

---

## Backend Terminal Logs

Check backend terminal for:
- `Analyzing domain: X` - When starting analysis
- `AI raw response:` - Raw AI output
- `Detected - Industry: X, Micro-vertical: Y` - Final detection
- `Company search result:` - Search results

---

## Files Modified

### Backend
- `backend/app/core/intelligence.py` - AI analysis logic
- `backend/app/core/scraper.py` - Website scraping
- `backend/app/api/intelligence.py` - API endpoints
- `backend/app/api/organizations.py` - Organization API
- `backend/app/core/database.py` - Database connection (TLS fix)

### Frontend
- `frontend/src/app/onboarding/owner/page.tsx` - Onboarding UI (FIXED dropdowns)
- `frontend/src/stores/organizationStore.ts` - Added website_url to interface

---

## Testing Checklist

- [x] Industry dropdown - clicking suggestion adds it as chip
- [x] Micro-vertical dropdown - clicking suggestion adds it as chip
- [x] Remove button (X) works on both chips
- [x] Blur timeout doesn't close dropdown before click registers
- [x] Suspense boundary for useSearchParams
- [x] Social links update has proper error handling
- [ ] MongoDB connection works (TLS issue - check Atlas dashboard)

---

## Known Issues

1. **MongoDB TLS Connection**
   - SSL handshake failing in test environment
   - Check MongoDB Atlas dashboard:
     - Cluster not paused
     - IP whitelist includes server IP
     - Network connectivity

2. **TODO**
   - [ ] Test with various company domains
   - [ ] Verify MongoDB connection in production

---

## Last Updated
2026-05-20