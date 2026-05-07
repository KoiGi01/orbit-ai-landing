/* AutiveX AI — landing redesign
   Sections: Nav · Hero · Niche strip · How it works · Proof · CTA · Footer
*/

const { useState, useEffect, useRef } = React;

function Typewriter({ words, typingSpeed = 75, deletingSpeed = 40, holdMs = 1600 }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('typing'); // typing · holding · deleting

  useEffect(() => {
    const word = words[idx % words.length];
    let timer;
    if (phase === 'typing') {
      if (text.length < word.length) {
        timer = setTimeout(() => setText(word.slice(0, text.length + 1)), typingSpeed);
      } else {
        timer = setTimeout(() => setPhase('deleting'), holdMs);
      }
    } else if (phase === 'deleting') {
      if (text.length > 0) {
        timer = setTimeout(() => setText(word.slice(0, text.length - 1)), deletingSpeed);
      } else {
        setIdx((i) => (i + 1) % words.length);
        setPhase('typing');
      }
    }
    return () => clearTimeout(timer);
  }, [text, phase, idx, words, typingSpeed, deletingSpeed, holdMs]);

  return (
    <span className="typewriter">
      <span className="typewriter-text">{text}</span>
      <span className="typewriter-caret" aria-hidden="true" />
    </span>
  );
}

const HEADLINE_VARIANTS = {
  nicho:   { lead: 'La recepcionista IA para', accent: '__TYPEWRITER__', tail: '' },
  tension: { lead: 'Cuando suena el teléfono,', accent: 'ya está contestado.', tail: '' },
  perdida: { lead: 'Nunca pierdas otra llamada.', accent: 'Ni una cita. Ni un cliente.', tail: '' },
};

const TYPEWRITER_WORDS = [
  'consultorios.',
  'inmobiliarias.',
  'despachos legales.',
  'servicio al cliente.',
  'agencias.',
  'clínicas dentales.',
];

const NICHES = [
  {
    id: 'consultorios',
    label: 'Consultorios',
    title: 'Cada llamada perdida es un paciente que se fue al de junto.',
    bullets: [
      'Agenda citas y confirma horarios sin saturar a tu recepcionista.',
      'Responde dudas frecuentes con tu protocolo, no improvisa.',
      'Recordatorios por WhatsApp para reducir ausencias.',
    ],
    metric: { value: '38%', label: 'menos ausencias con recordatorios' },
  },
  {
    id: 'inmobiliarias',
    label: 'Inmobiliarias',
    title: 'Califica al prospecto antes de que tu asesor llegue al volante.',
    bullets: [
      'Filtra por zona, presupuesto y tipo de propiedad en segundos.',
      'Agenda visitas con disponibilidad real del asesor.',
      'Reactiva leads fríos por WhatsApp con criterio comercial.',
    ],
    metric: { value: '3×', label: 'leads calificados por semana' },
  },
  {
    id: 'despachos',
    label: 'Despachos legales',
    title: 'Primer filtro profesional, sin que el socio conteste el primer timbre.',
    bullets: [
      'Identifica tipo de caso y urgencia antes de transferir.',
      'Toma datos de contacto y deja resumen para el equipo.',
      'Escala a humano cuando detecta un caso sensible.',
    ],
    metric: { value: '24/7', label: 'cobertura sin contratar planta' },
  },
  {
    id: 'soporte',
    label: 'Servicio al cliente',
    title: 'Atiende dudas y seguimientos sin colas ni música de espera.',
    bullets: [
      'Resuelve preguntas frecuentes con tu base de conocimiento.',
      'Toma datos para casos que sí requieren un humano.',
      'Cierra el ciclo con seguimiento por WhatsApp automático.',
    ],
    metric: { value: '< 2s', label: 'tiempo medio de respuesta' },
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Atiende',
    text: 'Contesta al primer tono con una voz entrenada en tu negocio: tono, servicios, horarios y políticas.',
  },
  {
    n: '02',
    title: 'Califica y agenda',
    text: 'Detecta intención, propone horarios y deja la cita lista para que tu equipo solo cierre.',
  },
  {
    n: '03',
    title: 'Da seguimiento',
    text: 'Manda confirmación, recordatorio y resumen por WhatsApp. Cero oportunidades enfriándose.',
  },
];

