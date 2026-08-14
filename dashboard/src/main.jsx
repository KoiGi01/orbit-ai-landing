import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OrganizationSwitcher, UserButton } from '@clerk/react';
import '@fontsource-variable/instrument-sans';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  FileText,
  Gauge,
  Headphones,
  LayoutDashboard,
  MessageSquareText,
  MoreHorizontal,
  PhoneCall,
  PhoneOutgoing,
  Play,
  PlugZap,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import './styles.css';
import './brand-theme.css';
import DashboardAuth from './auth';
import { CallExperience } from './workspace';
import { getWorkspaceVoices, updateWorkspaceVoice } from './control-api';

const primaryNav = [
  { label: 'Hoy', icon: LayoutDashboard },
  { label: 'Conversaciones', icon: PhoneCall },
  { label: 'Oportunidades', icon: Users, badge: 4 },
  { label: 'Mi recepcionista', icon: Headphones },
];

const secondaryNav = [
  { label: 'Conexiones', icon: PlugZap },
  { label: 'Uso y plan', icon: Gauge },
];

const followups = [
  {
    id: 1,
    initials: 'CM',
    name: 'Carlos Mendoza',
    detail: 'Urgencia dental',
    note: 'Dolor agudo desde anoche. Solicita una cita hoy.',
    time: 'Hace 34 min',
    priority: 'Urgente',
    priorityTone: 'urgent',
    action: 'Devolver llamada',
    phone: '+52 55 4182 9034',
    summary: 'Pidió atención hoy. La llamada terminó mientras se validaba un espacio de urgencia.',
    events: ['Llamada recibida · 18:08', 'Urgencia detectada · 18:10', 'Transferencia sin respuesta · 18:12'],
  },
  {
    id: 2,
    initials: 'MR',
    name: 'Mariana Ruiz',
    detail: 'Evaluación de implante',
    note: 'La transferencia al equipo no tuvo respuesta.',
    time: 'Hace 2 h',
    priority: 'Transferencia',
    priorityTone: 'warning',
    action: 'Revisar llamada',
    phone: '+52 55 3017 1182',
    summary: 'Tiene interés en un implante unitario y disponibilidad por las tardes.',
    events: ['Llamada recibida · 16:21', 'Datos capturados · 16:24', 'Transferencia sin respuesta · 16:27'],
  },
  {
    id: 3,
    initials: 'SP',
    name: 'Sofía Pérez',
    detail: 'Primera cita de ortodoncia',
    note: 'Eligió horario; falta confirmar disponibilidad.',
    time: 'Ayer',
    priority: 'Confirmar hoy',
    priorityTone: 'today',
    action: 'Confirmar cita',
    phone: '+52 55 6821 4409',
    summary: 'Prefiere el lunes a las 17:30. El calendario tardó en responder durante la llamada.',
    events: ['Llamada recibida · ayer, 17:42', 'Horario elegido · 17:46', 'Confirmación pendiente · 17:47'],
  },
  {
    id: 4,
    initials: 'AT',
    name: 'Andrea Torres',
    detail: 'Cambio de cita',
    note: 'Solicitó mover su cita del lunes al miércoles.',
    time: 'Ayer',
    priority: 'Seguimiento',
    priorityTone: 'normal',
    action: 'Ver solicitud',
    phone: '+52 55 7740 2381',
    summary: 'La cita original sigue reservada hasta que el equipo apruebe el cambio.',
    events: ['Llamada recibida · ayer, 12:14', 'Cambio solicitado · 12:17', 'En espera del equipo · 12:18'],
  },
];

const reasons = [
  { name: 'Tratamiento nuevo', total: 42, booked: 24, handled: 12, transferred: 3, pending: 3 },
  { name: 'Información general', total: 34, booked: 0, handled: 30, transferred: 2, pending: 2 },
  { name: 'Cita existente', total: 18, booked: 0, handled: 15, transferred: 2, pending: 1 },
  { name: 'Hablar con el equipo', total: 15, booked: 0, handled: 1, transferred: 11, pending: 3 },
  { name: 'Otros motivos', total: 19, booked: 0, handled: 16, transferred: 2, pending: 1 },
];

const reasonsByPeriod = {
  Hoy: reasons,
  '7 días': [
    { name: 'Tratamiento nuevo', total: 226, booked: 131, handled: 67, transferred: 14, pending: 14 },
    { name: 'Información general', total: 181, booked: 0, handled: 165, transferred: 9, pending: 7 },
    { name: 'Cita existente', total: 110, booked: 0, handled: 94, transferred: 11, pending: 5 },
    { name: 'Hablar con el equipo', total: 89, booked: 0, handled: 10, transferred: 65, pending: 14 },
    { name: 'Otros motivos', total: 78, booked: 0, handled: 69, transferred: 5, pending: 4 },
  ],
  '30 días': [
    { name: 'Tratamiento nuevo', total: 894, booked: 507, handled: 281, transferred: 52, pending: 54 },
    { name: 'Información general', total: 735, booked: 0, handled: 665, transferred: 38, pending: 32 },
    { name: 'Cita existente', total: 451, booked: 0, handled: 391, transferred: 39, pending: 21 },
    { name: 'Hablar con el equipo', total: 362, booked: 0, handled: 44, transferred: 264, pending: 54 },
    { name: 'Otros motivos', total: 306, booked: 0, handled: 268, transferred: 22, pending: 16 },
  ],
};

const analyticsByPeriod = {
  Hoy: {
    calls: 128,
    inbound: 136,
    noWait: '93%',
    noWaitCount: 126,
    noWaitTrend: '+3.2 pts',
    booked: 24,
    bookedTrend: '+8 vs. ayer',
    intent: 42,
    conversion: '57%',
    duration: '6:18',
    durationTrend: '−42 s',
    comparison: '+12%',
    comparisonLabel: 'vs. ayer',
    rangeLabel: 'Hoy · 07:00–18:52',
    chart: {
      title: 'Actividad por hora',
      caption: 'Conteo de llamadas completadas · 18:00 es parcial',
      points: [
        { label: '07:00', value: 4 }, { label: '08:00', value: 6 },
        { label: '09:00', value: 8 }, { label: '10:00', value: 9 },
        { label: '11:00', value: 11 }, { label: '12:00', value: 10 },
        { label: '13:00', value: 9 }, { label: '14:00', value: 12 },
        { label: '15:00', value: 14 }, { label: '16:00', value: 16 },
        { label: '17:00', value: 17 },
        { label: '18:00*', fullLabel: '18:00–18:52', value: 12, partial: true },
      ],
    },
  },
  '7 días': {
    calls: 684,
    inbound: 712,
    noWait: '94%',
    noWaitCount: 669,
    noWaitTrend: '+1.8 pts',
    booked: 131,
    bookedTrend: '+19 vs. 7 días anteriores',
    intent: 226,
    conversion: '58%',
    duration: '5:54',
    durationTrend: '−31 s',
    comparison: '+8%',
    comparisonLabel: 'vs. 7 días anteriores',
    rangeLabel: '25–31 de julio',
    chart: {
      title: 'Actividad por día',
      caption: 'Conteo diario · Hoy incluye hasta las 18:52',
      points: [
        { label: 'Sáb 25', value: 85 }, { label: 'Dom 26', value: 91 },
        { label: 'Lun 27', value: 88 }, { label: 'Mar 28', value: 104 },
        { label: 'Mié 29', value: 97 }, { label: 'Jue 30', value: 112 },
        { label: 'Hoy*', fullLabel: 'Vie 31 · hasta 18:52', value: 107, partial: true },
      ],
    },
  },
  '30 días': {
    calls: 2748,
    inbound: 2841,
    noWait: '94%',
    noWaitCount: 2671,
    noWaitTrend: '+2.1 pts',
    booked: 507,
    bookedTrend: '+61 vs. 30 días anteriores',
    intent: 894,
    conversion: '57%',
    duration: '5:47',
    durationTrend: '−38 s',
    comparison: '+14%',
    comparisonLabel: 'vs. 30 días anteriores',
    rangeLabel: '1–31 de julio',
    chart: {
      title: 'Actividad por semana',
      caption: 'Bloques del mes · el último incluye hasta hoy a las 18:52',
      points: [
        { label: '1–6 jul', value: 512 }, { label: '7–12', value: 548 },
        { label: '13–18', value: 566 }, { label: '19–24', value: 590 },
        { label: '25–31*', fullLabel: '25–31 jul · hasta 18:52', value: 532, partial: true },
      ],
    },
  },
};

