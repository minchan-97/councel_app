// 녹음한 목소리에 효과를 입힌다. 전부 폰 안에서 처리하고, 어디에도 보내지 않는다.
// - 높이 바꾸기: 빠르기는 그대로 두고 높이만 바꾼다 (시간 늘이기 + 재표본화)
// - 로봇, 메아리, 무전기, 괴물: 표본 단위로 직접 처리
(function () {
  let ctx = null;
  const audioCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  // 첫 터치 때 오디오를 깨워 둔다 (모바일 자동재생 제한 대응)
  addEventListener("pointerdown", () => { try { audioCtx(); } catch {} }, { once: true });

  const EFFECTS = {
    orig:    { label: "그대로" },
    high:    { label: "높게",     semi: 5 },
    higher:  { label: "아주 높게", semi: 9 },
    low:     { label: "낮게",     semi: -5 },
    monster: { label: "괴물",     semi: -9, lowpass: 0.25 },
    robot:   { label: "로봇",     ring: 45 },
    echo:    { label: "메아리",   echo: true },
    radio:   { label: "무전기",   radio: true },
  };

  // ── 시간 늘이기 (겹쳐 더하기, 한 창 = 약 46ms)
  function stretch(x, factor) {
    const N = 2048, Hs = 512, Ha = Hs / factor;
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const outLen = Math.ceil(x.length * factor) + N;
    const y = new Float32Array(outLen), norm = new Float32Array(outLen);
    for (let k = 0; ; k++) {
      const a = Math.round(k * Ha), s = k * Hs;
      if (a + N > x.length || s + N > outLen) break;
      for (let i = 0; i < N; i++) { y[s + i] += x[a + i] * win[i]; norm[s + i] += win[i]; }
    }
    for (let i = 0; i < outLen; i++) if (norm[i] > 1e-3) y[i] /= norm[i];
    return y;
  }
  // ── 재표본화 (선형 보간)
  function resample(x, ratio) {
    const len = Math.floor(x.length / ratio), y = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const p = i * ratio, j = Math.floor(p), f = p - j;
      y[i] = (x[j] || 0) * (1 - f) + (x[j + 1] || 0) * f;
    }
    return y;
  }
  function pitchShift(x, semi) {
    const r = Math.pow(2, semi / 12);
    return resample(stretch(x, r), r);
  }

  function process(x, sr, fx) {
    let y = x;
    if (fx.semi) y = pitchShift(y, fx.semi);
    if (fx.lowpass) { // 한 극 저역 통과: 소리를 두껍고 어둡게
      const a = fx.lowpass; let prev = 0;
      y = y.map((v) => (prev = prev + a * (v - prev)));
    }
    if (fx.ring) { // 고리 변조: 로봇 소리
      const w = (2 * Math.PI * fx.ring) / sr;
      y = y.map((v, i) => v * Math.sin(w * i) * 1.6);
    }
    if (fx.echo) { // 메아리 3번
      const d = Math.floor(sr * 0.22), out = new Float32Array(y.length + d * 3);
      out.set(y);
      for (let i = 0; i < out.length; i++) if (i >= d) out[i] += out[i - d] * 0.45;
      y = out;
    }
    if (fx.radio) { // 대역 통과(대략 400~3000Hz) + 살짝 찌그러뜨리기
      const hp = Math.exp((-2 * Math.PI * 400) / sr), lp = 1 - Math.exp((-2 * Math.PI * 3000) / sr);
      let px = 0, py = 0, l = 0;
      y = y.map((v) => { py = hp * (py + v - px); px = v; l += lp * (py - l); return Math.tanh(l * 3) * 0.6; });
    }
    // 소리 크기 맞추기 (최대 0.9)
    let peak = 0;
    for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]));
    if (peak > 0) { const g = Math.min(4, 0.9 / peak); for (let i = 0; i < y.length; i++) y[i] *= g; }
    return y;
  }

  const decoded = new Map(), processed = new Map();
  async function decode(dataUrl) {
    if (decoded.has(dataUrl)) return decoded.get(dataUrl);
    const buf = await (await fetch(dataUrl)).arrayBuffer();
    const ab = await audioCtx().decodeAudioData(buf);
    decoded.set(dataUrl, ab);
    return ab;
  }

  let current = null;
  async function play(dataUrl, fxId = "orig") {
    const ac = audioCtx();
    const key = dataUrl.length + ":" + dataUrl.slice(-64) + ":" + fxId;
    let out = processed.get(key);
    if (!out) {
      const src = await decode(dataUrl);
      const fx = EFFECTS[fxId] || EFFECTS.orig;
      const mono = new Float32Array(src.length);
      for (let c = 0; c < src.numberOfChannels; c++) {
        const d = src.getChannelData(c);
        for (let i = 0; i < d.length; i++) mono[i] += d[i] / src.numberOfChannels;
      }
      const y = fxId === "orig" ? mono : process(mono, src.sampleRate, fx);
      out = ac.createBuffer(1, y.length, src.sampleRate);
      out.copyToChannel(y, 0);
      processed.set(key, out);
    }
    if (current) try { current.stop(); } catch {}
    return new Promise((resolve) => {
      const node = ac.createBufferSource();
      node.buffer = out; node.connect(ac.destination);
      node.onended = () => { if (current === node) current = null; resolve(); };
      current = node; node.start();
    });
  }

  window.VoiceFX = { EFFECTS, play, audioCtx };
})();

