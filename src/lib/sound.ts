"use client";

/**
 * Two short notification tones, synthesized rather than loaded.
 *
 * Starting a bot takes tens of seconds — pull the image, install dependencies,
 * connect to Telegram — which is long enough that people switch tabs. The
 * outcome then lands on a screen nobody is looking at. These are the two
 * sounds that say how it went.
 *
 * Synthesized with the Web Audio API instead of shipping .mp3 files, for three
 * reasons that all pull the same way: two audio files are ~20-40 kB against
 * ~1 kB of code; a fetched asset can fail or be blocked while an oscillator
 * cannot; and the strict CSP here would need a media-src entry for something
 * self-hosted anyway. Nothing is downloaded and nothing can 404.
 *
 * On autoplay policy: an AudioContext starts suspended and only a user gesture
 * may resume it. `unlockAudio()` is called from the Start click for exactly
 * that reason — the gesture happens then, the sound happens a minute later, and
 * a context resumed once stays running. Without that call the tone would be
 * silently dropped precisely in the case this exists for.
 */

const MUTE_KEY = "bf:sound:muted";

let ctx: AudioContext | null = null;

/** The shared context, created lazily — constructing one per sound leaks them. */
function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null; // no Web Audio (very old browser) — stay silent, never throw
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Resume the audio context from inside a user gesture.
 *
 * Call this from the click that begins something whose result will be
 * announced later. Cheap and idempotent.
 */
export function unlockAudio(): void {
  const c = audioContext();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

export function soundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode) — the feature still works
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* non-fatal — the setting just won't survive a reload */
  }
}

/**
 * One note. `triangle` rather than `sine` for a little more body at low volume,
 * and every note gets an attack/release envelope — a bare gain switch produces
 * an audible click at both ends, which is what makes cheap web audio sound
 * cheap.
 */
function note(c: AudioContext, freq: number, startAt: number, duration: number, peak: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, startAt);

  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Play a sequence of [frequency, offset, duration] notes at a shared volume. */
function play(notes: [freq: number, offset: number, duration: number][], peak: number): void {
  if (soundMuted()) return;
  const c = audioContext();
  if (!c) return;
  // Still suspended means no gesture ever unlocked it. Try, but don't wait —
  // a dropped notification tone must never become an unhandled rejection.
  if (c.state === "suspended") void c.resume().catch(() => {});
  const now = c.currentTime;
  for (const [freq, offset, duration] of notes) {
    note(c, freq, now + offset, duration, peak);
  }
}

/**
 * Success: C5 → G5, a rising fifth. Two notes, the second held longer, which is
 * the shape of every "done" chime people already know.
 */
export function playSuccess(): void {
  play(
    [
      [523.25, 0, 0.14],
      [783.99, 0.11, 0.34],
    ],
    0.16,
  );
}

/**
 * Failure: G4 → E4 → C4, falling. Deliberately not harsh — this reports that a
 * bot didn't start, not that something is on fire, and a sound that startles
 * people is a sound they mute permanently within the hour.
 */
export function playFailure(): void {
  play(
    [
      [392.0, 0, 0.16],
      [329.63, 0.14, 0.16],
      [233.08, 0.28, 0.42],
    ],
    0.14,
  );
}

/**
 * True when the person is not looking at this tab — hidden, or visible but
 * behind another window. Both count: the point is whether they'd have seen the
 * status change on screen.
 */
export function tabUnattended(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState !== "visible" || !document.hasFocus();
}
