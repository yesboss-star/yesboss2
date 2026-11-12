// Spoken-language choices for the mic. Hinglish is best spoken with हिन्दी; English (India) suits English
// with a few Hindi words.
export const VOICE_LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "हिन्दी / Hinglish" },
  { code: "en-US", label: "English (US)" },
] as const;

export const VOICE_LANG_KEY = "yesboss-capture-voice-lang";
