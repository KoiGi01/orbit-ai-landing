import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  Check,
  CheckCircle2,
  Headphones,
  MessageSquareText,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  PlugZap,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import '@fontsource-variable/dm-sans';
import './styles.css';
import { createLiveDemoSession } from './liveDemo';

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
  idle: { colors: ['#6ad8ff', '#3b72ff', '#9f6cff', '#21e19a'], core: '#effbff', energy: 0.45, speed: 0.42 },
  connecting: { colors: ['#7df5ff', '#35b8ff', '#4c66ff', '#20e0ac'], core: '#f4ffff', energy: 0.7, speed: 0.72 },
  listening: { colors: ['#7dffe5', '#2fffb0', '#43d8ff', '#d8ff72'], core: '#f4fffb', energy: 0.82, speed: 0.76 },
  thinking: { colors: ['#8eb7ff', '#625cff', '#42d2ff', '#89f5c4'], core: '#eef4ff', energy: 0.64, speed: 0.5 },
  speaking: { colors: ['#46dfff', '#2f79ff', '#9c69ff', '#22f0a6'], core: '#ffffff', energy: 0.95, speed: 1.05 },
  asking_contact: { colors: ['#8affd1', '#28df82', '#42c8ff', '#f1fffb'], core: '#f8fffb', energy: 0.78, speed: 0.66 },
  complete: { colors: ['#baffdc', '#46e98c', '#98f7ff', '#ffffff'], core: '#ffffff', energy: 0.54, speed: 0.36 },
};

