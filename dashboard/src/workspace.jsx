import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RetellWebClient } from 'retell-client-js-sdk';
import { UserButton } from '@clerk/react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Headphones,
  MapPin,
  Mic,
  MicOff,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import { createWorkspaceTestCall, saveWorkspaceProfile } from './control-api';
import './workspace.css';

const SALES_URL = import.meta.env.VITE_SALES_CONTACT_URL
  || 'mailto:hola@autivexai.com?subject=Quiero%20activar%20AutiveX%20en%20mi%20clínica';

const CALL_GOALS = [
  ['new_patient', 'Agendar paciente nuevo', CalendarClock],
  ['reschedule', 'Cambiar o cancelar una cita', RotateCcw],
  ['urgent', 'Dolor o posible urgencia', CircleAlert],
  ['services', 'Preguntas sobre servicios', Stethoscope],
  ['prices', 'Precios o formas de pago', Sparkles],
  ['reception', 'Hablar con recepción', Headphones],
];

const SERVICES = [
  ['general', 'Consulta general y limpieza'],
  ['urgent', 'Urgencias'],
  ['orthodontics', 'Ortodoncia'],
  ['implants', 'Implantes'],
  ['endodontics', 'Endodoncia'],
  ['surgery', 'Extracciones o cirugía'],
  ['pediatric', 'Odontopediatría'],
  ['cosmetic', 'Estética y blanqueamiento'],
  ['other', 'Otro'],
];

const SCHEDULES = [
  ['weekdays', 'Lunes a viernes', '9:00–18:00'],
  ['weekdays_saturday', 'Lunes a sábado', '9:00–18:00'],
  ['custom', 'Personalizar horario', 'Escribir días y horas'],
  ['unknown', 'Todavía no estoy seguro', 'Lo definimos después'],
];

const OUTCOMES = [
  ['offer_demo_slots', 'Ofrecer horarios simulados', 'Recomendado para escuchar el flujo completo.'],
  ['capture_for_confirmation', 'Tomar datos para confirmar', 'El equipo revisaría la disponibilidad después.'],
  ['simulate_transfer', 'Simular transferencia', 'Lucía entregaría el contexto a recepción.'],
];

const EMPTY_PROFILE = {
  clinicName: '',
  city: '',
  callGoals: [],
  services: [],
  otherService: '',
  schedule: 'weekdays',
  customSchedule: '',
  appointmentOutcome: 'offer_demo_slots',
};

const GOAL_SCENARIOS = {
  new_patient: {
    key: 'new-patient',
    label: 'Quiero agendar mi primera cita',
    result: 'Solicitud de primera visita',
    business_role: 'recepcionista de una clínica dental',
    customer_context: 'La persona quiere agendar su primera consulta. Haz preguntas breves, toma contexto y ofrece el siguiente paso configurado para la demostración.',
  },
  reschedule: {
    key: 'reschedule',
    label: 'Necesito cambiar mi cita',
    result: 'Cambio de cita solicitado',
    business_role: 'recepcionista de una clínica dental',
    customer_context: 'La persona quiere mover una cita existente. Confirma qué necesita cambiar sin afirmar que un calendario real fue modificado.',
  },
  urgent: {
    key: 'urgent',
    label: 'Tengo dolor desde anoche',
    result: 'Posible urgencia detectada',
    business_role: 'recepcionista de una clínica dental',
    customer_context: 'La persona reporta dolor dental. Recopila contexto básico, no diagnostiques y explica que el equipo debe valorar la urgencia.',
  },
  services: {
    key: 'services',
    label: 'Quiero información de un tratamiento',
    result: 'Interés en tratamiento',
    business_role: 'recepcionista de una clínica dental',
    customer_context: 'La persona pregunta por servicios. Responde solo con el catálogo proporcionado y ofrece que el equipo confirme cualquier detalle no disponible.',
  },
  prices: {
    key: 'prices',
    label: '¿Cuánto cuesta una consulta?',
    result: 'Pregunta de precio capturada',
    business_role: 'recepcionista de una clínica dental',
    customer_context: 'La persona pregunta precios. No inventes montos; explica que el equipo confirmará costos y ofrece recopilar datos para seguimiento.',
  },
  reception: {
    key: 'reception',
    label: 'Quiero hablar con recepción',
    result: 'Transferencia solicitada',
    business_role: 'recepcionista de una clínica dental',
    customer_context: 'La persona pide hablar con recepción. Recopila el motivo y simula una transferencia con contexto, sin afirmar que llamaste a una línea real.',
  },
};

