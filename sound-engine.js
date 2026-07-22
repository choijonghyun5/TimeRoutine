/* =========================================================
   그린노트 - 백색소음 합성 엔진
   외부 오디오 파일 없이 Web Audio API로 모든 소리를 실시간 합성합니다.
   (오프라인에서도 동작 + 나중에 실제 음원으로 손쉽게 교체 가능한 구조)
   ========================================================= */

const SoundEngine = (() => {
  let ctx = null;
  let master = null;
  const controllers = {}; // id -> { setVolume, dispose }
  let sharedNoiseBuffer = null;

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      sharedNoiseBuffer = buildNoiseBuffer(ctx, 2);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function buildNoiseBuffer(ctx, seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function noiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = sharedNoiseBuffer;
    src.loop = true;
    return src;
  }

  /* ---- 지속형 사운드(비/파도/바람 등 배경음) ---- */
  function buildNoiseBed({ filterType = "lowpass", freq = 800, Q = 0.7, base = 0.5,
                            tremoloRate = 0, tremoloDepth = 0, sweep = null }) {
    const src = noiseSource();
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = Q;

    const soundGain = ctx.createGain();
    soundGain.gain.value = 0; // 볼륨 0에서 시작, setVolume 으로 제어

    const shaper = ctx.createGain();
    shaper.gain.value = base;

    src.connect(filter);
    filter.connect(shaper);
    shaper.connect(soundGain);
    soundGain.connect(master);

    let lfo = null, lfoGain = null, sweepLfo = null;
    if (tremoloRate > 0) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = tremoloRate;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = tremoloDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(shaper.gain);
      lfo.start();
    }
    if (sweep) {
      sweepLfo = ctx.createOscillator();
      sweepLfo.frequency.value = sweep.rate;
      const sweepGain = ctx.createGain();
      sweepGain.gain.value = sweep.depth;
      sweepLfo.connect(sweepGain);
      sweepGain.connect(filter.frequency);
      sweepLfo.start();
    }

    src.start();

    return {
      setVolume(v) { soundGain.gain.setTargetAtTime(v, ctx.currentTime, 0.15); },
      dispose() {
        try { src.stop(); lfo && lfo.stop(); sweepLfo && sweepLfo.stop(); } catch (e) {}
        [src, filter, shaper, soundGain, lfo, lfoGain, sweepLfo].forEach(n => n && n.disconnect && n.disconnect());
      }
    };
  }

  /* ---- 짧은 임펄스 하나 생성 (클릭/펜슬/새소리 등) ---- */
  function burst(destGain, { freqType = "noise", centerFreq = 2500, Q = 3, dur = 0.08, gain = 0.5, pitchSweep = null }) {
    const env = ctx.createGain();
    env.gain.value = 0;
    env.connect(destGain);

    let src;
    if (freqType === "noise") {
      src = noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = centerFreq;
      bp.Q.value = Q;
      src.connect(bp);
      bp.connect(env);
    } else {
      src = ctx.createOscillator();
      src.type = "sine";
      src.frequency.value = centerFreq;
      if (pitchSweep) src.frequency.linearRampToValueAtTime(pitchSweep, ctx.currentTime + dur);
      src.connect(env);
    }

    const t = ctx.currentTime;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /* ---- 반복적으로 임펄스를 예약하는 사운드 (키보드/클릭/책넘김/새) ---- */
  function buildTransientLoop(scheduleNext, burstFn) {
    const soundGain = ctx.createGain();
    soundGain.gain.value = 0;
    soundGain.connect(master);

    let volume = 0;
    let timerId = null;
    let alive = true;

    function loop() {
      if (!alive) return;
      if (volume > 0.001) burstFn(soundGain, volume);
      const wait = scheduleNext();
      timerId = setTimeout(loop, wait);
    }
    timerId = setTimeout(loop, 400);

    return {
      setVolume(v) {
        volume = v;
        soundGain.gain.setTargetAtTime(1, ctx.currentTime, 0.1); // 게인 자체는 1 고정, burst gain으로 조절
      },
      dispose() {
        alive = false;
        clearTimeout(timerId);
        soundGain.disconnect();
      }
    };
  }

  /* ---- 여러 서브 사운드를 하나의 컨트롤러로 묶기 (예: 빗소리 = 배경 노이즈 + 빗방울 임펄스) ---- */
  function buildCombined(builders) {
    const subs = builders.map(b => b());
    return {
      setVolume(v) { subs.forEach(s => s.setVolume(v)); },
      dispose() { subs.forEach(s => s.dispose()); }
    };
  }

  /* ---- 사운드 정의 ---- */
  const DEFS = {
    cafe: () => buildNoiseBed({ filterType: "lowpass", freq: 850, Q: 0.6, base: 0.55, tremoloRate: 0.7, tremoloDepth: 0.12 }),
    library: () => buildNoiseBed({ filterType: "bandpass", freq: 1100, Q: 0.6, base: 0.28, tremoloRate: 0.15, tremoloDepth: 0.05 }),
    rain: () => buildCombined([
      () => buildNoiseBed({ filterType: "highpass", freq: 1100, Q: 0.5, base: 0.6, tremoloRate: 3.2, tremoloDepth: 0.08 }),
      () => buildTransientLoop(
        () => 60 + Math.random() * 140,
        (gainNode, vol) => burst(gainNode, { freqType: "noise", centerFreq: 3000 + Math.random() * 2500, Q: 6, dur: 0.03, gain: vol * 0.35 })
      ),
    ]),
    forest: () => buildNoiseBed({ filterType: "bandpass", freq: 700, Q: 0.5, base: 0.35, tremoloRate: 0.25, tremoloDepth: 0.06 }),
    waves: () => buildNoiseBed({ filterType: "lowpass", freq: 500, Q: 0.6, base: 0.6, tremoloRate: 0.13, tremoloDepth: 0.55 }),
    wind: () => buildNoiseBed({ filterType: "bandpass", freq: 500, Q: 0.8, base: 0.5, sweep: { rate: 0.08, depth: 300 } }),
    fireplace: () => buildCombined([
      () => buildNoiseBed({ filterType: "lowpass", freq: 300, Q: 0.5, base: 0.3, tremoloRate: 1.1, tremoloDepth: 0.1 }),
      () => buildTransientLoop(
        () => 250 + Math.random() * 600,
        (gainNode, vol) => burst(gainNode, { freqType: "noise", centerFreq: 2000 + Math.random() * 2000, Q: 4, dur: 0.045, gain: vol * 0.7 })
      ),
    ]),
    white: () => buildNoiseBed({ filterType: "allpass", freq: 1000, Q: 0.0001, base: 0.4 }),
    pencil: () => buildNoiseBed({ filterType: "bandpass", freq: 3200, Q: 2.2, base: 0.25, tremoloRate: 3.5, tremoloDepth: 0.22 }),

    pageTurn: () => buildTransientLoop(
      () => 4500 + Math.random() * 5500,
      (gainNode, vol) => burst(gainNode, { freqType: "noise", centerFreq: 1800, Q: 0.8, dur: 0.4, gain: vol * 0.6 })
    ),
    keyboard: () => buildTransientLoop(
      () => 90 + Math.random() * 220,
      (gainNode, vol) => burst(gainNode, { freqType: "noise", centerFreq: 2200 + Math.random() * 1200, Q: 5, dur: 0.035, gain: vol * 0.5 })
    ),
    mouseClick: () => buildTransientLoop(
      () => 6000 + Math.random() * 9000,
      (gainNode, vol) => burst(gainNode, { freqType: "noise", centerFreq: 2600, Q: 6, dur: 0.02, gain: vol * 0.55 })
    ),
    bird: () => buildTransientLoop(
      () => 3000 + Math.random() * 6000,
      (gainNode, vol) => burst(gainNode, { freqType: "tone", centerFreq: 2400 + Math.random() * 1200, pitchSweep: 3200 + Math.random() * 1000, dur: 0.16, gain: vol * 0.3 })
    ),
  };

  function setVolume(id, value01) {
    ensureContext();
    if (!controllers[id] && value01 > 0) {
      const builder = DEFS[id];
      if (!builder) return;
      controllers[id] = builder();
    }
    if (controllers[id]) controllers[id].setVolume(value01);
    if (value01 === 0 && controllers[id]) {
      // 완전히 끄면 자원 정리(자원 절약). 다시 올리면 새로 생성됨.
      controllers[id].dispose();
      delete controllers[id];
    }
  }

  function stopAll() {
    Object.keys(controllers).forEach(id => {
      controllers[id].dispose();
      delete controllers[id];
    });
  }

  return { ensureContext, setVolume, stopAll, get ids() { return Object.keys(DEFS); } };
})();
