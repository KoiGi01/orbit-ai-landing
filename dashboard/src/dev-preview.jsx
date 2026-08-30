import React, { useState } from 'react';
import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarCheck2,
  ChevronRight,
  Plus,
  Search,
  Settings2,
} from 'lucide-react';
import { PortalBrand, ProspectOnboarding, ProspectPreview } from './workspace';
import { NewClientModal } from './internal-admin';

// ---------------------------------------------------------------------------
// Sample reads for the design preview.
//
// The preview account has no Clerk session, so /api/workspace answers
// `invalid_session` and Agenda and the voice picker can only ever render their
// error states -- which makes those screens impossible to review. This answers
// the calendar and voice-catalog reads with samples so the month grid, the day
// detail, the queue and the voice cards can be clicked through without a login
// or any environment variable.
//
// Scoped hard on purpose: it only installs when you explicitly opened
// `?preview=dashboard`, and the whole module is behind import.meta.env.DEV, so
// a normal `npm run dev:control` sign-in still talks to the real API.
// ---------------------------------------------------------------------------

const SAMPLE_APPOINTMENTS = [
  [0, 9, 0, 45, 'Ana Ruiz — Limpieza dental', 'agent'],
  [0, 11, 30, 30, 'Luis Mora — Valoración de implante', 'agent'],
  [0, 16, 0, 60, 'Junta de equipo', 'external'],
  [1, 10, 0, 45, 'Carmen Salas — Ortodoncia', 'agent'],
  [1, 13, 0, 30, 'Comida con proveedor', 'external'],
  [2, 9, 30, 60, 'Miguel Ángel Torres — Endodoncia', 'agent'],
  [2, 12, 0, 45, 'Rocío Beltrán — Limpieza dental', 'agent'],
  [2, 15, 0, 30, 'Sofía Navarro — Revisión', 'agent'],
  [2, 17, 0, 45, 'Diego Fuentes — Blanqueamiento', 'agent'],
  [5, 10, 30, 45, 'Paola Ibarra — Valoración', 'agent'],
  [6, 9, 0, 30, 'Entrega de material', 'external'],
  [9, 11, 0, 45, 'Héctor Ramos — Limpieza dental', 'agent'],
  [13, 16, 30, 30, 'Valentina Cruz — Retiro de brackets', 'agent'],
  [-3, 10, 0, 45, 'Jorge Lemus — Limpieza dental', 'agent'],
  [-8, 12, 0, 60, 'Revisión trimestral', 'external'],
  [-15, 9, 30, 45, 'Mariana Ochoa — Ortodoncia', 'agent'],
  [22, 11, 0, 45, 'Andrés Peña — Valoración', 'agent'],
  [31, 10, 0, 45, 'Lucía Herrera — Limpieza dental', 'agent'],
];

// Anchored on today so the grid always looks current, whenever you open it.
function buildSampleEvents() {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return SAMPLE_APPOINTMENTS.map(([offsetDays, hour, minute, minutes, summary, source], index) => {
    const start = new Date(midnight);
    start.setDate(start.getDate() + offsetDays);
    start.setHours(hour, minute, 0, 0);
    return {
      externalEventId: `preview-event-${index}`,
      summary,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + minutes * 60000).toISOString(),
      source,
    };
  });
}