function Nav({ onDemo }) {
  return (
    <nav className="nav">
      <a className="brand" href="#">
        <img src="/brand-logo.png" alt="Autivex AI" className="brand-logo-img" />
      </a>
      <div className="nav-links">
        <a href="#nicho">Nichos</a>
        <a href="#sistema">Sistema</a>
        <a href="#contacto">Contacto</a>
      </div>
      <button className="nav-cta" onClick={onDemo}>
        <span className="dot" /> Probar demo
      </button>
    </nav>
  );
}

function Hero({ headline, onDemo, density, ring, halo }) {
  const audioLevelRef = useRef(0);
  const v = HEADLINE_VARIANTS[headline] || HEADLINE_VARIANTS.nicho;

  return (
    <section className="hero">
      <div className="hero-grid-bg" aria-hidden="true" />
      <div className="hero-vignette" aria-hidden="true" />

      <div className="hero-copy">

        <h1 className="hero-headline">
          <span className="hl-lead">{v.lead}</span>{' '}
          {v.accent === '__TYPEWRITER__'
            ? <span className="hl-accent"><Typewriter words={TYPEWRITER_WORDS} /></span>
            : <span className="hl-accent">{v.accent}</span>}
        </h1>

        <p className="hero-sub">
          AutiveX AI contesta, califica y agenda. Tu equipo recibe la cita confirmada,
          no la lista de pendientes.
        </p>

        <div className="hero-actions">
          <button className="btn-primary" onClick={onDemo}>
            <span>Probar la demo en vivo</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <a className="btn-secondary" href="#sistema">
            Cómo funciona
          </a>
        </div>

        <div className="hero-meta">
          <div><strong>0.4s</strong><span>latencia de voz</span></div>
          <div className="meta-sep" />
          <div><strong>ES · MX</strong><span>acento natural</span></div>
          <div className="meta-sep" />
          <div><strong>WhatsApp</strong><span>seguimiento</span></div>
        </div>
      </div>

      <div className="hero-orb-stage">
        <Orb density={density} ring={ring} halo={halo} mode="idle" audioLevelRef={audioLevelRef} size={520} />
      </div>
    </section>
  );
}

function useCounter(target, { duration = 1800, start = false } = {}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf, t0;
    const tick = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

function useInView(ref, { threshold = 0.3 } = {}) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setSeen(true); });
    }, { threshold });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, ref]);
  return seen;
}

function BeforeColumn({ active }) {
  const [missed, setMissed] = useState(7);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setMissed((m) => m + 1), 2200);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div className="ba-col ba-before">
      <div className="ba-col-tag ba-tag-mute">Sin AutiveX</div>

      <div className="big-phone">
        <div className="big-phone-rings" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="big-phone-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
      </div>

      <div className="ba-bigstat ba-bigstat-bad">
        <strong>{String(missed).padStart(2, '0')}</strong>
        <span>llamadas perdidas hoy</span>
      </div>
    </div>
  );
}

function AfterColumn({ active }) {
  const booked = useCounter(38, { start: active, duration: 1800 });
  return (
    <div className="ba-col ba-after">
      <div className="ba-col-tag ba-tag-live"><span className="ba-tag-dot" /> Con AutiveX</div>

      <div className="big-orb-wrap">
        <div className="big-orb-halo" aria-hidden="true" />
        <div className="big-orb-core" aria-hidden="true" />
        <div className="big-orb-wave w1" aria-hidden="true" />
        <div className="big-orb-wave w2" aria-hidden="true" />
        <div className="big-orb-wave w3" aria-hidden="true" />
      </div>

      <div className="ba-bigstat ba-bigstat-good">
        <strong>{String(booked).padStart(2, '0')}</strong>
        <span>citas agendadas hoy</span>
      </div>
    </div>
  );
}

const NICHE_CHIPS = ['Consultorios', 'Inmobiliarias', 'Despachos legales', 'Servicio al cliente', 'Agencias', 'Clínicas dentales'];

function NicheStrip() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.25 });

  return (
    <section className="niche" id="nicho" ref={ref}>
      <header className="section-head">
        <h2>Lo que cambia <em>cuando AutiveX contesta.</em></h2>
      </header>

      <div className="ba-grid">
        <BeforeColumn active={seen} />
        <AfterColumn active={seen} />
      </div>

      <div className="niche-chips" aria-label="Funciona para">
        <span className="niche-chips-label">Funciona para</span>
        <div className="chips">
          {NICHE_CHIPS.map((c) => <span key={c} className="chip">{c}</span>)}
        </div>
      </div>
    </section>
  );
}

