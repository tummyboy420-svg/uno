// src/components/SoundManager.js

class SoundManager {
  constructor() {
    this.audioCtx = null;
    this.enabled = localStorage.getItem('uno_sounds_enabled') !== 'false';
  }

  init() {
    if (!this.audioCtx) {
      // Create audio context on first user interaction
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
  }

  toggle(enabled) {
    this.enabled = enabled;
    localStorage.setItem('uno_sounds_enabled', enabled ? 'true' : 'false');
  }

  isEnabled() {
    return this.enabled;
  }

  playTone(frequency, type, duration, slideTo = null) {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    // Resume context if suspended
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, this.audioCtx.currentTime + duration);
      }

      gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Failed to play tone:', e);
    }
  }

  playPlayCard() {
    // A crisp, pleasant clicky pop
    this.playTone(600, 'sine', 0.1, 900);
  }

  playDrawCard() {
    // Sliding swoosh sound
    this.playTone(300, 'triangle', 0.15, 150);
  }

  playError() {
    // Short buzzer sound
    this.playTone(180, 'sawtooth', 0.2);
  }

  playTurnAlert() {
    // Soft reminder ping
    this.playTone(523.25, 'sine', 0.1); // C5
  }

  playUno() {
    // Excited double-beep
    this.playTone(659.25, 'triangle', 0.1, 880); // E5 to A5
    setTimeout(() => {
      this.playTone(880, 'triangle', 0.15, 1109.73); // A5 to C#6
    }, 100);
  }

  playVictory() {
    // Simple major chord arpeggio
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C major notes
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, 'sine', 0.4);
      }, index * 100);
    });
  }

  playLoss() {
    // Descending melancholy notes
    const notes = [392.00, 349.23, 311.13, 261.63]; // Descending minor notes
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, 'triangle', 0.35, freq * 0.8);
      }, index * 180);
    });
  }
}

export const sounds = new SoundManager();