export function PortalBrand({ label = 'Preview' }) {
  return (
    <div className="portal-brand" aria-label={`AutiveX ${label}`}>
      <span><img src="/autivex-mark.png" alt="" /></span>
      <strong>AutiveX</strong>
      <b>{label}</b>
    </div>
  );
}

function StaticAvatar() {
  return <span className="portal-static-avatar" aria-label="Cuenta de muestra">CM</span>;
}

export function PortalTopbar({ label, email, children, staticAccount = false }) {
  return (
    <header className="portal-topbar">
      <PortalBrand label={label} />
      <div className="portal-account">
        {children}
        <span>{email}</span>
        {staticAccount ? <StaticAvatar /> : <UserButton appearance={{ elements: { avatarBox: 'portal-avatar' } }} />}
      </div>
    </header>
  );
}

function Choice({ selected, onClick, icon: Icon, title, detail, disabled }) {
  return (
    <button type="button" className={`portal-choice${selected ? ' selected' : ''}`} onClick={onClick} disabled={disabled}>
      {Icon && <span className="portal-choice-icon"><Icon size={19} /></span>}
      <span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
      <i>{selected && <Check size={15} />}</i>
    </button>
  );
}

function validateStep(step, profile) {
  if (step === 0) return profile.clinicName.trim().length >= 2 && profile.city.trim().length >= 2;
  if (step === 1) return profile.callGoals.length >= 1 && profile.callGoals.length <= 3;
  if (step === 2) return profile.services.length >= 1
    && (!profile.services.includes('other') || profile.otherService.trim().length >= 2);
  return Boolean(profile.schedule)
    && Boolean(profile.appointmentOutcome)
    && (profile.schedule !== 'custom' || profile.customSchedule.trim().length >= 4);
}

