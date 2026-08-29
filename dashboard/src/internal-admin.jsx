import React, { useEffect, useMemo, useState } from 'react';
import { UserButton, useAuth, useUser } from '@clerk/react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarCheck2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileCheck2,
  Database,
  ServerCog,
  TerminalSquare,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  MoveRight,
  Plus,
  Search,
  SlidersHorizontal,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import {
  createInternalClinic,
  deleteInternalClinic,
  getInternalClinics,
  updateInternalClinic,
} from './control-api';
import { PortalBrand } from './workspace';
import './internal-admin.css';

const PAYMENT_METHODS = [
  ['mercado_pago_terminal', 'Terminal Mercado Pago'],
  ['mercado_pago_link', 'Link de Mercado Pago'],
  ['transfer', 'Transferencia / SPEI'],
  ['cash', 'Efectivo'],
  ['invoice_paid', 'Factura pagada'],
  ['other', 'Otro'],
];

const TIMEZONES = [
  ['America/Mexico_City', 'Centro de México'],
  ['America/Cancun', 'Quintana Roo'],
  ['America/Monterrey', 'Monterrey'],
  ['America/Chihuahua', 'Chihuahua'],
  ['America/Hermosillo', 'Sonora'],
  ['America/Tijuana', 'Tijuana'],
];

const SCHEDULING_PROVIDERS = [
  ['none', 'Todavía no definido'],
  ['cal_com', 'Cal.com'],
  ['google_calendar', 'Google Calendar'],
  ['calendly', 'Calendly'],
  ['manual', 'Confirmación manual'],
];

const VOICE_PROVIDERS = [
  ['cartesia', 'Cartesia'],
  ['elevenlabs', 'ElevenLabs'],
  ['retell', 'Retell'],
];

const VOICES_BY_PROVIDER = {
  cartesia: [['sofia_calm', 'Sofía · Serena y natural']],
  elevenlabs: [['gaby_warm', 'Gaby · Joven y cálida']],
  retell: [
    ['andrea_natural', 'Andrea · Natural y profesional'],
    ['alejandro_natural', 'Alejandro · Natural y profesional'],
  ],
};

const STAGE_TONES = {
  'Registro incompleto': 'neutral',
  'Prospecto en demo': 'demo',
  Onboarding: 'paid',
  Configuración: 'progress',
  'En producción': 'live',
  'Cobro pendiente': 'warning',
  Suspendido: 'danger',
};

const ACTIONS = {
  needs_onboarding: ['start_configuration', 'Crear agente Retell', Settings2],
  scheduled: ['start_configuration', 'Iniciar configuración', Settings2],
  configuring: ['publish_test', 'Publicar llamada de prueba', FileCheck2],
  review: ['go_live', 'Activar producción', BadgeCheck],
};

function moneyFromCents(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(value) / 100);
}

function dateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function relativeTime(value) {
  const elapsed = Date.now() - new Date(value).getTime();
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return 'Hace menos de 1 h';
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

function todayInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const EMPTY_PAYMENT = {
  method: 'mercado_pago_terminal',
  amount: '',
  reference: '',
  paidAt: todayInput(),
  note: '',
};

const EMPTY_CLIENT = {
  clinicName: '',
  ownerName: '',
  email: '',
  ownerPhone: '',
  city: '',
  timezone: 'America/Mexico_City',
  website: '',
  industry: '',
  description: '',
  businessHours: '',
  services: '',
  callGoals: '',
  schedulingProvider: 'none',
  voiceProvider: 'cartesia',
  voicePreset: 'sofia_calm',
  internalNotes: '',
  memberEmails: '',
  source: 'local_sales',
};

const EMPTY_PROVISIONING = {
  retellAgentId: '',
  assignedPhoneNumber: '',
  fallbackPhoneNumber: '',
  approvedTestCallId: '',
  fallbackTested: false,
  postCallWebhookVerified: false,
};

const PROVISIONING_CHECKS = [
  ['retellAgentConfigured', 'Agente Retell registrado'],
  ['assignedNumberConfigured', 'Número E.164 asignado'],
  ['fallbackNumberConfigured', 'Fallback humano registrado'],
  ['approvedTestCallRecorded', 'Llamada de prueba aprobada'],
  ['fallbackTested', 'Fallback probado'],
  ['postCallWebhookVerified', 'Webhook post-llamada verificado'],
];

function provisioningFormValue(provisioning) {
  return {
    ...EMPTY_PROVISIONING,
    ...(provisioning || {}),
    fallbackTested: provisioning?.fallbackTested === true,
    postCallWebhookVerified: provisioning?.postCallWebhookVerified === true,
  };
}

function paymentPayload(form) {
  const normalized = String(form.amount || '').replace(/,/g, '');
  const paidAt = new Date(form.paidAt);
  return {
    method: form.method,
    amountCents: Math.round(Number(normalized) * 100),
    reference: form.reference,
    paidAt: form.paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt.toISOString() : form.paidAt,
    note: form.note,
  };
}

function splitList(value) {
  return [...new Set(String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function PaymentFields({ value, onChange }) {
  const update = (field, next) => onChange({ ...value, [field]: next });
  return (
    <div className="ops-form-grid payment-form-grid">
      <label><span>Método</span><select required value={value.method} onChange={(event) => update('method', event.target.value)}>{PAYMENT_METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>Monto recibido · MXN</span><input required inputMode="decimal" value={value.amount} onChange={(event) => update('amount', event.target.value)} placeholder="7,500" /></label>
      <label><span>Referencia o folio</span><input required value={value.reference} onChange={(event) => update('reference', event.target.value)} placeholder="MP-123456 / recibo 042" /></label>
      <label><span>Fecha del pago</span><input required type="datetime-local" value={value.paidAt} onChange={(event) => update('paidAt', event.target.value)} /></label>
      <label className="ops-form-wide"><span>Nota interna · opcional</span><textarea value={value.note} onChange={(event) => update('note', event.target.value)} placeholder="Qué comprobaste y con quién confirmaste el pago." /></label>
    </div>
  );
}

function ClinicRow({ clinic, selected, onClick }) {
  const accessCount = clinic.accessAssignments?.length || clinic.membersCount || 0;
  return (
    <button type="button" className={`ops-clinic-row${selected ? ' selected' : ''}`} onClick={onClick}>
      <span className="ops-clinic-mark">{clinic.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
      <span className="ops-clinic-main"><strong>{clinic.name}</strong><small>{clinic.owner.email || 'Sin correo asociado'}</small></span>
      <span className={`ops-stage ${STAGE_TONES[clinic.stage] || 'neutral'}`}><i /> {clinic.stage}</span>
      <span className="ops-method">{accessCount} {accessCount === 1 ? 'usuario' : 'usuarios'}</span>
      <time>{relativeTime(clinic.createdAt)}</time>
      <ChevronRight size={17} />
    </button>
  );
}

function StatCard({ label, value, detail, tone, icon: Icon }) {
  return <article className={`ops-stat ${tone || ''}`}><span><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function ModalShell({ title, eyebrow, onClose, children, wide = false }) {
  return (
    <div className="ops-modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`ops-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ops-modal-title">
        <header><div><p>{eyebrow}</p><h2 id="ops-modal-title">{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></header>
        {children}
      </section>
    </div>
  );
}

export function NewClientModal({ busy, error, onClose, onCreate }) {
  const [form, setForm] = useState(EMPTY_CLIENT);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    onCreate({
      locationName: form.clinicName,
      ownerEmail: form.email,
      city: form.city,
      source: form.source,
      members: splitList(form.memberEmails).map((email) => ({ email, role: 'org:member' })),
      businessProfile: {
        clinicName: form.clinicName,
        ownerName: form.ownerName,
        ownerPhone: form.ownerPhone,
        city: form.city,
        timezone: form.timezone,
        website: form.website,
        industry: form.industry,
        description: form.description,
        businessHours: form.businessHours,
        services: splitList(form.services),
        callGoals: splitList(form.callGoals),
        schedulingProvider: form.schedulingProvider,
        voiceProvider: form.voiceProvider,
        voicePreset: form.voicePreset,
        internalNotes: form.internalNotes,
      },
    });
  };

  return (
    <ModalShell title="Provisionar tenant" eyebrow="Create / Location pipeline" onClose={onClose} wide>
      <form className="ops-modal-body new-client-form" onSubmit={submit}>
        <div className="ops-provision-plan">
          <span><b>01</b> Clerk organization + invitations</span>
          <span><b>02</b> Supabase workspace isolation</span>
          <span><b>03</b> Private Retell agent + system prompt</span>
          <code>billing: not_required</code>
        </div>
        <div className="ops-form-section">
          <div className="ops-section-heading"><span>01</span><div><strong>Tenant identity & access</strong><p>Crea la Organization de Clerk, el owner administrativo y las asignaciones de acceso.</p></div></div>
          <div className="ops-form-grid">
            <label><span>Nombre comercial</span><input autoFocus required value={form.clinicName} onChange={(event) => update('clinicName', event.target.value)} placeholder="Clínica Dental Aurora" /></label>
            <label><span>Nombre del propietario</span><input required value={form.ownerName} onChange={(event) => update('ownerName', event.target.value)} placeholder="Ana Martínez" /></label>
            <label><span>Correo del propietario</span><input required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="propietario@clinica.mx" /></label>
            <label><span>WhatsApp o teléfono del propietario</span><input type="tel" inputMode="tel" value={form.ownerPhone} onChange={(event) => update('ownerPhone', event.target.value)} placeholder="+52 55 0000 0000" /></label>
            <label><span>Ciudad</span><input required value={form.city} onChange={(event) => update('city', event.target.value)} placeholder="Querétaro, Qro." /></label>
            <label><span>Zona horaria</span><select required value={form.timezone} onChange={(event) => update('timezone', event.target.value)}>{TIMEZONES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label><span>Industria</span><input required value={form.industry} onChange={(event) => update('industry', event.target.value)} placeholder="Clínica dental, inmobiliaria, taller…" /></label>
            <label><span>Sitio web · opcional</span><input type="url" value={form.website} onChange={(event) => update('website', event.target.value)} placeholder="https://negocio.mx" /></label>
            <label><span>Origen</span><select value={form.source} onChange={(event) => update('source', event.target.value)}><option value="local_sales">Venta local</option><option value="cold_call">Cold call</option><option value="referral">Referido</option><option value="inbound">Registro orgánico</option></select></label>
            <label className="ops-form-wide"><span>Usuarios adicionales · opcional</span><textarea value={form.memberEmails} onChange={(event) => update('memberEmails', event.target.value)} placeholder={'equipo@negocio.mx\nrecepcion@negocio.mx'} /><small>Un correo por línea. El propietario será administrador; estos usuarios serán miembros.</small></label>
          </div>
        </div>
        <div className="ops-form-section">
          <div className="ops-section-heading"><span>02</span><div><strong>Agent runtime context</strong><p>Estos campos se normalizan y compilan dentro del system prompt privado de Retell.</p></div></div>
          <div className="ops-form-grid">
            <label className="ops-form-wide"><span>Qué hace el negocio</span><textarea required value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Describe en lenguaje simple qué ofrece, a quién atiende y qué no debe prometer el agente." /></label>
            <label><span>Horarios</span><textarea required value={form.businessHours} onChange={(event) => update('businessHours', event.target.value)} placeholder="Lun–Vie 9:00–18:00; Sáb 9:00–14:00" /></label>
            <label><span>Agenda actual</span><select value={form.schedulingProvider} onChange={(event) => update('schedulingProvider', event.target.value)}>{SCHEDULING_PROVIDERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label><span>Proveedor de voz</span><select value={form.voiceProvider} onChange={(event) => { const provider = event.target.value; setForm((current) => ({ ...current, voiceProvider: provider, voicePreset: VOICES_BY_PROVIDER[provider][0][0] })); }}>{VOICE_PROVIDERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>Cartesia es el default recomendado para español.</small></label>
            <label><span>Voz del agente</span><select value={form.voicePreset} onChange={(event) => update('voicePreset', event.target.value)}>{VOICES_BY_PROVIDER[form.voiceProvider].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>La voz se aplica al crear el agente privado.</small></label>
            <label><span>Servicios principales</span><textarea required value={form.services} onChange={(event) => update('services', event.target.value)} placeholder="Consulta general, implantes, urgencias" /></label>
            <label><span>Motivos de llamada</span><textarea required value={form.callGoals} onChange={(event) => update('callGoals', event.target.value)} placeholder="Agendar, precios, reprogramar, urgencias" /></label>
            <label className="ops-form-wide"><span>Notas internas · opcional</span><textarea value={form.internalNotes} onChange={(event) => update('internalNotes', event.target.value)} placeholder="Restricciones, acuerdos comerciales o contexto que solo debe ver AutiveX." /></label>
          </div>
        </div>
        {error && <p className="ops-form-error"><CircleAlert size={16} /> {error}</p>}
        <footer><span className="ops-submit-note"><LockKeyhole size={14} /> Server-side provisioning · auditable</span><button type="button" className="ops-button secondary" onClick={onClose}>Cancelar</button><button type="submit" className="ops-button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Execute provisioning</button></footer>
      </form>
    </ModalShell>
  );
}

function ConfirmPayment({ clinic, busy, error, onConfirm }) {
  const [payment, setPayment] = useState(EMPTY_PAYMENT);
  return (
    <section className="ops-action-card payment-review-card">
      <div className="ops-action-icon"><Banknote size={21} /></div>
      <div className="ops-action-copy"><p>Cobro pendiente</p><h3>Confirma el dinero antes de abrir onboarding.</h3><span>El comprobante del cliente es evidencia; verifica el movimiento en Mercado Pago o tu cuenta.</span></div>
      <PaymentFields value={payment} onChange={setPayment} />
      {error && <p className="ops-form-error"><CircleAlert size={16} /> {error}</p>}
      <button type="button" className="ops-button primary" disabled={busy} onClick={() => onConfirm(paymentPayload(payment))}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Verifiqué el pago · habilitar onboarding</button>
    </section>
  );
}

function ProvisioningForm({ clinic, busy, error, onSave }) {
  const provisioning = clinic.provisioning || {};
  const [form, setForm] = useState(() => provisioningFormValue(provisioning));
  const editable = ['configuring', 'review'].includes(clinic.state.onboardingStatus)
    && clinic.state.serviceStatus !== 'live';

  useEffect(() => {
    setForm(provisioningFormValue(clinic.provisioning));
  }, [clinic.id, clinic.provisioning?.retellAgentId, clinic.provisioning?.updatedAt]);

  if (!editable && clinic.state.serviceStatus !== 'live') return null;

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    onSave({
      retellAgentId: form.retellAgentId,
      assignedPhoneNumber: form.assignedPhoneNumber,
      fallbackPhoneNumber: form.fallbackPhoneNumber,
      approvedTestCallId: form.approvedTestCallId,
      fallbackTested: form.fallbackTested,
      postCallWebhookVerified: form.postCallWebhookVerified,
    });
  };

  return (
    <section className={`ops-record-section provisioning-section${provisioning.ready ? ' ready' : ''}`}>
      <header>
        <Settings2 size={17} />
        <h3>Provisionamiento de producción</h3>
        <span className={`provisioning-status ${provisioning.ready ? 'ready' : 'pending'}`}>{provisioning.ready ? 'Listo para avanzar' : 'Verificación incompleta'}</span>
      </header>

      {clinic.provisioningDraft?.retellAgentId && (
        <div className="provisioning-draft">
          <div><span>Agente borrador creado</span><strong>{clinic.provisioningDraft.retellAgentId}</strong></div>
          <div><span>Plantilla</span><strong>{clinic.provisioningDraft.promptTemplateVersion || 'AutiveX'}</strong></div>
          <div><span>Voz</span><strong>{clinic.provisioningDraft.voiceModel || clinic.provisioningDraft.voiceId || 'Retell'}</strong></div>
          <div><span>n8n</span><strong>{clinic.provisioningDraft.n8nStatus === 'delivered' ? 'Evento entregado' : 'Pendiente de conectar'}</strong></div>
        </div>
      )}

      {editable ? (
        <form className="provisioning-form" onSubmit={submit}>
          <div className="ops-form-grid">
            <label><span>Retell agent ID</span><input required autoComplete="off" value={form.retellAgentId} onChange={(event) => update('retellAgentId', event.target.value)} placeholder="ID del agente en Retell" maxLength={160} /></label>
            <label><span>Retell call ID · prueba aprobada</span><input required autoComplete="off" value={form.approvedTestCallId} onChange={(event) => update('approvedTestCallId', event.target.value)} placeholder="ID de la llamada en Retell" maxLength={160} /></label>
            <label><span>Número asignado · E.164</span><input required inputMode="tel" autoComplete="off" value={form.assignedPhoneNumber} onChange={(event) => update('assignedPhoneNumber', event.target.value)} placeholder="+525512345678" maxLength={40} /></label>
            <label><span>Fallback humano · E.164</span><input required inputMode="tel" autoComplete="off" value={form.fallbackPhoneNumber} onChange={(event) => update('fallbackPhoneNumber', event.target.value)} placeholder="+525587654321" maxLength={40} /></label>
          </div>
          <div className="provisioning-confirmations">
            <label><input type="checkbox" checked={form.fallbackTested} onChange={(event) => update('fallbackTested', event.target.checked)} /><span><strong>Fallback probado</strong><small>Una llamada real llegó correctamente al teléfono humano.</small></span></label>
            <label><input type="checkbox" checked={form.postCallWebhookVerified} onChange={(event) => update('postCallWebhookVerified', event.target.checked)} /><span><strong>Webhook verificado</strong><small>El evento post-llamada llegó y quedó asociado a esta clínica.</small></span></label>
          </div>
          {error && <p className="ops-form-error"><CircleAlert size={16} /> {error}</p>}
          <footer><span>Los IDs quedan en metadata privada de Clerk.</span><button type="submit" className="ops-button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Guardar verificación</button></footer>
        </form>
      ) : (
        <dl>
          <div><dt>Agente Retell</dt><dd>{provisioning.retellAgentId || '—'}</dd></div>
          <div><dt>Prueba aprobada</dt><dd>{provisioning.approvedTestCallId || '—'}</dd></div>
          <div><dt>Número AutiveX</dt><dd>{provisioning.assignedPhoneNumber || '—'}</dd></div>
          <div><dt>Fallback humano</dt><dd>{provisioning.fallbackPhoneNumber || '—'}</dd></div>
        </dl>
      )}

      <div className="provisioning-readiness" aria-label="Estado del provisionamiento">
        {PROVISIONING_CHECKS.map(([key, label]) => {
          const complete = provisioning.checks?.[key] === true;
          return <span key={key} className={complete ? 'complete' : ''}>{complete ? <Check size={13} /> : <CircleAlert size={13} />} {label}</span>;
        })}
      </div>
    </section>
  );
}

function NextAction({ clinic, busy, error, onAction }) {
  const config = ACTIONS[clinic.state.onboardingStatus];
  const [confirmation, setConfirmation] = useState('');

  if (!['verified', 'not_required'].includes(clinic.state.billingStatus)) return null;
  if (clinic.state.serviceStatus === 'live') {
    return <section className="ops-action-card live-card"><div className="ops-action-icon"><BadgeCheck size={21} /></div><div className="ops-action-copy"><p>Servicio activo</p><h3>La clínica está en producción.</h3><span>Agente, prueba, webhook y fallback quedaron verificados antes de la activación.</span></div></section>;
  }
  if (!config) return null;

  const [action, configuredLabel, Icon] = config;
  const label = action === 'start_configuration' && clinic.provisioningDraft?.status === 'error'
    ? 'Reintentar creación del agente'
    : configuredLabel;
  const goLive = action === 'go_live';
  const startsConfiguration = action === 'start_configuration';
  const readinessRequired = ['publish_test', 'go_live'].includes(action);
  const readinessBlocked = readinessRequired && clinic.provisioning?.ready !== true;
  return (
    <section className={`ops-action-card${goLive ? ' go-live-card' : ''}`}>
      <div className="ops-action-icon"><Icon size={21} /></div>
      <div className="ops-action-copy"><p>Siguiente acción</p><h3>{label}</h3><span>{readinessBlocked ? 'Completa las seis verificaciones de provisionamiento para habilitar esta acción.' : startsConfiguration ? 'Crea un agente borrador privado en Retell, lo vincula a Supabase y prepara el evento compartido de n8n.' : goLive ? 'Esto marca el servicio como activo. La analítica seguirá identificada como demo hasta conectar una fuente de datos real.' : 'La acción queda registrada con tu usuario y hora.'}</span></div>
      {goLive && <label className="ops-confirm-name"><span>Escribe “{clinic.name}” para confirmar</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
      {error && <p className="ops-form-error"><CircleAlert size={16} /> {error}</p>}
      <button type="button" className="ops-button primary" disabled={busy || readinessBlocked || (goLive && confirmation !== clinic.name)} onClick={() => onAction(action, confirmation)}>{busy ? <LoaderCircle className="spin" size={17} /> : <Icon size={17} />} {label}</button>
    </section>
  );
}

function LocationManagement({ clinic, clinics, busy, onEdit, onMember, onCalendar, onAgentConfig, onStage, onBypass, onDelete }) {
  const [edit, setEdit] = useState({ name: clinic.name, city: clinic.profile?.city || '', industry: clinic.profile?.industry || '' });
  const [member, setMember] = useState({ email: '', role: 'org:member', operation: 'add', targetOrganizationId: '' });
  const [confirmation, setConfirmation] = useState('');
  const [stage, setStage] = useState('configuring');
  const [calendar, setCalendar] = useState({ displayName: clinic.profile?.calendarDisplayName || 'Agenda principal', calendarId: clinic.profile?.calendarId || '' });
  const [agent, setAgent] = useState({
    clinicName: clinic.profile?.clinicName || clinic.name,
    industry: clinic.profile?.industry || '',
    city: clinic.profile?.city || '',
    description: clinic.profile?.description || '',
    businessHours: clinic.profile?.businessHours || '',
    greeting: clinic.profile?.greeting || '',
    // Services carry duration/price/details now (see main.jsx's Servicios
    // tab), but this quick admin editor only exposes names -- editing here
    // preserves whatever duration/price/details a name already had rather
    // than wiping them, via serviceNamesToObjects below.
    services: (clinic.profile?.services || []).map((item) => (typeof item === 'string' ? item : item?.name || '')).join(', '),
    offDays: (clinic.profile?.offDays || []).join(', '),
  });
  useEffect(() => setEdit({ name: clinic.name, city: clinic.profile?.city || '', industry: clinic.profile?.industry || '' }), [clinic.id, clinic.name]);
  const splitList = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
  const serviceNamesToObjects = (namesText) => {
    const currentByName = new Map((clinic.profile?.services || []).map((item) => {
      const normalized = typeof item === 'string' ? { name: item, duration: '', price: '', details: '' } : item;
      return [String(normalized?.name || '').toLowerCase(), normalized];
    }));
    return splitList(namesText).map((name) => {
      const existing = currentByName.get(name.toLowerCase());
      return existing ? { ...existing, name } : { name, duration: '', price: '', details: '' };
    });
  };
  const saveAgent = () => onAgentConfig({ ...agent, services: serviceNamesToObjects(agent.services), offDays: splitList(agent.offDays) });
  return <section className="ops-record-section location-management">
    <header><Settings2 size={19} /><h3>Administrar Location</h3><span>Cambios reales en Clerk</span></header>
    <form className="ops-management-grid" onSubmit={(event) => { event.preventDefault(); onEdit(edit); }}>
      <label><span>Nombre</span><input value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} /></label>
      <label><span>Ciudad</span><input value={edit.city} onChange={(event) => setEdit({ ...edit, city: event.target.value })} /></label>
      <label><span>Industria</span><input value={edit.industry} onChange={(event) => setEdit({ ...edit, industry: event.target.value })} /></label>
      <button className="ops-button secondary" disabled={busy}>Guardar datos</button>
    </form>
    <div className="ops-member-manager">
      <div><strong>Acceso y miembros</strong><span>Invita, cambia el rol o mueve una cuenta activa.</span></div>
      <div className="ops-management-grid member-grid">
        <label><span>Correo</span><input type="email" value={member.email} onChange={(event) => setMember({ ...member, email: event.target.value })} placeholder="equipo@clinica.mx" /></label>
        <label><span>Acción</span><select value={member.operation} onChange={(event) => setMember({ ...member, operation: event.target.value })}><option value="add">Agregar / cambiar rol</option><option value="move">Mover a otra Location</option><option value="remove">Quitar acceso</option></select></label>
        {member.operation !== 'remove' && <label><span>Rol</span><select value={member.role} onChange={(event) => setMember({ ...member, role: event.target.value })}><option value="org:member">Miembro</option><option value="org:admin">Administrador</option></select></label>}
        {member.operation === 'move' && <label><span>Destino</span><select value={member.targetOrganizationId} onChange={(event) => setMember({ ...member, targetOrganizationId: event.target.value })}><option value="">Selecciona Location</option>{clinics.filter((item) => item.id !== clinic.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <button type="button" className="ops-button secondary" disabled={busy || !member.email || (member.operation === 'move' && !member.targetOrganizationId)} onClick={() => onMember(member)}>{member.operation === 'move' ? <MoveRight size={16} /> : <UserPlus size={16} />} Aplicar</button>
      </div>
    </div>
    <div className="ops-calendar-manager"><div><strong>Google Calendar</strong><span>Asignación manual mediante la credencial administrada de n8n.</span></div><label><span>Nombre visible</span><input value={calendar.displayName} onChange={(event) => setCalendar({ ...calendar, displayName: event.target.value })} placeholder="Agenda principal" /></label><label><span>Calendar ID</span><input value={calendar.calendarId} onChange={(event) => setCalendar({ ...calendar, calendarId: event.target.value })} placeholder="...@group.calendar.google.com" /></label><button type="button" className="ops-button primary" disabled={busy || !calendar.calendarId} onClick={() => onCalendar(calendar)}><CalendarCheck2 size={16} /> Conectar al agente</button></div>
    <div className="ops-agent-manager">
      <div><strong>Configuración del agente</strong><span>Regenera el prompt y el saludo en Retell al guardar. El cliente ve estos mismos campos en su dashboard.</span></div>
      <div className="ops-management-grid">
        <label><span>Nombre del negocio</span><input value={agent.clinicName} onChange={(event) => setAgent({ ...agent, clinicName: event.target.value })} /></label>
        <label><span>Industria</span><input value={agent.industry} onChange={(event) => setAgent({ ...agent, industry: event.target.value })} /></label>
        <label><span>Ciudad</span><input value={agent.city} onChange={(event) => setAgent({ ...agent, city: event.target.value })} /></label>
        <label><span>Horario regular</span><input value={agent.businessHours} onChange={(event) => setAgent({ ...agent, businessHours: event.target.value })} placeholder="Lunes a viernes, 9:00 a 19:00" /></label>
      </div>
      <label><span>Descripción breve</span><textarea rows={2} value={agent.description} onChange={(event) => setAgent({ ...agent, description: event.target.value })} /></label>
      <label><span>Mensaje inicial</span><textarea rows={2} value={agent.greeting} onChange={(event) => setAgent({ ...agent, greeting: event.target.value })} placeholder="Hola, gracias por llamar a…" /></label>
      <label><span>Servicios (separados por coma)</span><input value={agent.services} onChange={(event) => setAgent({ ...agent, services: event.target.value })} placeholder="Limpieza dental, Ortodoncia" /><small>Duración, costo y detalles de cada servicio se editan desde el dashboard del cliente (pestaña Servicios).</small></label>
      <label><span>Excepciones de horario (separadas por coma)</span><input value={agent.offDays} onChange={(event) => setAgent({ ...agent, offDays: event.target.value })} placeholder="25 de diciembre, Domingos" /></label>
      <button type="button" className="ops-button primary" disabled={busy || !agent.clinicName} onClick={saveAgent}><Settings2 size={16} /> Guardar configuración del agente</button>
    </div>
    <div className="ops-stage-manager"><div><strong>Etapa y acceso</strong><span>Cambia manualmente el ciclo de vida del tenant.</span></div><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="prospect">Prospecto</option><option value="onboarding">Onboarding</option><option value="configuring">Configuración</option><option value="review">Revisión</option><option value="live">Producción</option><option value="suspended">Suspendido</option></select><button type="button" className="ops-button secondary" disabled={busy} onClick={() => onStage(stage)}>Actualizar etapa</button></div>
    <div className="ops-danger-zone">
      <div><strong>Acciones avanzadas</strong><span>Escribe el nombre exacto para habilitarlas.</span></div>
      <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={clinic.name} />
      <button type="button" className="ops-button bypass" disabled={busy || confirmation !== clinic.name || clinic.state.serviceStatus === 'live'} onClick={() => onBypass(confirmation)}>Bypass → habilitar ahora</button>
      <button type="button" className="ops-button danger" disabled={busy || confirmation !== clinic.name} onClick={() => onDelete(confirmation)}><Trash2 size={16} /> Eliminar Location</button>
    </div>
  </section>;
}

const VOICE_EMOTIONS = [
  ['', 'Sin emoción marcada'],
  ['calm', 'Calmada'],
  ['sympathetic', 'Empática'],
  ['happy', 'Alegre'],
  ['sad', 'Triste'],
  ['angry', 'Molesta'],
  ['fearful', 'Nerviosa'],
  ['surprised', 'Sorprendida'],
];

const STT_MODES = [
  ['fast', 'Rápida — contesta antes, se equivoca más con nombres'],
  ['accurate', 'Precisa — entiende mejor, tarda un poco más'],
  ['custom', 'Personalizada'],
];

// Every range here is the one Retell actually enforces; a value outside it is
// clamped again on the server before it reaches the API.
const RUNTIME_SLIDERS = [
  ['voiceSpeed', 'Velocidad al hablar', 0.5, 2, 0.01, 'Abajo de 1 habla más despacio. 0.96 es el default.'],
  ['voiceTemperature', 'Expresividad', 0, 2, 0.05, 'Qué tanto varía la entonación entre frases.'],
  ['responsiveness', 'Qué tan rápido contesta', 0, 1, 0.01, 'Alto responde casi encima; bajo deja aire antes de hablar.'],
  ['interruptionSensitivity', 'Qué tan fácil se deja interrumpir', 0, 1, 0.01, 'Alto se calla en cuanto oye a la persona.'],
  ['beginMessageDelayMs', 'Espera antes de saludar', 0, 2000, 50, 'Milisegundos entre que contesta y que empieza a hablar.'],
  ['modelTemperature', 'Creatividad de las respuestas', 0, 1, 0.05, 'Bajo repite las mismas frases llamada tras llamada.'],
];

function AdvancedAgentSettings({ clinic, busy, onSave }) {
  const draft = clinic.provisioningDraft || {};
  const [open, setOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [settings, setSettings] = useState(clinic.agentRuntime || {});
  const [extraInstructions, setExtraInstructions] = useState(clinic.profile?.extraInstructions || '');

  useEffect(() => {
    setSettings(clinic.agentRuntime || {});
    setExtraInstructions(clinic.profile?.extraInstructions || '');
  }, [clinic.id, clinic.profile?.updatedAt]);

  // Nothing to tune until the Location actually has an agent on Retell.
  if (!draft.retellAgentId || !draft.retellLlmId) return null;

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const backchannelOn = settings.enableBackchannel !== false;

  return (
    <section className="ops-record-section ops-advanced">
      <header>
        <SlidersHorizontal size={17} />
        <h3>Ajustes avanzados del agente</h3>
        <button type="button" className="ops-advanced-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Ocultar' : 'Abrir'} <ChevronRight size={14} className={open ? 'rotated' : ''} />
        </button>
      </header>

      {!open
        ? <p className="ops-advanced-hint">Voz, ritmo, transcripción e instrucciones extra para el prompt. Sólo tú ves esto; el cliente no.</p>
        : (
          <div className="ops-advanced-body">
            <div className="ops-advanced-grid">
              {RUNTIME_SLIDERS.map(([key, label, min, max, step, hint]) => (
                <label key={key} className="ops-slider-row">
                  <span className="ops-slider-head">{label}<b>{key === 'beginMessageDelayMs' ? `${Math.round(Number(settings[key] ?? 0))} ms` : Number(settings[key] ?? 0).toFixed(2)}</b></span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={Number(settings[key] ?? 0)}
                    disabled={busy}
                    onChange={(event) => update(key, Number(event.target.value))}
                  />
                  <small>{hint}</small>
                </label>
              ))}
            </div>

            <div className="ops-advanced-grid">
              <label className="ops-advanced-field">
                <span>Emoción de la voz</span>
                <select value={settings.voiceEmotion || ''} disabled={busy} onChange={(event) => update('voiceEmotion', event.target.value)}>
                  {VOICE_EMOTIONS.map(([value, label]) => <option key={value || 'none'} value={value}>{label}</option>)}
                </select>
                <small>Sólo la aplican algunos proveedores de voz, como Cartesia y MiniMax.</small>
              </label>

              <label className="ops-advanced-field">
                <span>Transcripción</span>
                <select value={settings.sttMode || 'fast'} disabled={busy} onChange={(event) => update('sttMode', event.target.value)}>
                  {STT_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <small>Cámbiala a Precisa si le batalla con apellidos o números.</small>
              </label>
            </div>

            <div className="ops-advanced-backchannel">
              <label className="ops-advanced-check">
                <input type="checkbox" checked={backchannelOn} disabled={busy} onChange={(event) => update('enableBackchannel', event.target.checked)} />
                <span>Hace sonidos mientras escucha <small>Los "mhm", "ajá" y "sí" que hace una persona al teléfono. Apagado, escucha en silencio total.</small></span>
              </label>
              <label className="ops-slider-row">
                <span className="ops-slider-head">Qué tan seguido<b>{Number(settings.backchannelFrequency ?? 0).toFixed(2)}</b></span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={Number(settings.backchannelFrequency ?? 0)}
                  disabled={busy || !backchannelOn}
                  onChange={(event) => update('backchannelFrequency', Number(event.target.value))}
                />
              </label>
            </div>

            <label className="ops-advanced-field ops-advanced-wide">
              <span>Instrucciones adicionales</span>
              <textarea
                rows={5}
                value={extraInstructions}
                disabled={busy}
                placeholder={'Ej. Si preguntan por el Dr. Ruiz, atiende martes y jueves.\nNo agendar menores sin un adulto presente.'}
                onChange={(event) => setExtraInstructions(event.target.value)}
              />
              <small>Se agregan al prompt generado, arriba de las reglas de seguridad. No las reemplazan: los servicios y el horario se siguen actualizando solos.</small>
            </label>

            <div className="ops-advanced-prompt">
              <button type="button" className="ops-advanced-toggle" onClick={() => setShowPrompt(!showPrompt)} aria-expanded={showPrompt}>
                {showPrompt ? 'Ocultar' : 'Ver'} el prompt que se le manda <ChevronRight size={14} className={showPrompt ? 'rotated' : ''} />
              </button>
              {showPrompt && <pre>{clinic.agentPromptPreview || 'Todavía no hay perfil de negocio guardado.'}</pre>}
            </div>

            <div className="ops-advanced-actions">
              <button type="button" className="ops-button secondary" disabled={busy} onClick={() => setSettings(clinic.agentRuntimeDefaults || {})}>
                Restablecer valores
              </button>
              <button type="button" className="ops-button primary" disabled={busy} onClick={() => onSave({ settings, extraInstructions })}>
                {busy ? <LoaderCircle className="spin" size={17} /> : <SlidersHorizontal size={17} />} Guardar ajustes
              </button>
            </div>
          </div>
        )}
    </section>
  );
}

function ClinicDetail({ clinic, clinics, busy, error, onClose, onConfirmPayment, onSaveProvisioning, onAction, onEdit, onMember, onCalendar, onAgentConfig, onAgentAdvanced, onStage, onBypass, onDelete }) {
  const profile = clinic.profile;
  const accountEnabled = ['verified', 'not_required'].includes(clinic.state.billingStatus);
  return (
    <ModalShell title={clinic.name} eyebrow={`Expediente · ${clinic.stage}`} onClose={onClose} wide>
      <div className="ops-detail-body">
        <div className="ops-detail-summary">
          <article><span><UserRound size={18} /></span><div><small>Propietario</small><strong>{clinic.owner.name || 'Por confirmar'}</strong><p>{clinic.owner.email || 'Sin correo asociado'}</p></div></article>
          <article><span><MapPin size={18} /></span><div><small>Ciudad</small><strong>{profile?.city || 'Por confirmar'}</strong><p>{profile ? 'Capturada en Preview' : 'Pendiente de onboarding'}</p></div></article>
          <article><span><UserRound size={18} /></span><div><small>Acceso</small><strong>{clinic.accessAssignments?.length || clinic.membersCount || 0} usuarios</strong><p>Organización de Clerk</p></div></article>
        </div>

        <LocationManagement clinic={clinic} clinics={clinics} busy={busy} onEdit={onEdit} onMember={onMember} onCalendar={onCalendar} onAgentConfig={onAgentConfig} onStage={onStage} onBypass={onBypass} onDelete={onDelete} />

        {accountEnabled && <ProvisioningForm clinic={clinic} busy={busy} error={error} onSave={onSaveProvisioning} />}

        {!accountEnabled
          ? <ConfirmPayment clinic={clinic} busy={busy} error={error} onConfirm={onConfirmPayment} />
          : <NextAction clinic={clinic} busy={busy} error={error} onAction={onAction} />}

        <section className="ops-record-section"><header><UserRound size={17} /><h3>Usuarios de la Location</h3></header><dl>{(clinic.accessAssignments || []).map((assignment) => <div key={assignment.email}><dt>{assignment.role === 'org:admin' ? 'Administrador' : 'Miembro'}</dt><dd>{assignment.email} · {assignment.status === 'active' ? 'Activo' : assignment.status === 'invited' ? 'Invitación enviada' : 'Requiere atención'}</dd></div>)}</dl></section>

        {clinic.payment && <section className="ops-record-section"><header><Banknote size={17} /><h3>Pago verificado</h3></header><dl><div><dt>Monto</dt><dd>{moneyFromCents(clinic.payment.amountCents)}</dd></div><div><dt>Referencia</dt><dd>{clinic.payment.reference}</dd></div><div><dt>Fecha del pago</dt><dd>{dateTime(clinic.payment.paidAt)}</dd></div><div><dt>Verificado</dt><dd>{dateTime(clinic.payment.verifiedAt)}</dd></div></dl></section>}

        {profile && <section className="ops-record-section"><header><Building2 size={17} /><h3>Configuración del negocio</h3></header><dl><div><dt>Industria</dt><dd>{profile.industry || 'Por confirmar'}</dd></div><div><dt>Contacto</dt><dd>{profile.ownerPhone || clinic.owner.email || '—'}</dd></div><div><dt>Servicios</dt><dd>{profile.services?.join(', ') || '—'}</dd></div><div><dt>Motivos de llamada</dt><dd>{profile.callGoals?.join(', ') || '—'}</dd></div><div><dt>Horario</dt><dd>{profile.businessHours || profile.customSchedule || profile.schedule || '—'}</dd></div><div><dt>Agenda</dt><dd>{SCHEDULING_PROVIDERS.find(([key]) => key === profile.schedulingProvider)?.[1] || profile.appointmentOutcome || 'Por definir'}</dd></div>{profile.description && <div className="ops-record-wide"><dt>Descripción</dt><dd>{profile.description}</dd></div>}{profile.internalNotes && <div className="ops-record-wide"><dt>Notas internas</dt><dd>{profile.internalNotes}</dd></div>}</dl></section>}

        <AdvancedAgentSettings clinic={clinic} busy={busy} onSave={onAgentAdvanced} />

        <section className="ops-record-section audit-section"><header><Clock3 size={17} /><h3>Auditoría reciente</h3></header>{clinic.auditTrail.length ? <ol>{clinic.auditTrail.map((entry) => <li key={entry.id}><i /><div><strong>{String(entry.action).replaceAll('_', ' ')}</strong><span>{dateTime(entry.at)} · {entry.actorUserId}</span></div></li>)}</ol> : <p>Este expediente todavía no tiene eventos.</p>}</section>
      </div>
    </ModalShell>
  );
}

function AccessDenied({ error }) {
  return (
    <main className="ops-access-screen"><PortalBrand label="Operaciones" /><section><span><LockKeyhole size={26} /></span><h1>Acceso interno protegido.</h1><p>{error || 'Esta cuenta no está autorizada para administrar clientes de AutiveX.'}</p><a href="/app"><ArrowLeft size={17} /> Volver a mi cuenta</a></section></main>
  );
}

function AdminOverview({ clinics, onOpenLocations }) {
  const revenue = clinics.reduce((sum, clinic) => sum + Number(clinic.payment?.amountCents || 0), 0);
  const live = clinics.filter((clinic) => clinic.state.serviceStatus === 'live').length;
  const leads = clinics.filter((clinic) => ['Registro incompleto', 'Prospecto en demo'].includes(clinic.stage)).length;
  const agents = clinics.filter((clinic) => clinic.provisioningDraft?.retellAgentId || clinic.provisioning?.retellAgentId).length;
  const stages = ['Registro incompleto', 'Prospecto en demo', 'Onboarding', 'Configuración', 'En producción'];
  return <>
    <section className="ops-business-kpis">
      <StatCard label="Locations" value={clinics.length} detail={`${live} activas en producción`} tone="live" icon={Building2} />
      <StatCard label="Leads registrados" value={leads} detail="Prospectos e intake incompleto" tone="paid" icon={UserRound} />
      <StatCard label="Ingresos registrados" value={moneyFromCents(revenue)} detail="Pagos verificados en consola" tone="warning" icon={Banknote} />
      <StatCard label="Agentes creados" value={agents} detail={`${Math.max(agents - live, 0)} en staging o configuración`} tone="progress" icon={ServerCog} />
    </section>
    <section className="ops-overview-grid">
      <article className="ops-chart-card"><header><div><p>Pipeline operativo</p><h2>Locations por etapa</h2></div><BarChart3 size={20} /></header><div className="ops-stage-chart">{stages.map((stage) => { const count = clinics.filter((clinic) => clinic.stage === stage).length; return <div key={stage}><span>{stage}</span><i><b style={{ width: `${clinics.length ? Math.max((count / clinics.length) * 100, count ? 8 : 0) : 0}%` }} /></i><strong>{count}</strong></div>; })}</div></article>
      <article className="ops-chart-card spend-card"><header><div><p>Infraestructura</p><h2>Uso y gasto de agentes</h2></div><ServerCog size={20} /></header><div className="ops-data-status"><strong>Sin fuente de costos conectada</strong><p>Retell todavía no entrega consumo de tokens/minutos a esta consola. No mostramos estimaciones falsas.</p><span>{agents} agentes identificados · {live} activos</span></div></article>
    </section>
    <section className="ops-overview-action"><div><strong>Administración de Locations</strong><span>Edita tenants, miembros, etapas y accesos desde un solo lugar.</span></div><button type="button" onClick={onOpenLocations}>Abrir Locations <ArrowRight size={17} /></button></section>
  </>;
}

export default function InternalAdmin() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [section, setSection] = useState('Resumen');

  const load = async () => {
    setLoading(true);
    try {
      const result = await getInternalClinics(getToken);
      setClinics(result.clinics);
      setAccessError('');
    } catch (error) {
      setAccessError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selected = clinics.find((clinic) => clinic.id === selectedId) || null;
  const visible = useMemo(() => clinics.filter((clinic) => {
    const matchesQuery = !query.trim() || `${clinic.name} ${clinic.owner.email} ${clinic.payment?.reference || ''}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFilter = filter === 'Todos'
      || (filter === 'Por cobrar' && clinic.state.billingStatus !== 'verified')
      || (filter === 'Onboarding' && clinic.stage === 'Onboarding')
      || (filter === 'Configuración' && clinic.stage === 'Configuración')
      || (filter === 'Activos' && clinic.stage === 'En producción');
    return matchesQuery && matchesFilter;
  }), [clinics, filter, query]);

  const replaceClinic = (updated) => setClinics((current) => current.some((clinic) => clinic.id === updated.id)
    ? current.map((clinic) => clinic.id === updated.id ? updated : clinic)
    : [updated, ...current]);

  const createClinic = async (body) => {
    setBusy(true);
    setActionError('');
    try {
      const { clinic: created } = await createInternalClinic(getToken, body);
      replaceClinic(created);
      setCreating(false);
      setSelectedId(created.id);
      try {
        const { clinic: provisioned } = await updateInternalClinic(getToken, {
          organizationId: created.id,
          action: 'start_configuration',
        });
        replaceClinic(provisioned);
      } catch (provisioningError) {
        setActionError(`La Location quedó creada, pero el agente no pudo provisionarse: ${provisioningError.message}`);
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const mutateClinic = async (body) => {
    setBusy(true);
    setActionError('');
    try {
      const { clinic } = await updateInternalClinic(getToken, { organizationId: selectedId, ...body });
      replaceClinic(clinic);
      if (body.action === 'manage_member') {
        const refreshed = await getInternalClinics(getToken);
        setClinics(refreshed.clinics);
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const removeClinic = async (confirmation) => {
    setBusy(true); setActionError('');
    try {
      await deleteInternalClinic(getToken, { organizationId: selectedId, confirmation });
      setClinics((current) => current.filter((clinic) => clinic.id !== selectedId));
      setSelectedId(null);
    } catch (error) { setActionError(error.message); }
    finally { setBusy(false); }
  };

  if (!loading && accessError) return <AccessDenied error={accessError} />;

  const agentsPending = clinics.filter((clinic) => !clinic.provisioningDraft?.retellAgentId).length;
  const onboarding = clinics.filter((clinic) => clinic.stage === 'Onboarding').length;
  const configuring = clinics.filter((clinic) => clinic.stage === 'Configuración').length;
  const live = clinics.filter((clinic) => clinic.stage === 'En producción').length;

  return (
    <main className="ops-shell">
      <header className="ops-topbar">
        <div className="ops-console-brand"><PortalBrand label="Admin Console" /><span className="ops-env"><i /> PROD</span></div>
        <nav><a href="/app"><ArrowLeft size={16} /> Ver producto</a><span>{user?.primaryEmailAddress?.emailAddress}</span><UserButton appearance={{ elements: { avatarBox: 'ops-user-avatar' } }} /></nav>
      </header>
      <nav className="ops-primary-nav" aria-label="Navegación de Admin Console">
        {['Resumen', 'Locations', 'Agentes', 'Actividad'].map((item) => <button type="button" className={section === item ? 'active' : ''} key={item} onClick={() => setSection(item)}>{item}</button>)}
      </nav>
      <div className="ops-layout">
        <section className="ops-heading"><div><p><TerminalSquare size={14} /> Internal operations / {section.toLowerCase()}</p><h1>{section === 'Resumen' ? 'Admin Console' : section}</h1><span>{section === 'Resumen' ? 'Estado comercial y operativo de AutiveX.' : section === 'Locations' ? 'Clientes, miembros, acceso y ciclo de vida.' : section === 'Agentes' ? 'Inventario y estado de agentes Retell.' : 'Auditoría reciente de operaciones.'}</span></div><button type="button" onClick={() => { setActionError(''); setCreating(true); }}><Plus size={18} /> Nueva Location</button></section>

        <section className="ops-system-strip" aria-label="Estado de infraestructura">
          <span><ShieldCheck size={15} /><b>Clerk</b><i>Identity active</i></span>
          <span><Database size={15} /><b>Supabase</b><i>Workspace store</i></span>
          <span><ServerCog size={15} /><b>Retell</b><i>Agent provisioning</i></span>
          <span className="ops-system-scope">Scope <code>production</code></span>
        </section>

        {section === 'Resumen' && <AdminOverview clinics={clinics} onOpenLocations={() => setSection('Locations')} />}

        {section === 'Locations' && <><section className="ops-stats">
          <StatCard label="Provisioning queue" value={agentsPending} detail="Locations sin agente Retell" tone="warning" icon={Settings2} />
          <StatCard label="Onboarding" value={onboarding} detail="Locations aún sin configurar" tone="paid" icon={CalendarCheck2} />
          <StatCard label="Staging" value={configuring} detail="Agentes en validación" tone="progress" icon={Settings2} />
          <StatCard label="Production" value={live} detail="Tenants activos" tone="live" icon={BadgeCheck} />
        </section>

        <section className="ops-queue">
          <header><div><h2>Tenant registry</h2><span>{clinics.length} records</span></div><div className="ops-tools"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tenant or owner…" /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Todos</option><option>Onboarding</option><option>Configuración</option><option>Activos</option></select></div></header>
          <div className="ops-table-head"><span>Location</span><span>Etapa</span><span>Usuarios</span><span>Antigüedad</span><span /></div>
          <div className="ops-clinic-list">
            {loading && <div className="ops-list-state"><LoaderCircle className="spin" size={22} /><span>Cargando expedientes…</span></div>}
            {!loading && visible.map((clinic) => <ClinicRow key={clinic.id} clinic={clinic} selected={clinic.id === selectedId} onClick={() => { setActionError(''); setSelectedId(clinic.id); }} />)}
            {!loading && visible.length === 0 && <div className="ops-list-state"><Building2 size={22} /><strong>No encontramos Locations.</strong><span>Ajusta la búsqueda o crea la primera Location.</span></div>}
          </div>
        </section></>}
        {section === 'Agentes' && <section className="ops-queue ops-simple-view"><header><div><h2>Agent inventory</h2><span>{clinics.filter((clinic) => clinic.provisioningDraft?.retellAgentId).length} configured</span></div></header><div className="ops-agent-grid">{clinics.map((clinic) => <button type="button" key={clinic.id} onClick={() => setSelectedId(clinic.id)}><ServerCog size={20} /><span><strong>{clinic.name}</strong><small>{clinic.provisioningDraft?.retellAgentId || 'Sin agente'}</small></span><i>{clinic.state.serviceStatus === 'live' ? 'Activo' : clinic.stage}</i></button>)}</div></section>}
        {section === 'Actividad' && <section className="ops-queue ops-simple-view"><header><div><h2>Audit trail</h2><span>Eventos recientes</span></div></header><div className="ops-activity-feed">{clinics.flatMap((clinic) => clinic.auditTrail.map((entry) => ({ ...entry, clinic: clinic.name }))).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 40).map((entry) => <div key={`${entry.clinic}-${entry.id}`}><i /><span><strong>{entry.clinic}</strong><small>{String(entry.action).replaceAll('_', ' ')} · {dateTime(entry.at)}</small></span></div>)}</div></section>}
      </div>
      {creating && <NewClientModal busy={busy} error={actionError} onClose={() => setCreating(false)} onCreate={createClinic} />}
      {selected && <ClinicDetail clinic={selected} clinics={clinics} busy={busy} error={actionError} onClose={() => setSelectedId(null)} onConfirmPayment={(payment) => mutateClinic({ action: 'confirm_payment', payment })} onSaveProvisioning={(provisioning) => mutateClinic({ action: 'save_provisioning', provisioning })} onAction={(action, confirmation) => mutateClinic({ action, confirmation })} onEdit={(location) => mutateClinic({ action: 'update_location', location })} onMember={(member) => mutateClinic({ action: 'manage_member', member })} onCalendar={(calendar) => mutateClinic({ action: 'save_calendar', calendar })} onAgentConfig={(agent) => mutateClinic({ action: 'update_agent_configuration', agent })} onAgentAdvanced={(advanced) => mutateClinic({ action: 'update_agent_advanced', advanced })} onStage={(stage) => mutateClinic({ action: 'override_stage', stage })} onBypass={(confirmation) => mutateClinic({ action: 'bypass_live', confirmation })} onDelete={removeClinic} />}
    </main>
  );
}