const appointments = [
  { time: '09:30', name: 'Lucía Hernández', service: 'Limpieza', state: 'Confirmada' },
  { time: '11:00', name: 'Tomás Varela', service: 'Valoración', state: 'Confirmada' },
  { time: '13:30', name: 'Elena Ríos', service: 'Implante', state: 'Por confirmar' },
  { time: '16:00', name: 'Diego Lozano', service: 'Ortodoncia', state: 'Confirmada' },
  { time: '17:30', name: 'Sofía Pérez', service: 'Primera cita', state: 'Pendiente' },
];

const recentCalls = [
  { taskId: 1, name: 'Carlos Mendoza', time: '18:08', reason: 'Urgencia dental', duration: '4:16', result: 'Requiere atención', tone: 'urgent' },
  { name: 'Paola Jiménez', time: '17:52', reason: 'Tratamiento nuevo', duration: '5:42', result: 'Cita creada', tone: 'success' },
  { name: 'Mario Castillo', time: '17:31', reason: 'Información general', duration: '2:18', result: 'Resuelta', tone: 'neutral' },
  { name: 'Laura Campos', time: '17:04', reason: 'Tratamiento nuevo', duration: '6:03', result: 'Cita creada', tone: 'success' },
  { name: 'Fernanda Ortiz', time: '16:38', reason: 'Cita existente', duration: '3:29', result: 'Transferida', tone: 'info' },
];

const moduleCopy = {
  Conversaciones: {
    eyebrow: 'Bitácora',
    title: 'Cada llamada, con todo su contexto.',
    description: 'Busca, escucha y entiende qué decidió la recepcionista en cada conversación.',
  },
  Oportunidades: {
    eyebrow: 'Seguimiento comercial',
    title: 'Las conversaciones que pueden convertirse.',
    description: 'Prospectos, citas y próximos pasos en un solo flujo de trabajo.',
  },
  'Mi recepcionista': {
    eyebrow: 'Servicio administrado',
    title: 'Así atiende Lucía cuando suena el teléfono.',
    description: 'Disponibilidad, conocimiento y reglas de transferencia de tu recepcionista.',
  },
  Conexiones: {
    eyebrow: 'Sistemas conectados',
    title: 'El recorrido de cada dato.',
    description: 'Calendario, telefonía y mensajería trabajando como una sola operación.',
  },
  'Uso y plan': {
    eyebrow: 'Capacidad',
    title: 'Uso predecible, sin sorpresas.',
    description: 'Consumo actual, proyección mensual y margen disponible para crecer.',
  },
};

