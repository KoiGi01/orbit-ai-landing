import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import { RetellWebClient } from 'retell-client-js-sdk';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarCheck,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Headphones,
  Menu,
  MessageSquareText,
  Mic,
  Phone,
  PhoneCall,
  Route,
  ShieldCheck,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import './landing.css';

const MOTION_EXIT_MS = 320;

function usePresence(open) {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState(open ? 'is-open' : 'is-closed');

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setState('is-open'));
      return () => cancelAnimationFrame(frame);
    }
    setState('is-closing');
    const timer = window.setTimeout(() => setMounted(false), MOTION_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { mounted, state };
}

function AnimatedNumber({ value, suffix = '', format = (number) => Math.round(number).toLocaleString('es-MX') }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame;
    const run = () => {
      if (reduced) {
        setDisplay(value);
        return;
      }
      const startedAt = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / 1100);
        setDisplay(value * (1 - ((1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      run();
      observer.disconnect();
    }, { threshold: 0.45 });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [value]);

  return <span ref={ref}>{format(display)}{suffix}</span>;
}

function MotionRuntime() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealNodes = [...document.querySelectorAll('[data-reveal]')];
    if (reduced) revealNodes.forEach((node) => node.classList.add('is-revealed'));
    const observer = reduced ? null : new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    revealNodes.forEach((node) => observer?.observe(node));
    if (reduced) return () => observer?.disconnect();

    let frame = 0;
    let pointerX = 0.5;
    let pointerY = 0.3;
    let scrollY = window.scrollY;
    const render = () => {
      root.style.setProperty('--pointer-x', pointerX.toFixed(3));
      root.style.setProperty('--pointer-y', pointerY.toFixed(3));
      root.style.setProperty('--pointer-shift-x', `${((pointerX - 0.5) * 22).toFixed(1)}px`);
      root.style.setProperty('--pointer-shift-y', `${((pointerY - 0.5) * 18).toFixed(1)}px`);
      const oceanScroll = Math.min(scrollY * 0.035, 90);
      root.style.setProperty('--ocean-scroll', `${oceanScroll.toFixed(1)}px`);
      root.style.setProperty('--ocean-scroll-back', `${(oceanScroll * -0.3).toFixed(1)}px`);
      root.style.setProperty('--ocean-scroll-shallow', `${(oceanScroll * -0.18).toFixed(1)}px`);
      frame = 0;
    };
    const schedule = () => { if (!frame && !document.hidden) frame = requestAnimationFrame(render); };
    const onPointer = (event) => {
      pointerX = event.clientX / window.innerWidth;
      pointerY = event.clientY / window.innerHeight;
      schedule();
    };
    const onScroll = () => { scrollY = window.scrollY; schedule(); };
    const onVisibility = () => root.classList.toggle('motion-paused', document.hidden);
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      observer?.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL
  || (import.meta.env.DEV ? 'http://127.0.0.1:4184' : window.location.origin);

const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || 'https://calendly.com/autivex/consultoria';

function track(event, properties = {}) {
  const payload = { event, ...properties, occurredAt: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent('autivex:analytics', { detail: payload }));
  if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload);
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

const DEMO_CASES = [
  {
    key: 'urgent',
    label: 'Solicitud urgente',
    description: 'Prueba cómo recopila contexto sin prometer algo que no puede garantizar.',
    business_role: 'recepcionista de un negocio de servicios con atención por cita',
    customer_context: 'El usuario llama como cliente con una necesidad urgente desde anoche. Debes recopilar contexto básico, evitar prometer una solución inmediata y explicar que el equipo debe valorar la urgencia.',
    first_line: 'Buenas tardes, gracias por llamar. ¿En qué le puedo ayudar?',
  },
  {
    key: 'first-visit',
    label: 'Primer contacto',
    description: 'Pregunta por un servicio y quiere saber cuál sería el siguiente paso.',
    business_role: 'recepcionista de un negocio de servicios con atención por cita',
    customer_context: 'El usuario llama por primera vez y está interesado en un servicio. Debes entender lo que busca, recopilar lo necesario y ofrecer que el equipo continúe con la agenda sin inventar horarios.',
    first_line: 'Buenas tardes, gracias por llamar. ¿En qué le puedo ayudar?',
  },
  {
    key: 'existing',
    label: 'Mover una cita',
    description: 'Solicita cambiar una cita cuando aún no hay calendario conectado.',
    business_role: 'recepcionista de un negocio de servicios con atención por cita',
    customer_context: 'El usuario ya es cliente y quiere cambiar una cita. Debes pedir los datos necesarios y explicar con honestidad que el equipo confirmará el nuevo horario; no inventes disponibilidad.',
    first_line: 'Buenas tardes, gracias por llamar. ¿En qué le puedo ayudar?',
  },
  {
    key: 'question',
    label: 'Pregunta por precio o duración',
    description: 'Pide un dato exacto que el agente no tiene por qué inventar.',
    business_role: 'recepcionista de un negocio de servicios con atención por cita',
    customer_context: 'El usuario pregunta por el precio o la duración exacta de un servicio. Debes responder únicamente con la información configurada para ese servicio, reconocer con honestidad cuando no la tienes y ofrecer seguimiento del equipo.',
    first_line: 'Buenas tardes, gracias por llamar. ¿En qué le puedo ayudar?',
  },
];

const MISSED_CALLS = 62;

const TECH_STACK = [
  { name: 'Retell', role: 'Orquesta la llamada en tiempo real', src: '/logos/retell.svg', tone: 'cyan' },
  { name: 'OpenAI', role: 'Entiende y decide qué responder', src: '/logos/openai.svg', tone: 'cobalt' },
  { name: 'Anthropic', role: 'Entiende y decide qué responder', src: '/logos/anthropic.svg', tone: 'coral' },
  { name: 'ElevenLabs', role: 'Contesta con voz natural', src: '/logos/elevenlabs.svg', tone: 'yellow' },
];

const FIT_YES = [
  'Pierdes llamadas recurrentes en horas pico o fuera de horario.',
  'Te preguntan lo mismo todo el día: horarios, precios, ubicación, disponibilidad.',
  'Trabajas con citas, reservas o visitas agendadas.',
  'Quieres que cada llamada termine en un dato registrado, no en un recado perdido.',
];

const FIT_NO = [
  'Recibes tan pocas llamadas que tu equipo nunca deja una sin contestar.',
  'Cada llamada necesita criterio humano experto desde el primer segundo.',
  'Nadie en tu equipo puede dar seguimiento a lo que el agente deje listo.',
  'Todavía no tienes claro qué debería pasar cuando el agente no sepa responder.',
];

const CAPABILITIES = [
  {
    title: 'Entiende el motivo',
    text: 'Distingue una primera cita, un seguimiento, una urgencia o una pregunta.',
    Icon: MessageSquareText,
    className: 'capability-cyan',
  },
  {
    title: 'Aplica tus reglas',
    text: 'Responde lo permitido y reconoce cuándo debe detenerse o pedir ayuda.',
    Icon: ShieldCheck,
    className: 'capability-coral',
  },
  {
    title: 'Entrega el siguiente paso',
    text: 'Transfiere o deja el contexto listo para que el equipo continúe.',
    Icon: Route,
    className: 'capability-yellow',
  },
];

const PILOT_STEPS = [
  {
    title: 'Define la cobertura',
    text: 'Elegimos un hueco concreto: desborde, fuera de horario o ambos.',
    Icon: Clock3,
  },
  {
    title: 'Ponla a prueba',
    text: 'Ensayamos llamadas normales, casos difíciles y rutas de respaldo.',
    Icon: PhoneCall,
  },
  {
    title: 'Decide con evidencia',
    text: 'Revisas conversaciones y resultados antes de ampliar la operación.',
    Icon: BarChart3,
  },
];

const FAQS = [
  {
    question: '¿AutiveX reemplaza a mi recepcionista?',
    answer: 'No tiene que hacerlo. El punto de partida recomendado es cubrir los momentos en que tu equipo está ocupado o el negocio ya cerró. Los casos que requieren criterio humano siguen llegando a una persona.',
  },
  {
    question: '¿Puede usar el número actual de mi negocio?',
    answer: 'Depende de tu proveedor telefónico. Revisamos si conviene desvío, una segunda línea o una integración directa antes de cambiar cualquier cosa.',
  },
  {
    question: '¿Qué pasa cuando no sabe responder?',
    answer: 'Reconoce el límite y sigue una ruta definida: transferir, registrar una devolución o pedir los datos necesarios. No debería inventar una respuesta ni prometer disponibilidad.',
  },
  {
    question: '¿Qué está conectado en la demo de hoy?',
    answer: 'La demo pública prueba la conversación por voz mediante Retell. Calendario, telefonía y mensajería todavía no se presentan como integraciones activas: se conectan y validan durante un piloto según los sistemas de cada negocio.',
  },
  {
    question: '¿Qué pasa si la voz o una integración falla?',
    answer: 'Antes de activar una línea se define una ruta de respaldo: transferir a recepción, dejar una devolución pendiente o usar una segunda línea. Si una ruta no puede probarse, no se activa.',
  },
  {
    question: '¿Cómo se define el precio y la duración del piloto?',
    answer: 'Dependen del volumen, la cobertura y las integraciones necesarias. Antes de empezar recibes por escrito el alcance, el costo, la duración, los responsables y el criterio para decidir si se amplía.',
  },
];

function Brand({ dark = false }) {
  return (
    <a className={`brand ${dark ? 'brand-on-dark' : ''}`} href="#inicio" aria-label="AutiveX, volver al inicio">
      <span className="brand-symbol" aria-hidden="true">
        <img src="/autivex-ribbon.png" alt="" />
      </span>
      <strong>AutiveX</strong>
    </a>
  );
}

function Navigation({ onDemo, onPilot }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <div className="nav-shell">
        <Brand dark />
        <nav id="primary-navigation" className={`nav-links ${open ? 'is-open' : ''}`} aria-label="Navegación principal">
          <a href="#producto" onClick={close}>Producto</a>
          <a href="#resultados" onClick={close}>Resultados</a>
          <a href="#piloto" onClick={close}>Cómo empezar</a>
          <a className="mobile-login" href={`${DASHBOARD_URL}/sign-in`} onClick={close}>Iniciar sesión</a>
          <button type="button" className="mobile-nav-cta" onClick={() => { close(); onPilot(); }}>Solicitar demo</button>
        </nav>
        <div className="nav-actions">
          <a className="nav-login" href={`${DASHBOARD_URL}/sign-in`}>Iniciar sesión</a>
          <button type="button" className="nav-demo" onClick={onDemo}>
            <Volume2 size={19} aria-hidden="true" /> Probar la voz
          </button>
          <button type="button" className="menu-button" onClick={() => setOpen((value) => !value)} aria-controls="primary-navigation" aria-expanded={open} aria-label={open ? 'Cerrar menú' : 'Abrir menú'}>
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
    </header>
  );
}