function QuestionContent({ step, profile, update }) {
  const toggle = (field, value, maximum = Infinity) => {
    const current = profile[field];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : current.length < maximum ? [...current, value] : current;
    update(field, next);
  };

  if (step === 0) {
    return (
      <div className="portal-question-body identity-fields">
        <label>
          <span>¿Cómo se llama tu clínica?</span>
          <div><Building2 size={19} /><input autoFocus value={profile.clinicName} onChange={(event) => update('clinicName', event.target.value)} placeholder="Ej. Clínica Dental Aurora" maxLength={80} /></div>
        </label>
        <label>
          <span>¿En qué ciudad está?</span>
          <div><MapPin size={19} /><input value={profile.city} onChange={(event) => update('city', event.target.value)} placeholder="Ej. Querétaro, Qro." maxLength={80} /></div>
        </label>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="portal-question-body choice-grid call-goal-grid">
        {CALL_GOALS.map(([value, label, Icon]) => (
          <Choice
            key={value}
            title={label}
            icon={Icon}
            selected={profile.callGoals.includes(value)}
            disabled={!profile.callGoals.includes(value) && profile.callGoals.length >= 3}
            onClick={() => toggle('callGoals', value, 3)}
          />
        ))}
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="portal-question-body">
        <div className="service-chip-grid">
          {SERVICES.map(([value, label]) => (
            <button type="button" key={value} className={profile.services.includes(value) ? 'selected' : ''} onClick={() => toggle('services', value)}>
              {profile.services.includes(value) && <Check size={14} />} {label}
            </button>
          ))}
        </div>
        {profile.services.includes('other') && (
          <label className="other-service-field">
            <span>¿Qué otro servicio?</span>
            <input autoFocus value={profile.otherService} onChange={(event) => update('otherService', event.target.value)} placeholder="Escribe el servicio" maxLength={80} />
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="portal-question-body operation-fields">
      <div>
        <span className="field-caption">¿Cuándo atienden normalmente?</span>
        <div className="schedule-grid">
          {SCHEDULES.map(([value, title, detail]) => (
            <Choice key={value} title={title} detail={detail} selected={profile.schedule === value} onClick={() => update('schedule', value)} />
          ))}
        </div>
        {profile.schedule === 'custom' && <input className="custom-schedule" autoFocus value={profile.customSchedule} onChange={(event) => update('customSchedule', event.target.value)} placeholder="Ej. Lun–Vie 8:00–14:00 y 16:00–20:00" maxLength={160} />}
      </div>
      <div>
        <span className="field-caption">Cuando alguien pide cita, Lucía debería…</span>
        <div className="outcome-grid">
          {OUTCOMES.map(([value, title, detail]) => (
            <Choice key={value} title={title} detail={detail} selected={profile.appointmentOutcome === value} onClick={() => update('appointmentOutcome', value)} />
          ))}
        </div>
      </div>
    </div>
  );
}

const QUESTION_COPY = [
  ['Primero, lo esencial.', 'Personalizaremos el saludo y la experiencia con estos dos datos.'],
  ['¿Qué llamadas quieres resolver primero?', 'Elige hasta tres. Esas serán las situaciones disponibles en tu prueba.'],
  ['¿Qué servicios ofrece tu clínica?', 'Lucía solo hablará de lo que selecciones; no inventará tratamientos.'],
  ['Define cómo debería terminar la llamada.', 'Esto todavía es una simulación: ningún calendario o teléfono real será modificado.'],
];

export function ProspectOnboarding({ workspace, user, getToken, onComplete }) {
  const storageKey = `autivex:prospect:${workspace.organization?.id || user?.id}`;
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      return { ...EMPTY_PROFILE, ...(workspace.profile || {}), ...(stored || {}) };
    } catch {
      return { ...EMPTY_PROFILE, ...(workspace.profile || {}) };
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(profile));
  }, [profile, storageKey]);

  const update = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const next = async () => {
    if (!validateStep(step, profile)) {
      setError(step === 1 ? 'Elige entre una y tres opciones.' : 'Completa esta pantalla para continuar.');
      return;
    }
    if (step < 3) {
      setStep((value) => value + 1);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = user?.preview
        ? { ...workspace, view: 'prospect_demo', profile, state: { ...workspace.state, profileComplete: true } }
        : (await saveWorkspaceProfile(getToken, profile)).workspace;
      localStorage.removeItem(storageKey);
      onComplete(updated);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const [title, description] = QUESTION_COPY[step];

  return (
    <main className="portal-shell onboarding-intake-shell">
      <PortalTopbar label="Preview" email={user?.primaryEmailAddress?.emailAddress} staticAccount={user?.preview === true}>
        <span className="portal-save-state"><Check size={14} /> Guardado en este dispositivo</span>
      </PortalTopbar>
      <div className="intake-layout">
        <aside className="intake-context">
          <p className="portal-kicker">Tu recepcionista de prueba</p>
          <h1>Primero aprende tu clínica. Luego te contesta.</h1>
          <div className="intake-preview-card">
            <div className="lucia-orb"><i /></div>
            <span>Lucía dirá</span>
            <blockquote>“{profile.clinicName ? `${profile.clinicName}, buenas tardes.` : 'Tu clínica, buenas tardes.'} ¿En qué le puedo ayudar?”</blockquote>
          </div>
          <p className="intake-promise"><Clock3 size={17} /> Estarás hablando con Lucía en menos de dos minutos.</p>
        </aside>

        <section className="intake-card">
          <header>
            <span>Paso {step + 1} de 4</span>
            <div>{[0, 1, 2, 3].map((item) => <i key={item} className={item <= step ? 'active' : ''} />)}</div>
          </header>
          <div className="intake-heading">
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <QuestionContent step={step} profile={profile} update={update} />
          {error && <p className="portal-form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
          <footer>
            <button type="button" className="intake-back" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || saving}><ArrowLeft size={17} /> Atrás</button>
            <button type="button" className="intake-next" onClick={next} disabled={saving}>{saving ? 'Preparando…' : step === 3 ? 'Preparar mi demo' : 'Continuar'} <ArrowRight size={17} /></button>
          </footer>
        </section>
      </div>
    </main>
  );
}

function scenarioFromGoal(goal, profile) {
  const base = GOAL_SCENARIOS[goal] || GOAL_SCENARIOS.new_patient;
  const services = profile.services?.map((value) => SERVICES.find(([key]) => key === value)?.[1]).filter(Boolean).join(', ');
  const schedule = profile.schedule === 'custom'
    ? profile.customSchedule
    : SCHEDULES.find(([value]) => value === profile.schedule)?.slice(1).join(' · ');
  return {
    ...base,
    first_line: `${profile.clinicName}, buenas tardes. ¿En qué le puedo ayudar?`,
    clinic_name: profile.clinicName,
    clinic_city: profile.city,
    clinic_services: services,
    clinic_schedule: schedule,
    appointment_outcome: profile.appointmentOutcome,
  };
}

export function CallExperience({ profile, scenario, onClose, onCompleted = () => {}, getToken = null }) {
  const clientRef = useRef(null);
  const mountedRef = useRef(true);
  const transcriptRef = useRef([]);
  const completionRef = useRef(false);
  const [phase, setPhase] = useState('ready');
  const [transcript, setTranscript] = useState([]);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');

  const disposeClient = () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (!client) return;
    try {
      const stopped = client.stopCall?.();
      if (stopped && typeof stopped.catch === 'function') stopped.catch(() => {});
    } catch {}
    try { client.removeAllListeners?.(); } catch {}
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; disposeClient(); };
  }, []);

  const close = () => {
    // Unmount the dialog first so a late SDK event cannot leave its backdrop on screen.
    onClose();
    queueMicrotask(disposeClient);
  };

  const start = async () => {
    completionRef.current = false;
    transcriptRef.current = [];
    setPhase('connecting');
    setError('');
    setTranscript([]);
    try {
      const { accessToken } = getToken
        ? await createWorkspaceTestCall(getToken, scenario)
        : await fetch('/api/retell/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'main', scenario }),
        }).then(async (response) => {
          if (!response.ok) throw new Error('token_failed');
          return response.json();
        });
      const client = new RetellWebClient();
      clientRef.current = client;
      client.on('call_started', () => { if (mountedRef.current) setPhase('live'); });
      client.on('agent_start_talking', () => { if (mountedRef.current) setSpeaking(true); });
      client.on('agent_stop_talking', () => { if (mountedRef.current) setSpeaking(false); });
      client.on('update', (update) => {
        if (mountedRef.current && Array.isArray(update.transcript)) {
          transcriptRef.current = [...update.transcript];
          setTranscript(transcriptRef.current);
        }
      });
      client.on('call_ended', () => {
        if (!mountedRef.current) return;
        clientRef.current = null;
        try { client.removeAllListeners?.(); } catch {}
        setSpeaking(false);
        setPhase('ended');
        if (!completionRef.current) {
          completionRef.current = true;
          onCompleted({ scenario, transcript: transcriptRef.current });
        }
      });
      client.on('error', () => {
        if (!mountedRef.current) return;
        clientRef.current = null;
        try { client.removeAllListeners?.(); } catch {}
        setSpeaking(false);
        setError('La llamada se interrumpió. Puedes intentarlo otra vez.');
        setPhase('error');
      });
      await client.startCall({ accessToken });
    } catch (requestError) {
      setError(requestError?.status
        ? requestError.message
        : 'No pudimos abrir el micrófono o conectar la llamada. Revisa la configuración de Retell e intenta nuevamente.');
      setPhase('error');
    }
  };

  const stop = async () => {
    const client = clientRef.current;
    clientRef.current = null;
    try {
      const stopped = client?.stopCall?.();
      if (stopped && typeof stopped.then === 'function') await stopped.catch(() => {});
    } catch {}
    setSpeaking(false);
    setPhase('ended');
    if (!completionRef.current) {
      completionRef.current = true;
      onCompleted({ scenario, transcript: transcriptRef.current });
    }
  };

  const toggleMute = () => {
    if (!clientRef.current) return;
    if (muted) clientRef.current.unmute();
    else clientRef.current.mute();
    setMuted((value) => !value);
  };

  return (
    <div className="preview-dialog-layer" onMouseDown={(event) => event.target === event.currentTarget && phase !== 'live' && close()}>
      <section className="preview-call-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-call-title">
        <header><PortalBrand label="Llamada de prueba" /><button type="button" onClick={close} disabled={phase === 'live'} aria-label="Cerrar"><X size={20} /></button></header>
        <div className={`call-orb-stage ${speaking ? 'speaking' : ''}`}><div className="call-orb"><i /></div><span>{phase === 'live' ? speaking ? 'Lucía está hablando' : 'Lucía te escucha' : phase === 'connecting' ? 'Conectando llamada' : 'Lista para probar'}</span></div>
        <div className="call-dialog-copy">
          <p className="portal-kicker">{profile.clinicName}</p>
          <h2 id="preview-call-title">{scenario.label}</h2>
          {phase === 'ready' && <p>Actúa como paciente. Lucía responderá con el contexto que acabas de configurar.</p>}
          {phase === 'connecting' && <p>Estamos preparando una línea segura de demostración.</p>}
          {phase === 'live' && <p>Habla de forma natural. Usa nombres y datos ficticios.</p>}
          {phase === 'ended' && <p>La prueba terminó. Ya puedes revisar qué entendió Lucía.</p>}
          {error && <p className="call-error"><CircleAlert size={16} /> {error}</p>}
        </div>
        {transcript.length > 0 && <div className="call-transcript">{transcript.slice(-4).map((item, index) => <p key={`${item.role}-${index}`}><span>{item.role === 'agent' ? 'Lucía' : 'Tú'}</span>{item.content || item.text}</p>)}</div>}
        <footer>
          {phase === 'ready' && <button type="button" className="call-primary" onClick={start}><Mic size={18} /> Empezar llamada</button>}
          {phase === 'connecting' && <button type="button" className="call-primary" disabled>Conectando…</button>}
          {phase === 'live' && <><button type="button" className="call-secondary" onClick={toggleMute}>{muted ? <Mic size={18} /> : <MicOff size={18} />} {muted ? 'Activar micrófono' : 'Silenciar'}</button><button type="button" className="call-end" onClick={stop}>Terminar</button></>}
          {['ended', 'error'].includes(phase) && <><button type="button" className="call-secondary" onClick={start}><RotateCcw size={17} /> Intentar de nuevo</button><button type="button" className="call-primary" onClick={close}>Volver al dashboard <ArrowRight size={17} /></button></>}
        </footer>
      </section>
    </div>
  );
}

