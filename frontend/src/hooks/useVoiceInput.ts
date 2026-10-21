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
export function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const finalRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef<((text: string) => void) | null>(null);

  const startListening = useCallback((onFinal?: (text: string) => void) => {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    finalRef.current = "";
    setInterimText("");
    if (onFinal) onFinalRef.current = onFinal;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalRef.current += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };
    recognition.onend = () => {
      setListening(false);
      setInterimText("");
      if (finalRef.current.trim()) {
        onFinalRef.current?.(finalRef.current.trim());
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
