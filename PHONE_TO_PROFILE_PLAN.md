# Phone-to-Profile Migration Plan

> **Goal:** Remove phone from signup, add phone to personal profile with one-time OTP verification, and consolidate all personal profile fields to the external profile page.

## Constraints
- **DO NOT change the login flow** — login already supports email/password and phone/OTP correctly; leave it untouched.
- Phone verification in profile uses Firebase `signInWithPhoneNumber()` (same mechanism signup used before).

## Changes

### 1. Signup → Email-Only (`frontend/src/app/signup/page.tsx`)

**Remove:**
- `COUNTRY_CODES` array, `selectedCountry`, `confirmationResult`, `recaptchaReady`, `recaptchaVerifierRef`, `recaptchaInitPromiseRef` state
- `contactKind` phone detection & country-code JSX
- `sendPhoneOtp()` function, reCAPTCHA `useEffect`
- Phone branches in `verifyOtp()`, `finalizeSignup()`, and the OTP modal
- `Phone` / `ArrowRight` icon imports no longer needed

**Simplify:**
- `formData.contact` → `formData.email` (rename, no phone logic)
- `sendOtpToBackend()` → always called on submit
- `verifyOtp()` → email-only
- `finalizeSignup()` → email-only (no synthetic `@phone.yesboss.app` email)
- `canSubmit()` → validate email with `@`

### 2. Profile Page — Add Personal Card (`frontend/src/app/dashboard/profile/page.tsx`)

**Add a Personal Profile card** with:
- Avatar upload + DiceBear style picker
- Full Name, Email (read-only), Department, Role/Title
- **Phone field** with inline OTP verification (re-verification allowed)
- "Save Changes" button → `POST /employees/persona`
- Phone save → new `PUT /auth/me/phone` endpoint

**Phone flow:**
1. Show current phone (if any) with verified badge
2. "Edit" → inline input + country selector
3. "Send OTP" → Firebase `signInWithPhoneNumber()` 
4. OTP input + "Verify" → `confirmationResult.confirm(otp)`
5. On success → `PUT /auth/me/phone` (persists to Firebase + MongoDB)

### 3. Settings — Remove Profile Tab (`frontend/src/app/dashboard/settings/page.tsx`)

**Remove:**
- Profile tab trigger + content (~170 lines)
- Profile state: `profile`, `profileLoading`, `avatarUrl`, `avatarUploading`, `dicebearStyle`, `showStylePicker`, `profileError`, `fileInputRef`
- All handlers: `handleAvatarUpload`, `handleRemoveAvatar`, `handleStyleChange`
- Profile data loading in initial `useEffect`
- `OwnerList` card
- Unused imports

**Keep:** Notifications, Integrations, Feedback tabs

### 4. Backend — New `PUT /auth/me/phone` (`backend/app/api/auth.py`)

Updates phone in three stores:
1. Firebase (via `firebase_admin.update_user()`)
2. MongoDB `users` collection
3. MongoDB `employees` collection (matched by email)

### 5. Backend — Add `phone_verified` to `UserResponse` (`backend/app/api/auth.py`)

So the profile page can read the current verification status.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/app/signup/page.tsx` | Email-only signup |
| `frontend/src/app/dashboard/profile/page.tsx` | Personal profile card with phone OTP |
| `frontend/src/app/dashboard/settings/page.tsx` | Remove Profile tab |
| `backend/app/api/auth.py` | New endpoint + schema field |
