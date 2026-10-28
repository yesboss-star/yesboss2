"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

export interface VoiceInputOptions {
  /** BCP-47 recognition language, e.g. "en-IN" or "hi-IN". Default "en-US". */
  lang?: string;
  /**
   * Keep listening until stopListening() is called (tap-to-send). Browsers end a
   * session after a pause or a minute or so; we quietly start a new one and keep
   * everything said so far.
   */
  continuous?: boolean;
}

// Errors where restarting cannot help (permission denied, no microphone, ...).
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);
const MAX_RESTARTS = 40;

const join = (...parts: string[]) => parts.map((part) => part.trim()).filter(Boolean).join(" ");

/**
 * Browser SpeechRecognition voice input (shared by chat, assistant, ideas and journal).
 *
 * - `interimText`: the half-finished words of the current phrase.
 * - `liveText`: everything said since the mic was tapped (finished + half-finished),
 *   so the UI can show it as the user speaks.
 * - `startListening(onFinal, options)`: `onFinal` receives the whole transcript when
 *   listening ends.
 */
export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [liveText, setLiveText] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef<((text: string) => void) | null>(null);
  const optionsRef = useRef<VoiceInputOptions>({});
  const wantListeningRef = useRef(false);
  const fatalRef = useRef(false);
  const restartsRef = useRef(0);
  const doneTextRef = useRef(""); // text from sessions that already ended
  const sessionFinalRef = useRef("");
  const sessionInterimRef = useRef("");

  const beginSession = useCallback(() => {
    // One recognition session; when the browser ends it we may start the next one.
    function run(): boolean {
      const speechWindow = window as SpeechWindow;
      const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
      if (!Recognition) return false;

      sessionFinalRef.current = "";
      sessionInterimRef.current = "";
      const recognition = new Recognition();
      recognition.continuous = optionsRef.current.continuous ?? false;
      recognition.interimResults = true;
      recognition.lang = optionsRef.current.lang || "en-US";

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalText = "";
        let interim = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalText += event.results[i][0].transcript + " ";
          else interim += event.results[i][0].transcript;
        }
        sessionFinalRef.current = finalText;
        sessionInterimRef.current = interim;
        setInterimText(interim);
        setLiveText(join(doneTextRef.current, finalText, interim));
      };

      recognition.onerror = (event) => {
        if (event?.error && FATAL_ERRORS.has(event.error)) fatalRef.current = true;
      };

      recognition.onend = () => {
        // Keep what this session heard (including words that were still half-finished).
        doneTextRef.current = join(doneTextRef.current, sessionFinalRef.current, sessionInterimRef.current);
        sessionFinalRef.current = "";
        sessionInterimRef.current = "";
        setInterimText("");

        const keepGoing =
          wantListeningRef.current && (optionsRef.current.continuous ?? false) && !fatalRef.current && restartsRef.current < MAX_RESTARTS;
        if (keepGoing) {
          restartsRef.current += 1;
          setLiveText(doneTextRef.current);
          setTimeout(() => {
            if (wantListeningRef.current && !run()) wantListeningRef.current = false;
          }, 200);
          return;
        }

        wantListeningRef.current = false;
        setListening(false);
        setLiveText("");
        const transcript = doneTextRef.current.trim();
        doneTextRef.current = "";
        if (transcript) onFinalRef.current?.(transcript);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        return false;
      }
      return true;
    }
    return run();
  }, []);

  const startListening = useCallback(
    (onFinal?: (text: string) => void, options?: VoiceInputOptions) => {
      const speechWindow = window as SpeechWindow;
      if (!(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition)) return;
      if (wantListeningRef.current) return; // already listening
      onFinalRef.current = onFinal ?? null;
      optionsRef.current = options ?? {};
      doneTextRef.current = "";
      fatalRef.current = false;
      restartsRef.current = 0;
      wantListeningRef.current = true;
      setInterimText("");
      setLiveText("");
      if (beginSession()) setListening(true);
      else wantListeningRef.current = false;
    },
    [beginSession]
  );

  /** Stop listening; the transcript so far is delivered to the `onFinal` callback. */
  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }
    setListening(false);
    setInterimText("");
  }, []);

  // Never leave the microphone on after the page is closed.
  useEffect(
    () => () => {
      wantListeningRef.current = false;
      onFinalRef.current = null;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* already stopped */
      }
    },
    []
  );

  return { listening, interimText, liveText, startListening, stopListening };
}

export default useVoiceInput;
