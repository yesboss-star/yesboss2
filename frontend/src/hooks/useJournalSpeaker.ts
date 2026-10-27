"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export type SpeakerStatus = "idle" | "loading" | "playing";

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
const SPEED_KEY = "yesboss-journal-speed";

function loadSpeed(): number {
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

/** Strip markdown so the voice reads natural prose. */
export function toSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reads journal replies aloud. Uses the backend Gemini voice (natural) and falls
 * back to the browser voice if it is unavailable. Only one message plays at a time;
 * fetched audio is cached per message id so replays are instant and free.
 */
export function useJournalSpeaker() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<SpeakerStatus>("idle");
  const [speed, setSpeedState] = useState<number>(loadSpeed);
  const speedRef = useRef(speed);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setActiveId(null);
    setStatus("idle");
  }, []);

  const speakWithBrowser = useCallback((text: string, lang: string, run: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = speedRef.current;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.split("-")[0]));
    if (voice) utterance.voice = voice;
    const done = () => {
      if (runRef.current !== run) return;
      setActiveId(null);
      setStatus("idle");
    };
    utterance.onstart = () => {
      if (runRef.current === run) setStatus("playing");
    };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
    return true;
  }, []);

  /** Play a message; calling it again for the message that is playing stops it. */
  const toggle = useCallback(
    async (id: string, text: string, lang = "en-IN") => {
      if (activeId === id && status !== "idle") {
        stop();
        return;
      }
      stop();
      const clean = toSpeech(text);
      if (!clean) return;
      const run = runRef.current;
      setActiveId(id);
      setStatus("loading");

      let url = cacheRef.current.get(id);
      if (!url) {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const res = await fetch(`${API_URL}/journal/tts`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ text: clean }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`tts ${res.status}`);
          url = URL.createObjectURL(await res.blob());
          cacheRef.current.set(id, url);
        } catch {
          if (runRef.current !== run) return; // stopped or superseded
          if (!speakWithBrowser(clean, lang, run)) {
            setActiveId(null);
            setStatus("idle");
          }
          return;
        }
      }
      if (runRef.current !== run) return;

      const audio = new Audio(url);
      audio.preservesPitch = true; // faster playback without the chipmunk voice
      audio.playbackRate = speedRef.current;
      audioRef.current = audio;
      const finish = () => {
        if (runRef.current !== run) return;
        audioRef.current = null;
        setActiveId(null);
        setStatus("idle");
      };
      audio.onended = finish;
      audio.onerror = finish;
      try {
        await audio.play();
        if (runRef.current === run) setStatus("playing");
      } catch {
        finish();
      }
    },
    [activeId, status, stop, speakWithBrowser]
  );

  /** Change playback speed; applies immediately to audio that is already playing. */
  const setSpeed = useCallback((next: number) => {
    speedRef.current = next;
    setSpeedState(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
    try {
      localStorage.setItem(SPEED_KEY, String(next));
    } catch {
      /* preference is optional */
    }
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      runRef.current += 1;
      abortRef.current?.abort();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  return { activeId, status, speed, setSpeed, toggle, stop };
}
