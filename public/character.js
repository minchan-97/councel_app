// 부품 조립식 캐릭터: 모양 × 색 × 소품 × 표정
// 어떤 조합이든 같은 얼굴 좌표(눈 y≈112, 입 y≈132)를 쓰므로 표정 7개가 자동으로 맞는다.
// 모두 직접 그린 도형이라 외부 이미지·저작권 캐릭터가 없다.
(function () {
  const INK = "#2E3350";
  const BLUSH = "#F6A99A";

  const COLORS = {
    white:    { label: "하양",   fill: "#FFFFFF" },
    pink:     { label: "분홍",   fill: "#FFD3DF" },
    peach:    { label: "살구",   fill: "#FFDCC2" },
    lemon:    { label: "레몬",   fill: "#FFF0A8" },
    mint:     { label: "민트",   fill: "#C9F0DF" },
    sky:      { label: "하늘",   fill: "#CFE5FF" },
    lavender: { label: "보라",   fill: "#E2D7FF" },
    gray:     { label: "회색",   fill: "#E2E4EA" },
  };

  // 색을 어둡게/밝게 (외곽선·귀 안쪽용)
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c : 255 - c) * amt)));
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // 모양: 몸통 그림 + 머리 꼭대기 y(소품 위치용)
  const BODIES = {
    cloud: {
      label: "구름", top: 46,
      draw: (c, s) => `<path transform="translate(0,16)" d="M60 150c-28 0-44-18-44-40 0-19 13-33 30-37 4-26 26-45 54-45 24 0 44 14 51 35 3-1 7-1 10-1 22 0 39 17 39 39 0 27-20 49-50 49z" fill="${c}" stroke="${s}" stroke-width="3"/>`,
    },
    bunny: {
      label: "토끼", top: 62,
      draw: (c, s, inner) => `
        <ellipse cx="80" cy="52" rx="17" ry="42" fill="${c}" stroke="${s}" stroke-width="3" transform="rotate(-10 80 52)"/>
        <ellipse cx="140" cy="52" rx="17" ry="42" fill="${c}" stroke="${s}" stroke-width="3" transform="rotate(10 140 52)"/>
        <ellipse cx="80" cy="56" rx="7" ry="28" fill="${inner}" transform="rotate(-10 80 56)"/>
        <ellipse cx="140" cy="56" rx="7" ry="28" fill="${inner}" transform="rotate(10 140 56)"/>
        <ellipse cx="110" cy="126" rx="80" ry="62" fill="${c}" stroke="${s}" stroke-width="3"/>`,
    },
    cat: {
      label: "고양이", top: 66,
      draw: (c, s, inner) => `
        <path d="M40 104 L50 42 L96 74 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M180 104 L170 42 L124 74 Z" fill="${c}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M55 88 L58 58 L80 74 Z" fill="${inner}"/>
        <path d="M165 88 L162 58 L140 74 Z" fill="${inner}"/>
        <ellipse cx="110" cy="126" rx="82" ry="60" fill="${c}" stroke="${s}" stroke-width="3"/>
        <path d="M30 128 h-18 M30 138 h-16 M190 128 h18 M190 138 h16" stroke="${s}" stroke-width="2.5" stroke-linecap="round"/>`,
    },
    bear: {
      label: "곰", top: 60,
      draw: (c, s, inner) => `
        <circle cx="52" cy="66" r="24" fill="${c}" stroke="${s}" stroke-width="3"/>
        <circle cx="168" cy="66" r="24" fill="${c}" stroke="${s}" stroke-width="3"/>
        <circle cx="52" cy="66" r="12" fill="${inner}"/>
        <circle cx="168" cy="66" r="12" fill="${inner}"/>
        <ellipse cx="110" cy="124" rx="82" ry="66" fill="${c}" stroke="${s}" stroke-width="3"/>
        <ellipse cx="110" cy="140" rx="26" ry="18" fill="${inner}" opacity=".55"/>`,
    },
    chick: {
      label: "병아리", top: 60,
      draw: (c, s) => `
        <path d="M104 62 q-6 -18 4 -24 M112 60 q2 -20 14 -22" stroke="${s}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <ellipse cx="34" cy="138" rx="14" ry="24" fill="${c}" stroke="${s}" stroke-width="3" transform="rotate(20 34 138)"/>
        <ellipse cx="186" cy="138" rx="14" ry="24" fill="${c}" stroke="${s}" stroke-width="3" transform="rotate(-20 186 138)"/>
        <ellipse cx="110" cy="126" rx="74" ry="66" fill="${c}" stroke="${s}" stroke-width="3"/>`,
    },
    jelly: {
      label: "젤리", top: 44,
      draw: (c, s) => `
        <path d="M110 40 C162 40 186 106 186 140 C186 174 152 188 110 188 C68 188 34 174 34 140 C34 106 58 40 110 40Z" fill="${c}" stroke="${s}" stroke-width="3"/>
        <ellipse cx="78" cy="78" rx="12" ry="20" fill="#FFFFFF" opacity=".7" transform="rotate(25 78 78)"/>`,
    },
  };

  // 소품: 머리 꼭대기(top) 기준으로 놓는다
  const ACCS = {
    none:       { label: "없음",   draw: () => "" },
    ribbon:     { label: "리본",   draw: (t) => `<g transform="translate(150 ${t + 8})"><path d="M0 0 L-22 -12 L-22 12 Z M0 0 L22 -12 L22 12 Z" fill="#FF7FA3" stroke="#D9577E" stroke-width="2" stroke-linejoin="round"/><circle r="6" fill="#D9577E"/></g>` },
    hat:        { label: "털모자", draw: (t) => `<g transform="translate(110 ${t + 4})"><path d="M-46 4 C-46 -34 46 -34 46 4 Z" fill="#7FA8FF" stroke="#4F78D6" stroke-width="2.5"/><rect x="-50" y="0" width="100" height="14" rx="7" fill="#4F78D6"/><circle cy="-32" r="9" fill="#FFFFFF" stroke="#C9D0E6" stroke-width="2"/></g>` },
    glasses:    { label: "안경",   draw: () => `<g fill="none" stroke="${INK}" stroke-width="3"><circle cx="86" cy="112" r="15"/><circle cx="134" cy="112" r="15"/><path d="M101 112 h18"/></g>` },
    flower:     { label: "꽃",     draw: (t) => `<g transform="translate(72 ${t + 12})">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="7" ry="11" cy="-10" fill="#FFB3C7" transform="rotate(${a})"/>`).join("")}<circle r="6" fill="#FFD84D"/></g>` },
    headphones: { label: "헤드폰", draw: (t) => `<g><path d="M36 118 C36 ${t - 30} 184 ${t - 30} 184 118" fill="none" stroke="#5B6280" stroke-width="7" stroke-linecap="round"/><rect x="22" y="104" width="22" height="34" rx="10" fill="#8C93B5"/><rect x="176" y="104" width="22" height="34" rx="10" fill="#8C93B5"/></g>` },
    crown:      { label: "왕관",   draw: (t) => `<g transform="translate(110 ${t + 2})"><path d="M-26 0 L-30 -26 L-14 -12 L0 -32 L14 -12 L30 -26 L26 0 Z" fill="#FFD84D" stroke="#D9A91C" stroke-width="2.5" stroke-linejoin="round"/><circle cy="-6" r="4" fill="#FF7FA3"/></g>` },
  };

  // 표정: 눈·입만 (얼굴 좌표 공통)
  const FACES = {
    neutral:   `<circle cx="86" cy="112" r="6" fill="${INK}"/><circle cx="134" cy="112" r="6" fill="${INK}"/><path d="M100 134q10 7 20 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    happy:     `<path d="M78 114q8-10 16 0M126 114q8-10 16 0" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M96 130q14 16 28 0z" fill="${INK}"/>`,
    concern:   `<path d="M78 100l14 5M142 100l-14 5" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><circle cx="86" cy="114" r="5.5" fill="${INK}"/><circle cx="134" cy="114" r="5.5" fill="${INK}"/><path d="M100 138q10-6 20 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    surprised: `<circle cx="86" cy="110" r="7.5" fill="${INK}"/><circle cx="134" cy="110" r="7.5" fill="${INK}"/><ellipse cx="110" cy="136" rx="7" ry="9" fill="${INK}"/>`,
    thinking:  `<path d="M80 112h12" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><circle cx="134" cy="110" r="6" fill="${INK}"/><path d="M102 136h16" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
    cheer:     `<path d="M78 114q8-10 16 0M126 114q8-10 16 0" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M98 130q12 12 24 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M190 70l4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#F2C14E"/>`,
    calm:      `<path d="M78 112q8 6 16 0M126 112q8 6 16 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M102 134q8 4 16 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  };

  const DEFAULT_LOOK = { body: "cloud", color: "white", acc: "none" };

  function normalize(look) {
    const l = Object.assign({}, DEFAULT_LOOK, look || {});
    if (!BODIES[l.body]) l.body = DEFAULT_LOOK.body;
    if (!COLORS[l.color]) l.color = DEFAULT_LOOK.color;
    if (!ACCS[l.acc]) l.acc = DEFAULT_LOOK.acc;
    return l;
  }

  function svg(look, emotion = "neutral", opts = {}) {
    const l = normalize(look);
    const body = BODIES[l.body];
    const fill = COLORS[l.color].fill;
    const stroke = l.color === "white" ? "#C9D0E6" : shade(fill, -0.22);
    const inner = l.color === "white" ? "#FFD3DF" : shade(fill, -0.1);
    const face = FACES[emotion] || FACES.neutral;
    const cheeks = `<ellipse cx="70" cy="128" rx="11" ry="7" fill="${BLUSH}" opacity=".55"/><ellipse cx="150" cy="128" rx="11" ry="7" fill="${BLUSH}" opacity=".55"/>`;
    const acc = ACCS[l.acc];
    // 안경·헤드폰은 얼굴 위, 나머지는 머리 위에 그린다
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 200"${opts.title ? ` role="img" aria-label="${opts.title}"` : ' aria-hidden="true"'}>` +
      body.draw(fill, stroke, inner) + cheeks + face + acc.draw(body.top) + `</svg>`;
  }

  window.Character = { svg, normalize, BODIES, COLORS, ACCS, FACES, DEFAULT_LOOK };
})();
