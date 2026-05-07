import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CalendarCheck,
  Check,
  CheckCircle2,
  Headphones,
  HeartPulse,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  PlugZap,
  Scale,
  ShieldCheck,
  X,
} from 'lucide-react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/space-grotesk';
import './styles.css';
import { createDemoIntroSession, createLiveDemoSession } from './liveDemo';

const DEMO_OPEN_MS = 1450;
const DEMO_CLOSE_MS = 1100;
const DEMO_HANDOFF_MS = 280;
const REDUCED_DEMO_OPEN_MS = 180;
const REDUCED_DEMO_CLOSE_MS = 260;
const REDUCED_DEMO_HANDOFF_MS = 80;

const demoSteps = [
  {
    state: 'connecting',
    label: 'Conectando',
    line: 'Preparando una llamada de prueba...',
    duration: 1400,
  },
  {
    state: 'speaking',
    label: 'Hablando',
    line: 'Hola, soy tu recepcionista IA. Puedo contestar llamadas, explicar tus servicios y atender cuando tu equipo está ocupado.',
    duration: 3300,
  },
  {
    state: 'speaking',
    label: 'Hablando',
    line: 'También puedo agendar citas, confirmar horarios y mandar seguimiento por WhatsApp para que no se pierdan oportunidades.',
    duration: 3400,
  },
  {
    state: 'asking_contact',
    label: 'Escuchando',
    line: 'Si quieres escuchar cómo sonaría para tu negocio, déjame tu WhatsApp y te enviamos una demo personalizada.',
    duration: 3000,
  },
];

const auraPalettes = {
  idle: { colors: ['#ffffff', '#f1f7fb', '#00ecff', '#0aa4ff'], core: '#ffffff', energy: 0.9, speed: 0.9 },
  intro_idle: { colors: ['#ffffff', '#f1f7fb', '#00ecff', '#0aa4ff'], core: '#ffffff', energy: 0.9, speed: 0.9 },
  connecting: { colors: ['#ffffff', '#edf3f7', '#00e9ff', '#0a9dff'], core: '#ffffff', energy: 0.72, speed: 0.72 },
  listening: { colors: ['#ffffff', '#e4ecef', '#00e6ff', '#0894ff'], core: '#ffffff', energy: 0.78, speed: 0.78 },
  thinking: { colors: ['#ffffff', '#cfd6dd', '#00dfff', '#087dff'], core: '#ffffff', energy: 0.64, speed: 0.58 },
  speaking: { colors: ['#ffffff', '#f1f7fb', '#00ecff', '#0aa4ff'], core: '#ffffff', energy: 0.96, speed: 1.05 },
  asking_contact: { colors: ['#ffffff', '#d7dee2', '#00e2ff', '#087dff'], core: '#ffffff', energy: 0.66, speed: 0.62 },
  complete: { colors: ['#ffffff', '#dce3e6', '#00dcff', '#078cff'], core: '#ffffff', energy: 0.54, speed: 0.44 },
};

const serviceScenes = [
  {
    key: 'call',
    icon: PhoneCall,
    num: '01',
    label: 'Llamada',
    title: 'Atiende antes de perder la intencion.',
    text: 'AutiveX AI toma la llamada al primer tono, identifica el motivo y mantiene al prospecto dentro de tu operacion.',
  },
  {
    key: 'qa',
    icon: Bot,
    num: '02',
    label: 'Contexto',
    title: 'Responde con las reglas de tu negocio.',
    text: 'El agente explica servicios, precios base, horarios y requisitos sin improvisar, usando el criterio que definimos contigo.',
  },
  {
    key: 'calendar',
    icon: CalendarCheck,
    num: '03',
    label: 'Agenda',
    title: 'Convierte interes en una accion concreta.',
    text: 'Cuando detecta una oportunidad, propone horarios, confirma datos y deja el evento listo para que el equipo actue.',
  },
  {
    key: 'whatsapp',
    icon: MessageSquareText,
    num: '04',
    label: 'Seguimiento',
    title: 'Cierra el ciclo sin perseguir manualmente.',
    text: 'Despues de la llamada, prepara confirmaciones, recordatorios y resumen comercial para que nada se enfrie.',
  },
];

const demoScenarios = [
  {
    id: 'clinic',
    icon: HeartPulse,
    label: 'Clinica medica',
    description: 'Recepcion para pacientes, dudas frecuentes y solicitud de cita.',
    businessRole: 'recepcionista de una clinica medica privada',
    customerContext: 'El usuario llama como paciente potencial para resolver una duda y pedir una consulta.',
    firstLine: 'Perfecto. Vamos a simular una llamada a una clinica medica. Yo sere la recepcionista de IA; dime en que te puedo ayudar.',
    leadSource: 'voice_demo_clinic',
  },
  {
    id: 'legal',
    icon: Scale,
    label: 'Despacho de abogados',
    description: 'Primer filtro, tipo de caso y datos para seguimiento legal.',
    businessRole: 'recepcionista de un despacho de abogados',
    customerContext: 'El usuario llama como prospecto con un asunto legal y necesita orientacion inicial.',
    firstLine: 'Perfecto. Vamos a simular una llamada a un despacho de abogados. Yo sere la recepcionista de IA; cuentame brevemente que necesitas.',
    leadSource: 'voice_demo_legal',
  },
  {
    id: 'support',
    icon: Headphones,
    label: 'Servicio al cliente',
    description: 'Atencion de dudas, seguimiento y escalamiento con contexto.',
    businessRole: 'agente de servicio al cliente de una empresa de servicios',
    customerContext: 'El usuario llama como cliente con una duda o solicitud de seguimiento.',
    firstLine: 'Perfecto. Vamos a simular una llamada de servicio al cliente. Yo sere el agente de IA; dime que necesitas revisar.',
    leadSource: 'voice_demo_support',
  },
  {
    id: 'real_estate',
    icon: Building2,
    label: 'Inmobiliaria',
    description: 'Califica interes, zona, presupuesto y agenda visita.',
    businessRole: 'asesor telefonico de una inmobiliaria',
    customerContext: 'El usuario llama como prospecto interesado en comprar o rentar una propiedad.',
    firstLine: 'Perfecto. Vamos a simular una llamada a una inmobiliaria. Yo sere el asesor de IA; que tipo de propiedad estas buscando?',
    leadSource: 'voice_demo_real_estate',
  },
];

