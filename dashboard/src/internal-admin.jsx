import React, { useEffect, useMemo, useState } from 'react';
import { UserButton, useAuth, useUser } from '@clerk/react';
import {
  ArrowLeft,
  ArrowRight,
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
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import {
  createInternalClinic,
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
  ['google_calendar', 'Google Calendar'],
  ['calendly', 'Calendly'],
  ['manual', 'Confirmación manual'],
];

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
  needs_onboarding: ['schedule_onboarding', 'Marcar onboarding agendado', CalendarCheck2],
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
  internalNotes: '',
  source: 'local_sales',
  payment: EMPTY_PAYMENT,
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
  return (
    <button type="button" className={`ops-clinic-row${selected ? ' selected' : ''}`} onClick={onClick}>
      <span className="ops-clinic-mark">{clinic.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
      <span className="ops-clinic-main"><strong>{clinic.name}</strong><small>{clinic.owner.email || 'Sin correo asociado'}</small></span>
      <span className={`ops-stage ${STAGE_TONES[clinic.stage] || 'neutral'}`}><i /> {clinic.stage}</span>
      <span className="ops-method">{clinic.payment ? PAYMENT_METHODS.find(([key]) => key === clinic.payment.method)?.[1] || clinic.payment.method : 'Sin pago'}</span>
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
      clinicName: form.clinicName,
      email: form.email,
      city: form.city,
      source: form.source,
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
        internalNotes: form.internalNotes,
      },
      payment: paymentPayload(form.payment),
    });
  };

  return (
    <ModalShell title="Crear acceso pagado" eyebrow="Alta de cliente local" onClose={onClose} wide>
      <form className="ops-modal-body new-client-form" onSubmit={submit}>
        <div className="ops-form-section">
          <div className="ops-section-heading"><span>01</span><div><strong>Negocio y propietario</strong><p>Crearemos la organización y enviaremos una invitación segura al propietario.</p></div></div>
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
          </div>
        </div>
        <div className="ops-form-section">
          <div className="ops-section-heading"><span>02</span><div><strong>Operación que debe aprender el agente</strong><p>Esta información formará el expediente inicial y la configuración del workspace.</p></div></div>
          <div className="ops-form-grid">
            <label className="ops-form-wide"><span>Qué hace el negocio</span><textarea required value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Describe en lenguaje simple qué ofrece, a quién atiende y qué no debe prometer el agente." /></label>
            <label><span>Horarios</span><textarea required value={form.businessHours} onChange={(event) => update('businessHours', event.target.value)} placeholder="Lun–Vie 9:00–18:00; Sáb 9:00–14:00" /></label>
            <label><span>Agenda actual</span><select value={form.schedulingProvider} onChange={(event) => update('schedulingProvider', event.target.value)}>{SCHEDULING_PROVIDERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label><span>Servicios principales</span><textarea required value={form.services} onChange={(event) => update('services', event.target.value)} placeholder="Consulta general, implantes, urgencias" /></label>
            <label><span>Motivos de llamada</span><textarea required value={form.callGoals} onChange={(event) => update('callGoals', event.target.value)} placeholder="Agendar, precios, reprogramar, urgencias" /></label>
            <label className="ops-form-wide"><span>Notas internas · opcional</span><textarea value={form.internalNotes} onChange={(event) => update('internalNotes', event.target.value)} placeholder="Restricciones, acuerdos comerciales o contexto que solo debe ver AutiveX." /></label>
          </div>
        </div>
        <div className="ops-form-section">
          <div className="ops-section-heading"><span>03</span><div><strong>Pago que tú ya confirmaste</strong><p>Registrar una factura enviada no basta; usa esta acción únicamente cuando el dinero esté acreditado.</p></div></div>
          <PaymentFields value={form.payment} onChange={(payment) => update('payment', payment)} />
        </div>
        {error && <p className="ops-form-error"><CircleAlert size={16} /> {error}</p>}
        <footer><button type="button" className="ops-button secondary" onClick={onClose}>Cancelar</button><button type="submit" className="ops-button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Confirmar pago y crear acceso</button></footer>
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

  if (clinic.state.billingStatus !== 'verified') return null;
  if (clinic.state.serviceStatus === 'live') {
    return <section className="ops-action-card live-card"><div className="ops-action-icon"><BadgeCheck size={21} /></div><div className="ops-action-copy"><p>Servicio activo</p><h3>La clínica está en producción.</h3><span>Agente, prueba, webhook y fallback quedaron verificados antes de la activación.</span></div></section>;
  }
  if (!config) return null;

  const [action, label, Icon] = config;
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

function ClinicDetail({ clinic, busy, error, onClose, onConfirmPayment, onSaveProvisioning, onAction }) {
  const profile = clinic.profile;
  return (
    <ModalShell title={clinic.name} eyebrow={`Expediente · ${clinic.stage}`} onClose={onClose} wide>
      <div className="ops-detail-body">
        <div className="ops-detail-summary">
          <article><span><UserRound size={18} /></span><div><small>Propietario</small><strong>{clinic.owner.name || 'Por confirmar'}</strong><p>{clinic.owner.email || 'Sin correo asociado'}</p></div></article>
          <article><span><MapPin size={18} /></span><div><small>Ciudad</small><strong>{profile?.city || 'Por confirmar'}</strong><p>{profile ? 'Capturada en Preview' : 'Pendiente de onboarding'}</p></div></article>
          <article><span><Banknote size={18} /></span><div><small>Cobro</small><strong>{clinic.payment ? moneyFromCents(clinic.payment.amountCents) : 'No verificado'}</strong><p>{clinic.payment ? PAYMENT_METHODS.find(([key]) => key === clinic.payment.method)?.[1] : 'Requiere revisión manual'}</p></div></article>
        </div>

        {clinic.state.billingStatus === 'verified' && <ProvisioningForm clinic={clinic} busy={busy} error={error} onSave={onSaveProvisioning} />}

        {clinic.state.billingStatus !== 'verified'
          ? <ConfirmPayment clinic={clinic} busy={busy} error={error} onConfirm={onConfirmPayment} />
          : <NextAction clinic={clinic} busy={busy} error={error} onAction={onAction} />}

        {clinic.payment && <section className="ops-record-section"><header><Banknote size={17} /><h3>Pago verificado</h3></header><dl><div><dt>Monto</dt><dd>{moneyFromCents(clinic.payment.amountCents)}</dd></div><div><dt>Referencia</dt><dd>{clinic.payment.reference}</dd></div><div><dt>Fecha del pago</dt><dd>{dateTime(clinic.payment.paidAt)}</dd></div><div><dt>Verificado</dt><dd>{dateTime(clinic.payment.verifiedAt)}</dd></div></dl></section>}

        {profile && <section className="ops-record-section"><header><Building2 size={17} /><h3>Configuración del negocio</h3></header><dl><div><dt>Industria</dt><dd>{profile.industry || 'Por confirmar'}</dd></div><div><dt>Contacto</dt><dd>{profile.ownerPhone || clinic.owner.email || '—'}</dd></div><div><dt>Servicios</dt><dd>{profile.services?.join(', ') || '—'}</dd></div><div><dt>Motivos de llamada</dt><dd>{profile.callGoals?.join(', ') || '—'}</dd></div><div><dt>Horario</dt><dd>{profile.businessHours || profile.customSchedule || profile.schedule || '—'}</dd></div><div><dt>Agenda</dt><dd>{SCHEDULING_PROVIDERS.find(([key]) => key === profile.schedulingProvider)?.[1] || profile.appointmentOutcome || 'Por definir'}</dd></div>{profile.description && <div className="ops-record-wide"><dt>Descripción</dt><dd>{profile.description}</dd></div>}{profile.internalNotes && <div className="ops-record-wide"><dt>Notas internas</dt><dd>{profile.internalNotes}</dd></div>}</dl></section>}

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
      const { clinic } = await createInternalClinic(getToken, body);
      replaceClinic(clinic);
      setCreating(false);
      setSelectedId(clinic.id);
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
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!loading && accessError) return <AccessDenied error={accessError} />;

  const unpaid = clinics.filter((clinic) => clinic.state.billingStatus !== 'verified').length;
  const onboarding = clinics.filter((clinic) => clinic.stage === 'Onboarding').length;
  const configuring = clinics.filter((clinic) => clinic.stage === 'Configuración').length;
  const live = clinics.filter((clinic) => clinic.stage === 'En producción').length;

  return (
    <main className="ops-shell">
      <header className="ops-topbar">
        <PortalBrand label="Operaciones" />
        <nav><a href="/app"><ArrowLeft size={16} /> Ver producto</a><span>{user?.primaryEmailAddress?.emailAddress}</span><UserButton appearance={{ elements: { avatarBox: 'ops-user-avatar' } }} /></nav>
      </header>
      <div className="ops-layout">
        <section className="ops-heading"><div><p>Control interno · Solo AutiveX</p><h1>Activa clientes sin perder el control.</h1><span>Un pago verificado abre onboarding; nunca producción automáticamente.</span></div><button type="button" onClick={() => { setActionError(''); setCreating(true); }}><Plus size={18} /> Crear cliente pagado</button></section>

        <section className="ops-stats">
          <StatCard label="Cobros por revisar" value={unpaid} detail="Prospectos registrados" tone="warning" icon={Banknote} />
          <StatCard label="Onboarding" value={onboarding} detail="Pagados, aún sin configurar" tone="paid" icon={CalendarCheck2} />
          <StatCard label="Configurando" value={configuring} detail="Agente o integraciones" tone="progress" icon={Settings2} />
          <StatCard label="En producción" value={live} detail="Servicio activo" tone="live" icon={BadgeCheck} />
        </section>

        <section className="ops-queue">
          <header><div><h2>Clínicas</h2><span>{clinics.length} expedientes</span></div><div className="ops-tools"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Clínica, correo o referencia" /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Todos</option><option>Por cobrar</option><option>Onboarding</option><option>Configuración</option><option>Activos</option></select></div></header>
          <div className="ops-table-head"><span>Clínica</span><span>Etapa</span><span>Método</span><span>Antigüedad</span><span /></div>
          <div className="ops-clinic-list">
            {loading && <div className="ops-list-state"><LoaderCircle className="spin" size={22} /><span>Cargando expedientes…</span></div>}
            {!loading && visible.map((clinic) => <ClinicRow key={clinic.id} clinic={clinic} selected={clinic.id === selectedId} onClick={() => { setActionError(''); setSelectedId(clinic.id); }} />)}
            {!loading && visible.length === 0 && <div className="ops-list-state"><Building2 size={22} /><strong>No encontramos clínicas.</strong><span>Ajusta la búsqueda o crea el primer cliente pagado.</span></div>}
          </div>
        </section>
      </div>
      {creating && <NewClientModal busy={busy} error={actionError} onClose={() => setCreating(false)} onCreate={createClinic} />}
      {selected && <ClinicDetail clinic={selected} busy={busy} error={actionError} onClose={() => setSelectedId(null)} onConfirmPayment={(payment) => mutateClinic({ action: 'confirm_payment', payment })} onSaveProvisioning={(provisioning) => mutateClinic({ action: 'save_provisioning', provisioning })} onAction={(action, confirmation) => mutateClinic({ action, confirmation })} />}
    </main>
  );
}