function HeroChart() {
  return (
    <svg className="hero-chart" viewBox="0 0 620 230" role="img" aria-label="Volumen de llamadas y citas a lo largo del día">
      <defs>
        <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#47e6de" stopOpacity="0.42" />
          <stop offset="1" stopColor="#47e6de" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hero-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#47e6de" />
          <stop offset="0.72" stopColor="#43a5ff" />
          <stop offset="1" stopColor="#ff7058" />
        </linearGradient>
      </defs>
      <g className="chart-grid">
        <line x1="28" y1="36" x2="594" y2="36" />
        <line x1="28" y1="93" x2="594" y2="93" />
        <line x1="28" y1="150" x2="594" y2="150" />
        <line x1="28" y1="207" x2="594" y2="207" />
      </g>
      <path className="chart-area" d="M28 190 C66 177 82 184 112 162 C142 139 161 154 190 130 C219 106 240 137 270 115 C300 93 318 109 345 84 C373 58 401 97 426 75 C452 51 477 74 502 48 C529 19 556 49 594 25 L594 207 L28 207 Z" />
      <path className="chart-line" d="M28 190 C66 177 82 184 112 162 C142 139 161 154 190 130 C219 106 240 137 270 115 C300 93 318 109 345 84 C373 58 401 97 426 75 C452 51 477 74 502 48 C529 19 556 49 594 25" />
      <g className="chart-points">
        <circle cx="112" cy="162" r="6" />
        <circle cx="270" cy="115" r="6" />
        <circle cx="426" cy="75" r="6" />
        <circle className="chart-point-coral" cx="594" cy="25" r="7" />
      </g>
    </svg>
  );
}