function useDialogFocus() {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    if (!dialog) return undefined;

    const focusableSelector = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusable = [...dialog.querySelectorAll(focusableSelector)];
    focusable[0]?.focus();

    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const available = [...dialog.querySelectorAll(focusableSelector)];
      if (!available.length) return;
      const first = available[0];
      const last = available[available.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', trapFocus);
    return () => {
      dialog.removeEventListener('keydown', trapFocus);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return dialogRef;
}

function createCallRecord(call) {
  const initials = call.name.split(' ').slice(0, 2).map((part) => part[0]).join('');
  return {
    id: `call-${call.name}-${call.time}`,
    isCallRecord: true,
    initials,
    name: call.name,
    detail: call.reason,
    note: `Resultado registrado: ${call.result}.`,
    time: call.time,
    duration: call.duration,
    priority: call.result,
    phone: `Llamada de las ${call.time}`,
    summary: `Conversación de ${call.duration} sobre ${call.reason.toLowerCase()}. Abre la grabación para revisar todo el contexto.`,
    events: [`Llamada recibida · ${call.time}`, `${call.result} · al finalizar`],
  };
}

function getAccountIdentity(account) {
  const user = account?.user;
  const organization = account?.organization;
  const fullName = user?.fullName
    || [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    || user?.primaryEmailAddress?.emailAddress?.split('@')[0]
    || 'Administrador';
  const firstName = user?.firstName || fullName.split(' ')[0];
  const clinicName = organization?.name || user?.publicMetadata?.clinicName || 'Tu clínica';
  const clinicType = organization?.publicMetadata?.businessType || 'Clínica dental';
  const initials = fullName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const clinicInitials = clinicName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const isAdmin = account?.membership?.role === 'org:admin';
  const isPreview = user?.preview === true;
  const role = isAdmin ? 'Administración' : 'Equipo de la clínica';

  return { fullName, firstName, clinicName, clinicType, initials, clinicInitials, role, isAdmin, isPreview };
}

function getDashboardDataMode(workspace) {
  const serviceIsLive = workspace?.view === 'live'
    || workspace?.state?.serviceStatus === 'live';

  // This dashboard still renders the local showcase dataset below. A live
  // service state is intentionally not treated as proof that analytics are
  // connected; that requires a separate, explicit data-source contract.
  return {
    isDemo: true,
    serviceIsLive,
    serviceStatus: workspace?.state?.serviceStatus || 'unknown',
  };
}

function App({ account, workspace }) {
  const identity = getAccountIdentity(account);
  const dataMode = useMemo(() => getDashboardDataMode(workspace), [workspace]);
  const [active, setActive] = useState('Hoy');
  const [period, setPeriod] = useState('Hoy');
  const [tasks, setTasks] = useState(followups);
  const [taskFilter, setTaskFilter] = useState('Todas');
  const [selectedTask, setSelectedTask] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [testCallOpen, setTestCallOpen] = useState(false);
  const testProfile = workspace?.profile || { clinicName: identity.clinicName };
  const testScenario = {
    key: 'workspace_browser_test',
    label: 'Llamada libre de prueba',
    description: `Prueba privada del agente configurado para ${identity.clinicName}.`,
  };

  const toast = (message, action = null) => {
    setNotice({ message, action });
    window.clearTimeout(window.__autivexToast);
    window.__autivexToast = window.setTimeout(() => setNotice(null), action ? 12000 : 3200);
  };

  const navigate = (label) => {
    if (!identity.isAdmin && secondaryNav.some((item) => item.label === label)) return;
    setActive(label);
    setMoreOpen(false);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const resolveTask = (task) => {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setSelectedTask(null);
    toast(`Pendiente resuelto: ${task.name}`, {
      label: 'Deshacer',
      onClick: () => {
        setTasks((current) => [...current.filter((item) => item.id !== task.id), task]
          .sort((a, b) => followups.findIndex((item) => item.id === a.id) - followups.findIndex((item) => item.id === b.id)));
        toast(`Pendiente restaurado: ${task.name}`);
      },
    });
  };

  const startTask = (task) => {
    const updated = {
      ...task,
      assigned: task.assigned || identity.fullName,
      inProgress: true,
      events: [...task.events, `${task.action} iniciada · ahora`],
    };
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    setSelectedTask(updated);
    toast(`${task.action} iniciada para ${task.name}`);
  };

  const assignTask = (task) => {
    const updated = { ...task, assigned: identity.fullName };
    setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
    setSelectedTask(updated);
    toast(`${task.name} fue asignado a ${identity.firstName}`);
  };

  const selectTask = (task) => {
    setStatusOpen(false);
    setAssistantOpen(false);
    setMoreOpen(false);
    setSelectedTask(task);
  };

  const openCommand = () => {
    if (document.querySelector('[aria-modal="true"]')) return;
    setStatusOpen(false);
    setAssistantOpen(false);
    setCommandOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if ((event.key === '/' && !isTyping) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        if (!document.querySelector('[aria-modal="true"]')) {
          setStatusOpen(false);
          setAssistantOpen(false);
          setCommandOpen(true);
        }
      }
      if (event.key === 'Escape') {
        if (document.querySelector('.command-palette')) setCommandOpen(false);
        else if (document.querySelector('.mobile-more-sheet')) setMoreOpen(false);
        else if (document.querySelector('.task-drawer')) setSelectedTask(null);
        else if (document.querySelector('.ava-panel')) setAssistantOpen(false);
        else if (document.querySelector('.status-popover')) setStatusOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const overlayOpen = Boolean(selectedTask || commandOpen || moreOpen);
    if (!overlayOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selectedTask, commandOpen, moreOpen]);

  useEffect(() => {
    if (!identity.isAdmin && secondaryNav.some((item) => item.label === active)) setActive('Hoy');
  }, [active, identity.isAdmin]);

  const blockingOverlayOpen = Boolean(selectedTask || commandOpen || moreOpen);

  return (
    <div className="app-shell">
      <div className="app-content" inert={blockingOverlayOpen ? true : undefined} aria-hidden={blockingOverlayOpen ? true : undefined}>
        <Sidebar active={active} taskCount={tasks.length} identity={identity} dataMode={dataMode} onNavigate={navigate} />
        <div className="workspace">
          <Topbar
            active={active}
            clinicName={identity.clinicName}
            dataMode={dataMode}
            statusOpen={statusOpen}
            onToggleStatus={() => setStatusOpen((value) => !value)}
            onSearch={openCommand}
            onAction={toast}
          />
          {active === 'Hoy' ? (
            <Dashboard
              period={period}
              onPeriod={setPeriod}
              taskFilter={taskFilter}
              tasks={tasks}
              onTaskFilter={setTaskFilter}
              onSelectTask={selectTask}
              onNavigate={navigate}
              onAction={toast}
              firstName={identity.firstName}
              isAdmin={identity.isAdmin}
              dataMode={dataMode}
            />
          ) : (
            <ModulePage title={active} tasks={tasks} clinicName={identity.clinicName} dataMode={dataMode} profile={workspace?.profile} connections={workspace?.connections} getToken={account.getToken} isAdmin={identity.isAdmin} onSelectTask={selectTask} onAction={toast} onTestAgent={() => setTestCallOpen(true)} />
          )}
        </div>

        <MobileNav active={active} onNavigate={navigate} onMore={() => { setAssistantOpen(false); setStatusOpen(false); setMoreOpen(true); }} />
        <AvaButton open={assistantOpen} onToggle={() => setAssistantOpen((value) => !value)} />
        {assistantOpen && <AvaPanel tasks={tasks} dataMode={dataMode} onClose={() => setAssistantOpen(false)} onNavigate={navigate} onAction={toast} />}
      </div>
      {selectedTask && <TaskDrawer task={selectedTask} dataMode={dataMode} onClose={() => setSelectedTask(null)} onResolve={resolveTask} onStart={startTask} onAssign={assignTask} />}
      {commandOpen && <CommandPalette tasks={tasks} isAdmin={identity.isAdmin} onClose={() => setCommandOpen(false)} onNavigate={navigate} onSelectTask={selectTask} />}
      {moreOpen && <MobileMoreSheet active={active} isAdmin={identity.isAdmin} onClose={() => setMoreOpen(false)} onNavigate={navigate} />}
      {testCallOpen && <CallExperience profile={testProfile} scenario={testScenario} getToken={account.getToken} onClose={() => setTestCallOpen(false)} />}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {notice && <div className="toast"><Check size={16} aria-hidden="true" /><span>{notice.message}</span>{notice.action && <button type="button" onClick={() => { const action = notice.action; setNotice(null); action.onClick(); }}>{notice.action.label}</button>}</div>}
      </div>
    </div>
  );
}

function Sidebar({ active, taskCount, identity, dataMode, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <span className="brand-symbol" aria-hidden="true"><img src="/autivex-mark.png" alt="" /></span>
        <strong className="brand-name">AutiveX</strong>
        <span className="brand-product">Control</span>
      </div>

      <div className="clinic-switcher">
        <div className="clinic-switcher-visual" aria-hidden="true">
          <span className="clinic-mark">{identity.clinicInitials}</span>
          <span className="clinic-copy"><strong>{identity.clinicName}</strong><small>{identity.clinicType}</small></span>
          <span className="clinic-live-dot" />
          <ChevronDown size={15} />
        </div>
        {!identity.isPreview && (
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/app"
            appearance={{
              elements: {
                rootBox: 'clinic-switcher-clerk-root',
                organizationSwitcherTrigger: 'clinic-switcher-clerk-trigger',
              },
            }}
          />
        )}
      </div>

      <nav className="side-nav" aria-label="Navegación principal">
        <span className="nav-caption">Operación</span>
        {primaryNav.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            className={active === label ? 'active' : ''}
            onClick={() => onNavigate(label)}
            aria-current={active === label ? 'page' : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
            {label === 'Oportunidades' && taskCount > 0 && <b>{taskCount}</b>}
          </button>
        ))}
        {identity.isAdmin && <>
          <span className="nav-caption secondary-caption">Administración</span>
          {secondaryNav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className={active === label ? 'active' : ''}
              onClick={() => onNavigate(label)}
              aria-current={active === label ? 'page' : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </>}
      </nav>

      <div className="sidebar-footer">
        <div className="receptionist-card">
          <div className="receptionist-orb"><span /></div>
          <div>
            <small>Recepcionista</small>
            <strong>{dataMode.serviceIsLive ? 'Lucía está disponible' : 'Lucía está en configuración'}</strong>
            <span>{dataMode.serviceIsLive ? 'Agente asignado a tu Location' : 'Estamos preparando tu servicio'}</span>
          </div>
          <Activity size={15} aria-hidden="true" />
        </div>
        <div className="profile-button">
          {identity.isPreview
            ? <span className="profile-preview-avatar" aria-hidden="true">{identity.initials}</span>
            : <UserButton appearance={{ elements: { avatarBox: 'clerk-profile-avatar' } }} />}
          <span><strong>{identity.fullName}</strong><small>{identity.role}</small></span>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ active, clinicName, dataMode, statusOpen, onToggleStatus, onSearch, onAction }) {
  return (
    <header className="topbar">
      <div className="mobile-wordmark" aria-label="AutiveX Control">
        <span className="mobile-brand-symbol" aria-hidden="true"><img src="/autivex-mark.png" alt="" /></span>
        <strong>AutiveX</strong><b>Control</b>
      </div>
      <div className="breadcrumb"><span>{clinicName}</span><ChevronRight size={14} /><strong>{active}</strong></div>
      <div className="top-actions">
        <div className="status-wrap">
          <button className={`status-button ${dataMode.isDemo ? 'demo' : ''}`} type="button" onClick={onToggleStatus} aria-expanded={statusOpen} aria-label={dataMode.isDemo ? 'Estado: datos no conectados' : 'Estado: operando con normalidad'}>
            <span className={`status-dot ${dataMode.isDemo ? 'demo' : ''}`} />
            <span>{dataMode.serviceIsLive ? 'Operando con normalidad' : 'Configuración en curso'}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {statusOpen && <StatusPopover dataMode={dataMode} />}
        </div>
        <button className="search-button" type="button" onClick={onSearch} aria-label="Buscar en AutiveX">
          <Search size={17} aria-hidden="true" /><span>Buscar</span><kbd><Command size={11} /> K</kbd>
        </button>
        <button className="top-icon" type="button" aria-label="Notificaciones" onClick={() => onAction('No tienes notificaciones nuevas')}>
          <Bell size={18} aria-hidden="true" /><i />
        </button>
        <button className="top-icon help-icon" type="button" aria-label="Centro de ayuda" onClick={() => onAction('Centro de ayuda abierto')}>
          <CircleHelp size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function StatusPopover({ dataMode }) {
  if (dataMode.isDemo) {
    return (
      <div className="status-popover demo-status-popover">
        <div className="popover-title"><span className="status-dot demo" /><div><strong>Configuración en curso</strong><small>La actividad aparecerá conforme opere tu agente</small></div></div>
        <dl>
          <div><dt>Telefonía</dt><dd>No conectada</dd></div>
          <div><dt>Calendario</dt><dd>No conectado</dd></div>
          <div><dt>Actividad</dt><dd>Pendiente de sincronización</dd></div>
        </dl>
        <p>El estado cambiará automáticamente cuando terminemos de conectar los servicios de tu Location.</p>
      </div>
    );
  }

  return (
    <div className="status-popover">
      <div className="popover-title"><span className="status-dot" /><div><strong>Lucía está en línea</strong><small>Última revisión hace 18 s</small></div></div>
      <dl>
        <div><dt>Líneas</dt><dd>2 de 3 libres</dd></div>
        <div><dt>Horario</dt><dd>Hasta las 19:00</dd></div>
        <div><dt>Calendario</dt><dd><CheckCircle2 size={13} /> Sincronizado</dd></div>
      </dl>
      <button type="button">Ver estado del servicio <ArrowUpRight size={14} /></button>
    </div>
  );
}

function Dashboard({ period, onPeriod, tasks, taskFilter, onTaskFilter, onSelectTask, onNavigate, onAction, firstName, isAdmin, dataMode }) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const data = analyticsByPeriod[period];
  const firstTask = tasks[0];
  const periodContext = period === 'Hoy' ? 'hoy' : `en los últimos ${period}`;
  return (
    <main className="dashboard">
      <section className="page-heading">
        <div>
          <p className="eyebrow">{dataMode.isDemo ? 'Centro de operaciones' : 'Viernes, 31 de julio'}</p>
          <h1>{dataMode.isDemo ? `Todo listo para empezar, ${firstName}.` : (tasks.length ? `Hay ${tasks.length} ${tasks.length === 1 ? 'decisión' : 'decisiones'} para hoy, ${firstName}.` : `La cola está resuelta, ${firstName}.`)}</h1>
          <p className="heading-copy">{dataMode.isDemo ? <>La actividad aparecerá aquí cuando tu agente comience a recibir conversaciones.</> : <>Lucía atendió {data.calls.toLocaleString('es-MX')} llamadas {periodContext} y mantiene la operación estable. {firstTask ? <strong>Empieza por {firstTask.name}.</strong> : <strong>No quedan acciones pendientes.</strong>}</>}</p>
        </div>
        <div className="period-control" aria-label="Periodo de actividad">
          {['Hoy', '7 días', '30 días'].map((item) => (
            <button key={item} type="button" className={period === item ? 'active' : ''} onClick={() => onPeriod(item)}>{item}</button>
          ))}
        </div>
      </section>

      <section className="hero-grid">
        <AttentionPanel tasks={tasks} isDemoData={dataMode.isDemo} filter={taskFilter} onFilter={onTaskFilter} onSelect={onSelectTask} onNavigate={onNavigate} />
        <PulsePanel data={data} isDemoData={dataMode.isDemo} onNavigate={onNavigate} />
      </section>

      <section className="signal-strip" aria-label="Indicadores clave">
        <SignalMetric value={data.noWait} label="atendidas sin espera" meta={`${data.noWaitCount.toLocaleString('es-MX')} de ${data.inbound.toLocaleString('es-MX')} entrantes`} trend={data.noWaitTrend} />
        <SignalMetric value={data.booked.toLocaleString('es-MX')} label="citas creadas" meta={`de ${data.intent.toLocaleString('es-MX')} con intención`} trend={data.bookedTrend} />
        <SignalMetric value={data.duration} label="duración promedio" meta="minutos por conversación" trend={data.durationTrend} />
        <div className="signal-note"><ShieldCheck size={18} /><span><strong>{dataMode.isDemo ? 'Cobertura pendiente' : 'Sin llamadas perdidas'}</strong><small>{dataMode.isDemo ? 'Esperando actividad del agente' : (period === 'Hoy' ? 'en las últimas 3 h 20 min' : `en los últimos ${period}`)}</small></span></div>
      </section>

      <section className="analysis-disclosure">
        <div><p className="eyebrow">Más contexto</p><h2>Agenda, resultados y capacidad</h2><span>Lo esencial ya está arriba. Abre el detalle cuando necesites investigar el rendimiento.</span></div>
        <div className="analysis-facts"><span><small>Agenda hoy</small><strong>{dataMode.isDemo ? 'Sin citas registradas' : `${appointments.length} citas · ${appointments.filter((item) => item.state !== 'Confirmada').length} por atender`}</strong></span><span><small>Capacidad</small><strong>{dataMode.isDemo ? 'Sin consumo registrado' : '823 / 1,000 min'}</strong></span></div>
        <button type="button" aria-expanded={analysisOpen} aria-controls="dashboard-analysis" onClick={() => setAnalysisOpen((value) => !value)}>{analysisOpen ? 'Ocultar análisis' : 'Ver análisis'}<ChevronDown size={16} className={analysisOpen ? 'rotated' : ''} /></button>
      </section>
      {analysisOpen && <div className="analysis-details" id="dashboard-analysis">
        <section className="insight-grid">
          <OutcomePanel reasonsData={reasonsByPeriod[period]} isDemoData={dataMode.isDemo} onNavigate={onNavigate} />
          <AgendaPanel isDemoData={dataMode.isDemo} onAction={onAction} />
        </section>
        <CapacityPanel isAdmin={isAdmin} isDemoData={dataMode.isDemo} onNavigate={onNavigate} />
      </div>}
    </main>
  );
}

function PulsePanel({ data, isDemoData, onNavigate }) {
  const peak = data.chart.points.reduce((highest, point) => point.value > highest.value ? point : highest);
  const intentRate = Math.round((data.intent / data.calls) * 100);
  return (
    <article className="pulse-panel">
      <header className="pulse-header">
        <div className="pulse-kpi">
          <span>{isDemoData ? 'Llamadas registradas' : 'Llamadas atendidas'}</span>
          <div className="pulse-value-row"><strong>{data.calls.toLocaleString('es-MX')}</strong><small>{data.rangeLabel}</small></div>
          <p>{data.inbound.toLocaleString('es-MX')} entrantes <i /> {data.noWait} sin espera</p>
        </div>
        <div className="comparison"><strong><ArrowUpRight size={15} />{data.comparison}</strong><span>{data.comparisonLabel}</span></div>
      </header>

      <section className="volume-section">
        <header className="volume-head">
          <div><h3>{data.chart.title}</h3><p>{data.chart.caption}</p></div>
          <div className="peak-metric"><span>Pico</span><strong>{peak.fullLabel || peak.label}</strong><small>{peak.value.toLocaleString('es-MX')} llamadas</small></div>
        </header>
        <VolumeChart points={data.chart.points} total={data.calls} title={data.chart.title} peakValue={peak.value} />
      </section>

      <footer className="conversion-summary">
        <div className="conversion-flow">
          <span className="conversion-kicker">Ruta a cita</span>
          <div className="conversion-steps">
            <div><strong>{data.intent.toLocaleString('es-MX')}</strong><span>con intención</span><small>{intentRate}% de atendidas</small></div>
            <ArrowRight size={18} aria-hidden="true" />
            <div><strong>{data.booked.toLocaleString('es-MX')}</strong><span>citas creadas</span><small>en el periodo</small></div>
          </div>
        </div>
        <div className="conversion-score">
          <span>Conversión a cita</span><strong>{data.conversion}</strong><small>{data.booked.toLocaleString('es-MX')} de {data.intent.toLocaleString('es-MX')} agendaron</small>
          <div className="conversion-progress" aria-hidden="true"><i style={{ width: data.conversion }} /></div>
        </div>
        <button type="button" onClick={() => onNavigate('Conversaciones')}>Abrir bitácora <ArrowUpRight size={15} /></button>
      </footer>
    </article>
  );
}

function getChartMaximum(value) {
  if (value <= 25) return Math.ceil(value / 5) * 5;
  if (value <= 150) return Math.ceil(value / 20) * 20;
  if (value <= 700) return Math.ceil(value / 100) * 100;
  return Math.ceil(value / 500) * 500;
}

function VolumeChart({ points, total, title, peakValue }) {
  const chartMaximum = getChartMaximum(Math.max(...points.map((point) => point.value)));
  const ticks = [chartMaximum, chartMaximum * 0.75, chartMaximum * 0.5, chartMaximum * 0.25, 0];
  const labelEvery = points.length >= 10 ? 3 : points.length >= 8 ? 2 : 1;
  const summary = `${total.toLocaleString('es-MX')} llamadas en total. ${points.map((point) => `${point.fullLabel || point.label}: ${point.value}`).join('; ')}.`;
  return (
    <figure className="volume-chart">
      <figcaption className="sr-only">{title}. {summary}</figcaption>
      <div className="volume-chart-visual" aria-hidden="true">
        <div className="volume-y-axis">{ticks.map((tick) => <span key={tick}>{tick.toLocaleString('es-MX')}</span>)}</div>
        <div className="volume-plot">
          <div className="volume-grid">{ticks.map((tick) => <i key={tick} />)}</div>
          <div className="volume-bars">
            {points.map((point, index) => {
              const showLabel = index % labelEvery === 0 || index === points.length - 1;
              const share = Math.round((point.value / total) * 100);
              const edgeClass = index === 0 ? 'edge-start' : index === points.length - 1 ? 'edge-end' : '';
              return (
                <div className={`volume-column ${edgeClass}`} key={`${point.label}-${point.value}`}>
                  <div className="volume-bar-track">
                    <span className={`volume-bar ${point.value === peakValue ? 'peak' : ''} ${point.partial ? 'partial' : ''}`} style={{ height: `${(point.value / chartMaximum) * 100}%` }}>
                      <span className="volume-tooltip"><strong>{point.value.toLocaleString('es-MX')}</strong><small>llamadas · {share}%</small></span>
                    </span>
                  </div>
                  <span className={`volume-x-label ${showLabel ? '' : 'hidden'}`}>{point.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </figure>
  );
}

function AttentionPanel({ tasks, isDemoData, filter, onFilter, onSelect, onNavigate }) {
  const filtered = useMemo(() => {
    if (filter === 'Urgentes') return tasks.filter((item) => item.priorityTone === 'urgent' || item.priorityTone === 'warning');
    if (filter === 'Hoy') return tasks.filter((item) => item.priorityTone !== 'normal');
    return tasks;
  }, [filter, tasks]);

  return (
    <aside className="attention-panel">
      <header>
          <div><p className="eyebrow">Decisiones</p><h2>{isDemoData ? 'Sin actividad pendiente' : 'Necesitan atención'} <span>{isDemoData ? 0 : filtered.length}</span></h2></div>
      </header>
      <div className="task-tabs" role="group" aria-label="Filtrar pendientes">
        {['Todas', 'Hoy', 'Urgentes'].map((item) => (
          <button key={item} type="button" aria-pressed={filter === item} className={filter === item ? 'active' : ''} onClick={() => onFilter(item)}>{item}</button>
        ))}
      </div>
      <div className="task-list">
        {filtered.map((item) => (
          <button className="task-row" type="button" key={item.id} onClick={() => onSelect(item)}>
            <span className={`task-priority ${item.priorityTone}`} />
            <span className="task-main"><strong title={item.name}>{item.name}</strong><small>{item.detail}</small><span title={item.note}>{item.note}</span></span>
            <span className="task-side"><time>{item.time}</time><i className={item.inProgress ? 'in-progress' : ''}>{item.priority}</i><span className="task-action">{item.inProgress ? 'Continuar' : item.action}<ArrowUpRight size={14} /></span></span>
          </button>
        ))}
        {filtered.length === 0 && <div className="task-empty"><CheckCircle2 size={20} /><span>No hay pendientes en este filtro.</span></div>}
      </div>
      <button type="button" className="text-link" onClick={() => onNavigate('Oportunidades')}>Ver toda la cola <ArrowRight size={15} /></button>
    </aside>
  );
}

function SignalMetric({ value, label, meta, trend }) {
  return (
    <div className="signal-metric">
      <div><strong>{value}</strong><span>{label}</span></div>
      <footer><span>{meta}</span><b>{trend}</b></footer>
    </div>
  );
}

function OutcomePanel({ reasonsData, isDemoData, onNavigate }) {
  return (
    <article className="outcome-panel surface-panel">
      <header className="section-head">
        <div><p className="eyebrow">Resultados por motivo</p><h2>{isDemoData ? 'Los resultados aparecerán aquí' : 'Qué buscaban al llamar'}</h2></div>
        <button type="button" onClick={() => onNavigate('Conversaciones')}>Explorar llamadas <ArrowUpRight size={15} /></button>
      </header>
      <div className="reason-table" role="table" aria-label="Resultados de llamadas por motivo">
        <div className="reason-head" role="row">
          <span role="columnheader">Motivo</span><span role="columnheader">Llamadas</span><span role="columnheader">Resultado</span><span role="columnheader">Citas</span>
        </div>
        {reasonsData.map((reason) => (
          <div className="reason-row" role="row" key={reason.name}>
            <span className="reason-name" role="cell">{reason.name}</span>
            <strong role="cell">{reason.total.toLocaleString('es-MX')}</strong>
            <div className="result-bar" role="cell" aria-label={`${reason.handled} resueltas, ${reason.booked} citas, ${reason.transferred} transferidas y ${reason.pending} pendientes`}>
              {reason.handled > 0 && <i className="resolved" style={{ flex: reason.handled }} />}
              {reason.booked > 0 && <i className="booked" style={{ flex: reason.booked }} />}
              {reason.transferred > 0 && <i className="transfer" style={{ flex: reason.transferred }} />}
              {reason.pending > 0 && <i className="attention" style={{ flex: reason.pending }} />}
            </div>
            <span className="booked-count" role="cell">{reason.booked ? reason.booked.toLocaleString('es-MX') : '—'}</span>
          </div>
        ))}
      </div>
      <footer className="result-legend">
        <span><i className="resolved" />Resuelta</span><span><i className="booked" />Cita creada</span><span><i className="transfer" />Transferida</span><span><i className="attention" />Pendiente</span>
      </footer>
    </article>
  );
}

function AgendaPanel({ isDemoData, onAction }) {
  return (
    <article className="agenda-panel surface-panel">
      <header className="section-head">
        <div><p className="eyebrow">Agenda de hoy</p><h2>{isDemoData ? 'Sin citas registradas' : '5 citas programadas'}</h2></div>
        <button type="button" className="calendar-button" aria-label="Abrir calendario" onClick={() => onAction('Calendario abierto')}><CalendarCheck2 size={18} /></button>
      </header>
      <div className="agenda-list">
        {appointments.map((appointment) => (
          <button type="button" className="appointment-row" key={`${appointment.time}-${appointment.name}`} onClick={() => onAction(`Cita de ${appointment.name}`)}>
            <time>{appointment.time}</time>
            <span className="agenda-line"><i className={appointment.state === 'Confirmada' ? 'past' : 'pending'} /></span>
            <span className="appointment-copy"><strong>{appointment.name}</strong><small>{appointment.service}</small></span>
            <span className={`appointment-state ${appointment.state !== 'Confirmada' ? 'pending' : ''}`}>{appointment.state}</span>
          </button>
        ))}
      </div>
      <div className="agenda-foot"><Clock3 size={15} /><span>{isDemoData ? 'Conecta Google Calendar para consultar espacios' : 'Próximo espacio libre'}</span>{!isDemoData && <strong>Lun 3 · 09:00</strong>}</div>
    </article>
  );
}

function CapacityPanel({ isAdmin, isDemoData, onNavigate }) {
  return (
    <section className="capacity-panel">
      <div className="capacity-copy"><p className="eyebrow">Reserva mensual</p><div><strong>{isDemoData ? '—' : '823'}</strong><span>{isDemoData ? 'Sin consumo registrado' : 'de 1,000 minutos incluidos'}</span></div></div>
      <div className="capacity-visual">
        <div className="capacity-labels"><span>Incluido</span><span>Proyección · 1,140</span><span>Límite · 1,500</span></div>
        <div className="capacity-track"><i className="used" /><i className="projection" /><i className="limit" /></div>
        <span>{isDemoData ? 'El consumo aparecerá cuando tu agente comience a operar.' : 'Quedan 8 días. Tu servicio tiene margen suficiente para la proyección actual.'}</span>
      </div>
      {isAdmin && <button type="button" onClick={() => onNavigate('Uso y plan')}>Uso y plan <ArrowUpRight size={15} /></button>}
    </section>
  );
}

function ModulePage({ title, tasks, clinicName, dataMode, profile, connections, getToken, isAdmin, onSelectTask, onAction, onTestAgent }) {
  const copy = moduleCopy[title];
  const pendingDescriptions = {
    Conversaciones: 'El historial aparecerá cuando tu agente comience a atender llamadas.',
    Oportunidades: 'Los seguimientos se crearán automáticamente a partir de las conversaciones.',
    'Mi recepcionista': 'Configura y prueba la recepcionista asignada a tu Location.',
    Conexiones: 'Consulta los sistemas operativos y las integraciones disponibles.',
    'Uso y plan': 'El consumo aparecerá cuando tu agente comience a operar.',
  };
  return (
    <main className="module-page">
      <section className="module-heading">
        <div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><span>{dataMode.isDemo ? pendingDescriptions[title] : copy.description}</span></div>
        <button type="button" className="primary-action" onClick={() => onAction(`Nueva acción en ${title}`)}>Nueva acción <ArrowUpRight size={16} /></button>
      </section>
      {title === 'Conversaciones' && <ConversationsModule tasks={tasks} isDemoData={dataMode.isDemo} onSelectTask={onSelectTask} />}
      {title === 'Oportunidades' && <OpportunitiesModule tasks={tasks} onSelectTask={onSelectTask} />}
      {title === 'Mi recepcionista' && <ReceptionistModule clinicName={clinicName} isDemoData={dataMode.isDemo} profile={profile} getToken={getToken} isAdmin={isAdmin} onAction={onAction} onTestAgent={onTestAgent} />}
      {title === 'Conexiones' && <ConnectionsModule connections={connections} />}
      {title === 'Uso y plan' && <UsageModule isDemoData={dataMode.isDemo} />}
    </main>
  );
}

function ConversationsModule({ tasks, isDemoData, onSelectTask }) {
  const [query, setQuery] = useState('');
  const [resultFilter, setResultFilter] = useState('Todas');
  const [sortOrder, setSortOrder] = useState('Recientes');
  const filteredCalls = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-MX');
    const matches = recentCalls.filter((call) => {
      const matchesQuery = !normalizedQuery || `${call.name} ${call.reason} ${call.result}`.toLocaleLowerCase('es-MX').includes(normalizedQuery);
      const matchesResult = resultFilter === 'Todas' || call.result === resultFilter;
      return matchesQuery && matchesResult;
    });
    return sortOrder === 'Antiguas' ? [...matches].reverse() : matches;
  }, [query, resultFilter, sortOrder]);

  return (
    <section className="records-layout">
      <article className="records-panel surface-panel">
        <div className="records-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar conversación" placeholder="Paciente, motivo o resultado" /></label>
          <select aria-label="Filtrar por resultado" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
            <option>Todas</option><option>Requiere atención</option><option>Cita creada</option><option>Resuelta</option><option>Transferida</option>
          </select>
          <select aria-label="Ordenar conversaciones" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option>Recientes</option><option>Antiguas</option></select>
        </div>
        <div className="call-list">
          {filteredCalls.map((call) => (
            <button type="button" className="call-row" key={`${call.name}-${call.time}`} onClick={() => onSelectTask(tasks.find((task) => task.id === call.taskId) || createCallRecord(call))}>
              <span className="call-play"><Play size={14} fill="currentColor" /></span>
              <span className="call-person"><strong>{call.name}</strong><small>{call.reason}</small></span>
              <time>{call.time}</time><span className="call-duration">{call.duration}</span><span className={`result-chip ${call.tone}`}>{call.result}</span><ChevronRight size={16} />
            </button>
          ))}
          {filteredCalls.length === 0 && <div className="records-empty"><Search size={20} /><strong>Sin resultados</strong><span>Prueba otro nombre, motivo o resultado.</span></div>}
        </div>
      </article>
      <aside className="module-aside dark-module-card"><p className="dark-eyebrow">Hoy</p><strong>{isDemoData ? 0 : 136}</strong><span>llamadas entrantes</span><dl><div><dt>Atendidas</dt><dd>{isDemoData ? 0 : 128}</dd></div><div><dt>Sin respuesta</dt><dd>0</dd></div><div><dt>Fuera de horario</dt><dd>{isDemoData ? 0 : 8}</dd></div></dl></aside>
    </section>
  );
}

function OpportunitiesModule({ tasks, onSelectTask }) {
  const stages = [
    ['Nuevas', tasks.filter((task) => !task.inProgress && ['urgent', 'warning'].includes(task.priorityTone))],
    ['Por atender', tasks.filter((task) => !task.inProgress && !['urgent', 'warning'].includes(task.priorityTone))],
    ['En curso', tasks.filter((task) => task.inProgress)],
  ];
  return (
    <section className="opportunity-board">
      {stages.map(([stage, people]) => (
        <article className="opportunity-column" key={stage}>
          <header><strong>{stage}</strong><span>{people.length}</span></header>
          {people.map((person) => <button type="button" key={`${stage}-${person.id}`} onClick={() => onSelectTask(person)}><span className="mini-avatar">{person.initials}</span><strong>{person.name}</strong><small>{person.detail}</small><time>{person.time}</time></button>)}
          {people.length === 0 && <div className="opportunity-empty"><CheckCircle2 size={18} /><span>No hay elementos en esta etapa.</span></div>}
        </article>
      ))}
    </section>
  );
}

const VOICE_PROVIDER_NAMES = { platform: 'Retell', cartesia: 'Cartesia', elevenlabs: 'ElevenLabs', minimax: 'MiniMax', fish_audio: 'Fish Audio', openai: 'OpenAI', deepgram: 'Deepgram' };

function ReceptionistModule({ clinicName, isDemoData, profile, getToken, isAdmin, onAction, onTestAgent }) {
  const [voices, setVoices] = useState([]);
  const [provider, setProvider] = useState(profile?.voiceProvider || 'cartesia');
  const [voiceId, setVoiceId] = useState(profile?.voiceId || 'cartesia-Sofia');
  const [voiceStatus, setVoiceStatus] = useState('loading');
  const [voiceError, setVoiceError] = useState('');
  const providers = useMemo(() => [...new Set(voices.map((voice) => voice.provider))], [voices]);
  const providerVoices = useMemo(() => voices.filter((voice) => voice.provider === provider), [voices, provider]);

  useEffect(() => {
    let active = true;
    getWorkspaceVoices(getToken).then((result) => {
      if (!active) return;
      setVoices(result.voices || []);
      const current = (result.voices || []).find((voice) => voice.id === (profile?.voiceId || 'cartesia-Sofia'));
      if (current) { setProvider(current.provider); setVoiceId(current.id); }
      setVoiceStatus('ready');
    }).catch((error) => { if (active) { setVoiceError(error.message); setVoiceStatus('error'); } });
    return () => { active = false; };
  }, [getToken, profile?.voiceId]);

  const changeProvider = (nextProvider) => {
    setProvider(nextProvider);
    setVoiceId(voices.find((voice) => voice.provider === nextProvider)?.id || '');
    setVoiceStatus('ready');
    setVoiceError('');
  };
  const saveVoice = async () => {
    setVoiceStatus('saving'); setVoiceError('');
    try { await updateWorkspaceVoice(getToken, voiceId); setVoiceStatus('saved'); }
    catch (error) { setVoiceError(error.message); setVoiceStatus('error'); }
  };
  const selectedVoice = voices.find((voice) => voice.id === voiceId);
  return (
    <section className="reception-layout">
      <article className="reception-identity dark-module-card"><div className="large-orb"><span /></div><p className="dark-eyebrow">{isDemoData ? 'Agente asignado' : 'En línea ahora'}</p><h2>Lucía</h2><span>Recepcionista de {clinicName}</span><div className="reception-number">{isDemoData ? 'Disponible desde este navegador' : '+52 55 4160 0198'}</div><button type="button" onClick={onTestAgent}><PhoneOutgoing size={16} /> Probar mi agente</button></article>
      <article className="settings-list surface-panel">
        <div className="voice-settings">
          <div className="voice-settings-heading"><span className="setting-icon"><Headphones size={18} /></span><span><strong>Voz de tu recepcionista</strong><small>Voces disponibles con acento mexicano en Retell.</small></span></div>
          {voiceStatus === 'loading' ? <p>Cargando catálogo de voces…</p> : <>
            <div className="voice-settings-fields">
              <label><span>Proveedor</span><select disabled={!isAdmin || voiceStatus === 'saving'} value={provider} onChange={(event) => changeProvider(event.target.value)}>{providers.map((item) => <option value={item} key={item}>{VOICE_PROVIDER_NAMES[item] || item}</option>)}</select></label>
              <label><span>Voz</span><select disabled={!isAdmin || voiceStatus === 'saving'} value={voiceId} onChange={(event) => { setVoiceId(event.target.value); setVoiceStatus('ready'); }}>{providerVoices.map((voice) => <option value={voice.id} key={voice.id}>{voice.name} · {voice.gender === 'female' ? 'Femenina' : 'Masculina'}{voice.recommended ? ' · Recomendada' : ''}</option>)}</select></label>
            </div>
            <div className="voice-settings-actions">
              {selectedVoice?.previewUrl && <audio controls preload="none" src={selectedVoice.previewUrl}>Tu navegador no puede reproducir esta muestra.</audio>}
              {isAdmin ? <button type="button" className="primary-action" disabled={!voiceId || voiceStatus === 'saving'} onClick={saveVoice}>{voiceStatus === 'saving' ? 'Guardando…' : 'Guardar voz'}</button> : <small>Solo un administrador puede cambiar la voz.</small>}
            </div>
          </>}
          {voiceStatus === 'saved' && <p className="voice-success"><CheckCircle2 size={15} /> Voz actualizada. La siguiente llamada usará esta voz.</p>}
          {voiceError && <p className="voice-error">{voiceError}</p>}
        </div>
        {(isDemoData ? [
          ['Disponibilidad', profile?.businessHours || 'Horario por configurar', Clock3],
          ['Servicios que conoce', profile?.services?.join(', ') || 'Servicios por configurar', FileText],
          ['Transferencias', 'Sin personas ni reglas conectadas', PhoneCall],
          ['Mensaje inicial', 'Configurado para tu negocio', MessageSquareText],
        ] : [
          ['Disponibilidad', 'Lunes a viernes · 07:00–19:00', Clock3],
          ['Servicios que conoce', '12 tratamientos y 38 respuestas', FileText],
          ['Transferencias', '3 personas y una regla fuera de horario', PhoneCall],
          ['Mensaje inicial', 'Actualizado el 27 de julio', MessageSquareText],
        ]).map(([label, value, Icon]) => <button type="button" key={label} onClick={() => onAction(`${label} abierto`)}><span className="setting-icon"><Icon size={18} /></span><span><strong>{label}</strong><small>{value}</small></span><ChevronRight size={17} /></button>)}
      </article>
    </section>
  );
}

function ConnectionsModule({ connections = {} }) {
  const calendar = connections.googleCalendar || { status: 'not_connected' };
  const retell = connections.retell || { status: 'configuring' };
  const items = [
    { name: 'Google Calendar', detail: calendar.status === 'connected' ? `${calendar.displayName} · ${calendar.capabilities?.join(', ')}` : 'Nuestro equipo puede conectarlo para consultar disponibilidad y administrar citas.', state: calendar.status === 'connected' ? 'Conectado' : 'Solicitar conexión', meta: calendar.calendarIdMasked, Icon: CalendarCheck2 },
    { name: 'Telefonía y agente de voz', detail: 'Atiende llamadas, conserva contexto y ejecuta las reglas configuradas.', state: retell.status === 'connected' ? 'Conectado' : 'En configuración', Icon: PhoneCall },
    { name: 'CRM AutiveX', detail: 'Organiza contactos, conversaciones, resultados y siguientes acciones.', state: 'Activo', Icon: Users },
    { name: 'WhatsApp Business', detail: 'Confirmaciones, recordatorios y seguimiento después de cada conversación.', state: 'Disponible como add-on', Icon: MessageSquareText },
    { name: 'Correo y notificaciones', detail: 'Resúmenes de llamadas, alertas y tareas para el equipo.', state: 'Próximamente', Icon: Bell },
    { name: 'Webhooks y automatización', detail: 'Entrega eventos a sistemas externos bajo configuración administrada.', state: 'Administrado por AutiveX', Icon: PlugZap },
  ];
  return <section className="connections-workspace"><article className="connections-summary dark-module-card"><p className="dark-eyebrow">Infraestructura administrada</p><h2>{items.filter((item) => ['Conectado', 'Activo'].includes(item.state)).length} sistemas operativos</h2><span>Las credenciales y cambios sensibles son gestionados por AutiveX. Tu equipo siempre puede ver qué está conectado y qué función cumple.</span></article><div className="connection-grid">{items.map(({ name, detail, state, meta, Icon }) => <article className="connection-card surface-panel" key={name}><header><span className="connection-icon"><Icon size={21} /></span><i className={['Conectado', 'Activo'].includes(state) ? 'connected' : 'review'}>{state}</i></header><h3>{name}</h3><p>{detail}</p>{meta && <code>{meta}</code>}</article>)}</div></section>;
}

function UsageModule({ isDemoData }) {
  return (
    <section className="usage-layout">
      <article className="usage-reserve dark-module-card"><p className="dark-eyebrow">Consumo mensual</p><strong>{isDemoData ? '—' : '823'}</strong><span>{isDemoData ? 'Sin minutos registrados' : 'minutos usados de 1,000'}</span><div className="usage-ring" style={{ '--progress': isDemoData ? '0%' : '82.3%' }}><i /></div><footer><span>Proyección</span><b>{isDemoData ? 'Pendiente' : '1,140 min'}</b></footer></article>
      <article className="usage-detail surface-panel"><h2>Tu capacidad este mes</h2><p>{isDemoData ? 'El consumo aparecerá automáticamente cuando tu agente comience a atender llamadas.' : 'El excedente proyectado está cubierto por tu plan. El servicio no está en riesgo de interrupción.'}</p><dl><div><dt>Incluidos</dt><dd>1,000 min</dd></div><div><dt>Consumidos</dt><dd>{isDemoData ? '—' : '823 min'}</dd></div><div><dt>Límite de seguridad</dt><dd>1,500 min</dd></div><div><dt>Estado</dt><dd>{isDemoData ? 'Sin actividad' : 'Operando'}</dd></div></dl></article>
    </section>
  );
}

function TaskDrawer({ task, dataMode, onClose, onResolve, onStart, onAssign }) {
  const dialogRef = useDialogFocus();
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={dialogRef} className="task-drawer" role="dialog" aria-modal="true" aria-labelledby="task-title">
        <header><div><p className="eyebrow">{dataMode.isDemo ? 'Registro pendiente de sincronización' : (task.isCallRecord ? `Conversación · ${task.time}` : `Pendiente · ${task.inProgress ? `En curso · ${task.priority}` : task.priority}`)}</p><h2 id="task-title">{task.name}</h2><span>{dataMode.isDemo ? 'La actividad real aparecerá al operar el agente' : task.phone}</span></div><button type="button" onClick={onClose} aria-label="Cerrar detalle"><X size={20} /></button></header>
        <div className="drawer-summary"><span className="mini-avatar">{task.initials}</span><div><strong>{task.detail}</strong><p>{task.summary}</p>{task.assigned && <small>Responsable · {task.assigned}</small>}</div></div>
        <section className="drawer-section"><div className="drawer-section-title"><FileText size={16} /><h3>Bitácora de la llamada</h3></div><div className="event-list">{task.events.map((event, index) => <div key={event}><i className={index === task.events.length - 1 ? 'last' : ''} /><span>{event}</span></div>)}</div></section>
        <section className="drawer-section"><div className="drawer-section-title"><Sparkles size={16} /><h3>Lectura de Lucía</h3></div><blockquote>“{task.note}”</blockquote></section>
        <div className="drawer-audio"><button type="button" aria-label="Reproducir llamada"><Play size={15} fill="currentColor" /></button><div><i /><span /></div><time>{task.duration || '04:16'}</time></div>
        {task.isCallRecord ? <footer><button type="button" className="primary-action" onClick={onClose}>Listo</button></footer> : <footer><button type="button" className="secondary-action" disabled={Boolean(task.assigned)} onClick={() => onAssign(task)}>{task.assigned ? 'Asignada a mí' : 'Asignarme'}</button><button type="button" className="primary-action" onClick={() => task.inProgress ? onResolve(task) : onStart(task)}>{task.inProgress ? 'Marcar como resuelto' : task.action}<ArrowUpRight size={16} /></button></footer>}
      </aside>
    </div>
  );
}

function CommandPalette({ tasks, isAdmin, onClose, onNavigate, onSelectTask }) {
  const dialogRef = useDialogFocus();
  const activeOptionRef = useRef(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const sections = [...primaryNav, ...(isAdmin ? secondaryNav : [])].map((item) => ({ type: 'Sección', label: item.label }));
  const people = tasks.map((item) => ({ type: 'Pendiente', label: item.name, task: item }));
  const results = [...sections, ...people].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, query]);
  const choose = (item) => {
    if (item.task) onSelectTask(item.task);
    else onNavigate(item.label);
    onClose();
  };
  const handleKeys = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => results.length ? (index + 1) % results.length : 0);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => results.length ? (index - 1 + results.length) % results.length : 0);
    }
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  };
  return (
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Búsqueda global">
        <label><Search size={19} /><input role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={results[activeIndex] ? `command-option-${activeIndex}` : undefined} aria-autocomplete="list" aria-label="Buscar en AutiveX" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleKeys} placeholder="Busca un pendiente o sección…" /><kbd>esc</kbd></label>
        <div className="command-results" id="command-results" role="listbox">
          {results.map((item, index) => <button ref={index === activeIndex ? activeOptionRef : undefined} tabIndex={-1} type="button" role="option" id={`command-option-${index}`} className={index === activeIndex ? 'active' : ''} aria-selected={index === activeIndex} key={`${item.type}-${item.label}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}><span>{item.type}</span><strong>{item.label}</strong><ArrowUpRight size={15} /></button>)}
          {results.length === 0 && <p>No encontramos resultados para “{query}”.</p>}
        </div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span>Busca también con <kbd>/</kbd></span></footer>
      </section>
    </div>
  );
}

function AvaButton({ open, onToggle }) {
  return <button type="button" className={`ava-button ${open ? 'open' : ''}`} onClick={onToggle} aria-label={open ? 'Cerrar Ava' : 'Abrir Ava'} aria-expanded={open}><span className="ava-orb"><i /></span><span className="ava-label">Pregúntale a Ava</span></button>;
}

function AvaPanel({ tasks, dataMode, onClose, onNavigate, onAction }) {
  const urgent = tasks.find((task) => task.priorityTone === 'urgent');
  return (
    <aside className="ava-panel" aria-label="Asistente Ava">
      <header><div className="ava-title"><span className="ava-orb small"><i /></span><span><strong>Ava</strong><small>Asistente de AutiveX</small></span></div><button type="button" onClick={onClose} aria-label="Cerrar Ava"><X size={18} /></button></header>
      <div className="ava-message"><p>{dataMode.isDemo ? 'Ava preparará recomendaciones cuando exista actividad conectada.' : (urgent ? `La operación está estable. Lo más urgente es ${urgent.action.toLowerCase()} a ${urgent.name} antes de que cierre la clínica.` : 'La operación está estable y no quedan pendientes urgentes.')}</p><span>{dataMode.isDemo ? 'Todavía no hay conversaciones suficientes para analizar.' : 'Analicé el pulso operativo y la cola pendiente.'}</span></div>
      <div className="ava-prompts"><button type="button" onClick={() => { onNavigate('Oportunidades'); onClose(); }}>Muéstrame los pendientes de hoy <ArrowRight size={14} /></button><button type="button" onClick={() => onAction('Resumen semanal preparado')}>Resume el desempeño de esta semana <ArrowRight size={14} /></button></div>
      <footer><Sparkles size={14} /><span>{dataMode.isDemo ? 'Ava se activará con la actividad de tu cuenta.' : 'Ava usa únicamente datos visibles de tu cuenta.'}</span></footer>
    </aside>
  );
}

function MobileNav({ active, onNavigate, onMore }) {
  const items = [primaryNav[0], primaryNav[1], primaryNav[2], { label: 'Más', icon: MoreHorizontal }];
  return (
    <nav className="mobile-nav" aria-label="Navegación móvil">
      {items.map(({ label, icon: Icon }) => {
        const current = label === 'Más' ? !['Hoy', 'Conversaciones', 'Oportunidades'].includes(active) : active === label;
        return <button type="button" key={label} className={current ? 'active' : ''} onClick={() => label === 'Más' ? onMore() : onNavigate(label)} aria-current={current ? 'page' : undefined}><Icon size={19} /><span>{label}</span></button>;
      })}
    </nav>
  );
}

function MobileMoreSheet({ active, isAdmin, onClose, onNavigate }) {
  const dialogRef = useDialogFocus();
  const items = [primaryNav[3], ...(isAdmin ? secondaryNav : [])];
  return (
    <div className="mobile-more-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="Más secciones">
        <header><div><p className="eyebrow">Navegación</p><h2>Más secciones</h2></div><button type="button" onClick={onClose} aria-label="Cerrar menú"><X size={19} /></button></header>
        <nav>{items.map(({ label, icon: Icon }) => <button type="button" key={label} className={active === label ? 'active' : ''} onClick={() => onNavigate(label)}><span className="setting-icon"><Icon size={18} /></span><span><strong>{label}</strong><small>{moduleCopy[label].description}</small></span><ChevronRight size={17} /></button>)}</nav>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<DashboardAuth DashboardComponent={App} />);