export function ProspectPreview({ workspace, user }) {
  const profile = workspace.profile || EMPTY_PROFILE;
  const scenarios = useMemo(() => (profile.callGoals?.length ? profile.callGoals : ['new_patient', 'urgent', 'reschedule']).map((goal) => scenarioFromGoal(goal, profile)), [profile]);
  const historyKey = `autivex:demo-history:${workspace.organization?.id}`;
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(historyKey)) || []; } catch { return []; }
  });

  const recordCompletion = ({ scenario, transcript }) => {
    setHistory((current) => {
      const next = [{
        id: `${Date.now()}`,
        scenarioKey: scenario.key,
        label: scenario.label,
        result: scenario.result,
        turns: transcript.length,
        completedAt: new Date().toISOString(),
      }, ...current].slice(0, 6);
      localStorage.setItem(historyKey, JSON.stringify(next));
      return next;
    });
  };

  const serviceNames = profile.services?.slice(0, 3).map((value) => SERVICES.find(([key]) => key === value)?.[1]).filter(Boolean);

  return (
    <main className="portal-shell prospect-shell">
      <PortalTopbar label="Preview" email={user?.primaryEmailAddress?.emailAddress} staticAccount={user?.preview === true}>
        <span className="sandbox-badge"><span /> Entorno de prueba</span>
      </PortalTopbar>
      <div className="prospect-layout">
        <section className="prospect-hero">
          <div className="prospect-heading">
            <p className="portal-kicker">Tu recepcionista está lista</p>
            <h1>Ahora llama como lo haría un paciente.</h1>
            <p>Lucía ya conoce a <strong>{profile.clinicName}</strong>, sus horarios y {serviceNames?.length ? `servicios como ${serviceNames.join(', ')}` : 'los servicios que elegiste'}.</p>
          </div>
          <div className="preview-agent-card">
            <div className="preview-agent-head"><div className="lucia-orb large"><i /></div><div><span>Recepcionista de prueba</span><strong>Lucía</strong></div><b>Lista</b></div>
            <div className="preview-warning"><ShieldCheck size={19} /><span>Esta es una simulación. Usa nombres y datos ficticios.</span></div>
            <div className="scenario-list">
              {scenarios.map((scenario, index) => (
                <button type="button" key={scenario.key} onClick={() => setSelectedScenario(scenario)}>
                  <span>{String(index + 1).padStart(2, '0')}</span><strong>{scenario.label}</strong><PhoneCall size={19} />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="preview-results">
          <header><div><p className="portal-kicker">Tus pruebas</p><h2>El dashboard empieza con conversaciones reales.</h2></div><span>{history.length} completadas</span></header>
          {history.length ? (
            <div className="preview-result-list">
              {history.map((item) => (
                <article key={item.id}>
                  <span className="result-check"><CheckCircle2 size={18} /></span>
                  <div><strong>{item.result}</strong><p>{item.label}</p></div>
                  <time>{new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.completedAt))}</time>
                  <span className="result-turns">{item.turns || '—'} turnos</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="preview-empty"><PhoneCall size={23} /><strong>Aquí aparecerá tu primera llamada.</strong><p>No mostraremos métricas ni pacientes inventados.</p></div>
          )}
        </section>

        <section className="activation-band">
          <div><p className="portal-kicker">Siguiente paso</p><h2>Conecta a Lucía con tu clínica real.</h2><p>El pago activa onboarding, telefonía e integraciones. Tú decides cuándo sale a producción.</p></div>
          <div><a href={SALES_URL}>Activarla en mi clínica <ArrowRight size={18} /></a><span>El cobro y la configuración se confirman personalmente.</span></div>
        </section>
      </div>
      {selectedScenario && <CallExperience profile={profile} scenario={selectedScenario} onClose={() => setSelectedScenario(null)} onCompleted={recordCompletion} />}
    </main>
  );
}

export function WorkspaceMessage({ type, user, detail }) {
  const content = {
    organization_required: ['Falta crear el espacio de tu clínica.', 'Activa la creación automática de la primera Organization en Clerk y vuelve a iniciar sesión.'],
    billing_recovery: ['Tu operación está en modo consulta.', 'Conservamos el histórico, pero necesitamos revisar el estado de pago antes de continuar.'],
    suspended: ['El servicio está pausado.', 'Habla con AutiveX para revisar la operación y el número de respaldo.'],
    error: ['No pudimos abrir tu espacio.', 'Revisa la conexión con el servidor o intenta de nuevo.'],
  }[type] || ['Estamos preparando tu espacio.', 'Actualiza la página en unos momentos.'];
  const description = type === 'error' && detail ? detail : content[1];
  const action = type === 'error'
    ? { href: '/app', label: 'Intentar de nuevo' }
    : { href: SALES_URL, label: 'Hablar con AutiveX' };

  return (
    <main className="portal-shell workspace-message-shell">
      <PortalTopbar label="Control" email={user?.primaryEmailAddress?.emailAddress} staticAccount={user?.preview === true} />
      <section className="workspace-message-card">
        <span><CircleAlert size={25} /></span><p className="portal-kicker">Acceso protegido</p><h1>{content[0]}</h1><p>{description}</p>
        <a href={action.href}>{action.label} <ArrowRight size={17} /></a>
      </section>
    </main>
  );
}

export function WorkspaceLoading() {
  return (
    <main className="portal-shell workspace-loading-shell"><PortalBrand label="Control" /><div className="lucia-orb large"><i /></div><p>Preparando tu clínica…</p></main>
  );
}