function HeroProduct() {
  return (
    <div className="hero-product" aria-label="Vista demostrativa del panel de AutiveX">
      <div className="product-glow product-glow-one" />
      <div className="product-glow product-glow-two" />
      <div className="product-window">
        <header className="product-window-header">
          <div><Activity size={20} /><strong>Vista de producto</strong></div>
          <span>Datos de ejemplo</span>
        </header>
        <div className="product-metric-line">
          <div>
            <span>Llamadas atendidas</span>
            <strong><AnimatedNumber value={128} /></strong>
          </div>
          <span className="metric-change">+12%</span>
        </div>
        <HeroChart />
        <div className="chart-legend">
          <span><i className="legend-cyan" /> Llamadas</span>
          <span><i className="legend-coral" /> Citas listas</span>
        </div>
        <div className="product-stats">
          <div><strong>42</strong><span>con intención de agendar</span></div>
          <div><strong>24</strong><span>citas listas para confirmar</span></div>
          <div><strong>57%</strong><span>de intención a cita</span></div>
        </div>
      </div>
      <article className="incoming-call-card">
        <span className="incoming-icon"><PhoneCall size={22} /></span>
        <div><span>Llamada entrante</span><strong>Cliente nuevo</strong></div>
        <span className="call-live-dot" aria-label="En curso" />
      </article>
      <article className="call-result-card">
        <span><Check size={22} /></span>
        <div><strong>Motivo registrado</strong><p>Primer contacto</p></div>
      </article>
    </div>
  );
}

function Hero({ onDemo, onPilot }) {
  return (
    <section className="hero" id="inicio">
      <div className="hero-orbit hero-orbit-one" />
      <div className="hero-orbit hero-orbit-two" />
      <div className="hero-grid">
        <div className="hero-copy">
          <h1>Que una llamada sin respuesta no te cueste <span className="headline-accent">un cliente</span>.</h1>
          <p>AutiveX atiende las llamadas de tu negocio cuando tu equipo está ocupado, identifica el motivo y deja cada caso listo para confirmar una cita, devolver la llamada o escalar.</p>
          <div className="hero-actions" data-reveal style={{ '--reveal-delay': '280ms' }}>
            <button type="button" className="button button-coral" onClick={onDemo}>
              <Volume2 size={21} /> Probar la voz
            </button>
            <button type="button" className="button button-ghost" onClick={onPilot}>
              Solicitar demo <ArrowRight size={20} />
            </button>
          </div>
        </div>
        <div data-reveal data-reveal-direction="right" style={{ '--reveal-delay': '160ms' }}><HeroProduct /></div>
      </div>
      <div className="hero-capability-line" data-reveal aria-label="Capacidades principales">
        <span><PhoneCall size={22} /> Contesta</span>
        <span><CircleDot size={22} /> Clasifica</span>
        <span><Route size={22} /> Escala</span>
        <span><CalendarCheck size={22} /> Deja la cita lista</span>
      </div>
    </section>
  );
}

function CallMatrix() {
  return (
    <div
      className="call-matrix"
      role="img"
      aria-label={`De cada 100 llamadas, ${MISSED_CALLS} quedan sin respuesta y ${100 - MISSED_CALLS} se contestan.`}
    >
      {Array.from({ length: 100 }, (_, index) => (
        <i
          key={index}
          className={index < MISSED_CALLS ? 'is-lost' : 'is-answered'}
          style={{ '--dot-delay': `${index * 11}ms` }}
        />
      ))}
    </div>
  );
}

