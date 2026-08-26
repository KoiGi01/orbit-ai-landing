import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OrganizationSwitcher, UserButton } from '@clerk/react';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/syne';
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
import {
  getWorkspaceActivity,
  getWorkspaceNotifications,
  getWorkspaceVoices,
  markAllWorkspaceNotificationsRead,
  markWorkspaceNotificationRead,
  saveWorkspaceCalendar,
  updateWorkspaceAgentConfiguration,
  updateWorkspaceVoice,
} from './control-api';

const primaryNav = [
  { label: 'Hoy', icon: LayoutDashboard },
  { label: 'Conversaciones', icon: PhoneCall },
  { label: 'Oportunidades', icon: Users, badge: 4 },
  { label: 'Mi agente', icon: Headphones },
];

const secondaryNav = [
  { label: 'Conexiones', icon: PlugZap },
  { label: 'Uso y plan', icon: Gauge },
];

// moduleCopy.title is the only thing shown in the desktop header now (just
// the section name, e.g. "Conversaciones") -- every section used to open
// with a line of ad copy ("Así atiende Lucía cuando suena el teléfono.")
// that took up space without telling the reader anything. description is
// still used in the mobile nav sheet, so it stays.
const moduleCopy = {
  Conversaciones: {
    title: 'Conversaciones',
    description: 'Busca y escucha cualquier llamada que haya atendido tu recepcionista.',
  },
  Oportunidades: {
    title: 'Oportunidades',
    description: 'Prospectos y citas que necesitan un siguiente paso.',
  },
  'Mi agente': {
    title: 'Mi agente',
    description: 'Voz, disponibilidad y datos del negocio que usa Lucía para atender.',
  },
  Conexiones: {
    title: 'Conexiones',
    description: 'Los sistemas conectados a tu agente y qué función cumple cada uno.',
  },
  'Uso y plan': {
    title: 'Uso y plan',
    description: 'Consumo del mes y margen disponible.',
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

function initialsFromName(name) {
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return initials || '·';
}

function relativeTimeFrom(isoString) {
  if (!isoString) return 'Pendiente';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 60000));
  if (minutes < 1) return 'Justo ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Ayer' : `Hace ${days} días`;
}

function priorityCopyForTask(task) {
  if (task.priority === 'urgent') return { label: 'Urgente', tone: 'urgent' };
  if (task.priority === 'high') return { label: 'Prioridad alta', tone: 'warning' };
  return { label: 'Seguimiento', tone: 'normal' };
}

function actionLabelForTaskKind(kind) {
  if (kind === 'urgent_callback') return 'Devolver llamada';
  if (kind === 'appointment') return 'Confirmar cita';
  return 'Revisar llamada';
}

// Maps a real app.tasks row (see lib/server/crm-foundation.js:serializeActivityTask)
// into the same shape the UI already knows how to render for a pending item.
// There is no real per-task event timeline yet, so `events` stays empty rather
// than inventing one.
function createRealTaskRecord(task) {
  const { label, tone } = priorityCopyForTask(task);
  const name = task.contactName || task.contactPhone || 'Contacto sin nombre';
  return {
    id: `task-${task.id}`,
    initials: initialsFromName(name),
    name,
    detail: task.title,
    note: task.description || 'Sin detalles adicionales.',
    time: relativeTimeFrom(task.dueAt),
    priority: label,
    priorityTone: tone,
    action: actionLabelForTaskKind(task.kind),
    phone: task.contactPhone || 'Sin teléfono registrado',
    summary: task.description || 'Sin resumen disponible todavía.',
    events: [],
  };
}

function formatCallDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function resultCopyForCall(call) {
  if (call.status === 'ongoing') return { result: 'En curso', tone: 'info' };
  if (call.followUpRequired) return { result: 'Requiere atención', tone: 'urgent' };
  if (call.status === 'analyzed') return { result: 'Resuelta', tone: 'success' };
  return { result: 'Registrada', tone: 'neutral' };
}

