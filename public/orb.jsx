/* AutiveX AI — refined particle orb
   - Brand palette: violeta #B735FF · púrpura #7432FF · azul #0877FF · cian #08D8FF
   - Lighter density (440 particles) so each one has more presence
   - Adds halo + thin orbital ring (toggleable) behind the canvas
*/

const ORB_PALETTE = {
  core:    '#FFFFFF',
  cyan:    '#08D8FF',
  blue:    '#0877FF',
  purple:  '#7432FF',
  violet:  '#B735FF',
  whiteSoft: '#EEF6FF',
};

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function Orb({ density = 440, ring = true, halo = true, audioLevelRef, mode = 'idle', size = 540 }) {
  const canvasRef = React.useRef(null);
  const modeRef = React.useRef(mode);
  React.useEffect(() => { modeRef.current = mode; }, [mode]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const rand = (s) => { const v = Math.sin(s * 928.37) * 10000; return v - Math.floor(v); };

    // particles distributed on a unit sphere
    const particles = Array.from({ length: density }, (_, i) => {
      const a = rand(i + 3);
      const b = rand(i + 113);
      const theta = a * Math.PI * 2;
      const z = b * 2 - 1;
      const phiR = Math.sqrt(Math.max(0.02, 1 - z * z));
      // assign each particle a colour bucket based on depth tendency
      const colorRoll = rand(i + 401);
      let colorKey;
      if (colorRoll < 0.34) colorKey = 'core';
      else if (colorRoll < 0.55) colorKey = 'cyan';
      else if (colorRoll < 0.75) colorKey = 'blue';
      else if (colorRoll < 0.92) colorKey = 'purple';
      else colorKey = 'violet';
      return {
        theta, z, phiR,
        shell: 0.86 + rand(i + 211) * 0.28,
        orbit: (rand(i + 41) - 0.5) * 0.42,
        react: 0.5 + rand(i + 71) * 0.9,
        size: 1.0 + rand(i + 19) * 1.7,
        alpha: 0.5 + rand(i + 29) * 0.5,
        wander: rand(i + 53) > 0.84,
        seed: rand(i + 97) * Math.PI * 2,
        colorKey,
        x: 0, y: 0, vx: 0, vy: 0,
      };
    });

    let w = 0, h = 0, anim, init = false, voice = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width); h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      init = false;
    }

    function modeSettings(m) {
      if (m === 'speaking')   return { radius: 1.02, spring: 0.026, friction: 0.87, drift: 0.28, alpha: 1.16, speed: 1.30, burst: 0.70 };
      if (m === 'listening')  return { radius: 1.00, spring: 0.022, friction: 0.89, drift: 0.20, alpha: 1.04, speed: 0.90, burst: 0.18 };
      if (m === 'thinking')   return { radius: 0.95, spring: 0.020, friction: 0.90, drift: 0.24, alpha: 0.96, speed: 0.72, burst: 0.10 };
      if (m === 'connecting') return { radius: 0.92, spring: 0.024, friction: 0.88, drift: 0.32, alpha: 1.05, speed: 1.15, burst: 0.26 };
      // idle
      return { radius: 1.00, spring: 0.020, friction: 0.88, drift: 0.22, alpha: 1.06, speed: 0.95, burst: 0.16 };
    }

    function targetFor(p, t, min, cx, cy, s) {
      const rot = t * 0.18 * s.speed;
      const theta = p.theta + rot + Math.sin(t * 0.22 + p.seed) * p.orbit;
      const z = p.z + Math.sin(t * 0.28 + p.seed) * 0.08;
      const depth = Math.max(-1, Math.min(1, z));
      const persp = 0.78 + (depth + 1) * 0.13;
      const breath = Math.sin(t * 1.35 + p.seed) * 0.025;
      const wander = p.wander ? Math.max(0, Math.sin(t * 0.7 + p.seed * 1.7)) * 0.24 : 0;
      const burst = modeRef.current === 'speaking'
        ? voice * s.burst * p.react
        : Math.max(0, Math.sin(t * 0.72 + p.seed * 1.4)) * s.burst * 0.22 * p.react;
      const r = min * 0.31 * (s.radius + breath + wander + burst * 0.28) * p.shell;
      const x = cx + Math.cos(theta) * p.phiR * r * persp;
      const y = cy + Math.sin(theta) * p.phiR * r * persp + depth * min * 0.055;
      const cx2 = Math.sin(t * (0.9 + p.react * 0.12) + p.seed) * s.drift;
      const cy2 = Math.cos(t * (0.82 + p.react * 0.1) + p.seed * 1.3) * s.drift;
      return { x, y, depth, curlX: cx2, curlY: cy2, burst };
    }

    function frame(now) {
      const t = now * 0.001 * (reduce ? 0.18 : 1);
      const min = Math.min(w, h);
      const cx = w / 2, cy = h / 2;
      const s = modeSettings(modeRef.current);
      const target = modeRef.current === 'speaking' ? Math.min(1, Math.max(0, audioLevelRef?.current || 0)) : 0;
      voice += (target - voice) * (target > voice ? 0.2 : 0.08);

      ctx.clearRect(0, 0, w, h);

      if (!init) {
        particles.forEach((p) => {
          const tg = targetFor(p, t, min, cx, cy, s);
          p.x = tg.x; p.y = tg.y; p.vx = 0; p.vy = 0;
        });
        init = true;
      }

      const maxDist = min * 0.44;
      const draws = [];
      particles.forEach((p) => {
        const tg = targetFor(p, t, min, cx, cy, s);
        p.vx += (tg.x - p.x) * s.spring + tg.curlX;
        p.vy += (tg.y - p.y) * s.spring + tg.curlY;

        if (modeRef.current === 'speaking' && voice > 0.04) {
          const dx = p.x - cx, dy = p.y - cy;
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = voice * p.react * 0.42;
          p.vx += (dx / d) * f; p.vy += (dy / d) * f;
        }

        p.vx *= s.friction; p.vy *= s.friction;
        p.x += p.vx; p.y += p.vy;

        const dx = p.x - cx, dy = p.y - cy;
        const d = Math.max(1, Math.hypot(dx, dy));
        if (d > maxDist) {
          const pull = (d - maxDist) / d;
          p.x -= dx * pull * 0.18; p.y -= dy * pull * 0.18;
          p.vx *= 0.72; p.vy *= 0.72;
        }
        draws.push({ p, depth: tg.depth, burst: tg.burst });
      });

      draws.sort((a, b) => a.depth - b.depth);
      draws.forEach(({ p, depth, burst }) => {
        const front = (depth + 1) / 2; // 0 back → 1 front
        const shimmer = 0.85 + Math.sin(t * 2.2 + p.seed) * 0.15;
        const a = Math.min(1, p.alpha * (0.4 + front * 0.78) * s.alpha * shimmer + burst * 0.18);
        const sz = p.size * (0.7 + front * 0.85) * (1 + burst * 0.38);
        // colour selection: front-biased core/cyan, back-biased violet/purple
        let key = p.colorKey;
        if (front < 0.35 && (key === 'core' || key === 'cyan')) key = 'violet';
        if (front > 0.75 && (key === 'violet' || key === 'purple')) key = 'cyan';
        ctx.fillStyle = rgba(ORB_PALETTE[key], a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      });

      anim = requestAnimationFrame(frame);
    }

    resize();
    anim = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(anim); window.removeEventListener('resize', resize); };
  }, [density]);

  return (
    <div className="orb-wrap" style={{ width: size, height: size }}>
      {halo && <div className="orb-halo" aria-hidden="true" />}
      {ring && (
        <div className="orb-ring" aria-hidden="true">
          <div className="orb-ring-inner" />
          <div className="orb-ring-outer" />
        </div>
      )}
      <canvas className="orb-canvas" ref={canvasRef} aria-hidden="true" />
    </div>
  );
}

window.Orb = Orb;