function ProblemSection() {
  return (
    <section className="problem-section" id="evidencia">
      <div className="section-heading" data-reveal>
        <h2>El costo real de no contestar.</h2>
        <p>No es una corazonada: así lo está midiendo la industria del servicio al cliente.</p>
      </div>

      <div className="call-panel" data-reveal>
        <header className="call-panel-head">
          <span className="call-panel-eyebrow"><PhoneCall size={18} /> De cada 100 llamadas que entran a un negocio como el tuyo</span>
          <strong className="call-panel-figure">{MISSED_CALLS}<i>%</i></strong>
        </header>
        <CallMatrix />
        <footer className="call-panel-foot">
          <span className="matrix-key matrix-key-lost"><i />{MISSED_CALLS} quedan sin respuesta</span>
          <span className="matrix-key matrix-key-answered"><i />{100 - MISSED_CALLS} se contestan</span>
          <cite>Small Business Trends · análisis de telecomunicaciones</cite>
        </footer>
      </div>

      <div className="problem-consequences">
        <article className="consequence consequence-loss" data-reveal>
          <strong>85%</strong>
          <p>de quienes no reciben respuesta no vuelve a llamar.</p>
          <span className="consequence-flow">Tu negocio <ArrowRight size={17} /> la competencia</span>
          <cite>MessageDesk / BT Business</cite>
        </article>
        <article className="consequence consequence-gain" data-reveal style={{ '--reveal-delay': '110ms' }}>
          <span className="consequence-eyebrow">Con un agente de voz</span>
          <ul>
            <li><strong>100%</strong><span>de las llamadas contestadas, todos los días, a toda hora.</span></li>
            <li><strong>30–50%</strong><span>menos costo operativo de atención al cliente.</span></li>
          </ul>
          <cite>McKinsey &amp; Company / IBM</cite>
        </article>
      </div>
    </section>
  );
}

function CapabilitySection() {
  return (
    <section className="capability-section" id="producto">
      <div className="section-heading" data-reveal>
        <h2>No solo contesta. Mueve la llamada hacia una decisión.</h2>
        <p>Cada conversación debe terminar con claridad, no con una transcripción abandonada.</p>
      </div>
      <div className="capability-grid">
        {CAPABILITIES.map(({ title, text, Icon, className }, index) => (
          <article className={`capability-card ${className}`} key={title} data-reveal style={{ '--reveal-delay': `${index * 90}ms` }}>
            <span className="capability-icon"><Icon size={30} /></span>
            <h3>{title}</h3>
            <p>{text}</p>
            <ArrowUpRight className="capability-arrow" size={25} aria-hidden="true" />
          </article>
        ))}
      </div>
    </section>
  );
}

function AnalyticsChart() {
  const bars = [41, 58, 46, 72, 61, 84, 69, 92, 77, 100, 86, 73];
  return (
    <div className="analytics-chart" aria-label="Distribución ilustrativa de llamadas por hora">
      <div className="analytics-bars">
        {bars.map((height, index) => (
          <div className="analytics-bar-track" key={`${height}-${index}`}>
            <span className={index === 9 ? 'is-peak' : ''} style={{ '--height': `${height}%` }} />
          </div>
        ))}
      </div>
      <div className="analytics-axis"><span>8:00</span><span>12:00</span><span>16:00</span><span>19:00</span></div>
    </div>
  );
}

function ResultsSection() {
  return (
    <section className="results-section" id="resultados">
      <div className="results-copy" data-reveal>
        <h2>Ve qué llamadas terminan en cita y cuáles necesitan atención.</h2>
        <p>Revisa el motivo, el resultado y el siguiente paso de cada conversación desde un solo tablero.</p>
        <ul>
          <li><Check size={20} /> Motivo y resultado de cada llamada</li>
          <li><Check size={20} /> Pendientes ordenados por prioridad</li>
          <li><Check size={20} /> Conversión visible por horario</li>
        </ul>
      </div>
      <div className="analytics-window" data-reveal data-reveal-direction="right" aria-label="Ejemplo de tablero operativo">
        <header className="analytics-header">
          <div><BarChart3 size={23} /><strong>Tablero de ejemplo</strong></div>
          <span className="analytics-period">Últimas 12 horas</span>
        </header>
        <div className="analytics-kpis">
          <div><strong>128</strong><span>llamadas</span></div>
          <div><strong>24</strong><span>citas listas</span></div>
          <div><strong>10</strong><span>pendientes</span></div>
        </div>
        <div className="analytics-body">
          <div className="analytics-main">
            <div className="analytics-chart-heading"><strong>Conversaciones por hora</strong><span>El pico fue a las 17:00</span></div>
            <AnalyticsChart />
          </div>
          <div className="outcome-card">
            <div className="donut" aria-label="57 por ciento terminó con una cita"><strong>57%</strong></div>
            <p>terminó con una cita lista para confirmar</p>
          </div>
        </div>
        <div className="attention-row">
          <span className="attention-icon"><Headphones size={22} /></span>
          <div><strong>3 llamadas necesitan revisión</strong><p>Urgencia, cambio de cita y pregunta sobre servicio</p></div>
          <ArrowRight size={22} />
        </div>
      </div>
    </section>
  );
}