function toRgb(color) {
  if (color.startsWith('rgb')) {
    const [r, g, b] = color.match(/\d+/g).map(Number);
    return { r, g, b };
  }
  const num = Number.parseInt(color.replace('#', ''), 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function mixColor(from, to, amount) {
  const a = toRgb(from);
  const b = toRgb(to);
  return `rgb(${Math.round(a.r + (b.r - a.r) * amount)}, ${Math.round(a.g + (b.g - a.g) * amount)}, ${Math.round(a.b + (b.b - a.b) * amount)})`;
}

function withAlpha(rgb, alpha) {
  return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

function normalizeTranscriptText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function mergeTranscript(items, line) {
  const text = normalizeTranscriptText(line.text);
  if (!text) return items;

  const now = Date.now();
  const last = items[items.length - 1];
  const normalized = text.toLowerCase();
  const lastNormalized = normalizeTranscriptText(last?.text).toLowerCase();

  if (last?.role === line.role) {
    if (lastNormalized === normalized && now - (last.at || 0) < 5000) return items;

    if (normalized.startsWith(lastNormalized) || lastNormalized.startsWith(normalized)) {
      const nextText = text.length >= last.text.length ? text : last.text;
      return [...items.slice(0, -1), { ...last, text: nextText, at: now }].slice(-16);
    }

    if (now - (last.at || 0) < 3200) {
      const spacer = /[.!?]$/.test(last.text) ? ' ' : ' ';
      return [...items.slice(0, -1), { ...last, text: `${last.text}${spacer}${text}`, at: now }].slice(-16);
    }
  }

  return [...items, { role: line.role, text, at: now }].slice(-16);
}

function useScrollProgress(ref) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const scrollable = Math.max(1, rect.height - viewport);
      const next = Math.min(1, Math.max(0, -rect.top / scrollable));
      setProgress(next);
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, [ref]);

  return progress;
}

function AuraScene({ mode, audioLevelRef }) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  const paletteRef = useRef(auraPalettes[mode] || auraPalettes.idle);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = (seed) => {
      const value = Math.sin(seed * 928.37) * 10000;
      return value - Math.floor(value);
    };
    const particleCount = 560;
    const particles = Array.from({ length: particleCount }, (_, i) => {
      const a = rand(i + 3);
      const b = rand(i + 113);
      const theta = a * Math.PI * 2;
      const z = b * 2 - 1;
      const phiRadius = Math.sqrt(Math.max(0.02, 1 - z * z));
      return {
        theta,
        z,
        phiRadius,
        shell: 0.88 + rand(i + 211) * 0.26,
        orbit: (rand(i + 41) - 0.5) * 0.42,
        react: 0.45 + rand(i + 71) * 0.95,
        size: 0.95 + rand(i + 19) * 1.65,
        alpha: 0.52 + rand(i + 29) * 0.48,
        cyan: rand(i + 37) > 0.93,
        wander: rand(i + 53) > 0.86,
        seed: rand(i + 97) * Math.PI * 2,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
    });

    let width = 0, height = 0, animationFrame, initialized = false, voiceLevel = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initialized = false;
    }

    function modeSettings(currentMode) {
      if (currentMode === 'speaking') return { radius: 1.02, spring: 0.026, friction: 0.87, drift: 0.28, alpha: 1.16, speed: 1.35, burst: 0.72 };
      if (currentMode === 'idle' || currentMode === 'intro_idle') return { radius: 1.03, spring: 0.022, friction: 0.88, drift: 0.24, alpha: 1.08, speed: 1.05, burst: 0.18 };
      if (currentMode === 'listening') return { radius: 1.02, spring: 0.02, friction: 0.9, drift: 0.2, alpha: 1.02, speed: 0.9, burst: 0.18 };
      if (currentMode === 'thinking') return { radius: 0.95, spring: 0.019, friction: 0.9, drift: 0.24, alpha: 0.96, speed: 0.72, burst: 0.1 };
      if (currentMode === 'connecting') return { radius: 0.9, spring: 0.024, friction: 0.88, drift: 0.34, alpha: 1.05, speed: 1.18, burst: 0.28 };
      if (currentMode === 'complete' || currentMode === 'asking_contact') return { radius: 0.9, spring: 0.017, friction: 0.91, drift: 0.14, alpha: 0.88, speed: 0.58, burst: 0.06 };
      return { radius: 0.9, spring: 0.017, friction: 0.91, drift: 0.14, alpha: 0.88, speed: 0.58, burst: 0.06 };
    }

    function targetFor(particle, index, t, min, cx, cy, settings) {
      const rotation = t * 0.18 * settings.speed;
      const theta = particle.theta + rotation + Math.sin(t * 0.22 + particle.seed) * particle.orbit;
      const z = particle.z + Math.sin(t * 0.28 + particle.seed) * 0.08;
      const depth = Math.max(-1, Math.min(1, z));
      const perspective = 0.78 + (depth + 1) * 0.13;
      const breath = Math.sin(t * 1.35 + particle.seed) * 0.025;
      const wanderPulse = particle.wander ? Math.max(0, Math.sin(t * 0.7 + particle.seed * 1.7)) * 0.24 : 0;
      const voiceBurst = modeRef.current === 'speaking'
        ? voiceLevel * settings.burst * particle.react
        : Math.max(0, Math.sin(t * 0.72 + particle.seed * 1.4)) * settings.burst * 0.22 * particle.react;
      const radius = min * 0.31 * (settings.radius + breath + wanderPulse + voiceBurst * 0.28) * particle.shell;
      const x = cx + Math.cos(theta) * particle.phiRadius * radius * perspective;
      const y = cy + Math.sin(theta) * particle.phiRadius * radius * perspective + depth * min * 0.055;
      const curlX = Math.sin(t * (0.9 + particle.react * 0.12) + particle.seed + index * 0.01) * settings.drift;
      const curlY = Math.cos(t * (0.82 + particle.react * 0.1) + particle.seed * 1.3) * settings.drift;
      return { x, y, depth, curlX, curlY, voiceBurst };
    }

    function render(now) {
      const next = auraPalettes[modeRef.current] || auraPalettes.idle;
      const current = paletteRef.current;
      const ease = 0.035;
      paletteRef.current = {
        colors: current.colors.map((c, i) => mixColor(c, next.colors[i], ease)),
        core: mixColor(current.core, next.core, ease),
        energy: current.energy + (next.energy - current.energy) * ease,
        speed: current.speed + (next.speed - current.speed) * ease,
      };
      const palette = paletteRef.current;
      const motionScale = reducedMotion ? 0.18 : 1;
      const t = now * 0.001 * palette.speed * motionScale;
      const min = Math.min(width, height);
      const cx = width / 2, cy = height / 2;
      const settings = modeSettings(modeRef.current);
      const targetVoice = modeRef.current === 'speaking' ? Math.min(1, Math.max(0, audioLevelRef?.current || 0)) : 0;
      voiceLevel += (targetVoice - voiceLevel) * (targetVoice > voiceLevel ? 0.2 : 0.08);

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      if (!initialized) {
        particles.forEach((particle, index) => {
          const target = targetFor(particle, index, t, min, cx, cy, settings);
          particle.x = target.x;
          particle.y = target.y;
          particle.vx = 0;
          particle.vy = 0;
        });
        initialized = true;
      }

      const maxDistance = min * 0.44;
      const drawList = [];
      particles.forEach((particle, index) => {
        const target = targetFor(particle, index, t, min, cx, cy, settings);
        particle.vx += (target.x - particle.x) * settings.spring + target.curlX;
        particle.vy += (target.y - particle.y) * settings.spring + target.curlY;

        if (modeRef.current === 'speaking' && voiceLevel > 0.04) {
          const dx = particle.x - cx;
          const dy = particle.y - cy;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const force = voiceLevel * particle.react * 0.42;
          particle.vx += (dx / dist) * force;
          particle.vy += (dy / dist) * force;
        }

        particle.vx *= settings.friction;
        particle.vy *= settings.friction;
        particle.x += particle.vx;
        particle.y += particle.vy;

        const dx = particle.x - cx;
        const dy = particle.y - cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        if (dist > maxDistance) {
          const pull = (dist - maxDistance) / dist;
          particle.x -= dx * pull * 0.18;
          particle.y -= dy * pull * 0.18;
          particle.vx *= 0.72;
          particle.vy *= 0.72;
        }

        drawList.push({ particle, depth: target.depth, voiceBurst: target.voiceBurst });
      });

      drawList.sort((a, b) => a.depth - b.depth);
      drawList.forEach(({ particle, depth, voiceBurst }) => {
        const front = (depth + 1) / 2;
        const shimmer = 0.85 + Math.sin(t * 2.2 + particle.seed) * 0.15;
        const alpha = Math.min(1, particle.alpha * (0.42 + front * 0.74) * settings.alpha * shimmer + voiceBurst * 0.18);
        const size = particle.size * (0.72 + front * 0.82) * (1 + voiceBurst * 0.38);
        const color = particle.cyan && ['idle', 'intro_idle', 'speaking', 'connecting'].includes(modeRef.current)
          ? palette.colors[2]
          : (front > 0.5 ? palette.core : palette.colors[1]);

        ctx.fillStyle = withAlpha(color, alpha);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrame = requestAnimationFrame(render);
    }

    resize();
    render(0);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(animationFrame); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas className="aura-scene" ref={canvasRef} aria-hidden="true" />;
}

function LeadForm({
  compact = false,
  source = 'final_cta',
  submitLabel = 'Enviar',
  successMessage = 'Listo. Te enviamos la demo personalizada por WhatsApp.',
  helperText = '',
  variant = '',
}) {
  const [form, setForm] = useState({ name: '', whatsapp: '' });
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const digits = form.whatsapp.replace(/\D/g, '');
    if (!form.name.trim()) { setError('Escribe tu nombre.'); return; }
    if (digits.length < 10 || digits.length > 13) { setError('Agrega un WhatsApp válido.'); return; }
    setError('');
    setSending(true);
    try {
      const response = await fetch('/api/demo/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          whatsapp: digits,
          whatsappConsent: true,
          source,
        }),
      });
      if (!response.ok) throw new Error('lead_request_failed');
      setSent(true);
    } catch (error) {
      console.error('Lead capture failed', error);
      setError('No pudimos enviar tus datos. Intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="success-message">
        <Check size={16} />
        <span>{successMessage}</span>
      </div>
    );
  }

  return (
    <form className={`lead-form${compact ? ' compact' : ''}${variant ? ` ${variant}` : ''}`} onSubmit={handleSubmit}>
      {helperText && <p className="lead-form-helper">{helperText}</p>}
      <input
        aria-label="Nombre"
        placeholder="Tu nombre"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        aria-label="WhatsApp"
        inputMode="tel"
        placeholder="WhatsApp"
        value={form.whatsapp}
        onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
      />
      <button type="submit" disabled={sending}>
        {sending ? 'Enviando...' : submitLabel} <ArrowRight size={15} />
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

function PhoneMockup({ activeKey }) {
  const activeClass = `is-${activeKey}`;

  return (
    <div className={`phone-composition ${activeClass}`} aria-hidden="true">
      <div className={`phone-shell ${activeClass}`}>
        <div className="phone-speaker" />
        <div className="phone-screen">
          <div className="phone-status">
            <span>9:41</span>
            <span>AutiveX AI</span>
          </div>

          <div className={`phone-state call-state ${activeKey === 'call' ? 'active' : ''}`}>
            <div className="call-card">
              <span className="screen-label">Llamada entrante</span>
              <div className="caller-avatar">AM</div>
              <h3>Ana Martinez</h3>
              <p>Consulta inicial · Alta intencion</p>
              <span className="answering-pill">AutiveX AI responde</span>
            </div>
            <div className="signal-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className={`phone-state qa-state ${activeKey === 'qa' ? 'active' : ''}`}>
            <div className="active-call-top">
              <div>
                <span>Conversacion activa</span>
                <strong>02:18</strong>
              </div>
              <span className="live-dot" />
            </div>
            <div className="speech-thread">
              <p className="bubble client">Necesito una consulta esta semana.</p>
              <p className="bubble ai">Tenemos espacio manana a las 12:00 o 16:30.</p>
              <p className="bubble client">Prefiero a las 12:00.</p>
              <p className="bubble ai">Listo. Confirmo tus datos y preparo la cita.</p>
            </div>
          </div>

          <div className={`phone-state calendar-state ${activeKey === 'calendar' ? 'active' : ''}`}>
            <div className="gcal-topbar">
              <span className="gcal-mark"><i /></span>
              <strong>Agenda conectada</strong>
            </div>
            <div className="calendar-grid">
              <div className="calendar-day">
                <span>MAR</span>
                <strong>12</strong>
              </div>
              <div className="calendar-event-card">
                <span>12:00 PM</span>
                <strong>Consulta inicial</strong>
                <p>Ana Martinez · confirmado por AutiveX AI</p>
              </div>
              <div className="calendar-summary">
                <CheckCircle2 size={16} />
                Evento listo para el equipo
              </div>
            </div>
          </div>

          <div className={`phone-state whatsapp-state ${activeKey === 'whatsapp' ? 'active' : ''}`}>
            <div className="wa-header">
              <div className="wa-avatar">A</div>
              <div>
                <strong>Ana Martinez</strong>
                <span>Seguimiento</span>
              </div>
            </div>
            <div className="wa-thread">
              <p className="wa-bubble sent">Ana, tu cita quedo confirmada para manana a las 12:00.</p>
              <p className="wa-bubble sent">Te enviaremos ubicacion y recordatorio antes de llegar.</p>
              <p className="wa-bubble received">Perfecto, gracias!</p>
            </div>
            <div className="wa-compose">Seguimiento preparado <Check size={14} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceScrollytelling() {
  const sectionRef = useRef(null);
  const progress = useScrollProgress(sectionRef);
  const activeIndex = Math.min(serviceScenes.length - 1, Math.floor(progress * serviceScenes.length));
  const activeScene = serviceScenes[activeIndex];

  return (
    <section className="service-scrolly" id="servicio" ref={sectionRef}>
      <div className="scrolly-pin">
        <div className="scrolly-copy">
          <div className="scrolly-section-title">
            <span>Sistema</span>
            <h2>Una recepcion que <span className="gradient-mark">opera con criterio</span>.</h2>
          </div>

          <div className="scrolly-copy-stack" aria-label="Como funciona">
            {serviceScenes.map(({ icon: Icon, num, label, title, text }, index) => (
              <article
                className={activeIndex === index ? 'scrolly-panel active' : 'scrolly-panel'}
                key={title}
                aria-hidden={activeIndex !== index}
              >
                <div className="scrolly-kicker">
                  <span>{num}</span>
                  <Icon size={18} />
                  {label}
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="scrolly-phone-stage">
          <PhoneMockup activeKey={activeScene.key} />
          <div className="scrolly-progress" aria-hidden="true">
            {serviceScenes.map((scene, index) => (
              <span className={activeIndex === index ? 'active' : ''} key={scene.key} />
            ))}
          </div>
        </div>
      </div>

      <div className="mobile-service-scenes" aria-label="Como funciona en cuatro pasos">
        <div className="mobile-scrolly-title">
          <span>Sistema</span>
          <h2>Una recepcion que <span className="gradient-mark">opera con criterio</span>.</h2>
        </div>
        {serviceScenes.map(({ icon: Icon, num, label, title, text, key }) => (
          <article className="mobile-service-scene" key={key}>
            <div className="mobile-scene-copy">
              <div className="scrolly-kicker">
                <span>{num}</span>
                <Icon size={18} />
                {label}
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
            <PhoneMockup activeKey={key} />
          </article>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoTransition, setDemoTransition] = useState('idle');
  const [auraTravel, setAuraTravel] = useState(null);
  const [orbMode, setOrbMode] = useState('idle');
  const [demoState, setDemoState] = useState('idle');
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [showScenarioOptions, setShowScenarioOptions] = useState(false);
  const [introState, setIntroState] = useState('idle');
  const [transcript, setTranscript] = useState([]);
  const [demoError, setDemoError] = useState('');
  const [demoActions, setDemoActions] = useState([]);
  const [muted, setMuted] = useState(false);
  const introVoidActive = demoState === 'selecting_scenario' && !showScenarioOptions;
  const sessionRef = useRef(null);
  const introSessionRef = useRef(null);
  const introRunRef = useRef(0);
  const closeRunRef = useRef(0);
  const closingRef = useRef(false);
  const transitionTimerRef = useRef(0);
  const stageAuraRef = useRef(null);
  const transcriptRef = useRef([]);
  const audioLevelRef = useRef(0);

  const conciergeFlow = useMemo(() => [
    { icon: PhoneCall, num: '01', title: 'Atiende', text: 'Contesta al primer tono con una voz entrenada en tu oferta, horarios y políticas.' },
    { icon: Bot, num: '02', title: 'Entiende', text: 'Detecta intención, urgencia, objeciones y datos clave antes de pasar al siguiente paso.' },
    { icon: CalendarCheck, num: '03', title: 'Agenda', text: 'Propone horarios, confirma la cita y deja la información lista para tu equipo.' },
    { icon: MessageSquareText, num: '04', title: 'Da seguimiento', text: 'Envía WhatsApp, recordatorios y resúmenes para que ninguna oportunidad se enfríe.' },
  ], []);

  const qualityItems = useMemo(() => [
    { icon: ShieldCheck, title: 'Diseñado con tus reglas', text: 'No improvisa: responde con tus precios, límites, tono, servicios y criterios de atención.' },
    { icon: Headphones, title: 'Escala a humano', text: 'Cuando detecta un caso sensible o una oportunidad caliente, transfiere con contexto completo.' },
    { icon: BarChart3, title: 'Registra cada oportunidad', text: 'Guarda intención, estado, resumen y siguiente acción para que vendas con memoria.' },
    { icon: PlugZap, title: 'Ajuste semanal del guion', text: 'Mejoramos respuestas con base en conversaciones reales, no en suposiciones.' },
  ], []);

  const industries = ['Clínicas', 'Inmobiliarias', 'Cursos online', 'Servicios locales', 'Ventas B2B', 'Consultorios', 'Agencias', 'Restaurantes'];

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => () => window.clearTimeout(transitionTimerRef.current), []);

  useEffect(() => {
    if (['requesting_mic', 'connecting'].includes(demoState)) setOrbMode('connecting');
    else if (demoState === 'listening') setOrbMode('listening');
    else if (demoState === 'thinking') setOrbMode('thinking');
    else if (demoState === 'speaking') setOrbMode('speaking');
    else if (demoState === 'ended') setOrbMode('complete');
    else if (demoState === 'error') setOrbMode('asking_contact');
    else if (demoState === 'selecting_scenario' && !showScenarioOptions && ['opening', 'handoff'].includes(demoTransition)) setOrbMode('intro_idle');
    else if (demoState === 'selecting_scenario' && !showScenarioOptions && introState === 'connecting') setOrbMode('intro_idle');
    else if (demoState === 'selecting_scenario' && !showScenarioOptions) setOrbMode('speaking');
    else if (demoOpen) setOrbMode('asking_contact');
    else setOrbMode('idle');
  }, [demoOpen, demoState, showScenarioOptions, introState, demoTransition]);

  const resetDemoState = () => {
    closingRef.current = false;
    setDemoOpen(false);
    setDemoTransition('idle');
    setAuraTravel(null);
    setOrbMode('idle');
    setDemoState('idle');
    setSelectedScenario(null);
    setShowScenarioOptions(false);
    setIntroState('idle');
    setTranscript([]);
    transcriptRef.current = [];
    setDemoError('');
    setDemoActions([]);
    setMuted(false);
    audioLevelRef.current = 0;
  };

  const squareAuraRect = (rect, size = Math.min(rect.width, rect.height)) => ({
    left: rect.left + (rect.width - size) / 2,
    top: rect.top + (rect.height - size) / 2,
    width: size,
    height: size,
  });

  const targetAuraRect = () => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    const isMobile = width <= 760;
    const size = isMobile
      ? Math.max(240, Math.min(width * 0.76, 320))
      : Math.max(340, Math.min(width * 0.58, 560));
    const top = isMobile ? 56 : (height - size) / 2;
    return {
      left: (width - size) / 2,
      top,
      width: size,
      height: size,
    };
  };

  const measureHeroAura = () => {
    const rect = stageAuraRef.current?.getBoundingClientRect();
    if (!rect) return targetAuraRect();
    return squareAuraRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  };

  const travelStyle = (travel) => travel ? {
    '--aura-from-x': `${travel.from.left}px`,
    '--aura-from-y': `${travel.from.top}px`,
    '--aura-from-w': `${travel.from.width}px`,
    '--aura-from-h': `${travel.from.height}px`,
    '--aura-to-x': `${travel.to.left}px`,
    '--aura-to-y': `${travel.to.top}px`,
    '--aura-to-w': `${travel.to.width}px`,
    '--aura-to-h': `${travel.to.height}px`,
  } : undefined;

  const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const startIntroAfterOpening = async (runId) => {
    let introDone = false;
    setIntroState('connecting');
    setOrbMode('connecting');

    const introSession = await createDemoIntroSession({
      onState: setIntroState,
      onOutputLevel: (level) => {
        audioLevelRef.current = level;
      },
      onEnded: () => {
        audioLevelRef.current = 0;
        introDone = true;
        if (introRunRef.current !== runId) return;
        introSessionRef.current = null;
        setIntroState('ended');
        setShowScenarioOptions(true);
        setOrbMode('asking_contact');
      },
      onError: () => {
        audioLevelRef.current = 0;
        introDone = true;
        if (introRunRef.current !== runId) return;
        setIntroState('error');
        setShowScenarioOptions(true);
        setOrbMode('asking_contact');
      },
    });

    if (introRunRef.current !== runId || introDone) {
      await introSession?.end?.();
      return;
    }
    introSessionRef.current = introSession;
  };

  const runCloseTransition = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const runId = closeRunRef.current + 1;
    closeRunRef.current = runId;
    introRunRef.current += 1;
    window.clearTimeout(transitionTimerRef.current);
    await introSessionRef.current?.end?.();
    introSessionRef.current = null;
    await sessionRef.current?.end?.();
    sessionRef.current = null;

    const heroRect = measureHeroAura();
    const centerRect = targetAuraRect();
    setAuraTravel({ direction: 'closing', from: centerRect, to: heroRect });
    setDemoTransition('closing');
    setMuted(false);
    audioLevelRef.current = 0;

    transitionTimerRef.current = window.setTimeout(() => {
      if (closeRunRef.current !== runId) return;
      resetDemoState();
    }, prefersReducedMotion() ? REDUCED_DEMO_CLOSE_MS : DEMO_CLOSE_MS);
  };

  const openDemo = async () => {
    const runId = introRunRef.current + 1;
    closingRef.current = false;
    introRunRef.current = runId;
    closeRunRef.current += 1;
    window.clearTimeout(transitionTimerRef.current);
    await sessionRef.current?.end?.();
    sessionRef.current = null;
    await introSessionRef.current?.end?.();
    introSessionRef.current = null;

    const from = measureHeroAura();
    const to = targetAuraRect();
    setAuraTravel({ direction: 'opening', from, to });
    setDemoOpen(true);
    setDemoTransition('opening');
    setDemoState('selecting_scenario');
    setSelectedScenario(null);
    setShowScenarioOptions(false);
    setIntroState('idle');
    setTranscript([]);
    transcriptRef.current = [];
    setDemoError('');
    setDemoActions([]);
    setMuted(false);
    audioLevelRef.current = 0;
    setOrbMode('connecting');

    const openMs = prefersReducedMotion() ? REDUCED_DEMO_OPEN_MS : DEMO_OPEN_MS;
    const handoffMs = prefersReducedMotion() ? REDUCED_DEMO_HANDOFF_MS : DEMO_HANDOFF_MS;

    transitionTimerRef.current = window.setTimeout(() => {
      if (introRunRef.current !== runId) return;
      setDemoTransition('handoff');
      transitionTimerRef.current = window.setTimeout(() => {
        if (introRunRef.current !== runId) return;
        setDemoTransition('active');
        setAuraTravel(null);
        startIntroAfterOpening(runId);
      }, handoffMs);
    }, openMs);
  };

  const startDemo = async (scenario) => {
    if (!scenario) {
      await openDemo();
      return;
    }

    introRunRef.current += 1;
    await introSessionRef.current?.end?.();
    introSessionRef.current = null;
    setShowScenarioOptions(true);
    setIntroState('ended');
    setDemoOpen(true);
    setDemoState('requesting_mic');
    setSelectedScenario(scenario);
    setTranscript([]);
    transcriptRef.current = [];
    setDemoError('');
    setDemoActions([]);
    setMuted(false);
    audioLevelRef.current = 0;
    setOrbMode('connecting');

    await sessionRef.current?.end?.();
    sessionRef.current = await createLiveDemoSession({
      scenario,
      onState: setDemoState,
      onOutputLevel: (level) => {
        audioLevelRef.current = level;
      },
      onTranscript: (line) => {
        setTranscript((items) => {
          const next = mergeTranscript(items, line);
          transcriptRef.current = next;
          return next;
        });
      },
      onAction: (action) => {
        setDemoActions((items) => [action, ...items.filter((item) => item.type !== action.type)].slice(0, 3));
      },
      onError: setDemoError,
      onEnded: () => {
        audioLevelRef.current = 0;
        sessionRef.current = null;
        setMuted(false);
        if (!closingRef.current) runCloseTransition();
      },
      getTranscript: () => transcriptRef.current,
    });
  };

  const closeDemo = async () => {
    await runCloseTransition();
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    sessionRef.current?.setMuted(nextMuted);
  };

  const endCall = async () => {
    await runCloseTransition();
  };

  return (
    <main className={`app demo-transition-${demoTransition}${demoOpen ? ' demo-active' : ''}`}>
      <div className="grain" aria-hidden="true" />

      {/* ── NAV ── */}
      <nav className="nav">
        <a className="brand brand-logo" href="#" aria-label="AutiveX AI">
          <img src="/brand-logo.png" alt="" />
        </a>
        <div className="nav-links" aria-label="Secciones">
          <a href="#servicio">Producto</a>
          <a href="#calidad">Sistema</a>
          <a href="#contacto">Contacto</a>
        </div>
        <button className="nav-cta" onClick={openDemo}>
          Demo
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="hero hero-v2">
        <div className="hero-v2-copy">
          <h1>
            Convierte llamadas perdidas en <span className="gradient-mark">citas confirmadas</span><span className="h1-accent">.</span>
          </h1>
          <p className="hero-subtitle hero-subtitle-v2">
            AutiveX AI contesta, califica, agenda y da seguimiento por WhatsApp cuando tu equipo no puede atender.
          </p>
          <div className="hero-lead-card" aria-label="Cotizar asistente IA">
            <LeadForm
              compact
              source="hero_quote"
              submitLabel="Cotizar mi asistente"
              successMessage="Listo. Te escribiremos por WhatsApp con tu demo personalizada."
              helperText="Te contactamos por WhatsApp con una demo personalizada."
              variant="hero-lead-form"
            />
          </div>
          <div className="hero-actions hero-actions-v2 hero-demo-actions">
            <button className="secondary-cta" onClick={openDemo}>
              Ver demo
            </button>
          </div>
        </div>

        <div className="concierge-stage neural-stage" aria-label="Sistema de asistente IA">
          <div className="hero-system-preview" aria-hidden="true">
            <div className="system-preview-row active">
              <span>Llamada entrante</span>
              <strong>Ana Martinez</strong>
            </div>
            <div className="system-preview-row">
              <span>Calificacion</span>
              <strong>Alta intencion</strong>
            </div>
            <div className="system-preview-row confirmed">
              <span>Cita confirmada</span>
              <strong>Manana, 12:00</strong>
            </div>
          </div>
          <div
            className={demoOpen ? 'stage-aura neural-mesh-sculpture is-traveling-source' : 'stage-aura neural-mesh-sculpture'}
            ref={stageAuraRef}
          >
            <AuraScene mode={orbMode} audioLevelRef={audioLevelRef} />
          </div>
        </div>
      </section>

      {/* ── TICKER ── */}
      {auraTravel && (
        <div
          className={`aura-traveler aura-traveler-${auraTravel.direction}`}
          style={travelStyle(auraTravel)}
          aria-hidden="true"
        >
          <AuraScene mode={orbMode} audioLevelRef={audioLevelRef} />
        </div>
      )}

      <div className="ticker-wrap" aria-hidden="true">
        <div className="ticker-track">
          {[...industries, ...industries, ...industries].map((ind, i) => (
            <span key={i} className="ticker-item">{ind}</span>
          ))}
        </div>
      </div>

      {/* ── PROBLEM ── */}
      <section className="problem-section" aria-label="Problema">
        <div className="problem-inner">
          <p className="problem-statement">
            Cada llamada perdida<br />
            es una venta que<br />
            <em className="gradient-mark">alguien más cerró.</em>
          </p>
          <p className="problem-body">
            Autivex AI responde cuando tu equipo está ocupado, filtra la intención real
            y convierte cada conversación en una cita o seguimiento concreto.
          </p>
        </div>
      </section>

      {/* ── SERVICE ── */}
      <ServiceScrollytelling />
      {false && <section className="service-story" id="servicio">
        <div className="section-header">
          <span className="section-num">01</span>
          <div className="story-heading">
            <h2>Voz IA + WhatsApp + agenda + resumen comercial, en un solo flujo.</h2>
            <p>No instalamos un chatbot suelto. Diseñamos una recepción comercial que conoce tu negocio, habla con criterio y deja trazabilidad para vender mejor.</p>
          </div>
        </div>

        <div className="flow-timeline" aria-label="Cómo funciona">
          {conciergeFlow.map(({ icon: Icon, num, title, text }) => (
            <article className="flow-step" key={title}>
              <div className="step-num">{num}</div>
              <Icon size={20} className="step-icon" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      }

      {/* ── QUALITY ── */}
      <section className="quality-section" id="calidad">
        <div className="section-header">
          <span className="section-num">02</span>
          <div className="quality-copy">
            <h2>Se comporta como <span className="gradient-mark">parte de tu equipo</span>, no como una máquina improvisando.</h2>
            <p>El valor no está solo en contestar. Está en responder bien, saber cuándo insistir, cuándo transferir y cómo dejar el contexto listo para que tu equipo venda.</p>
          </div>
        </div>

        <div className="quality-list">
          {qualityItems.map(({ icon: Icon, title, text }) => (
            <article className="quality-item" key={title}>
              <Icon size={18} className="quality-icon" />
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── INDUSTRIES ── */}
      <section className="industries-section" aria-label="Industrias">
        <div className="section-header">
          <span className="section-num">03</span>
          <h2>Negocios donde una <span className="gradient-mark">respuesta tarde</span> cuesta dinero.</h2>
        </div>
        <div className="industry-chips">
          {industries.map((ind) => (
            <span key={ind}>{ind}</span>
          ))}
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section className="contact" id="contacto">
        <div className="section-header">
          <span className="section-num">04</span>
        </div>
        <div className="contact-inner">
          <div className="contact-copy">
            <h2>Escucha cómo sonaría tu <span className="gradient-mark">recepcionista IA</span>.</h2>
            <p>Déjanos tu WhatsApp y armamos una demo con tu tipo de cliente, tus preguntas frecuentes y un flujo de cita cercano a tu operación real.</p>
          </div>
          <LeadForm compact source="final_cta" />
        </div>
      </section>

      {/* ── DEMO MODAL ── */}
      {demoOpen && (
        <div className={`demo-overlay demo-state-${demoState}`} role="dialog" aria-modal="true" aria-label="Demo del agente IA">
          <button className="close-demo" onClick={closeDemo} aria-label="Cerrar demo">
            <X size={18} />
          </button>
          <div className="demo-orb">
            <AuraScene mode={orbMode} audioLevelRef={audioLevelRef} />
            <div className={introVoidActive ? 'demo-status is-hidden' : 'demo-status'}>
              <span className={`status-dot ${orbMode}`} />
              {demoState === 'requesting_mic' && 'Pidiendo microfono'}
              {demoState === 'selecting_scenario' && !showScenarioOptions && introState === 'connecting' && 'Preparando voz'}
              {demoState === 'selecting_scenario' && !showScenarioOptions && introState !== 'connecting' && 'Presentando demo'}
              {demoState === 'selecting_scenario' && showScenarioOptions && 'Elige un escenario'}
              {demoState === 'connecting' && 'Conectando'}
              {demoState === 'listening' && 'Escuchando'}
              {demoState === 'thinking' && 'Pensando'}
              {demoState === 'speaking' && 'Hablando'}
              {demoState === 'muted' && 'Microfono silenciado'}
              {demoState === 'ended' && 'Llamada terminada'}
              {demoState === 'error' && 'Demo no disponible'}
              {demoState === 'idle' && 'Agente listo'}
            </div>
          </div>
          <div className={demoState === 'selecting_scenario' ? `demo-panel scenario-demo-panel${!showScenarioOptions ? ' is-hidden' : ''}` : 'demo-panel'}>
            {demoState === 'selecting_scenario' ? (
              <div className="scenario-selector" aria-label="Escenarios de demo">
                {showScenarioOptions && (
                  <div className="scenario-intro">
                    <span>Demo interactiva</span>
                    <h2>Elige el servicio mas cercano a tu negocio.</h2>
                    <p>Despues te pediremos permiso para usar el microfono y entraras como cliente o prospecto.</p>
                  </div>
                )}

                {showScenarioOptions && (
                  <div className="scenario-grid">
                    {demoScenarios.map(({ icon: Icon, ...scenario }, index) => (
                      <button
                        className="scenario-card"
                        style={{ '--delay': `${index * 120}ms` }}
                        type="button"
                        onClick={() => startDemo({ icon: Icon, ...scenario })}
                        key={scenario.id}
                      >
                        <Icon size={19} />
                        <span>
                          <strong>{scenario.label}</strong>
                          <small>{scenario.description}</small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="transcript live-transcript" aria-live="polite">
                {selectedScenario && (
                  <p className="demo-scenario-label">
                    <span>Escenario</span>
                    {selectedScenario.label}
                  </p>
                )}
                {transcript.length === 0 && !demoError && (
                  <p className="empty-transcript">La llamada empezara en un momento...</p>
                )}
                {transcript.slice(-5).map((line, i) => (
                  <p className={line.role === 'user' ? 'from-user' : 'from-assistant'} key={`${line.text}-${i}`}>
                    <span>{line.role === 'user' ? 'Tu' : 'Autivex AI'}</span>
                    {line.text}
                  </p>
                ))}
                {demoError && <p className="demo-error">{demoError}</p>}
              </div>
            )}

            {demoActions.length > 0 && (
              <div className="demo-actions-list" aria-label="Acciones de la demo">
                {demoActions.map((action) => (
                  <a
                    className="demo-action-card"
                    href={action.href || undefined}
                    target={action.href ? '_blank' : undefined}
                    rel={action.href ? 'noreferrer' : undefined}
                    key={action.id}
                  >
                    <MessageSquareText size={16} />
                    <span>
                      <strong>{action.title}</strong>
                      <small>{action.text}</small>
                    </span>
                  </a>
                ))}
              </div>
            )}

            {demoState === 'error' && <LeadForm source="demo_fallback" />}

            {demoState !== 'selecting_scenario' && (
              <div className="demo-controls" aria-label="Controles de llamada">
                {demoState === 'error' || demoState === 'ended' ? (
                  <button type="button" onClick={closeDemo}>
                    <X size={16} /> Cerrar demo
                  </button>
                ) : (
                <>
                  <button type="button" onClick={toggleMute} disabled={!sessionRef.current}>
                    {muted ? <Mic size={16} /> : <MicOff size={16} />}
                    {muted ? 'Activar mic' : 'Silenciar'}
                  </button>
                  <button className="danger-control" type="button" onClick={endCall}>
                    <PhoneOff size={16} /> Terminar
                  </button>
                </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