const SYSTEM_STEPS = [
  {
    n: '01',
    icon: 'phone',
    title: 'Contesta',
    desc: 'Toma la llamada al momento y saluda con el tono de tu negocio.',
  },
  {
    n: '02',
    icon: 'brain',
    title: 'Entiende',
    desc: 'Identifica qué necesita la persona y hace las preguntas importantes.',
    primary: true,
  },
  {
    n: '03',
    icon: 'calendar',
    title: 'Agenda',
    desc: 'Convierte el interés en una cita, visita o siguiente paso claro.',
  },
  {
    n: '04',
    icon: 'whatsapp',
    title: 'Da seguimiento',
    desc: 'Envía confirmación y recordatorios para que la oportunidad no se enfríe.',
  },
];

const SYSTEM_BENEFITS = [
  { icon: 'speaker', label: 'Voz natural' },
  { icon: 'handoff', label: 'Escala a tu equipo' },
  { icon: 'fork', label: 'Sigue tus reglas' },
];

function NodeIcon({ name }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'phone':
      return <svg viewBox="0 0 24 24" {...stroke}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'wave':
      return <svg viewBox="0 0 24 24" {...stroke}><path d="M3 12h2M7 8v8M11 4v16M15 8v8M19 10v4M21 12h0"/></svg>;
    case 'brain':
      return <svg viewBox="0 0 24 24" {...stroke}><path d="M9 4a3 3 0 0 0-3 3v0a3 3 0 0 0-2 5v0a3 3 0 0 0 2 5v0a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v0a3 3 0 0 0 2-5v0a3 3 0 0 0-2-5v0a3 3 0 0 0-3-3z M12 4v16 M9 9h0 M15 14h0"/></svg>;
    case 'speaker':
      return <svg viewBox="0 0 24 24" {...stroke}><path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>;
    case 'fork':
      return <svg viewBox="0 0 24 24" {...stroke}><path d="M6 3v6M6 9a6 6 0 0 0 6 6h6M18 12l3 3-3 3M6 9a6 6 0 0 1 6-6"/></svg>;
    case 'calendar':
      return <svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4M9 14l2 2 4-4"/></svg>;
    case 'handoff':
      return <svg viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 2-4 4-4s3 1 3 3"/></svg>;
    case 'whatsapp':
      return <svg viewBox="0 0 24 24" {...stroke}><path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1.1 3.6A9 9 0 0 1 21 12z M8 11c.5 2 2 3.5 4 4l2-1 2 1.5-1 1.5a8 8 0 0 1-7-7l1.5-1L11 12z"/></svg>;
    default: return null;
  }
}