function ValueCalculator({ onPilot }) {
  const [missedCalls, setMissedCalls] = useState(18);
  const [intentRate, setIntentRate] = useState(35);
  const [firstVisitValue, setFirstVisitValue] = useState(900);
  const monthlyCalls = Math.round(missedCalls * 4.33);
  const opportunities = Math.round(monthlyCalls * (intentRate / 100));
  const monthlyValue = opportunities * firstVisitValue;

  return (
    <section className="value-section" aria-labelledby="value-title">
      <div className="value-heading" data-reveal>
        <h2 id="value-title">Ponle números al hueco.</h2>
        <p>Usa tus propios datos para dimensionar el valor que hoy pasa por llamadas sin respuesta. Es un escenario, no una garantía.</p>
      </div>
      <div className="value-calculator" data-reveal style={{ '--reveal-delay': '120ms' }}>
        <div className="calculator-controls">
          <label>
            <span>Llamadas sin respuesta por semana</span>
            <output>{missedCalls}</output>
            <input type="range" min="1" max="80" step="1" value={missedCalls} onChange={(event) => setMissedCalls(Number(event.target.value))} />
          </label>
          <label>
            <span>Con intención de pedir cita</span>
            <output>{intentRate}%</output>
            <input type="range" min="5" max="80" step="5" value={intentRate} onChange={(event) => setIntentRate(Number(event.target.value))} />
          </label>
          <label>
            <span>Valor promedio por cliente</span>
            <output>{formatMoney(firstVisitValue)}</output>
            <input type="range" min="300" max="3000" step="100" value={firstVisitValue} onChange={(event) => setFirstVisitValue(Number(event.target.value))} />
          </label>
        </div>
        <div className="calculator-result" aria-live="polite">
          <span>Valor potencial al mes</span>
          <strong className="animated-value">{formatMoney(monthlyValue)}</strong>
          <p>{opportunities} oportunidades de cita pasan por ese hueco cada mes.</p>
          <button type="button" className="button button-ink" onClick={onPilot}>Solicitar demo <ArrowRight size={21} /></button>
        </div>
      </div>
    </section>
  );
}

function VoiceWave() {
  return (
    <div className="voice-wave" aria-hidden="true">
      {[28, 52, 76, 40, 94, 66, 34, 82, 58, 100, 71, 44, 87, 62, 31, 74, 49, 91, 55, 37].map((height, index) => (
        <i key={`${height}-${index}`} style={{ '--wave-height': `${height}%`, '--delay': `${index * -70}ms` }} />
      ))}
    </div>
  );
}

function VoiceSection({ onDemo }) {
  return (
    <section className="voice-section">
      <div className="voice-copy" data-reveal>
        <h2>No te pedimos que imagines la voz. Escúchala.</h2>
        <p>Entra como cliente, cambia el tema o haz una pregunta difícil. La mejor demo es una conversación que no sigue el guion perfecto.</p>
        <button type="button" className="button button-ink" onClick={onDemo}>
          <Mic size={21} /> Probar la voz
        </button>
      </div>
      <div className="voice-console" aria-label="Vista de una conversación de prueba">
        <div className="voice-console-head"><span><i /> Llamada en curso</span><strong>00:42</strong></div>
        <VoiceWave />
        <div className="voice-console-result">
          <div><ShieldCheck size={25} /><span><strong>Límite aplicado</strong><p>No ofrecer diagnóstico</p></span></div>
          <div><UserRound size={25} /><span><strong>Siguiente paso</strong><p>Escalar con contexto</p></span></div>
        </div>
      </div>
    </section>
  );
}

function TechStackSection() {
  return (
    <section className="tech-section" id="tecnologia">
      <div className="section-heading" data-reveal>
        <h2>Lo que pasa mientras tu cliente habla.</h2>
        <p>Entre su pregunta y la respuesta hay cuatro capas trabajando. Tardan alrededor de un segundo.</p>
      </div>
      <div className="tech-chain" data-reveal>
        <span className="chain-marker chain-marker-in"><PhoneCall size={17} /> Entra la llamada</span>
        <div className="chain-nodes">
          {TECH_STACK.map(({ name, role, src, tone }, index) => (
            <article className={`chain-node node-${tone}`} key={name} style={{ '--i': index }}>
              <span className="node-chip"><img src={src} alt={name} loading="lazy" /></span>
              <strong>{name}</strong>
              <span className="node-role">{role}</span>
            </article>
          ))}
        </div>
        <span className="chain-marker chain-marker-out"><Volume2 size={17} /> Contesta en segundos</span>
      </div>
    </section>
  );
}

