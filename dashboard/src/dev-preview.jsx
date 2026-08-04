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
        }}
      />
    );
  }
  if (workspace.view === 'prospect_demo') return <ProspectPreview workspace={workspace} user={previewUser} />;
  return <ProspectOnboarding workspace={workspace} user={previewUser} getToken={async () => 'preview'} onComplete={setWorkspace} />;
}
