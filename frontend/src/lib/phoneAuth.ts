import {
  Auth,
  ConfirmationResult,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  signInWithPhoneNumber,
} from "firebase/auth";
import { RECAPTCHA_SITE_KEY } from "@/lib/firebase";

/**
 * Lazily loads the Google reCAPTCHA script and builds an invisible
 * RecaptchaVerifier anchored to `containerId`. Shared by Settings (phone
 * linking) and Login (phone sign-in) so both use identical reCAPTCHA
 * lifecycle handling instead of two slightly-different copies.
 */
export async function initRecaptcha(auth: Auth, containerId: string): Promise<RecaptchaVerifier | null> {
  try {
    if (!document.getElementById(containerId)) {
      console.warn(`reCAPTCHA container #${containerId} not found in DOM`);
      return null;
    }
    if (!document.getElementById("google-recaptcha-js")) {
      const script = document.createElement("script");
      script.id = "google-recaptcha-js";
      script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    if (typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha === "undefined") {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== "undefined") resolve();
          else setTimeout(check, 100);
        };
        check();
        setTimeout(() => resolve(), 5000);
      });
    }
    return new RecaptchaVerifier(auth, containerId, {
      siteKey: RECAPTCHA_SITE_KEY,
      size: "invisible",
      callback: () => {},
    });
  } catch (err) {
    console.error("Recaptcha init error:", err);
    return null;
  }
}

/** Links a phone number to the currently signed-in Firebase user (Settings flow). */
export function sendLinkOtp(auth: Auth, phoneE164: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
  if (!auth.currentUser) throw new Error("You must be logged in to verify a phone.");
  return linkWithPhoneNumber(auth.currentUser, phoneE164, verifier);
}

/** Signs in with a phone number (Login flow) — resolves to the existing Firebase
 * user the number is linked to, or creates a brand-new orphan user if unlinked. */
export function sendSignInOtp(auth: Auth, phoneE164: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneE164, verifier);
}

/** Clears and releases a RecaptchaVerifier ref — call on unmount and before
 * re-initializing (resend, or a remounted container). */
export function resetRecaptcha(verifierRef: { current: RecaptchaVerifier | null }): void {
  try {
    verifierRef.current?.clear();
  } catch {
    // already cleared / DOM node gone — safe to ignore
  }
  verifierRef.current = null;
}
