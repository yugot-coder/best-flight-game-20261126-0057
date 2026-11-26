// audio.js — every sound is synthesised with WebAudio: an engine hum whose
// pitch follows throttle and speed, wind noise, and short beeps and chimes
// for rings, landings and crashes. No audio files, no network.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.started = false;
    this.muted = false;
  }

  // Must be called from a user gesture the first time.
  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.started = true;

      // Engine: two detuned sawtooths through a low-pass filter.
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'sawtooth';
      this.engineOsc2.frequency.value = 55 * 1.5;
      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.value = 0.4;
      this.engineOsc.connect(filter);
      this.engineOsc2.connect(osc2Gain);
      osc2Gain.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      this.engineOsc2.start();

      // Wind: looped white noise through a band-pass filter.
      const len = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 600;
      this.windFilter.Q.value = 0.6;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      noise.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);
      noise.start();
    } catch (err) {
      // Audio is decoration; a failure here must never stop the game.
      this.started = false;
    }
  }

  // Called every frame while flying: throttle 0..1, speed in m/s.
  setFlight(throttle, speed, running) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 42 + throttle * 78 + speed * 0.12;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.494, t, 0.08);
    const vol = this.muted ? 0 : running ? 0.05 + throttle * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.1);
    const wind = this.muted ? 0 : Math.min(0.14, Math.max(0, (speed - 25) * 0.0022));
    this.windGain.gain.setTargetAtTime(wind, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(380 + speed * 9, t, 0.15);
  }

  beep(freq, duration, type, volume) {
    if (!this.started || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  ring() {
    this.beep(880, 0.16, 'sine', 0.2);
    setTimeout(() => this.beep(1318, 0.24, 'sine', 0.18), 90);
  }

  warning() {
    this.beep(440, 0.12, 'square', 0.08);
    setTimeout(() => this.beep(440, 0.12, 'square', 0.08), 160);
  }

  land() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.3, 'triangle', 0.16), i * 110);
    });
  }

  crash() {
    if (!this.started || !this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  }
}
