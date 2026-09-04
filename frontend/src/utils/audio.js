// Web Audio API Synthesizer & Speech Synthesis Utility
// Generates crystal-clear audio notifications without requiring external sound files.

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== "undefined") {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Plays a resonant two-tone "Ding-Dong" chime (typical airport / cafeteria announcement tone).
 */
export function playDingDongChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: "Ding" (High Note - E5 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.8);

    // Tone 2: "Dong" (Lower Harmonious Note - C5 523.25 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(523.25, now + 0.35);

    gain2.gain.setValueAtTime(0, now + 0.35);
    gain2.gain.linearRampToValueAtTime(0.4, now + 0.39);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.35);
    osc2.stop(now + 1.4);
  } catch (err) {
    console.warn("Could not play chime:", err);
  }
}

/**
 * Plays a short alert tone for the Kitchen when a new order arrives.
 */
export function playKitchenNewOrderTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, now); // A5

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch (err) {
    console.warn("Kitchen tone error:", err);
  }
}

/**
 * Text-to-speech announcement: e.g. "Token A-102 is ready for pickup"
 */
export function speakAnnouncement(text) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel(); // Stop any overlapping previous announcements
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // slightly deliberate for clarity over canteen noise
    utterance.pitch = 1.05;
    utterance.lang = "en-IN"; // English (Indian) or default

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
  }
}

/**
 * Combined alert: Chimes first, then announces the token after a brief pause.
 */
export function announceReadyOrder(token) {
  playDingDongChime();

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    setTimeout(() => {
      speakAnnouncement(`Order token ${token}, is ready for pickup at the counter.`);
    }, 700);
  }
}