function SystemFlow() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.2 });

  return (
    <section className="how" id="sistema" ref={ref}>
      <header className="section-head">
        <h2>Cómo trabaja <em>por ti.</em></h2>
        <p className="section-lede">
          Una recepcionista IA que responde, entiende el caso y mueve cada
          conversación hacia una acción concreta.
        </p>
      </header>

      <div className={`system-simple ${seen ? 'is-on' : ''}`}>
        <div className="system-glow" aria-hidden="true" />
        <div className="system-steps">
          {SYSTEM_STEPS.map((step, i) => (
          <div
            key={step.title}
            className={`system-step ${step.primary ? 'is-primary' : ''}`}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="system-step-num">{step.n}</span>
            <div className="system-step-icon" aria-hidden="true">
              <NodeIcon name={step.icon} />
            </div>
            <h3>{step.title}</h3>
            <p>{step.desc}</p>
          </div>
          ))}
        </div>

        <div className="system-support">
          <div className="support-copy">
            <span>Cuando hace falta</span>
            <strong>pasa el contexto a una persona.</strong>
            <p>Tu equipo recibe el resumen y entra con la información lista, sin empezar desde cero.</p>
          </div>
          <div className="support-icon-row" aria-hidden="true">
            <span><NodeIcon name="handoff" /></span>
            <span><NodeIcon name="phone" /></span>
            <span><NodeIcon name="whatsapp" /></span>
          </div>
        </div>
      </div>

      <div className="system-benefits">
        {SYSTEM_BENEFITS.map((item) => (
          <div className="system-benefit" key={item.label}>
            <span aria-hidden="true"><NodeIcon name={item.icon} /></span>
            <strong>{item.label}</strong>
          </div>
        ))}
        <div className="system-benefit">
          <span aria-hidden="true"><NodeIcon name="calendar" /></span>
          <strong>Citas confirmadas</strong>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() { return <SystemFlow />; }

function Proof() {
  return (
    <section className="proof">
      <p className="proof-statement">
        Cada llamada perdida<br />
        es una venta que <em>alguien más cerró.</em>
      </p>
      <p className="proof-body">
        AutiveX AI responde cuando tu equipo está ocupado, filtra la intención
        real y convierte cada conversación en una cita o seguimiento concreto.
      </p>
    </section>
  );
}

function FinalCta({ onDemo }) {
  return (
    <section className="cta-final" id="contacto">
      <h2>
        Escucha cómo sonaría<br />
        tu <em>recepcionista IA.</em>
      </h2>
      <p>Una llamada de prueba — tu negocio, tus preguntas, tu flujo.</p>
      <button className="btn-primary btn-primary-lg" onClick={onDemo}>
        <span>Probar la demo en vivo</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <p className="cta-fineprint">Sin tarjeta. Sin instalación. 90 segundos.</p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <img src="/brand-logo.png" alt="Autivex AI" className="brand-logo-img brand-logo-img-sm" />
        <span>Voz IA para negocios en español</span>
      </div>
      <div className="footer-meta">
        <span>México · 2026</span>
        <a href="#">Privacidad</a>
        <a href="#">Contacto</a>
      </div>
    </footer>
  );
}

const SCENARIOS = [
  {
    key: 'clinic',
    label: 'Clínica / Consultorio',
    business_role: 'recepcionista de una clínica médica',
    customer_context: 'El usuario llama como paciente que quiere agendar una cita o tiene una consulta médica.',
    first_line: 'Con mucho gusto. ¿Para qué servicio necesita agendar su cita?',
  },
  {
    key: 'agency',
    label: 'Agencia de servicios',
    business_role: 'agente de ventas de una agencia de servicios',
    customer_context: 'El usuario llama como prospecto interesado en cotizar o contratar un servicio.',
    first_line: 'Con gusto. ¿Qué tipo de servicio le interesa cotizar?',
  },
  {
    key: 'law',
    label: 'Despacho de abogados',
    business_role: 'recepcionista de un despacho de abogados',
    customer_context: 'El usuario llama como cliente con una consulta legal o proceso jurídico.',
    first_line: 'Con gusto. ¿Cuál es el asunto legal que desea consultar?',
  },
  {
    key: 'restaurant',
    label: 'Restaurante / Eventos',
    business_role: 'anfitrión de un restaurante o espacio de eventos',
    customer_context: 'El usuario llama para hacer una reservación o preguntar sobre el menú o eventos.',
    first_line: 'Con gusto. ¿Para cuántas personas y qué fecha tiene en mente?',
  },
  {
    key: 'realestate',
    label: 'Bienes raíces',
    business_role: 'asesor inmobiliario',
    customer_context: 'El usuario llama como prospecto interesado en comprar, rentar o vender una propiedad.',
    first_line: 'Con gusto. ¿Busca comprar, rentar o tiene una propiedad para vender?',
  },
];

function DemoModal({ open, onClose }) {
  const audioLevelRef = useRef(0);
  const introAudioRef = useRef(null);
  const clientRef = useRef(null);
  const rafRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | intro | scenario_select | live | ended | error
  const [callConnected, setCallConnected] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');

  const animateLevel = (active) => {
    cancelAnimationFrame(rafRef.current);
    if (active) {
      const tick = () => {
        audioLevelRef.current = 0.35 + Math.random() * 0.6;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      const fade = () => {
        audioLevelRef.current = Math.max(0, audioLevelRef.current - 0.04);
        if (audioLevelRef.current > 0) rafRef.current = requestAnimationFrame(fade);
      };
      rafRef.current = requestAnimationFrame(fade);
    }
  };

  const endCurrentCall = async () => {
    try { await clientRef.current?.stopCall(); } catch {}
    clientRef.current = null;
  };

  const startRetellCall = async ({ type, scenario } = {}) => {
    const RetellWebClient = window.RetellWebClient;
    if (!RetellWebClient) throw new Error('sdk_not_loaded');

    const res = await fetch('/api/retell/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, scenario }),
    });
    if (!res.ok) throw new Error('token_failed');
    const { accessToken } = await res.json();

    const client = new RetellWebClient();
    clientRef.current = client;
    return { client, accessToken };
  };

  const startIntro = async (cancelled) => {
    const showScenarios = () => {
      if (!cancelled.v) { animateLevel(false); setAgentSpeaking(false); setPhase('scenario_select'); }
    };

    const fallbackTimer = setTimeout(showScenarios, 30000);

    try {
      const { client, accessToken } = await startRetellCall({ type: 'intro' });
      if (cancelled.v) { clearTimeout(fallbackTimer); return; }

      client.on('call_started', () => {
        if (!cancelled.v) setCallConnected(true);
      });
      client.on('agent_start_talking', () => {
        if (!cancelled.v) { clearTimeout(fallbackTimer); setAgentSpeaking(true); animateLevel(true); }
      });
      client.on('agent_stop_talking', () => {
        clearTimeout(fallbackTimer);
        showScenarios();
      });
      client.on('call_ended', () => {
        clearTimeout(fallbackTimer);
        showScenarios();
      });
      client.on('error', () => {
        clearTimeout(fallbackTimer);
        showScenarios();
      });

      await client.startCall({ accessToken });
    } catch (err) {
      console.error('Intro failed:', err);
      clearTimeout(fallbackTimer);
      showScenarios();
    }
  };

  const startLive = async (scenario) => {
    await endCurrentCall();
    setPhase('live');
    setTranscript([]);
    setMuted(false);
    setAgentSpeaking(false);
    cancelAnimationFrame(rafRef.current);
    audioLevelRef.current = 0;

    try {
      const { client, accessToken } = await startRetellCall({ type: 'main', scenario });

      client.on('agent_start_talking', () => { setAgentSpeaking(true); animateLevel(true); });
      client.on('agent_stop_talking', () => { setAgentSpeaking(false); animateLevel(false); });
      client.on('update', (u) => { if (u.transcript?.length) setTranscript([...u.transcript]); });
      client.on('call_ended', () => { animateLevel(false); setAgentSpeaking(false); setPhase('ended'); });
      client.on('error', (err) => {
        console.error('Live call error:', err);
        animateLevel(false);
        setError('Hubo un problema con la llamada. Intenta de nuevo.');
        setPhase('error');
      });

      await client.startCall({ accessToken });
    } catch (err) {
      console.error('Live call failed:', err);
      setError('No se pudo conectar. Verifica tu micrófono e intenta de nuevo.');
      setPhase('error');
    }
  };

  useEffect(() => {
    if (!open) {
      endCurrentCall();
      cancelAnimationFrame(rafRef.current);
      audioLevelRef.current = 0;
      setPhase('idle');
      setTranscript([]);
      setAgentSpeaking(false);
      setError('');
      return;
    }

    const cancelled = { v: false };
    setPhase('intro');
    setCallConnected(false);
    audioLevelRef.current = 0;
    startIntro(cancelled);

    return () => {
      cancelled.v = true;
      cancelAnimationFrame(rafRef.current);
      audioLevelRef.current = 0;
      // Stop intro Retell call if still active
      introAudioRef.current = null;
      // Stop live Retell call if active
      clientRef.current?.stopCall?.().catch(() => {});
      clientRef.current = null;
    };
  }, [open]);

  const toggleMute = () => {
    if (!clientRef.current) return;
    if (muted) { clientRef.current.unmute(); setMuted(false); }
    else { clientRef.current.mute(); setMuted(true); }
  };

  const orbMode = phase === 'intro' || phase === 'live'
    ? (agentSpeaking ? 'speaking' : 'listening')
    : phase === 'scenario_select' ? 'listening'
    : 'idle';

  if (!open) return null;
  return (
    <div className="demo-overlay">
      <div className="demo-shell" onClick={(e) => e.stopPropagation()}>
        <button className="demo-close" onClick={async () => { await endCurrentCall(); cancelAnimationFrame(rafRef.current); audioLevelRef.current = 0; onClose(); }} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </button>

        <div className="demo-orb">
          <Orb density={500} ring={true} halo={true} mode={orbMode} audioLevelRef={audioLevelRef} size={420} />
        </div>

        {phase === 'intro' && (
          <div className="demo-status">
            <span className={`status-dot ${agentSpeaking ? 'speaking' : callConnected ? 'listening' : 'intro'}`} />
            {agentSpeaking ? 'Presentando…' : callConnected ? 'Conectado' : 'Conectando…'}
          </div>
        )}

        {phase === 'live' && (
          <div className="demo-status">
            <span className={`status-dot ${agentSpeaking ? 'speaking' : 'listening'}`} />
            {agentSpeaking ? 'Hablando' : 'Escuchando'}
          </div>
        )}

        {phase === 'scenario_select' && (
          <div className="demo-scenarios">
            <p className="demo-scenarios-label">Elige el tipo de negocio a simular:</p>
            <div className="demo-scenarios-grid">
              {SCENARIOS.map((s) => (
                <button key={s.key} className="demo-scenario-card" onClick={() => startLive(s)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'live' && transcript.length > 0 && (
          <div className="demo-transcript">
            {transcript.slice(-3).map((line, i) => (
              <p key={i} className={`demo-transcript-line demo-transcript-${line.role}`}>
                {line.content}
              </p>
            ))}
          </div>
        )}

        {phase === 'live' && (
          <div className="demo-controls">
            <button className={`demo-ctrl ${muted ? 'demo-ctrl-muted' : ''}`} onClick={toggleMute}>
              {muted ? 'Activar mic' : 'Silenciar'}
            </button>
            <button className="demo-ctrl demo-ctrl-end" onClick={async () => { await endCurrentCall(); cancelAnimationFrame(rafRef.current); audioLevelRef.current = 0; setPhase('ended'); }}>
              Colgar
            </button>
          </div>
        )}

        {phase === 'ended' && (
          <p className="demo-line">Gracias por probar Autivex AI.</p>
        )}

        {phase === 'error' && (
          <p className="demo-error">{error}</p>
        )}
      </div>
    </div>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "headline": "nicho",
  "density": 440,
  "ring": true,
  "halo": true
}/*EDITMODE-END*/;

function App() {
  const [demo, setDemo] = useState(false);
  const tweaksHook = window.useTweaks ? window.useTweaks(TWEAK_DEFAULTS) : [TWEAK_DEFAULTS, () => {}];
  const tweaks = tweaksHook[0];
  const setTweak = tweaksHook[1];

  return (
    <div className="app">
      <div className="grain" aria-hidden="true" />
      <Nav onDemo={() => setDemo(true)} />
      <Hero
        headline={tweaks.headline}
        onDemo={() => setDemo(true)}
        density={tweaks.density}
        ring={tweaks.ring}
        halo={tweaks.halo}
      />
      <NicheStrip />
      <HowItWorks />
      <Proof />
      <FinalCta onDemo={() => setDemo(true)} />
      <Footer />
      <DemoModal open={demo} onClose={() => setDemo(false)} />

      {window.TweaksPanel && (
        <window.TweaksPanel>
          <window.TweakSection title="Headline">
            <window.TweakSelect
              label="Variante"
              value={tweaks.headline}
              onChange={(v) => setTweak('headline', v)}
              options={[
                { value: 'nicho', label: 'Directo al nicho' },
                { value: 'tension', label: 'Cuando suena el teléfono…' },
                { value: 'perdida', label: 'Nunca pierdas otra llamada' },
              ]}
            />
          </window.TweakSection>
          <window.TweakSection title="Orbe">
            <window.TweakSlider
              label="Densidad de partículas"
              value={tweaks.density}
              min={200} max={700} step={20}
              onChange={(v) => setTweak('density', v)}
            />
            <window.TweakToggle
              label="Halo radial"
              value={tweaks.halo}
              onChange={(v) => setTweak('halo', v)}
            />
            <window.TweakToggle
              label="Anillo orbital"
              value={tweaks.ring}
              onChange={(v) => setTweak('ring', v)}
            />
          </window.TweakSection>
        </window.TweaksPanel>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