// A slice of the real Retell catalog: both accents it uses for Spanish, the
// providers that actually ship those voices, and the two names that carry
// their own region ("es-ES", "Latin America").
const SAMPLE_VOICES = [
  { id: 'cartesia-Sofia', name: 'Sofia', provider: 'cartesia', accent: 'Mexican', gender: 'female', age: 'Middle Aged', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/customvoice-icon.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/cartesia-Sofia.mp3', recommended: true },
  { id: 'cartesia-Gaby', name: 'Gaby', provider: 'cartesia', accent: 'Mexican', gender: 'female', age: 'Young', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Gaby.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/cartesia-Gaby.mp3', recommended: false },
  { id: 'cartesia-Alejandro', name: 'Alejandro', provider: 'cartesia', accent: 'Mexican', gender: 'male', age: 'Young', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Alejandro.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/cartesia-Alejandro.mp3', recommended: false },
  { id: '11labs-Claudia', name: 'Claudia', provider: 'elevenlabs', accent: 'Mexican', gender: 'female', age: 'Middle Aged', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Claudia.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/11labs-Claudia.mp3', recommended: false },
  { id: '11labs-Santiago', name: 'Santiago (es-ES)', provider: 'elevenlabs', accent: 'Spanish', gender: 'male', age: 'Middle Aged', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Santiago.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/11labs-Santiago.mp3', recommended: false },
  { id: 'inworld-Itzel', name: 'Itzel', provider: 'inworld', accent: 'Mexican', gender: 'female', age: 'Young', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Itzel.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/inworld-Itzel.mp3', recommended: false },
  { id: 'inworld-Cuauhtemoc', name: 'Cuauhtemoc', provider: 'inworld', accent: 'Mexican', gender: 'male', age: 'Young', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Cuauhtemoc.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/inworld-Cuauhtemoc.mp3', recommended: false },
  { id: 'inworld-Lupita', name: 'Lupita', provider: 'inworld', accent: 'Spanish', gender: 'female', age: 'Young', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Lupita.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/inworld-Lupita.mp3', recommended: false },
  { id: 'minimax-Andrea', name: 'Andrea', provider: 'minimax', accent: 'Mexican', gender: 'female', age: 'Middle Aged', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Andrea.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/minimax-Andrea.mp3', recommended: false },
  { id: 'openai-Santiago', name: 'Santiago', provider: 'openai', accent: 'Spanish', gender: 'male', age: 'Middle Aged', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Santiago.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/openai-Santiago.mp3', recommended: false },
  { id: 'cartesia-Elena', name: 'Elena', provider: 'cartesia', accent: 'Spanish', gender: 'female', age: 'Middle Aged', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/customvoice-icon.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/cartesia-Elena.mp3', recommended: false },
  { id: 'cartesia-Hailey-Spanish-latin-america', name: 'Hailey - Spanish, Latin America', provider: 'cartesia', accent: 'Spanish', gender: 'female', age: 'Young', avatarUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/Hailey.png', previewUrl: 'https://retell-utils-public.s3.us-west-2.amazonaws.com/cartesia-Hailey-Spanish-latin-america.mp3', recommended: false },
];

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

function installSampleReads() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/api/workspace') && url.includes('resource=voices')) {
      return jsonResponse({ voices: SAMPLE_VOICES });
    }
    if (!url.includes('/api/workspace') || !url.includes('resource=calendar')) {
      return realFetch(input, init);
    }
    // Honour the requested window so paging between months behaves like the
    // real endpoint instead of dumping every sample event into every month.
    const params = new URLSearchParams(url.split('?')[1] || '');
    const from = params.get('from') ? Date.parse(params.get('from')) : -Infinity;
    const to = params.get('to') ? Date.parse(params.get('to')) : Infinity;
    const events = buildSampleEvents().filter((event) => {
      const at = Date.parse(event.startsAt);
      return at >= from && at <= to;
    });
    return jsonResponse({ connected: true, calendarId: 'muestra@group.calendar.google.com', events });
  };
}

if (import.meta.env.DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('preview') === 'dashboard') {
  installSampleReads();
}

const previewUser = {
  id: 'preview-user',
  preview: true,
  firstName: 'Camila',
  primaryEmailAddress: { emailAddress: 'camila@autivexai.com' },
};

const previewAccount = {
  user: { ...previewUser, fullName: 'Camila Méndez' },
  organization: {
    id: 'org_dashboard_preview',
    name: 'Clínica Dental Aurora',
    publicMetadata: { businessType: 'Clínica dental' },
  },
  membership: { role: 'org:admin' },
  // Without this the dashboard's data fetches threw on `getToken()` before
  // ever reaching the network, so every preview rendered the empty state and
  // nothing downstream of a request could be inspected. Returning a token
  // lets the requests actually go out: against a seeded local API they load
  // real data, and otherwise they fail honestly like they would in the app.
  getToken: async () => 'preview',
};

const previewProfile = {
  clinicName: 'Clínica Dental Aurora',
  city: 'Querétaro, Qro.',
  callGoals: ['new_patient', 'urgent', 'reschedule'],
  services: ['general', 'orthodontics', 'implants', 'urgent'],
  otherService: '',
  schedule: 'weekdays_saturday',
  customSchedule: '',
  appointmentOutcome: 'offer_demo_slots',
};

const previewWorkspace = {
  view: 'prospect_intake',
  organization: { id: 'org_preview', name: 'Mi clínica' },
  state: { billingStatus: 'unpaid', onboardingStatus: 'prospect_intake', serviceStatus: 'demo', profileComplete: false },
  profile: null,
};

const mockClinics = [
  ['Dental Norte', 'ana@dentalnorte.mx', 'Onboarding', 'Terminal Mercado Pago', 'Hace 2 h', 'DN'],
  ['Clínica Sonrisa Alta', 'direccion@sonrisaalta.mx', 'Prospecto en demo', 'Sin pago', 'Hace 6 h', 'SA'],
  ['Studio Oral MX', 'hola@studiooral.mx', 'Configuración', 'Transferencia / SPEI', 'Hace 1 día', 'SO'],
  ['Odontología Central', 'admin@odontologiacentral.mx', 'En producción', 'Link de Mercado Pago', 'Hace 4 días', 'OC'],
];

function MockStat({ label, value, detail, className, Icon }) {
  return <article className={`ops-stat ${className}`}><span><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function AdminPreview() {
  const [creating, setCreating] = useState(false);
  return (
    <main className="ops-shell">
      <header className="ops-topbar"><PortalBrand label="Operaciones" /><nav><span>camila@autivexai.com</span><span className="portal-static-avatar">CM</span></nav></header>
      <div className="ops-layout">
        <section className="ops-heading"><div><p>Control interno · Solo AutiveX</p><h1>Activa clientes sin perder el control.</h1><span>Un pago verificado abre onboarding; nunca producción automáticamente.</span></div><button type="button" onClick={() => setCreating(true)}><Plus size={18} /> Crear cliente pagado</button></section>
        <section className="ops-stats">
          <MockStat label="Cobros por revisar" value="3" detail="Prospectos registrados" className="warning" Icon={Banknote} />
          <MockStat label="Onboarding" value="2" detail="Pagados, aún sin configurar" className="paid" Icon={CalendarCheck2} />
          <MockStat label="Configurando" value="1" detail="Agente o integraciones" className="progress" Icon={Settings2} />
          <MockStat label="En producción" value="4" detail="Servicio activo" className="live" Icon={BadgeCheck} />
        </section>
        <section className="ops-queue">
          <header><div><h2>Clínicas</h2><span>10 expedientes</span></div><div className="ops-tools"><label><Search size={16} /><input readOnly placeholder="Clínica, correo o referencia" /></label><select defaultValue="Todos"><option>Todos</option></select></div></header>
          <div className="ops-table-head"><span>Clínica</span><span>Etapa</span><span>Método</span><span>Antigüedad</span><span /></div>
          <div className="ops-clinic-list">
            {mockClinics.map(([name, email, stage, method, age, initials]) => <button type="button" className="ops-clinic-row" key={name}><span className="ops-clinic-mark">{initials}</span><span className="ops-clinic-main"><strong>{name}</strong><small>{email}</small></span><span className={`ops-stage ${stage === 'En producción' ? 'live' : stage === 'Configuración' ? 'progress' : stage === 'Onboarding' ? 'paid' : 'demo'}`}><i /> {stage}</span><span className="ops-method">{method}</span><time>{age}</time><ChevronRight size={17} /></button>)}
          </div>
        </section>
      </div>
      {creating && <NewClientModal busy={false} error="" onClose={() => setCreating(false)} onCreate={() => setCreating(false)} />}
    </main>
  );
}

export default function DevPreview({ screen, DashboardComponent }) {
  const [workspace, setWorkspace] = useState(screen === 'preview'
    ? { ...previewWorkspace, view: 'prospect_demo', profile: previewProfile, state: { ...previewWorkspace.state, profileComplete: true } }
    : previewWorkspace);

  if (screen === 'admin') return <AdminPreview />;
  if (screen === 'dashboard' && DashboardComponent) {
    return (
      <DashboardComponent
        account={previewAccount}
        workspace={{
          view: 'live',
          organization: { id: previewAccount.organization.id, name: previewAccount.organization.name },
          state: { billingStatus: 'verified', onboardingStatus: 'active', serviceStatus: 'live' },
          // Service names match the sample appointment titles above, so the
          // calendar actually demonstrates the per-service colouring instead
          // of painting every appointment the same default coral.
          profile: {
            clinicName: 'Clínica Dental Aurora',
            city: 'Querétaro, Qro.',
            industry: 'Clínica dental',
            businessHours: 'Lunes a viernes, 9:00 a 19:00',
            services: [
              { name: 'Limpieza dental', duration: '45 min', price: '$800', details: 'Incluye revisión inicial', color: 'pavo' },
              { name: 'Valoración de implante', duration: '30 min', price: '$500', details: '', color: 'mandarina' },
              { name: 'Ortodoncia', duration: '45 min', price: '$1,500', details: '', color: 'uva' },
              { name: 'Endodoncia', duration: '60 min', price: '$2,400', details: '', color: 'tomate' },
              { name: 'Blanqueamiento', duration: '45 min', price: '$1,900', details: '', color: 'platano' },
              { name: 'Revisión', duration: '30 min', price: '', details: '', color: 'albahaca' },
            ],
          },
        }}
      />
    );
  }
  if (workspace.view === 'prospect_demo') return <ProspectPreview workspace={workspace} user={previewUser} />;
  return <ProspectOnboarding workspace={workspace} user={previewUser} getToken={async () => 'preview'} onComplete={setWorkspace} />;
}
