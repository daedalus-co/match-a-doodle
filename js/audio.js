/**
 * Doodle Premium — Procedural Audio & Music Engine
 * Generates all sound effects and continuous ambient background music
 * via the Web Audio API — zero external mp3 files required, fully offline & free!
 */

'use strict';

const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;

  let sfxEnabled = true;
  let musicEnabled = true;
  let isAppBackgrounded = false;

  // Background Music loop variables
  let musicOscillators = [];
  let isMusicPlaying = false;
  let musicStep = 0;
  let musicInterval = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();

      masterGain = ctx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 1.0;
      sfxGain.connect(masterGain);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.55; // Audibly pleasant, relaxing sketchbook vibe
      musicGain.connect(masterGain);
    }
    if (ctx.state === 'suspended' && !isAppBackgrounded) {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function unlockAudio() {
    try {
      if (isAppBackgrounded) return;
      const c = getCtx();
      if (c && c.state === 'suspended') {
        c.resume().catch(() => {});
      }
      if (musicEnabled && !isMusicPlaying) {
        startMusic();
      }
    } catch (_) {}
  }

  function playTone({ type = 'sine', freq = 440, gainPeak = 0.4, start = 0,
                      attack = 0.01, decay = 0.05, sustain = 0.2, release = 0.15,
                      dur = 0.3, detune = 0, dest = null } = {}) {
    if (!sfxEnabled) return;
    try {
      const c = getCtx();
      if (!c) return;
      const now = c.currentTime + start;

      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(detune, now);

      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gainPeak, now + attack);
      g.gain.linearRampToValueAtTime(gainPeak * sustain, now + attack + decay);
      g.gain.setValueAtTime(gainPeak * sustain, now + dur - release);
      g.gain.linearRampToValueAtTime(0, now + dur);

      osc.connect(g);
      g.connect(dest || sfxGain);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    } catch (_) {}
  }

  function playNoise({ gainPeak = 0.3, start = 0, dur = 0.18, lowpass = 1800 } = {}) {
    if (!sfxEnabled) return;
    try {
      const c = getCtx();
      if (!c) return;
      const now = c.currentTime + start;
      const bufSize = Math.ceil(c.sampleRate * (dur + 0.05));
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

      const src = c.createBufferSource();
      src.buffer = buf;

      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lowpass;

      const g = c.createGain();
      g.gain.setValueAtTime(gainPeak, now);
      g.gain.linearRampToValueAtTime(0, now + dur);

      src.connect(filt);
      filt.connect(g);
      g.connect(sfxGain);
      src.start(now);
      src.stop(now + dur + 0.01);
    } catch (_) {}
  }

  // ── Public Sound Effects ─────────────────────────────────────────────────────

  function playSelect() {
    playTone({ type: 'sine', freq: 880, gainPeak: 0.25, attack: 0.005, decay: 0.02, sustain: 0, release: 0.05, dur: 0.08 });
  }

  function playMatch(chainLevel = 0) {
    const baseFreqs = [523, 659, 784, 1047];
    const freqs = baseFreqs.slice(0, Math.min(baseFreqs.length, 3 + chainLevel));
    freqs.forEach((freq, i) => {
      playTone({ type: 'triangle', freq, gainPeak: 0.35, start: i * 0.06,
                 attack: 0.01, decay: 0.05, sustain: 0.4, release: 0.1, dur: 0.28 });
    });
  }

  function playInvalid() {
    playTone({ type: 'square', freq: 150, gainPeak: 0.2, attack: 0.01, decay: 0.05, sustain: 0.1, release: 0.1, dur: 0.22, detune: -50 });
  }

  function playLaser() {
    if (!sfxEnabled) return;
    const c = getCtx();
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.35, now);
    g.gain.linearRampToValueAtTime(0, now + 0.35);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  function playExplosion() {
    playNoise({ gainPeak: 0.5, dur: 0.3, lowpass: 600 });
    playTone({ type: 'sine', freq: 80, gainPeak: 0.55, attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.2, dur: 0.4 });
  }

  function playColorBomb() {
    playNoise({ gainPeak: 0.6, dur: 0.5, lowpass: 2000 });
    [200, 350, 500, 700, 1000, 1400].forEach((f, i) => {
      playTone({ type: 'sine', freq: f, gainPeak: 0.3, start: i * 0.04,
                 attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.1, dur: 0.3 });
    });
  }

  function playCascade(level) {
    const baseFreq = 440 * Math.pow(1.3, level);
    playTone({ type: 'sine', freq: baseFreq, gainPeak: 0.4, attack: 0.01, decay: 0.08, sustain: 0.5, release: 0.15, dur: 0.4 });
    playTone({ type: 'triangle', freq: baseFreq * 1.5, gainPeak: 0.25, start: 0.05,
               attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.1, dur: 0.3 });
  }

  function playJelly() {
    playNoise({ gainPeak: 0.2, dur: 0.08, lowpass: 800 });
    playTone({ type: 'sine', freq: 600, gainPeak: 0.2, attack: 0.005, decay: 0.04, sustain: 0, release: 0.06, dur: 0.12 });
  }

  function playBooster() {
    [880, 1100, 1320].forEach((f, i) => {
      playTone({ type: 'triangle', freq: f, gainPeak: 0.35, start: i * 0.07,
                 attack: 0.005, decay: 0.04, sustain: 0.3, release: 0.08, dur: 0.25 });
    });
  }

  function playVictory() {
    const melody = [523, 659, 784, 1047, 784, 1047, 1319];
    const durations = [0.12, 0.12, 0.12, 0.25, 0.12, 0.12, 0.45];
    let t = 0;
    melody.forEach((f, i) => {
      playTone({ type: 'triangle', freq: f, gainPeak: 0.45, start: t,
                 attack: 0.01, decay: 0.04, sustain: 0.6, release: 0.08, dur: durations[i] + 0.05 });
      t += durations[i];
    });
  }

  function playDefeat() {
    const notes = [440, 370, 310, 261];
    notes.forEach((f, i) => {
      playTone({ type: 'triangle', freq: f, gainPeak: 0.35, start: i * 0.18,
                 attack: 0.01, decay: 0.06, sustain: 0.5, release: 0.15, dur: 0.3 });
    });
  }

  function playClick() {
    playTone({ type: 'sine', freq: 700, gainPeak: 0.2, attack: 0.002, decay: 0.02, sustain: 0, release: 0.04, dur: 0.07 });
  }

  function playIngredient() {
    [784, 988, 1175].forEach((f, i) => {
      playTone({ type: 'sine', freq: f, gainPeak: 0.3, start: i * 0.08,
                 attack: 0.01, decay: 0.04, sustain: 0.4, release: 0.1, dur: 0.28 });
    });
  }

  // ── 8 World Theme Music Profiles ─────────────────────────────────────────────
  // Each theme has: melody notes, bass notes, oscillator type, tempo (ms/step),
  // gain levels, and bass-frequency multiplier for distinct character.

  let currentTheme = 0;

  const THEME_MUSIC = [
    {
      // Theme 0: Sketchy Hills — warm acoustic guitar strum (C major pentatonic, triangle)
      name: 'Sketchy Hills',
      melody: [261.63, 329.63, 392.00, 440.00, 523.25, 392.00, 329.63, 261.63,
               293.66, 349.23, 440.00, 523.25, 587.33, 440.00, 349.23, 293.66],
      bass:   [130.81, 130.81, 164.81, 164.81, 196.00, 196.00, 130.81, 130.81,
               146.83, 146.83, 174.61, 174.61, 220.00, 220.00, 146.83, 146.83],
      melType: 'triangle', bassType: 'sine',
      tempo: 450, melGain: 0.24, bassGain: 0.28, melDecay: 0.52, bassDecay: 0.80,
    },
    {
      // Theme 1: Graph Paper Grove — electronic/chiptune (D dorian, square wave)
      name: 'Graph Paper Grove',
      melody: [293.66, 329.63, 369.99, 440.00, 493.88, 440.00, 369.99, 329.63,
               349.23, 392.00, 440.00, 523.25, 587.33, 523.25, 440.00, 349.23],
      bass:   [146.83, 146.83, 184.99, 184.99, 220.00, 220.00, 146.83, 146.83,
               174.61, 174.61, 220.00, 220.00, 246.94, 246.94, 174.61, 174.61],
      melType: 'square', bassType: 'square',
      tempo: 300, melGain: 0.14, bassGain: 0.18, melDecay: 0.30, bassDecay: 0.50,
    },
    {
      // Theme 2: Crayon Canyon — marimba/xylophone (G major, sawtooth softened)
      name: 'Crayon Canyon',
      melody: [392.00, 493.88, 587.33, 659.25, 783.99, 659.25, 587.33, 493.88,
               440.00, 523.25, 587.33, 659.25, 783.99, 659.25, 523.25, 440.00],
      bass:   [196.00, 196.00, 246.94, 246.94, 293.66, 293.66, 196.00, 196.00,
               220.00, 220.00, 261.63, 261.63, 329.63, 329.63, 220.00, 220.00],
      melType: 'sine', bassType: 'triangle',
      tempo: 380, melGain: 0.30, bassGain: 0.22, melDecay: 0.32, bassDecay: 0.55,
    },
    {
      // Theme 3: Chalkboard Caverns — moody minor (A natural minor, sawtooth)
      name: 'Chalkboard Caverns',
      melody: [440.00, 392.00, 349.23, 329.63, 293.66, 329.63, 349.23, 392.00,
               523.25, 493.88, 440.00, 392.00, 349.23, 392.00, 440.00, 493.88],
      bass:   [110.00, 110.00, 146.83, 146.83, 130.81, 130.81, 110.00, 110.00,
               130.81, 130.81, 164.81, 164.81, 146.83, 146.83, 130.81, 130.81],
      melType: 'sawtooth', bassType: 'sine',
      tempo: 520, melGain: 0.15, bassGain: 0.25, melDecay: 0.60, bassDecay: 0.90,
    },
    {
      // Theme 4: Origami Oasis — Asian-inspired pentatonic (E pentatonic, triangle+sine)
      name: 'Origami Oasis',
      melody: [329.63, 369.99, 440.00, 493.88, 587.33, 493.88, 440.00, 369.99,
               369.99, 440.00, 523.25, 587.33, 659.25, 587.33, 523.25, 440.00],
      bass:   [164.81, 164.81, 184.99, 184.99, 220.00, 220.00, 164.81, 164.81,
               184.99, 184.99, 220.00, 220.00, 246.94, 246.94, 184.99, 184.99],
      melType: 'triangle', bassType: 'sine',
      tempo: 490, melGain: 0.22, bassGain: 0.20, melDecay: 0.70, bassDecay: 1.00,
    },
    {
      // Theme 5: Watercolor Waves — dreamy/ambient (F major, sine with long sustain)
      name: 'Watercolor Waves',
      melody: [349.23, 440.00, 523.25, 587.33, 698.46, 587.33, 523.25, 440.00,
               392.00, 493.88, 587.33, 659.25, 783.99, 659.25, 587.33, 493.88],
      bass:   [174.61, 174.61, 220.00, 220.00, 261.63, 261.63, 174.61, 174.61,
               196.00, 196.00, 246.94, 246.94, 293.66, 293.66, 196.00, 196.00],
      melType: 'sine', bassType: 'sine',
      tempo: 600, melGain: 0.20, bassGain: 0.22, melDecay: 0.90, bassDecay: 1.20,
    },
    {
      // Theme 6: Inkwell Valley — jazz-inflected (G mixolydian, triangle warm)
      name: 'Inkwell Valley',
      melody: [392.00, 440.00, 493.88, 523.25, 587.33, 523.25, 466.16, 440.00,
               415.30, 440.00, 493.88, 554.37, 622.25, 554.37, 493.88, 466.16],
      bass:   [196.00, 196.00, 220.00, 220.00, 246.94, 246.94, 196.00, 196.00,
               207.65, 207.65, 233.08, 233.08, 261.63, 261.63, 207.65, 207.65],
      melType: 'triangle', bassType: 'sine',
      tempo: 400, melGain: 0.26, bassGain: 0.30, melDecay: 0.48, bassDecay: 0.75,
    },
    {
      // Theme 7: Pastel Peaks — bright & energetic (B major, saw wave bright)
      name: 'Pastel Peaks',
      melody: [493.88, 554.37, 622.25, 698.46, 783.99, 698.46, 622.25, 554.37,
               587.33, 659.25, 739.99, 830.61, 987.77, 830.61, 739.99, 659.25],
      bass:   [246.94, 246.94, 277.18, 277.18, 311.13, 311.13, 246.94, 246.94,
               261.63, 261.63, 293.66, 293.66, 329.63, 329.63, 261.63, 261.63],
      melType: 'sawtooth', bassType: 'triangle',
      tempo: 340, melGain: 0.13, bassGain: 0.16, melDecay: 0.35, bassDecay: 0.55,
    },
  ];

  function startMusic() {
    if (!musicEnabled || isMusicPlaying) return;
    const c = getCtx();
    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }
    isMusicPlaying = true;
    musicStep = 0;

    const theme = THEME_MUSIC[currentTheme % THEME_MUSIC.length];

    musicInterval = setInterval(() => {
      if (!musicEnabled || !isMusicPlaying) return;
      const now = c.currentTime;

      // Melody note
      const freq = theme.melody[musicStep % theme.melody.length];
      const osc = c.createOscillator();
      osc.type = theme.melType;
      osc.frequency.setValueAtTime(freq, now);

      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(theme.melGain, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.002, now + theme.melDecay);

      osc.connect(g);
      g.connect(musicGain);
      osc.start(now);
      osc.stop(now + theme.melDecay + 0.02);

      // Bass note every 2 steps
      if (musicStep % 2 === 0) {
        const bassFreq = theme.bass[(musicStep / 2) % theme.bass.length];
        const bassOsc = c.createOscillator();
        bassOsc.type = theme.bassType;
        bassOsc.frequency.setValueAtTime(bassFreq, now);

        const bassG = c.createGain();
        bassG.gain.setValueAtTime(0, now);
        bassG.gain.linearRampToValueAtTime(theme.bassGain, now + 0.03);
        bassG.gain.exponentialRampToValueAtTime(0.002, now + theme.bassDecay);

        bassOsc.connect(bassG);
        bassG.connect(musicGain);
        bassOsc.start(now);
        bassOsc.stop(now + theme.bassDecay + 0.02);
      }

      musicStep++;
    }, theme.tempo);
  }

  function stopMusic() {
    isMusicPlaying = false;
    if (musicInterval) {
      clearInterval(musicInterval);
      musicInterval = null;
    }
  }

  function setTheme(worldIdx) {
    const newTheme = Math.max(0, worldIdx || 0) % THEME_MUSIC.length;
    if (newTheme === currentTheme && isMusicPlaying) return; // no change needed
    currentTheme = newTheme;
    if (musicEnabled) {
      stopMusic();
      startMusic();
    }
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    if (musicEnabled) {
      startMusic();
    } else {
      stopMusic();
    }
    return musicEnabled;
  }

  function setMusicEnabled(val) {
    musicEnabled = !!val;
    if (musicEnabled) startMusic();
    else stopMusic();
  }

  function isMusicEnabled() { return musicEnabled; }

  // ── SFX Controls ─────────────────────────────────────────────────────────────

  // ── Lifecycle Visibility & Background Pause / Resume ────────────────────────
  function pauseAudio() {
    isAppBackgrounded = true;
    if (musicInterval) {
      clearInterval(musicInterval);
      musicInterval = null;
    }
    if (ctx && ctx.state === 'running') {
      ctx.suspend().catch(() => {});
    }
  }

  function resumeAudio() {
    isAppBackgrounded = false;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (musicEnabled && isMusicPlaying && !musicInterval) {
      // Re-trigger interval without resetting musicStep
      const theme = THEME_MUSIC[currentTheme % THEME_MUSIC.length];
      musicInterval = setInterval(() => {
        if (!musicEnabled || !isMusicPlaying || isAppBackgrounded) return;
        const c = getCtx();
        const now = c.currentTime;

        // Melody note
        const freq = theme.melody[musicStep % theme.melody.length];
        const osc = c.createOscillator();
        osc.type = theme.melType;
        osc.frequency.setValueAtTime(freq, now);

        const g = c.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(theme.melGain, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.002, now + theme.melDecay);

        osc.connect(g);
        g.connect(musicGain);
        osc.start(now);
        osc.stop(now + theme.melDecay + 0.02);

        // Bass note every 2 steps
        if (musicStep % 2 === 0) {
          const bassFreq = theme.bass[(musicStep / 2) % theme.bass.length];
          const bassOsc = c.createOscillator();
          bassOsc.type = theme.bassType;
          bassOsc.frequency.setValueAtTime(bassFreq, now);

          const bassG = c.createGain();
          bassG.gain.setValueAtTime(0, now);
          bassG.gain.linearRampToValueAtTime(theme.bassGain, now + 0.03);
          bassG.gain.exponentialRampToValueAtTime(0.002, now + theme.bassDecay);

          bassOsc.connect(bassG);
          bassG.connect(musicGain);
          bassOsc.start(now);
          bassOsc.stop(now + theme.bassDecay + 0.02);
        }

        musicStep++;
      }, theme.tempo);
    }
  }

  return {
    playSelect, playMatch, playInvalid, playLaser, playExplosion,
    playColorBomb, playCascade, playJelly, playBooster,
    playVictory, playDefeat, playClick, playIngredient,
    startMusic, stopMusic, toggleMusic, setMusicEnabled, isMusicEnabled,
    pauseAudio, resumeAudio,
    setTheme,
    unlockAudio,
    setEnabled, isEnabled
  };
})();

