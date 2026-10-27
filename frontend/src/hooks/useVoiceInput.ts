"use client";

import { useCallback, useRef, useState } from "react";

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
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

/**
 * Browser SpeechRecognition voice input (shared by chat, assistant and ideas).
 * Returns interim text plus start/stop controls; `startListening` takes an
 * optional callback that receives the final transcript when recording ends.
 */
export interface VoiceInputOptions {
  /** BCP-47 recognition language, e.g. "en-IN" or "hi-IN". Default "en-US". */
  lang?: string;
  /** Keep listening through pauses until stopListening() (tap-to-send). */
  continuous?: boolean;
}

export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const finalRef = useRef("");
  const interimRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef<((text: string) => void) | null>(null);

  const startListening = useCallback((onFinal?: (text: string) => void, options?: VoiceInputOptions) => {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    finalRef.current = "";
    interimRef.current = "";
    setInterimText("");
    if (onFinal) onFinalRef.current = onFinal;
    const recognition = new SpeechRecognition();
    recognition.continuous = options?.continuous ?? false;
    recognition.interimResults = true;
    recognition.lang = options?.lang || "en-US";
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      finalRef.current = finalText;
      interimRef.current = interim;
      setInterimText(interim);
    };
    recognition.onend = () => {
      setListening(false);
      setInterimText("");
      // Keep words that were still interim when the user tapped "send".
      const transcript = `${finalRef.current} ${interimRef.current}`.trim();
      if (transcript) {
        onFinalRef.current?.(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setInterimText("");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText("");
  }, []);

  return { listening, interimText, startListening, stopListening };
}

export default useVoiceInput;