function PilotSection({ onPilot }) {
  return (
    <section className="pilot-section" id="piloto">
      <div className="section-heading pilot-heading" data-reveal>
        <h2>Empieza con un piloto, no con una promesa.</h2>
        <p>Un alcance pequeño permite probar la experiencia y medir si realmente ayuda a recepción.</p>
      </div>
      <div className="pilot-grid">
        {PILOT_STEPS.map(({ title, text, Icon }, index) => (
          <article key={title} data-reveal style={{ '--reveal-delay': `${index * 100}ms` }}>
            <span className="pilot-number">{index + 1}</span>
            <Icon size={30} />
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <button type="button" className="button button-blue" data-reveal onClick={onPilot}>Solicitar demo <ArrowRight size={21} /></button>
    </section>
  );
}

function FitCheckSection() {
  return (
    <section className="fit-section" id="es-para-mi">
      <div className="section-heading" data-reveal>
        <h2>¿Un agente de voz es lo que necesita tu negocio?</h2>
        <p>Preferimos decírtelo con honestidad antes de que inviertas tiempo. No todos los negocios son un buen candidato — todavía.</p>
      </div>
      <div className="fit-grid" data-reveal data-reveal-direction="right" style={{ '--reveal-delay': '120ms' }}>
        <div className="fit-column fit-yes">
          <h3><Check size={22} /> Te puede ayudar si...</h3>
          <ul>
            {FIT_YES.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="fit-column fit-no">
          <h3><X size={22} /> Probablemente no es para ti (todavía) si...</h3>
          <ul>
            {FIT_NO.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
      <a
        className="button button-coral fit-cta"
        href={CALENDLY_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('calendly_cta_click', { source: 'fit_check' })}
      >
        Agenda tu consultoría gratis <ArrowUpRight size={20} />
      </a>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="faq-section" id="preguntas">
      <div className="faq-heading"><h2>Lo importante antes de conectar una línea.</h2></div>
      <div className="faq-list" data-reveal data-reveal-direction="right">
        {FAQS.map((item) => (
          <details key={item.question}>
            <summary>{item.question}<ChevronDown size={23} aria-hidden="true" /></summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function LeadForm() {
  const [form, setForm] = useState({ name: '', clinic: '', whatsapp: '', volume: 'Menos de 50', coverage: 'Desborde durante el día', consent: false });
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const digits = form.whatsapp.replace(/\D/g, '');
    if (form.name.trim().length < 2 || form.clinic.trim().length < 2 || digits.length < 10 || digits.length > 15 || !form.consent) {
      track('lead_form_validation_error');
      setStatus('error');
      setMessage('Revisa tu nombre, negocio, WhatsApp y autorización de contacto.');
      return;
    }

    setStatus('sending');
    setMessage('');
    track('lead_form_submit', { coverage: form.coverage });
    try {
      const response = await fetch('/api/demo/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          website,
          name: form.name.trim(),
          clinic: form.clinic.trim(),
          whatsapp: digits,
          whatsappConsent: true,
          source: 'landing_coverage_review',
          note: `${form.coverage}. Volumen semanal: ${form.volume}.`,
          transcript: [],
        }),
      });
      if (!response.ok) throw new Error('request_failed');
      setStatus('success');
      setMessage('Listo. Te contactaremos por WhatsApp para revisar la cobertura de tu negocio.');
      track('lead_form_success', { coverage: form.coverage });
    } catch {
      setStatus('error');
      setMessage('No pudimos enviar la solicitud. Intenta de nuevo o escribe a contact@autivexai.com.');
      track('lead_form_delivery_error');
    }
  };

  if (status === 'success') {
    return (
      <div className="lead-success" role="status">
        <span><Check size={30} /></span>
        <h3>Tu solicitud está lista.</h3>
        <p>{message}</p>
        <button type="button" onClick={() => { setStatus('idle'); setMessage(''); }}>Enviar otra solicitud <ArrowRight size={19} /></button>
      </div>
    );
  }

  return (
    <form className="lead-form" onSubmit={submit} noValidate>
      <label className="lead-honeypot" aria-hidden="true">
        Sitio web
        <input
          type="text"
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </label>
      <div className="form-row">
        <label>Tu nombre<input type="text" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Nombre y apellido" required /></label>
        <label>Negocio<input type="text" autoComplete="organization" value={form.clinic} onChange={(event) => update('clinic', event.target.value)} placeholder="Nombre de tu negocio" required /></label>
      </div>
      <div className="form-row">
        <label>WhatsApp<input type="tel" inputMode="tel" autoComplete="tel" value={form.whatsapp} onChange={(event) => update('whatsapp', event.target.value)} placeholder="+52 55 0000 0000" required /></label>
        <label>Llamadas por semana
          <select value={form.volume} onChange={(event) => update('volume', event.target.value)}>
            <option>Menos de 50</option>
            <option>Entre 50 y 150</option>
            <option>Entre 150 y 500</option>
            <option>Más de 500</option>
          </select>
        </label>
      </div>
      <label>¿Dónde necesitas cobertura?
        <select value={form.coverage} onChange={(event) => update('coverage', event.target.value)}>
          <option>Desborde durante el día</option>
          <option>Fuera de horario</option>
          <option>Ambos</option>
          <option>Todavía no lo sé</option>
        </select>
      </label>
      <label className="consent-row">
        <input type="checkbox" checked={form.consent} onChange={(event) => update('consent', event.target.checked)} />
        <span>Acepto que AutiveX me contacte por WhatsApp sobre esta demo.</span>
      </label>
      {message && <p className="form-message" role="alert">{message}</p>}
      <button className="button button-coral form-submit" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando…' : 'Solicitar demo'} <ArrowRight size={21} />
      </button>
    </form>
  );
}

function ContactSection({ onDemo }) {
  return (
    <section className="contact-section" id="evaluacion">
      <div className="contact-copy" data-reveal>
        <h2>Veamos dónde se están perdiendo las llamadas.</h2>
        <p>Cuéntanos cómo funciona hoy tu recepción. Te proponemos un primer alcance para probar AutiveX sin cambiar toda la operación.</p>
        <ul>
          <li><Check size={20} /> Un especialista revisa tu cobertura y sistemas.</li>
          <li><Check size={20} /> Recibes un alcance de piloto y un siguiente paso.</li>
        </ul>
        <button type="button" className="contact-demo" onClick={onDemo}><Headphones size={21} /> Probar la voz</button>
      </div>
      <div data-reveal data-reveal-direction="right"><LeadForm /></div>
    </section>
  );
}

function VoiceBars({ active }) {
  return <div className={`voice-bars ${active ? 'is-active' : ''}`} aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((bar) => <i key={bar} style={{ '--bar': bar }} />)}</div>;
}

function DemoDialog({ open, onClose, onPilot }) {
  const presence = usePresence(open);
  const clientRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const triggerRef = useRef(null);
  const [phase, setPhase] = useState('select');
  const [scenario, setScenario] = useState(null);
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState('');

  const endCall = async () => {
    try { await clientRef.current?.stopCall?.(); } catch {}
    clientRef.current = null;
    setConnected(false);
    setSpeaking(false);
  };

  const reset = async () => {
    await endCall();
    setPhase('select');
    setScenario(null);
    setTranscript([]);
    setMuted(false);
    setError('');
  };

  const close = async () => {
    await endCall();
    onClose();
  };

  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setPhase('select');
    setScenario(null);
    setTranscript([]);
    setError('');
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      clientRef.current?.stopCall?.().catch(() => {});
      clientRef.current = null;
      triggerRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (open) dialogRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [open, phase]);

  const startLive = async (selected) => {
    track('voice_demo_case_started', { scenario: selected.key });
    setScenario(selected);
    setPhase('connecting');
    setTranscript([]);
    setMuted(false);
    setError('');
    try {
      const response = await fetch('/api/retell/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'main', scenario: selected }),
      });
      if (!response.ok) throw new Error('token_failed');
      const { accessToken } = await response.json();
      const client = new RetellWebClient();
      clientRef.current = client;
      client.on('call_started', () => { setConnected(true); setPhase('live'); track('voice_demo_connected', { scenario: selected.key }); });
      client.on('agent_start_talking', () => setSpeaking(true));
      client.on('agent_stop_talking', () => setSpeaking(false));
      client.on('update', (update) => { if (update.transcript?.length) setTranscript([...update.transcript]); });
      client.on('call_ended', () => { setSpeaking(false); setConnected(false); setPhase('ended'); track('voice_demo_ended', { scenario: selected.key }); });
      client.on('error', () => {
        setSpeaking(false);
        setConnected(false);
        setError('La llamada se interrumpió. Puedes intentarlo otra vez o revisar el ejemplo escrito.');
        setPhase('error');
        track('voice_demo_error', { scenario: selected.key });
      });
      await client.startCall({ accessToken });
    } catch {
      setError('No pudimos abrir el micrófono o conectar la llamada. Puedes intentarlo otra vez o revisar el ejemplo escrito.');
      setPhase('error');
      track('voice_demo_error', { scenario: selected.key });
    }
  };

  const toggleMute = () => {
    if (!clientRef.current) return;
    if (muted) clientRef.current.unmute();
    else clientRef.current.mute();
    setMuted((value) => !value);
  };

  const showSample = () => {
    setScenario(DEMO_CASES[0]);
    setPhase('sample');
    setError('');
    track('written_demo_opened');
  };

  if (!presence.mounted) return null;

  return (
    <div className={`dialog-backdrop ${presence.state}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialogRef} className="demo-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-title">
        <header className="dialog-header">
          <Brand />
          <button ref={closeRef} type="button" onClick={close} aria-label="Cerrar demostración"><X size={24} /></button>
        </header>

        {phase === 'select' && (
          <div className="demo-select">
            <div className="demo-select-heading">
              <h2 id="demo-title">Habla como lo haría un cliente.</h2>
              <p>Elige un caso y prueba la conversación. La llamada usa tu micrófono, así que utiliza información ficticia.</p>
            </div>
            <div className="case-grid">
              {DEMO_CASES.map((item) => (
                <button type="button" key={item.key} aria-label={`Probar caso: ${item.label}`} onClick={() => startLive(item)}>
                  <span><PhoneCall size={24} /></span><strong>{item.label}</strong><p>{item.description}</p><ArrowUpRight size={22} />
                </button>
              ))}
            </div>
            <button type="button" className="sample-link" onClick={showSample}>Ver un ejemplo sin usar micrófono <ArrowRight size={19} /></button>
          </div>
        )}

        {['connecting', 'live'].includes(phase) && (
          <div className="demo-live">
            <div className="voice-stage">
              <VoiceBars active={phase === 'connecting' || speaking} />
              <strong>{phase === 'connecting' ? 'Conectando la llamada…' : speaking ? 'AutiveX está hablando' : 'AutiveX está escuchando'}</strong>
              <span>{scenario?.label}</span>
            </div>
            <div className="live-transcript" aria-live="polite">
              {transcript.length === 0 ? <p className="transcript-empty">La conversación aparecerá aquí.</p> : transcript.slice(-4).map((line, index) => (
                <p key={`${line.role}-${index}`} className={line.role === 'agent' ? 'agent' : 'user'}><strong>{line.role === 'agent' ? 'AutiveX' : 'Tú'}</strong>{line.content}</p>
              ))}
            </div>
            <div className="demo-controls">
              <button type="button" onClick={toggleMute} disabled={!connected}><Mic size={20} />{muted ? 'Activar micrófono' : 'Silenciar'}</button>
              <button type="button" className="end-call" onClick={async () => { await endCall(); setPhase('ended'); }}><Phone size={20} /> Terminar</button>
            </div>
          </div>
        )}

        {phase === 'sample' && (
          <div className="sample-demo">
            <h2 id="demo-title">Una respuesta útil también sabe dónde detenerse.</h2>
            <div className="sample-lines">
              <p className="user"><strong>Cliente</strong>“Necesito ayuda urgente, ¿pueden atenderme hoy mismo?”</p>
              <p className="agent"><strong>AutiveX</strong>“Entiendo la urgencia. No puedo confirmarle disponibilidad ahora mismo, pero sí dejar su caso listo para que el equipo lo revise de inmediato. ¿Me comparte su nombre y teléfono?”</p>
              <p className="user"><strong>Cliente</strong>“Sí, claro.”</p>
              <p className="agent"><strong>AutiveX</strong>“Gracias. Voy a registrar ese dato para que el equipo continúe con usted.”</p>
            </div>
            <div className="sample-outcome"><ShieldCheck size={24} /><span><strong>Resultado</strong><p>Sin promesas inventadas, contexto capturado y escalamiento.</p></span></div>
            <div className="dialog-actions"><button type="button" className="button button-blue" onClick={() => startLive(DEMO_CASES[0])}><Mic size={20} /> Probar la voz</button><button type="button" className="dialog-link" onClick={() => { close(); onPilot(); }}>Solicitar demo</button></div>
          </div>
        )}

        {phase === 'ended' && (
          <div className="demo-end">
            <span className="end-check"><Check size={30} /></span>
            <h2 id="demo-title">La voz es solo la primera prueba.</h2>
            <p>En un piloto también revisas el motivo, el resultado y el siguiente paso de cada conversación.</p>
            <div className="dialog-actions"><button type="button" className="button button-blue" onClick={() => { close(); onPilot(); }}>Solicitar demo <ArrowRight size={20} /></button><button type="button" className="dialog-link" onClick={reset}>Probar otra llamada</button></div>
          </div>
        )}

        {phase === 'error' && (
          <div className="demo-end demo-error">
            <span className="end-check"><X size={30} /></span>
            <h2 id="demo-title">No pudimos conectar la llamada.</h2>
            <p>{error}</p>
            <div className="dialog-actions"><button type="button" className="button button-blue" onClick={() => scenario ? startLive(scenario) : reset()}>Intentar de nuevo</button><button type="button" className="dialog-link" onClick={showSample}>Ver ejemplo escrito</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function PrivacyDialog({ open, onClose }) {
  const presence = usePresence(open);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!presence.mounted) return null;

  return (
    <div className={`dialog-backdrop ${presence.state}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar"><X size={24} /></button>
        <h2 id="privacy-title">Prueba siempre con un caso ficticio.</h2>
        <p>La demostración solicita acceso al micrófono y procesa la conversación mediante Retell. No compartas nombres, teléfonos ni información real de tus clientes.</p>
        <p>Antes de una implementación productiva se definen consentimiento, acceso, retención y eliminación con cada negocio.</p>
        <a href="mailto:contact@autivexai.com">contact@autivexai.com <ArrowUpRight size={19} /></a>
      </section>
    </div>
  );
}

function Footer({ onPrivacy, onDemo }) {
  return (
    <footer className="site-footer">
      <Brand dark />
      <div className="footer-links"><button type="button" onClick={onDemo}>Probar la voz</button><button type="button" onClick={onPrivacy}>Privacidad</button><a href="mailto:contact@autivexai.com">Contacto</a></div>
      <span>AutiveX · México · {new Date().getFullYear()}</span>
    </footer>
  );
}

function FloatingVoiceCTA({ onDemo }) {
  const [pastHero, setPastHero] = useState(false);
  const [atContact, setAtContact] = useState(false);

  useEffect(() => {
    const observers = [];
    const hero = document.getElementById('inicio');
    const contact = document.getElementById('evaluacion');
    if (hero) {
      const heroObserver = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting), { rootMargin: '-40% 0px 0px 0px' });
      heroObserver.observe(hero);
      observers.push(heroObserver);
    }
    if (contact) {
      const contactObserver = new IntersectionObserver(([entry]) => setAtContact(entry.isIntersecting), { threshold: 0.15 });
      contactObserver.observe(contact);
      observers.push(contactObserver);
    }
    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  const visible = pastHero && !atContact;

  return (
    <button
      type="button"
      className={`floating-voice-cta ${visible ? 'is-visible' : ''}`}
      onClick={onDemo}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
    >
      <span className="floating-voice-pulse" aria-hidden="true" />
      <Volume2 size={20} />
      <span className="floating-voice-label">Probar la voz</span>
    </button>
  );
}

function App() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const openDemo = (source) => {
    track('voice_demo_opened', { source });
    setDemoOpen(true);
  };

  const goToForm = (source = 'unknown') => {
    track('coverage_evaluation_opened', { source });
    setDemoOpen(false);
    window.setTimeout(() => document.getElementById('evaluacion')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 50);
  };

  return (
    <div className="site-shell">
      <MotionRuntime />
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <Navigation onDemo={() => openDemo('navigation')} onPilot={() => goToForm('navigation')} />
      <main id="main-content">
        <Hero onDemo={() => openDemo('hero')} onPilot={() => goToForm('hero')} />
        <ProblemSection />
        <CapabilitySection />
        <ResultsSection />
        <ValueCalculator onPilot={() => goToForm('calculator')} />
        <VoiceSection onDemo={() => openDemo('voice_section')} />
        <TechStackSection />
        <PilotSection onPilot={() => goToForm('pilot')} />
        <FitCheckSection />
        <FaqSection />
        <ContactSection onDemo={() => openDemo('contact')} />
      </main>
      <Footer onPrivacy={() => setPrivacyOpen(true)} onDemo={() => openDemo('footer')} />
      <FloatingVoiceCTA onDemo={() => openDemo('floating_cta')} />
      <DemoDialog open={demoOpen} onClose={() => setDemoOpen(false)} onPilot={() => goToForm('demo_end')} />
      <PrivacyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
