export const AudioEngine = {
    ctx: null,
    masterGain: null,
    liminalDrone: null,
    proximityOsc: null,
    proximityGain: null,
    noiseBuffer: null,
    isPanic: false,
    
    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5; 
        this.masterGain.connect(this.ctx.destination);

        // 1. Buffer pour bruit de pas (Bruit blanc filtré)
        const bufferSize = this.ctx.sampleRate * 1.0; 
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;

        this.startLiminalDrone();
        this.setupProximitySound();
    },

    // Son d'ambiance : Un bourdonnement sourd
    startLiminalDrone() {
        if(this.isPanic) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = "sawtooth";
        osc.frequency.value = 55; 
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 180;

        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.1;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 20; 
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();

        gain.gain.value = 0.3;
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        this.liminalDrone = { osc, gain, lfo };
    },

    // Son strident qui augmente quand le stalker approche
    setupProximitySound() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = "triangle";
        osc.frequency.value = 80; 
        
        const shaper = this.ctx.createWaveShaper();
        shaper.curve = this.makeDistortionCurve(400);

        gain.gain.value = 0; 
        
        osc.connect(shaper);
        shaper.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        
        this.proximityOsc = osc;
        this.proximityGain = gain;
    },

    updateStress(intensity) {
        if(!this.ctx || this.isPanic) return;
        
        const vol = Math.pow(intensity, 3) * 0.8;
        this.proximityGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);

        const freq = 80 + (intensity * 500) + (Math.random() * 20);
        this.proximityOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    },

    triggerAlarm() {
        if(this.isPanic) return;
        this.isPanic = true;

        if(this.liminalDrone) {
            this.liminalDrone.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1);
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(150, this.ctx.currentTime + 3);
        
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
    },

    // NOUVEAU : Screamer violent à la mort
    playScreamer() {
        if(!this.ctx) return;
        this.isPanic = true;
        
        const t = this.ctx.currentTime;
        
        // 1. Cri aigu (Sawtooth dissonant)
        const osc1 = this.ctx.createOscillator();
        osc1.type = "sawtooth";
        osc1.frequency.setValueAtTime(800, t);
        osc1.frequency.exponentialRampToValueAtTime(100, t + 0.5);
        
        // 2. Bruit blanc (Impact)
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(1.0, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
        
        osc1.connect(gain);
        noise.connect(gain);
        gain.connect(this.masterGain);
        
        osc1.start(t); osc1.stop(t+1.5);
        noise.start(t); noise.stop(t+1.5);
    },

    playFootstep() {
        if(!this.ctx || !this.noiseBuffer) return;
        const t = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 300 + Math.random() * 100;
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, t); 
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        
        src.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        src.playbackRate.value = 0.8 + Math.random() * 0.2;
        src.start(t); src.stop(t + 0.15);
    },

    collect() {
        if(!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, t); 
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(t); osc.stop(t + 0.3);
    },

    makeDistortionCurve(amount) {
        const k = amount, n_samples = 44100, curve = new Float32Array(n_samples), deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i ) {
            const x = i * 2 / n_samples - 1;
            curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
        }
        return curve;
    },

    stopAll() {
        if(this.ctx) {
            // On ne suspend pas immédiatement pour laisser le screamer finir si besoin
            setTimeout(() => this.ctx.suspend(), 2000);
        }
    }
};