const serviceScenes = [
  {
    key: 'call',
    icon: PhoneCall,
    num: '01',
    label: 'Llamada entrante',
    title: 'Contesta antes de que el lead se enfrie.',
    text: 'Orbit AI toma la llamada al primer tono, saluda con tu voz de marca y evita que el prospecto se vaya con la competencia.',
  },
  {
    key: 'qa',
    icon: Bot,
    num: '02',
    label: 'Respuestas con criterio',
    title: 'Responde preguntas con contexto real.',
    text: 'El agente explica servicios, horarios, precios base y requisitos sin inventar, siguiendo las reglas que definimos para tu operacion.',
  },
  {
    key: 'calendar',
    icon: CalendarCheck,
    num: '03',
    label: 'Agenda conectada',
    title: 'Convierte interes en una cita.',
    text: 'Cuando detecta intencion, propone horarios y crea el evento directamente en Google Calendar para que tu equipo lo tenga listo.',
  },
  {
    key: 'whatsapp',
    icon: MessageSquareText,
    num: '04',
    label: 'Seguimiento automatico',
    title: 'Da seguimiento sin que nadie lo persiga.',
    text: 'Despues de agendar, envia confirmacion y recordatorio por WhatsApp para reducir ausencias y mantener viva la oportunidad.',
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

function AuraScene({ mode }) {
  const canvasRef = useRef(null);
  const modeRef = useRef(mode);
  const paletteRef = useRef(auraPalettes[mode] || auraPalettes.idle);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const blobs = [
      { radius: 0.4, orbit: 0.1, angle: 0.2, color: 0, xAmp: 0.22, yAmp: 0.11 },
      { radius: 0.34, orbit: 1.85, angle: 1.8, color: 1, xAmp: 0.18, yAmp: 0.18 },
      { radius: 0.3, orbit: 2.9, angle: 3.3, color: 2, xAmp: 0.2, yAmp: 0.15 },
      { radius: 0.25, orbit: 4.25, angle: 5.1, color: 3, xAmp: 0.16, yAmp: 0.2 },
      { radius: 0.22, orbit: 5.4, angle: 2.4, color: 0, xAmp: 0.1, yAmp: 0.17 },
    ];
    const sparks = Array.from({ length: 34 }, (_, i) => ({
      angle: (i / 34) * Math.PI * 2,
      seed: Math.random() * Math.PI * 2,
      distance: 0.34 + Math.random() * 0.28,
      size: 0.8 + Math.random() * 1.9,
    }));

    let width = 0, height = 0, animationFrame;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawBlob(x, y, radius, color, alpha, squeeze = 1) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, withAlpha(color, alpha));
      gradient.addColorStop(0.42, withAlpha(color, alpha * 0.55));
      gradient.addColorStop(1, withAlpha(color, 0));
      ctx.save();
      ctx.translate(x, y); ctx.scale(1.16, squeeze); ctx.translate(-x, -y);
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
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
      const t = reducedMotion ? 18 : now * 0.001 * palette.speed;
      const min = Math.min(width, height);
      const cx = width / 2, cy = height / 2;
      const pulse = 1 + Math.sin(t * 2.7) * 0.025 * palette.energy;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      const outerGlow = ctx.createRadialGradient(cx, cy, min * 0.04, cx, cy, min * 0.44);
      outerGlow.addColorStop(0, `rgba(248, 253, 255, ${0.1 + palette.energy * 0.07})`);
      outerGlow.addColorStop(0.34, `rgba(62, 137, 255, ${0.16 + palette.energy * 0.07})`);
      outerGlow.addColorStop(0.62, `rgba(38, 223, 156, ${0.08 + palette.energy * 0.03})`);
      outerGlow.addColorStop(1, 'rgba(38, 121, 255, 0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath(); ctx.arc(cx, cy, min * 0.46, 0, Math.PI * 2); ctx.fill();

      ctx.filter = `blur(${Math.max(16, min * 0.045)}px) saturate(128%)`;
      blobs.forEach((blob, i) => {
        const angle = blob.angle + t * (0.72 + i * 0.08) + Math.sin(t * 0.45 + blob.orbit) * 0.34;
        const wobble = Math.sin(t * 1.8 + blob.orbit) * 0.05;
        const x = cx + Math.cos(angle) * min * (blob.xAmp + wobble);
        const y = cy + Math.sin(angle * 1.16) * min * blob.yAmp;
        const radius = min * blob.radius * pulse * (0.88 + Math.sin(t * 1.4 + i) * 0.08);
        drawBlob(x, y, radius, palette.colors[blob.color], 0.46 + palette.energy * 0.18, 0.72 + i * 0.06);
      });

      ctx.filter = `blur(${Math.max(8, min * 0.02)}px)`;
      drawBlob(cx, cy, min * (0.22 + palette.energy * 0.04), palette.core, 0.64, 0.82);

      ctx.filter = 'none';
      const ringRadius = min * (0.29 + Math.sin(t * 1.6) * 0.012);
      const ring = ctx.createRadialGradient(cx, cy, ringRadius * 0.68, cx, cy, ringRadius * 1.16);
      ring.addColorStop(0, 'rgba(255,255,255,0)');
      ring.addColorStop(0.58, `rgba(231, 250, 255, ${0.14 + palette.energy * 0.08})`);
      ring.addColorStop(0.76, `rgba(74, 172, 255, ${0.12 + palette.energy * 0.09})`);
      ring.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ringRadius * 1.2, ringRadius * 0.82, Math.sin(t * 0.7) * 0.16, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      sparks.forEach((spark) => {
        const shimmer = (Math.sin(t * 2.4 + spark.seed) + 1) / 2;
        if (shimmer < 0.28) return;
        const orbit = spark.angle + t * 0.12;
        const x = cx + Math.cos(orbit) * min * spark.distance;
        const y = cy + Math.sin(orbit * 1.1) * min * spark.distance * 0.72;
        ctx.fillStyle = `rgba(225, 248, 255, ${shimmer * 0.5 * palette.energy})`;
        ctx.beginPath(); ctx.arc(x, y, spark.size, 0, Math.PI * 2); ctx.fill();
      });

      const center = ctx.createRadialGradient(cx, cy, 0, cx, cy, min * 0.16);
      center.addColorStop(0, `rgba(255, 255, 255, ${0.82 + palette.energy * 0.1})`);
      center.addColorStop(0.24, `rgba(212, 248, 255, ${0.34 + palette.energy * 0.12})`);
      center.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = center;
      ctx.beginPath(); ctx.arc(cx, cy, min * 0.17, 0, Math.PI * 2); ctx.fill();

      const edgeMask = ctx.createRadialGradient(cx, cy, min * 0.08, cx, cy, min * 0.52);
      edgeMask.addColorStop(0, 'rgba(255,255,255,1)');
      edgeMask.addColorStop(0.68, 'rgba(255,255,255,1)');
      edgeMask.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = edgeMask;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      if (!reducedMotion) animationFrame = requestAnimationFrame(render);
    }

    resize();
    render(0);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(animationFrame); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas className="aura-scene" ref={canvasRef} aria-hidden="true" />;
}

function LeadForm({ compact = false, source = 'final_cta' }) {
  const [form, setForm] = useState({ name: '', whatsapp: '' });
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const digits = form.whatsapp.replace(/\D/g, '');
    if (!form.name.trim()) { setError('Escribe tu nombre.'); return; }
    if (digits.length < 10 || digits.length > 13) { setError('Agrega un WhatsApp válido.'); return; }
    setError('');
    setSent(true);
    console.info('Lead capturado', { ...form, source, whatsapp: digits });
  };

  if (sent) {
    return (
      <div className="success-message">
        <Check size={16} />
        <span>Listo. Te enviamos la demo personalizada por WhatsApp.</span>
      </div>
    );
  }

  return (
    <form className={compact ? 'lead-form compact' : 'lead-form'} onSubmit={handleSubmit}>
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
      <button type="submit">
        Enviar <ArrowRight size={15} />
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

function PhoneMockup({ activeKey }) {
  const activeClass = `is-${activeKey}`;

  return (
    <div className={`phone-composition ${activeClass}`} aria-hidden="true">
      <div className="calendar-network">
        <span className="network-node node-client" />
        <span className="network-node node-ai" />
        <span className="network-node node-calendar" />
        <span className="network-line line-one" />
        <span className="network-line line-two" />
        <div className="network-event">
          <span>Google Calendar</span>
          <strong>Consulta inicial</strong>
          <small>Manana, 12:00</small>
        </div>
      </div>

      <div className={`phone-shell ${activeClass}`}>
        <div className="phone-speaker" />
        <div className="phone-screen">
          <div className="phone-status">
            <span>9:41</span>
            <span>Orbit AI</span>
          </div>

          <div className={`phone-state call-state ${activeKey === 'call' ? 'active' : ''}`}>
            <span className="call-glow glow-one" />
            <span className="call-glow glow-two" />
            <div className="call-card">
              <span className="screen-label">Llamada entrante</span>
              <div className="caller-avatar">AM</div>
              <h3>Ana Martinez</h3>
              <p>Quiere agendar hoy</p>
              <span className="answering-pill">Orbit AI contestando...</span>
            </div>
            <div className="call-controls">
              <button className="decline-control" type="button"><X size={18} /></button>
              <button className="answer-control" type="button"><PhoneCall size={18} /></button>
            </div>
          </div>

          <div className={`phone-state qa-state ${activeKey === 'qa' ? 'active' : ''}`}>
            <div className="active-call-top">
              <div>
                <span>En llamada con Ana</span>
                <strong>02:18</strong>
              </div>
              <span className="live-dot" />
            </div>
            <div className="speech-thread">
              <p className="bubble client">Cuanto cuesta la consulta?</p>
              <p className="bubble ai">La inicial empieza desde $600. Te confirmo segun el servicio.</p>
              <p className="bubble client">Tienen horario manana?</p>
              <p className="bubble ai">Si. Hay espacio a las 12:00 o 16:30. Cual prefieres?</p>
            </div>
          </div>

          <div className={`phone-state calendar-state ${activeKey === 'calendar' ? 'active' : ''}`}>
            <div className="gcal-topbar">
              <span className="gcal-mark"><i /> <i /> <i /> <i /></span>
              <strong>Google Calendar</strong>
            </div>
            <div className="calendar-grid">
              <div className="calendar-day">
                <span>MAR</span>
                <strong>12</strong>
              </div>
              <div className="calendar-event-card">
                <span>12:00 PM</span>
                <strong>Consulta inicial</strong>
                <p>Ana Martinez - confirmado por Orbit AI</p>
              </div>
              <div className="calendar-summary">
                <CheckCircle2 size={16} />
                Evento creado y listo para el equipo
              </div>
            </div>
          </div>

          <div className={`phone-state whatsapp-state ${activeKey === 'whatsapp' ? 'active' : ''}`}>
            <div className="wa-header">
              <div className="wa-avatar">A</div>
              <div>
                <strong>Ana Martinez</strong>
                <span>WhatsApp</span>
              </div>
            </div>
            <div className="wa-thread">
              <p className="wa-bubble sent">Hola Ana, tu cita quedo confirmada para manana a las 12:00.</p>
              <p className="wa-bubble sent">Te mando ubicacion y recordatorio 2 horas antes. Nos vemos pronto.</p>
              <p className="wa-bubble received">Perfecto, gracias!</p>
            </div>
            <div className="wa-compose">Mensaje enviado <Check size={14} /></div>
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
            <span>Servicio</span>
            <h2>Del primer tono al seguimiento.</h2>
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
          <span>Servicio</span>
          <h2>Del primer tono al seguimiento.</h2>
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
  const [orbMode, setOrbMode] = useState('idle');
  const [demoState, setDemoState] = useState('idle');
  const [transcript, setTranscript] = useState([]);
  const [demoError, setDemoError] = useState('');
  const [demoActions, setDemoActions] = useState([]);
  const [muted, setMuted] = useState(false);
  const sessionRef = useRef(null);
  const transcriptRef = useRef([]);

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

  useEffect(() => {
    if (['requesting_mic', 'connecting'].includes(demoState)) setOrbMode('connecting');
    else if (demoState === 'listening') setOrbMode('listening');
    else if (demoState === 'thinking') setOrbMode('thinking');
    else if (demoState === 'speaking') setOrbMode('speaking');
    else if (demoState === 'ended') setOrbMode('complete');
    else if (demoState === 'error') setOrbMode('asking_contact');
    else if (demoOpen) setOrbMode('asking_contact');
    else setOrbMode('idle');
  }, [demoOpen, demoState]);

  const startDemo = async () => {
    setDemoOpen(true);
    setDemoState('requesting_mic');
    setTranscript([]);
    transcriptRef.current = [];
    setDemoError('');
    setDemoActions([]);
    setMuted(false);
    setOrbMode('connecting');

    await sessionRef.current?.end?.();
    sessionRef.current = await createLiveDemoSession({
      onState: setDemoState,
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
        sessionRef.current = null;
        setMuted(false);
      },
      getTranscript: () => transcriptRef.current,
    });
  };

  const closeDemo = async () => {
    await sessionRef.current?.end?.();
    sessionRef.current = null;
    setDemoOpen(false);
    setOrbMode('idle');
    setDemoState('idle');
    setTranscript([]);
    transcriptRef.current = [];
    setDemoError('');
    setDemoActions([]);
    setMuted(false);
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    sessionRef.current?.setMuted(nextMuted);
  };

  const endCall = async () => {
    await sessionRef.current?.end?.();
    sessionRef.current = null;
    setDemoState('ended');
    setMuted(false);
  };

  return (
    <main className={demoOpen ? 'app demo-active' : 'app'}>
      <div className="grain" aria-hidden="true" />

      {/* ── NAV ── */}
      <nav className="nav">
        <a className="brand" href="#" aria-label="Orbit AI">Orbit AI</a>
        <div className="nav-links" aria-label="Secciones">
          <a href="#servicio">Servicio</a>
          <a href="#calidad">Calidad</a>
          <a href="#contacto">Contacto</a>
        </div>
        <button className="nav-cta" onClick={startDemo}>
          Demo <ArrowRight size={13} />
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-copy">
          <p className="pretitle">
            <span className="pretitle-pip" />
            Recepción con inteligencia artificial
          </p>
          <h1>
            Cada llamada,<br />
            <span className="h1-accent">atendida.</span>
          </h1>
          <p className="hero-subtitle">
            Un agente de voz con IA contesta tus llamadas, agenda citas y da
            seguimiento por WhatsApp — sin pausas, las 24 horas, los 365 días.
          </p>
          <div className="hero-actions">
            <button className="primary-cta" onClick={startDemo}>
              Probar demo de voz <ArrowRight size={17} />
            </button>
            <a className="secondary-cta" href="#servicio">Ver el servicio</a>
          </div>
        </div>

        <div className="concierge-stage" aria-label="Demo visual del servicio">
          <div className="stage-aura">
            <AuraScene mode={orbMode} />
            <button className="mic-button" onClick={startDemo} aria-label="Probar demo de voz">
              <Mic size={22} />
            </button>
          </div>

          <div className="artifact call-note">
            <span className="artifact-label">Llamada entrante</span>
            <strong>Prospecto listo para agendar</strong>
            <span className="artifact-meta">Respondida en 4 s</span>
          </div>

          <div className="artifact whatsapp-note">
            <span className="artifact-label">WhatsApp</span>
            <p>Hola Ana, te confirmo mañana a las 12:00. Te mando ubicación y recordatorio.</p>
          </div>

          <div className="receipt-card">
            <div className="receipt-head">
              <span>Cita reservada</span>
              <CheckCircle2 size={15} />
            </div>
            <dl>
              <div><dt>Cliente</dt><dd>Ana Martínez</dd></div>
              <div><dt>Interés</dt><dd>Consulta inicial</dd></div>
              <div><dt>Siguiente paso</dt><dd>Recordatorio WhatsApp</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── TICKER ── */}
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
            <em>alguien más cerró.</em>
          </p>
          <p className="problem-body">
            Orbit AI responde cuando tu equipo está ocupado, filtra la intención real
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
            <h2>Se comporta como parte de tu equipo, no como una máquina improvisando.</h2>
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
          <h2>Negocios donde una respuesta tarde cuesta dinero.</h2>
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
            <h2>Escucha cómo sonaría tu recepcionista IA.</h2>
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
            <AuraScene mode={orbMode} />
            <div className="demo-status">
              <span className={`status-dot ${orbMode}`} />
              {demoState === 'requesting_mic' && 'Pidiendo microfono'}
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
          <div className="demo-panel">
            <div className="transcript live-transcript" aria-live="polite">
              {transcript.length === 0 && !demoError && (
                <p className="empty-transcript">La llamada empezara en un momento...</p>
              )}
              {transcript.slice(-5).map((line, i) => (
                <p className={line.role === 'user' ? 'from-user' : 'from-assistant'} key={`${line.text}-${i}`}>
                  <span>{line.role === 'user' ? 'Tu' : 'Orbit AI'}</span>
                  {line.text}
                </p>
              ))}
              {demoError && <p className="demo-error">{demoError}</p>}
            </div>

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

            <div className="demo-controls" aria-label="Controles de llamada">
              {demoState === 'error' || demoState === 'ended' ? (
                <button type="button" onClick={startDemo}>
                  <RotateCcw size={16} /> Reintentar
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
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