// Maps a real app.calls row (see lib/server/crm-foundation.js:serializeActivityCall)
// into the same shape the call log already renders, so createCallRecord() and the
// existing "call-row" markup work unchanged for real data.
function createRealCallListItem(call) {
  const { result, tone } = resultCopyForCall(call);
  const name = call.contactName
    || call.contactPhone
    || (call.channel === 'web' ? 'Llamada de prueba' : 'Número desconocido');
  const time = call.startedAt
    ? new Date(call.startedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : '—';
  return {
    name,
    time,
    reason: call.summary ? call.summary.slice(0, 60) : (call.status === 'ongoing' ? 'Llamada en curso' : 'Sin resumen todavía'),
    duration: formatCallDuration(call.durationSeconds),
    result,
    tone,
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

function getDashboardDataMode(workspace, hasRealActivity) {
  const serviceIsLive = workspace?.view === 'live'
    || workspace?.state?.serviceStatus === 'live';

  // isDemo now reflects whether app.calls/app.tasks actually returned
  // anything for this workspace (see App's activity fetch), not a hardcoded
  // placeholder. A workspace with no calls yet still reads as "demo" so it
  // gets the honest waiting-for-activity copy instead of an error state.
  return {
    isDemo: !hasRealActivity,
    serviceIsLive,
    serviceStatus: workspace?.state?.serviceStatus || 'unknown',
  };
}

function App({ account, workspace }) {
  const identity = getAccountIdentity(account);
  const [activity, setActivity] = useState(null);
  const hasRealActivity = Boolean(activity && (activity.calls.length > 0 || activity.tasks.length > 0));
  const dataMode = useMemo(() => getDashboardDataMode(workspace, hasRealActivity), [workspace, hasRealActivity]);
  const [active, setActive] = useState('Hoy');
  const [period, setPeriod] = useState('Hoy');
  const [tasks, setTasks] = useState([]);
  const periodDays = period === '7 días' ? 7 : period === '30 días' ? 30 : 1;
  // The old period selector didn't actually filter anything -- it toggled a
  // hardcoded demo dataset. Now that calls are real, it filters them by
  // startedAt for real.
  const periodCalls = useMemo(() => {
    const rawCalls = activity?.calls || [];
    if (!rawCalls.length) return rawCalls;
    const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    return rawCalls.filter((call) => !call.startedAt || new Date(call.startedAt).getTime() >= cutoff);
  }, [activity, periodDays]);
  const calls = useMemo(() => periodCalls.map(createRealCallListItem), [periodCalls]);
  const [taskFilter, setTaskFilter] = useState('Todas');
  const [selectedTask, setSelectedTask] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [testCallOpen, setTestCallOpen] = useState(false);
  const [notifications, setNotifications] = useState({ notifications: [], unreadCount: 0 });
  const [notifOpen, setNotifOpen] = useState(false);
  const testProfile = workspace?.profile || { clinicName: identity.clinicName };
  const testScenario = {
    key: 'workspace_browser_test',
    label: 'Llamada libre de prueba',
    description: `Prueba privada del agente configurado para ${identity.clinicName}.`,
  };

  // Real KPIs, computed from the same activity fetch the rest of the page
  // already uses -- no separate endpoint needed for numbers this simple.
  const kpis = useMemo(() => {
    const completed = periodCalls.filter((call) => call.status !== 'ongoing');
    const timed = completed.filter((call) => Number.isFinite(call.durationSeconds));
    const needsAttention = periodCalls.filter((call) => call.followUpRequired).length;
    return {
      totalCalls: periodCalls.length,
      avgDurationSeconds: timed.length ? Math.round(timed.reduce((sum, call) => sum + call.durationSeconds, 0) / timed.length) : null,
      needsAttention,
      resolved: Math.max(0, completed.length - needsAttention),
    };
  }, [periodCalls]);

  useEffect(() => {
    let cancelled = false;
    getWorkspaceActivity(account.getToken)
      .then((data) => {
        if (cancelled) return;
        setActivity(data);
        setTasks(data.tasks.map(createRealTaskRecord));
      })
      .catch(() => {
        if (!cancelled) setActivity({ hasVoiceAgent: false, calls: [], tasks: [] });
      });
    return () => { cancelled = true; };
  }, [account.getToken]);

  useEffect(() => {
    let cancelled = false;
    const load = () => getWorkspaceNotifications(account.getToken)
      .then((data) => { if (!cancelled) setNotifications(data); })
      .catch(() => {});
    load();
    const interval = window.setInterval(load, 45000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [account.getToken]);

  const readNotification = async (notification) => {
    if (notification.readAt) return;
    setNotifications((current) => ({
      unreadCount: Math.max(0, current.unreadCount - 1),
      notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item),
    }));
    try { setNotifications(await markWorkspaceNotificationRead(account.getToken, notification.id)); } catch { /* local state already updated */ }
  };

  const readAllNotifications = async () => {
    setNotifications((current) => ({ unreadCount: 0, notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })) }));
    try { setNotifications(await markAllWorkspaceNotificationsRead(account.getToken)); } catch { /* local state already updated */ }
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
    const removedIndex = tasks.findIndex((item) => item.id === task.id);
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setSelectedTask(null);
    toast(`Pendiente resuelto: ${task.name}`, {
      label: 'Deshacer',
      onClick: () => {
        setTasks((current) => {
          const next = current.filter((item) => item.id !== task.id);
          next.splice(Math.min(removedIndex, next.length), 0, task);
          return next;
        });
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
    setNotifOpen(false);
    setSelectedTask(task);
  };

  const openCommand = () => {
    if (document.querySelector('[aria-modal="true"]')) return;
    setStatusOpen(false);
    setAssistantOpen(false);
    setNotifOpen(false);
    setCommandOpen(true);
  };

  const toggleNotifications = () => {
    setStatusOpen(false);
    setAssistantOpen(false);
    setNotifOpen((value) => !value);
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
        else if (document.querySelector('.notification-popover')) setNotifOpen(false);
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
            onToggleStatus={() => { setNotifOpen(false); setStatusOpen((value) => !value); }}
            onSearch={openCommand}
            onAction={toast}
            notifications={notifications}
            notifOpen={notifOpen}
            onToggleNotifications={toggleNotifications}
            onReadNotification={readNotification}
            onReadAllNotifications={readAllNotifications}
            onNavigate={navigate}
            onSelectTask={selectTask}
            tasks={tasks}
          />
          {active === 'Hoy' ? (
            <Dashboard
              period={period}
              onPeriod={setPeriod}
              taskFilter={taskFilter}
              tasks={tasks}
              calls={calls}
              kpis={kpis}
              onTaskFilter={setTaskFilter}
              onSelectTask={selectTask}
              onNavigate={navigate}
              onAction={toast}
              firstName={identity.firstName}
              isAdmin={identity.isAdmin}
              dataMode={dataMode}
            />
          ) : (
            <ModulePage title={active} tasks={tasks} calls={calls} clinicName={identity.clinicName} dataMode={dataMode} profile={workspace?.profile} connections={workspace?.connections} getToken={account.getToken} isAdmin={identity.isAdmin} onSelectTask={selectTask} onAction={toast} onTestAgent={() => setTestCallOpen(true)} />
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

function Topbar({
  active, clinicName, dataMode, statusOpen, onToggleStatus, onSearch, onAction,
  notifications, notifOpen, onToggleNotifications, onReadNotification, onReadAllNotifications, onNavigate, onSelectTask, tasks,
}) {
  const unreadCount = notifications.unreadCount;
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
        <div className="status-wrap">
          <button className="top-icon" type="button" aria-expanded={notifOpen} aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'} onClick={onToggleNotifications}>
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 && <i>{unreadCount > 9 ? '9+' : unreadCount}</i>}
          </button>
          {notifOpen && (
            <NotificationPopover
              notifications={notifications.notifications}
              onRead={onReadNotification}
              onReadAll={onReadAllNotifications}
              onOpenTask={(notification) => {
                const task = tasks.find((item) => item.id === `task-${notification.taskId}`);
                if (task) { onSelectTask(task); return; }
                onNavigate(notification.taskId ? 'Oportunidades' : 'Conversaciones');
              }}
            />
          )}
        </div>
        <button className="top-icon help-icon" type="button" aria-label="Centro de ayuda" onClick={() => onAction('Centro de ayuda abierto')}>
          <CircleHelp size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function NotificationPopover({ notifications, onRead, onReadAll, onOpenTask }) {
  const hasUnread = notifications.some((item) => !item.readAt);
  return (
    <div className="status-popover notification-popover">
      <div className="popover-title">
        <div><strong>Notificaciones</strong><small>Lo que Lucía registró recientemente</small></div>
        {hasUnread && <button type="button" className="text-link" onClick={onReadAll}>Marcar todas leídas</button>}
      </div>
      <div className="notification-list">
        {notifications.length === 0 && <div className="notification-empty"><Bell size={18} /><span>Sin notificaciones todavía.</span></div>}
        {notifications.map((notification) => (
          <button
            type="button"
            key={notification.id}
            className={`notification-row ${notification.readAt ? '' : 'unread'}`}
            onClick={() => { onRead(notification); if (notification.taskId || notification.callId) onOpenTask(notification); }}
          >
            <span className="notification-dot" aria-hidden="true" />
            <span className="notification-body"><strong>{notification.title}</strong><small>{notification.body}</small><time>{relativeTimeFrom(notification.createdAt)}</time></span>
          </button>
        ))}
      </div>
    </div>
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

function formatKpiDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function KpiStrip({ kpis, isDemoData }) {
  const cards = [
    { label: 'Llamadas registradas', value: kpis.totalCalls.toLocaleString('es-MX'), icon: PhoneCall },
    { label: 'Resueltas sin intervención', value: kpis.resolved.toLocaleString('es-MX'), icon: CheckCircle2 },
    { label: 'Necesitan atención', value: kpis.needsAttention.toLocaleString('es-MX'), icon: ShieldCheck, alert: kpis.needsAttention > 0 },
    { label: 'Duración promedio', value: formatKpiDuration(kpis.avgDurationSeconds), icon: Clock3 },
  ];
  return (
    <section className="kpi-strip" aria-label="Indicadores de actividad">
      {cards.map(({ label, value, icon: Icon, alert }, index) => (
        <article className={`kpi-card ${alert ? 'kpi-card-alert' : ''}`} key={label} style={{ '--stagger': index }}>
          <span className="kpi-icon"><Icon size={17} /></span>
          <strong>{isDemoData ? '—' : value}</strong>
          <span className="kpi-label">{label}</span>
        </article>
      ))}
    </section>
  );
}

function Dashboard({ period, onPeriod, tasks, calls, kpis, taskFilter, onTaskFilter, onSelectTask, onNavigate, onAction, firstName, isAdmin, dataMode }) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const firstTask = tasks[0];
  return (
    <main className="dashboard">
      <section className="page-heading">
        <div>
          <p className="eyebrow">{dataMode.isDemo ? 'Centro de operaciones' : 'Actividad reciente'}</p>
          <h1>{dataMode.isDemo ? `Todo listo para empezar, ${firstName}.` : (tasks.length ? `Hay ${tasks.length} ${tasks.length === 1 ? 'decisión' : 'decisiones'} para hoy, ${firstName}.` : `La cola está resuelta, ${firstName}.`)}</h1>
          <p className="heading-copy">{dataMode.isDemo ? <>La actividad aparecerá aquí cuando tu agente comience a recibir conversaciones.</> : <>Lucía registró {calls.length.toLocaleString('es-MX')} {calls.length === 1 ? 'llamada reciente' : 'llamadas recientes'}. {firstTask ? <strong>Empieza por {firstTask.name}.</strong> : <strong>No quedan acciones pendientes.</strong>}</>}</p>
        </div>
        <div className="period-control" aria-label="Periodo de actividad">
          {['Hoy', '7 días', '30 días'].map((item) => (
            <button key={item} type="button" className={period === item ? 'active' : ''} onClick={() => onPeriod(item)}>{item}</button>
          ))}
        </div>
      </section>

      <KpiStrip kpis={kpis} isDemoData={dataMode.isDemo} />

      <section className="hero-grid">
        <AttentionPanel tasks={tasks} isDemoData={dataMode.isDemo} filter={taskFilter} onFilter={onTaskFilter} onSelect={onSelectTask} onNavigate={onNavigate} />
        <PulsePlaceholder onNavigate={onNavigate} />
      </section>

      <section className="analysis-disclosure">
        <div><p className="eyebrow">Más contexto</p><h2>Agenda, resultados y capacidad</h2><span>Lo esencial ya está arriba. Abre el detalle cuando necesites investigar el rendimiento.</span></div>
        <div className="analysis-facts"><span><small>Agenda hoy</small><strong>Sin citas registradas</strong></span><span><small>Capacidad</small><strong>Sin consumo registrado</strong></span></div>
        <button type="button" aria-expanded={analysisOpen} aria-controls="dashboard-analysis" onClick={() => setAnalysisOpen((value) => !value)}>{analysisOpen ? 'Ocultar análisis' : 'Ver análisis'}<ChevronDown size={16} className={analysisOpen ? 'rotated' : ''} /></button>
      </section>
      {analysisOpen && <div className="analysis-details" id="dashboard-analysis">
        <section className="insight-grid">
          <OutcomePanel reasonsData={[]} isDemoData onNavigate={onNavigate} />
          <AgendaPanel onAction={onAction} />
        </section>
        <CapacityPanel isAdmin={isAdmin} onNavigate={onNavigate} />
      </div>}
    </main>
  );
}

// Call-volume trends (charts, conversion funnel, no-wait rate) need
// aggregated historical data no endpoint computes yet. Rather than fabricate
// numbers, this stays an honest placeholder; app.calls already has enough
// rows to see individual conversations in Conversaciones.
function PulsePlaceholder({ onNavigate }) {
  return (
    <article className="pulse-panel pulse-panel-empty">
      <header className="pulse-header">
        <div className="pulse-kpi">
          <span>Tendencias de llamadas</span>
          <p>Vamos a mostrar aquí el volumen y la duración de llamadas en cuanto tengamos suficiente historial.</p>
        </div>
      </header>
      <button type="button" className="pulse-placeholder-action" onClick={() => onNavigate('Conversaciones')}>Ver conversaciones recientes <ArrowUpRight size={15} /></button>
    </article>
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

function AgendaPanel({ onAction }) {
  // Google Calendar connection is not wired to this dashboard yet (see
  // saveClinicCalendar in lib/server/clerk-control.js), so there is no real
  // appointment source. This stays an honest empty state instead of the
  // previous hardcoded list of 5 fake appointments.
  return (
    <article className="agenda-panel surface-panel">
      <header className="section-head">
        <div><p className="eyebrow">Agenda de hoy</p><h2>Sin citas registradas</h2></div>
        <button type="button" className="calendar-button" aria-label="Abrir calendario" onClick={() => onAction('Calendario abierto')}><CalendarCheck2 size={18} /></button>
      </header>
      <div className="agenda-list agenda-empty">
        <CalendarCheck2 size={20} /><span>Conecta el calendario del negocio para ver la agenda aquí.</span>
      </div>
      <div className="agenda-foot"><Clock3 size={15} /><span>Conecta Google Calendar para consultar espacios</span></div>
    </article>
  );
}

function CapacityPanel({ isAdmin, onNavigate }) {
  // No plan/minutes-limit concept exists in app.calls yet — this stays an
  // honest empty state rather than the previous hardcoded 823/1,000 min.
  return (
    <section className="capacity-panel">
      <div className="capacity-copy"><p className="eyebrow">Reserva mensual</p><div><strong>—</strong><span>Sin consumo registrado</span></div></div>
      <div className="capacity-visual">
        <span>El consumo aparecerá cuando definamos un plan y empecemos a medir minutos por llamada.</span>
      </div>
      {isAdmin && <button type="button" onClick={() => onNavigate('Uso y plan')}>Uso y plan <ArrowUpRight size={15} /></button>}
    </section>
  );
}

function ModulePage({ title, tasks, calls, clinicName, dataMode, profile, connections, getToken, isAdmin, onSelectTask, onAction, onTestAgent }) {
  const copy = moduleCopy[title];
  return (
    <main className="module-page">
      <section className="module-heading">
        <h1>{copy.title}</h1>
        {!['Conexiones', 'Uso y plan'].includes(title) && <button type="button" className="primary-action" onClick={() => onAction(`Nueva acción en ${title}`)}>Nueva acción <ArrowUpRight size={16} /></button>}
      </section>
      {title === 'Conversaciones' && <ConversationsModule tasks={tasks} calls={calls} isDemoData={dataMode.isDemo} onSelectTask={onSelectTask} />}
      {title === 'Oportunidades' && <OpportunitiesModule tasks={tasks} onSelectTask={onSelectTask} />}
      {title === 'Mi agente' && <ReceptionistModule clinicName={clinicName} isDemoData={dataMode.isDemo} profile={profile} getToken={getToken} isAdmin={isAdmin} onAction={onAction} onTestAgent={onTestAgent} />}
      {title === 'Conexiones' && <ConnectionsModule connections={connections} getToken={getToken} isAdmin={isAdmin} onAction={onAction} />}
      {title === 'Uso y plan' && <UsageModule />}
    </main>
  );
}

function ConversationsModule({ tasks, calls, isDemoData, onSelectTask }) {
  const [query, setQuery] = useState('');
  const [resultFilter, setResultFilter] = useState('Todas');
  const [sortOrder, setSortOrder] = useState('Recientes');
  const filteredCalls = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-MX');
    const matches = calls.filter((call) => {
      const matchesQuery = !normalizedQuery || `${call.name} ${call.reason} ${call.result}`.toLocaleLowerCase('es-MX').includes(normalizedQuery);
      const matchesResult = resultFilter === 'Todas' || call.result === resultFilter;
      return matchesQuery && matchesResult;
    });
    return sortOrder === 'Antiguas' ? [...matches].reverse() : matches;
  }, [calls, query, resultFilter, sortOrder]);
  const answeredCalls = calls.filter((call) => call.result !== 'En curso').length;

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
      <aside className="module-aside dark-module-card"><p className="dark-eyebrow">Recientes</p><strong>{calls.length}</strong><span>llamadas registradas</span><dl><div><dt>Atendidas</dt><dd>{answeredCalls}</dd></div><div><dt>Sin respuesta</dt><dd>—</dd></div><div><dt>Fuera de horario</dt><dd>—</dd></div></dl></aside>
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

// Small add/remove list editor shared by the services and off-days fields —
// the "menú más sofisticado" replacement for the free-text version.
function TagListField({ label, hint, placeholder, items, onChange, disabled }) {
  const [draft, setDraft] = useState('');
  const addItem = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft('');
  };
  return (
    <div className="tag-list-field">
      <span className="tag-list-label"><strong>{label}</strong><small>{hint}</small></span>
      <div className="tag-list-items">
        {items.map((item, index) => (
          <span className="tag-chip" key={`${item}-${index}`}>
            {item}
            {!disabled && <button type="button" aria-label={`Quitar ${item}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>×</button>}
          </span>
        ))}
        {items.length === 0 && <small className="tag-list-empty">Sin elementos todavía.</small>}
      </div>
      {!disabled && (
        <div className="tag-list-add">
          <input
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addItem(); } }}
          />
          <button type="button" onClick={addItem}>Agregar</button>
        </div>
      )}
    </div>
  );
}

function agentDraftFromProfile(profile, clinicName) {
  return {
    clinicName: profile?.clinicName || clinicName || '',
    city: profile?.city || '',
    industry: profile?.industry || '',
    description: profile?.description || '',
    businessHours: profile?.businessHours || '',
    greeting: profile?.greeting || '',
    services: profile?.services || [],
    offDays: profile?.offDays || [],
  };
}

function ReceptionistModule({ clinicName, isDemoData, profile, getToken, isAdmin, onAction, onTestAgent }) {
  const [voices, setVoices] = useState([]);
  const [provider, setProvider] = useState(profile?.voiceProvider || 'cartesia');
  const [voiceId, setVoiceId] = useState(profile?.voiceId || 'cartesia-Sofia');
  const [voiceStatus, setVoiceStatus] = useState('loading');
  const [voiceError, setVoiceError] = useState('');
  const providers = useMemo(() => [...new Set(voices.map((voice) => voice.provider))], [voices]);
  const providerVoices = useMemo(() => voices.filter((voice) => voice.provider === provider), [voices, provider]);

  const [agentDraft, setAgentDraft] = useState(() => agentDraftFromProfile(profile, clinicName));
  const [agentStatus, setAgentStatus] = useState('idle');
  const [agentError, setAgentError] = useState('');
  const updateAgentField = (field, value) => { setAgentDraft((current) => ({ ...current, [field]: value })); setAgentStatus('idle'); };

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
  const saveAgentConfiguration = async () => {
    setAgentStatus('saving'); setAgentError('');
    try {
      const result = await updateWorkspaceAgentConfiguration(getToken, agentDraft);
      setAgentDraft(agentDraftFromProfile(result.workspace?.profile, clinicName));
      setAgentStatus('saved');
      onAction('Configuración del agente actualizada');
    } catch (error) { setAgentError(error.message); setAgentStatus('error'); }
  };
  const selectedVoice = voices.find((voice) => voice.id === voiceId);
  const fieldsDisabled = isDemoData || !isAdmin || agentStatus === 'saving';
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

        <div className="agent-settings">
          <div className="voice-settings-heading"><span className="setting-icon"><FileText size={18} /></span><span><strong>Configuración de tu agente</strong><small>{isDemoData ? 'Disponible en cuanto tu agente esté configurado.' : 'Estos cambios se aplican directo al agente en Retell.'}</small></span></div>

          <div className="agent-settings-fields">
            <label><span>Nombre del negocio</span><input disabled={fieldsDisabled} value={agentDraft.clinicName} onChange={(event) => updateAgentField('clinicName', event.target.value)} /></label>
            <label><span>Industria</span><input disabled={fieldsDisabled} value={agentDraft.industry} onChange={(event) => updateAgentField('industry', event.target.value)} placeholder="Ej. Clínica dental" /></label>
            <label><span>Ciudad</span><input disabled={fieldsDisabled} value={agentDraft.city} onChange={(event) => updateAgentField('city', event.target.value)} /></label>
            <label className="agent-settings-full"><span>Descripción breve</span><textarea disabled={fieldsDisabled} rows={2} value={agentDraft.description} onChange={(event) => updateAgentField('description', event.target.value)} placeholder="Qué hace tu negocio, en una frase." /></label>
            <label className="agent-settings-full"><span><Clock3 size={14} /> Horario regular</span><input disabled={fieldsDisabled} value={agentDraft.businessHours} onChange={(event) => updateAgentField('businessHours', event.target.value)} placeholder="Ej. Lunes a viernes, 9:00 a 19:00" /></label>
            <label className="agent-settings-full"><span><MessageSquareText size={14} /> Mensaje inicial</span><textarea disabled={fieldsDisabled} rows={2} value={agentDraft.greeting} onChange={(event) => updateAgentField('greeting', event.target.value)} placeholder="Hola, gracias por llamar a tu negocio. Soy Lucía…" /></label>
          </div>

          <TagListField label="Servicios que conoce" hint="Cada uno se menciona al cliente cuando pregunta." placeholder="Ej. Limpieza dental" items={agentDraft.services} onChange={(value) => updateAgentField('services', value)} disabled={fieldsDisabled} />
          <TagListField label="Excepciones de horario" hint="Días u ocasiones en que no hay servicio." placeholder="Ej. 25 de diciembre" items={agentDraft.offDays} onChange={(value) => updateAgentField('offDays', value)} disabled={fieldsDisabled} />

          <div className="voice-settings-actions">
            {isAdmin ? <button type="button" className="primary-action" disabled={isDemoData || !agentDraft.clinicName || agentStatus === 'saving'} onClick={saveAgentConfiguration}>{agentStatus === 'saving' ? 'Guardando…' : 'Guardar configuración'}</button> : <small>Solo un administrador puede editar la configuración del agente.</small>}
          </div>
          {agentStatus === 'saved' && <p className="voice-success"><CheckCircle2 size={15} /> Configuración actualizada. La siguiente llamada usará estos cambios.</p>}
          {agentError && <p className="voice-error">{agentError}</p>}
        </div>
      </article>
    </section>
  );
}

function CalendarConnectionCard({ calendar, getToken, isAdmin, onAction, onConnected }) {
  const isConnected = calendar.status === 'connected';
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const save = async () => {
    const calendarId = draft.trim();
    if (!calendarId) return;
    setStatus('saving'); setError('');
    try {
      const result = await saveWorkspaceCalendar(getToken, calendarId);
      onConnected(result.connections?.googleCalendar || { status: 'connected' });
      setDraft('');
      setStatus('idle');
      onAction('Calendario conectado');
    } catch (saveError) { setError(saveError.message); setStatus('error'); }
  };

  return (
    <article className="connection-card surface-panel connection-card-editable">
      <header><span className="connection-icon"><CalendarCheck2 size={21} /></span><i className={isConnected ? 'connected' : 'review'}>{isConnected ? 'Conectado' : 'No conectado'}</i></header>
      <h3>Google Calendar</h3>
      <p>{isConnected ? `${calendar.displayName} · ${calendar.capabilities?.join(', ')}` : 'Escribe el ID del calendario de Google para que Lucía pueda consultar disponibilidad y crear citas.'}</p>
      {isConnected && calendar.calendarIdMasked && <code>{calendar.calendarIdMasked}</code>}
      {isAdmin ? (
        <div className="connection-edit">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } }}
            placeholder="negocio@group.calendar.google.com"
            aria-label="ID del calendario de Google"
            disabled={status === 'saving'}
          />
          <button type="button" onClick={save} disabled={!draft.trim() || status === 'saving'}>{status === 'saving' ? 'Guardando…' : isConnected ? 'Cambiar' : 'Conectar'}</button>
        </div>
      ) : <small>Solo un administrador puede conectar el calendario.</small>}
      {error && <p className="voice-error">{error}</p>}
    </article>
  );
}

function ConnectionsModule({ connections = {}, getToken, isAdmin, onAction }) {
  const [calendar, setCalendar] = useState(connections.googleCalendar || { status: 'not_connected' });
  const retell = connections.retell || { status: 'configuring' };
  const requestConnection = (name) => onAction(`Solicitud enviada: te contactaremos para activar ${name}.`);
  const items = [
    { name: 'Telefonía y agente de voz', detail: 'Atiende llamadas, conserva contexto y ejecuta las reglas configuradas.', state: retell.status === 'connected' ? 'Conectado' : 'En configuración', Icon: PhoneCall },
    { name: 'CRM AutiveX', detail: 'Organiza contactos, conversaciones, resultados y siguientes acciones.', state: 'Activo', Icon: Users },
    { name: 'WhatsApp Business', detail: 'Confirmaciones, recordatorios y seguimiento después de cada conversación.', state: 'Disponible como add-on', Icon: MessageSquareText, requestable: true },
    { name: 'Correo y notificaciones', detail: 'Resúmenes de llamadas, alertas y tareas para el equipo.', state: 'Próximamente', Icon: Bell, requestable: true },
    { name: 'Webhooks y automatización', detail: 'Entrega eventos a sistemas externos bajo configuración administrada.', state: 'Administrado por AutiveX', Icon: PlugZap, requestable: true },
  ];
  const connectedCount = items.filter((item) => ['Conectado', 'Activo'].includes(item.state)).length + (calendar.status === 'connected' ? 1 : 0);
  return (
    <section className="connections-workspace">
      <article className="connections-summary dark-module-card">
        <p className="dark-eyebrow">Infraestructura administrada</p>
        <h2>{connectedCount} sistemas operativos</h2>
        <span>Las credenciales y cambios sensibles son gestionados por AutiveX. Tu equipo siempre puede ver qué está conectado y qué función cumple.</span>
      </article>
      <div className="connection-grid">
        <CalendarConnectionCard calendar={calendar} getToken={getToken} isAdmin={isAdmin} onAction={onAction} onConnected={setCalendar} />
        {items.map(({ name, detail, state, Icon, requestable }) => (
          <article className="connection-card surface-panel" key={name}>
            <header><span className="connection-icon"><Icon size={21} /></span><i className={['Conectado', 'Activo'].includes(state) ? 'connected' : 'review'}>{state}</i></header>
            <h3>{name}</h3>
            <p>{detail}</p>
            {requestable && <button type="button" className="text-link connection-request" onClick={() => requestConnection(name)}>Solicitar conexión<ArrowUpRight size={14} /></button>}
          </article>
        ))}
      </div>
    </section>
  );
}

function UsageModule() {
  // No plan/minutes-limit concept exists yet — honest empty state rather
  // than the previous hardcoded 823/1,000/1,500 min figures.
  return (
    <section className="usage-layout">
      <article className="usage-reserve dark-module-card"><p className="dark-eyebrow">Consumo mensual</p><strong>—</strong><span>Sin minutos registrados</span><div className="usage-ring" style={{ '--progress': '0%' }}><i /></div><footer><span>Proyección</span><b>Pendiente</b></footer></article>
      <article className="usage-detail surface-panel"><h2>Tu capacidad este mes</h2><p>El consumo aparecerá automáticamente cuando definamos un plan y empecemos a medir minutos por llamada.</p><dl><div><dt>Incluidos</dt><dd>Pendiente</dd></div><div><dt>Consumidos</dt><dd>—</dd></div><div><dt>Límite de seguridad</dt><dd>Pendiente</dd></div><div><dt>Estado</dt><dd>Sin actividad</dd></div></dl></article>
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
