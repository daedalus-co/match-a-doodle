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
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function unlockAudio() {
    try {
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
    const c = getCtx();
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
  }

  function playNoise({ gainPeak = 0.3, start = 0, dur = 0.18, lowpass = 1800 } = {}) {
    if (!sfxEnabled) return;
    const c = getCtx();
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

  // ── Procedural Ambient Background Music (Free Chiptune/Lofi Melody) ──────────
  // Gentle C major pentatonic progression: C4, E4, G4, A4, D5, C5, G4, E4
  const BGM_NOTES = [
    261.63, 329.63, 392.00, 440.00, 523.25, 392.00, 329.63, 261.63,
    293.66, 349.23, 440.00, 523.25, 587.33, 440.00, 349.23, 293.66
  ];
  const BASS_NOTES = [
    130.81, 130.81, 164.81, 164.81, 196.00, 196.00, 130.81, 130.81,
    146.83, 146.83, 174.61, 174.61, 220.00, 220.00, 146.83, 146.83
  ];

  function startMusic() {
    if (!musicEnabled || isMusicPlaying) return;
    const c = getCtx();
    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }
    isMusicPlaying = true;
    musicStep = 0;

    musicInterval = setInterval(() => {
      if (!musicEnabled || !isMusicPlaying) return;
      const now = c.currentTime;

      // Melody note (rich, warm marimba chime with pleasant sustain)
      const freq = BGM_NOTES[musicStep % BGM_NOTES.length];
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.24, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.002, now + 0.52);

      osc.connect(g);
      g.connect(musicGain);
      osc.start(now);
      osc.stop(now + 0.55);

      // Warm acoustic bass note every 2 steps
      if (musicStep % 2 === 0) {
        const bassFreq = BASS_NOTES[(musicStep / 2) % BASS_NOTES.length];
        const bassOsc = c.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(bassFreq, now);

        const bassG = c.createGain();
        bassG.gain.setValueAtTime(0, now);
        bassG.gain.linearRampToValueAtTime(0.28, now + 0.03);
        bassG.gain.exponentialRampToValueAtTime(0.002, now + 0.8);

        bassOsc.connect(bassG);
        bassG.connect(musicGain);
        bassOsc.start(now);
        bassOsc.stop(now + 0.85);
      }

      musicStep++;
    }, 450); // Relaxed ~133 BPM 8th notes
  }

  function stopMusic() {
    isMusicPlaying = false;
    if (musicInterval) {
      clearInterval(musicInterval);
      musicInterval = null;
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

  function setEnabled(val) {
    sfxEnabled = !!val;
  }
  function isEnabled() { return sfxEnabled; }

  return {
    playSelect, playMatch, playInvalid, playLaser, playExplosion,
    playColorBomb, playCascade, playJelly, playBooster,
    playVictory, playDefeat, playClick, playIngredient,
    startMusic, stopMusic, toggleMusic, setMusicEnabled, isMusicEnabled,
    unlockAudio,
    setEnabled, isEnabled
  };
})();
