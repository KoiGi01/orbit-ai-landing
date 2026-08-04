import React, { useCallback, useEffect, useState } from 'react';
import {
  ClerkProvider,
  SignIn,
  SignUp,
  UserButton,
  useAuth,
  useOrganization,
  useUser,
} from '@clerk/react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  Check,
  Clock3,
  Headphones,
  LockKeyhole,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';
import { getWorkspace } from './control-api';
import DevPreview from './dev-preview';
import InternalAdmin from './internal-admin';
import {
  ProspectOnboarding,
  ProspectPreview,
  WorkspaceLoading,
  WorkspaceMessage,
} from './workspace';
import './auth.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const SCHEDULING_URL = import.meta.env.VITE_ONBOARDING_SCHEDULING_URL
  || 'mailto:hola@autivexai.com?subject=Agendar%20onboarding%20de%20AutiveX';
const SUPPORT_URL = import.meta.env.VITE_ONBOARDING_SUPPORT_URL
  || 'mailto:hola@autivexai.com?subject=Ayuda%20con%20mi%20onboarding%20de%20AutiveX';

const clerkAppearance = {
  variables: {
    colorPrimary: '#1859ff',
    colorBackground: '#ffffff',
    colorText: '#071631',
    colorTextSecondary: '#50617a',
    colorInputBackground: '#f6f8ff',
    colorInputText: '#071631',
    borderRadius: '14px',
    fontFamily: 'Instrument Sans Variable, Instrument Sans, sans-serif',
  },
  elements: {
    rootBox: 'autivex-clerk-root',
    cardBox: 'autivex-clerk-card-box',
    card: 'autivex-clerk-card',
    headerTitle: 'autivex-clerk-title',
    headerSubtitle: 'autivex-clerk-subtitle',
    socialButtonsBlockButton: 'autivex-clerk-social',
    formButtonPrimary: 'autivex-clerk-primary',
    formFieldInput: 'autivex-clerk-input',
    footerActionLink: 'autivex-clerk-link',
  },
};

function Brand({ compact = false }) {
  return (
    <div className={`auth-brand${compact ? ' compact' : ''}`} aria-label="AutiveX Control">
      <span><img src="/autivex-mark.png" alt="" /></span>
      <strong>AutiveX</strong>
      <b>Control</b>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-loading" aria-live="polite">
      <Brand compact />
      <div className="auth-loading-orb"><span /></div>
      <p>Preparando tu operación…</p>
    </main>
  );
}

function ClerkSetupScreen() {
  return (
    <main className="clerk-setup-screen">
      <header><Brand /></header>
      <section className="clerk-setup-card">
        <div className="setup-icon"><LockKeyhole size={26} /></div>
        <p className="auth-kicker">Último paso de configuración</p>
        <h1>Conecta Clerk para encender el acceso.</h1>
        <p>Crea una instancia de desarrollo, copia su publishable key y reinicia el dashboard.</p>
        <div className="setup-code">
          <span>dashboard/.env.local</span>
          <code>VITE_CLERK_PUBLISHABLE_KEY=pk_test_…</code>
        </div>
        <a href="https://dashboard.clerk.com" target="_blank" rel="noreferrer">
          Abrir Clerk Dashboard <ArrowRight size={17} />
        </a>
      </section>
    </main>
  );
}

function AuthShowcase() {
  return (
    <section className="auth-showcase">
      <Brand />
      <div className="auth-showcase-copy">
        <p className="auth-kicker">La recepción, bajo control</p>
        <h1>Tu clínica no se detiene cuando tú cierras sesión.</h1>
        <p>Revisa llamadas, citas y pendientes desde un solo lugar. Lucía sigue atendiendo.</p>
      </div>
      <div className="auth-pulse-card">
        <header><span><i /> Operación en vivo</span><b>Ahora</b></header>
        <div className="auth-pulse-main">
          <span className="auth-pulse-icon"><Headphones size={22} /></span>
          <div><small>Lucía está atendiendo</small><strong>Paciente nuevo</strong></div>
          <time>02:14</time>
        </div>
        <div className="auth-pulse-result">
          <span><Check size={15} /></span>
          <div><small>Motivo detectado</small><strong>Valoración de implante</strong></div>
        </div>
        <footer><span>128 llamadas atendidas hoy</span><strong>93% sin espera</strong></footer>
      </div>
      <div className="auth-trust"><ShieldCheck size={17} /><span>Acceso privado para el equipo de tu clínica</span></div>
    </section>
  );
}

function AuthPage({ mode }) {
  return (
    <main className="auth-layout">
      <AuthShowcase />
      <section className="auth-form-panel">
        <div className="auth-mobile-brand"><Brand compact /></div>
        <div className="auth-form-heading">
          <span>{mode === 'sign-in' ? 'Bienvenido de vuelta' : 'Prueba AutiveX en tu clínica'}</span>
          <h2>{mode === 'sign-in' ? 'Entra a tu espacio' : 'Crea tu recepcionista de prueba'}</h2>
        </div>
        {mode === 'sign-in' ? (
          <SignIn
            path="/sign-in"
            routing="path"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/app"
            appearance={clerkAppearance}
          />
        ) : (
          <SignUp
            path="/sign-up"
            routing="path"
            signInUrl="/sign-in"
            fallbackRedirectUrl="/app"
            appearance={clerkAppearance}
          />
        )}
        <div className="auth-support">¿Problemas para entrar? <a href="mailto:hola@autivexai.com">Habla con AutiveX</a></div>
      </section>
    </main>
  );
}

function InvitationPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const ticket = params.get('__clerk_ticket');
  const status = params.get('__clerk_status');
  const invitationUrl = `${location.pathname}${location.search}`;
  const canProcessInvitation = Boolean(ticket) && ['sign_in', 'sign_up'].includes(status);

  if (!isLoaded) return <LoadingScreen />;
  if (status === 'complete' && isSignedIn) return <Navigate to="/onboarding" replace />;

  return (
    <main className="auth-layout">
      <AuthShowcase />
      <section className="auth-form-panel">
        <div className="auth-mobile-brand"><Brand compact /></div>
        <div className="auth-form-heading">
          <span>Invitación privada</span>
          <h2>{canProcessInvitation ? 'Activa el acceso a tu clínica' : 'Este enlace no se puede usar'}</h2>
        </div>
        {canProcessInvitation && status === 'sign_up' ? (
          <SignUp
            path="/accept-invitation"
            routing="path"
            signInUrl={invitationUrl}
            forceRedirectUrl="/onboarding"
            fallbackRedirectUrl="/onboarding"
            appearance={clerkAppearance}
          />
        ) : canProcessInvitation ? (
          <SignIn
            path="/accept-invitation"
            routing="path"
            signUpUrl={invitationUrl}
            forceRedirectUrl="/onboarding"
            fallbackRedirectUrl="/onboarding"
            appearance={clerkAppearance}
          />
        ) : (
          <div className="clerk-setup-card">
            <div className="setup-icon"><LockKeyhole size={26} /></div>
            <p>La invitación está incompleta, ya fue utilizada o venció. Solicita un enlace nuevo a AutiveX.</p>
            <a href={isSignedIn ? '/onboarding' : '/sign-in'}>
              {isSignedIn ? 'Volver a mi onboarding' : 'Iniciar sesión'} <ArrowRight size={17} />
            </a>
          </div>
        )}
        <div className="auth-support">La invitación sólo funciona con el correo al que fue enviada.</div>
      </section>
    </main>
  );
}

function RequireAuth({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function PublicOnly({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Navigate to="/app" replace />;
  return children;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  return <Navigate to={isSignedIn ? '/app' : '/sign-in'} replace />;
}

function getOnboardingView(status) {
  if (status === 'needs_organization') {
    return {
      eyebrow: 'Asignación pendiente',
      title: 'Tu acceso está listo; falta vincular tu clínica.',
      copy: 'Pídele a tu contacto de AutiveX que te agregue a la organización correcta. En cuanto acepte la invitación, este espacio se actualizará.',
      cta: 'Solicitar acceso a mi clínica',
      action: 'support',
      phase: 0,
    };
  }
  if (status === 'scheduled') {
    return {
      eyebrow: 'Sesión agendada',
      title: 'Ya tenemos fecha para conocer tu operación.',
      copy: 'Ten a la mano horarios, servicios, reglas de transferencia y el calendario que usa tu equipo. Nosotros llevamos el resto.',
      cta: 'Revisar o cambiar la sesión',
      action: 'schedule',
      phase: 1,
    };
  }
  if (status === 'configuring') {
    return {
      eyebrow: 'Configuración en curso',
      title: 'Estamos enseñándole a Lucía cómo trabaja tu clínica.',
      copy: 'El equipo de AutiveX está conectando telefonía, agenda y reglas de atención. Te avisaremos cuando la llamada de prueba esté lista.',
      cta: 'Hablar con onboarding',
      action: 'support',
      phase: 2,
    };
  }
  if (status === 'review') {
    return {
      eyebrow: 'Lista para probar',
      title: 'Lucía está esperando su primera llamada de prueba.',
      copy: 'Validaremos juntos las respuestas, transferencias y creación de citas antes de abrir la línea a tus pacientes.',
      cta: 'Agendar prueba final',
      action: 'schedule',
      phase: 3,
    };
  }
  return {
    eyebrow: 'Activación guiada',
    title: 'Vamos a preparar a Lucía para tu clínica.',
    copy: 'En una sesión breve entenderemos tu operación y definiremos qué debe resolver, transferir y agendar tu recepcionista.',
    cta: 'Agendar sesión de arranque',
    action: 'schedule',
    phase: 1,
  };
}

function OnboardingPage({ organization, user, status }) {
  const view = getOnboardingView(status);
  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || 'Hola';
  const clinicName = organization?.name || 'tu clínica';
  const actionUrl = view.action === 'support' ? SUPPORT_URL : SCHEDULING_URL;
  const actionExternal = /^https?:/i.test(actionUrl);
  const steps = [
    { label: 'Cuenta y clínica', detail: organization ? clinicName : 'Pendiente de asignación', icon: Building2 },
    { label: 'Sesión de arranque', detail: status === 'scheduled' ? 'Agendada' : '30 minutos con tu equipo', icon: CalendarCheck2 },
    { label: 'Conexiones', detail: status === 'configuring' ? 'En configuración' : 'Calendario, telefonía y reglas', icon: PhoneCall },
    { label: 'Prueba y activación', detail: status === 'review' ? 'Lista para validar' : 'Validación antes de salir en vivo', icon: Headphones },
  ];

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Brand />
        <div className="onboarding-account">
          <span>{user?.primaryEmailAddress?.emailAddress}</span>
          <UserButton appearance={{ elements: { avatarBox: 'onboarding-avatar' } }} />
        </div>
      </header>
      <div className="onboarding-canvas">
        <section className="onboarding-intro">
          <p className="auth-kicker">{view.eyebrow}</p>
          <span className="onboarding-hello">{firstName}, este es tu siguiente paso.</span>
          <h1>{view.title.replace('tu clínica', clinicName)}</h1>
          <p>{view.copy}</p>
          <a
            className="onboarding-cta"
            href={actionUrl}
            target={actionExternal ? '_blank' : undefined}
            rel={actionExternal ? 'noreferrer' : undefined}
          >
            {view.cta} <ArrowRight size={18} />
          </a>
          <div className="onboarding-duration"><Clock3 size={17} /><span>Sesión práctica de 30 minutos con una persona de AutiveX</span></div>
        </section>

        <section className="onboarding-progress" aria-label="Progreso de activación">
          <header><span>Tu ruta de activación</span><strong>{Math.min(view.phase, 4)} de 4</strong></header>
          <div className="onboarding-progress-track"><i style={{ width: `${Math.min(view.phase, 4) * 25}%` }} /></div>
          <ol>
            {steps.map(({ label, detail, icon: Icon }, index) => {
              const done = index < view.phase;
              const current = index === Math.min(view.phase, 3);
              return (
                <li key={label} className={`${done ? 'done' : ''}${current ? ' current' : ''}`}>
                  <span className="onboarding-step-icon">{done ? <Check size={17} /> : <Icon size={18} />}</span>
                  <div><strong>{label}</strong><small>{detail}</small></div>
                  {current && <b>Ahora</b>}
                </li>
              );
            })}
          </ol>
          <footer><ShieldCheck size={17} /><span>No publicaremos tu número hasta completar la prueba final.</span></footer>
        </section>
      </div>
    </main>
  );
}

function AccountGate({ DashboardComponent }) {
  const location = useLocation();
  const { getToken } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const { organization, membership, isLoaded: organizationLoaded } = useOrganization();
  const [workspace, setWorkspace] = useState(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(true);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const result = await getWorkspace(getToken);
      setWorkspace(result.workspace);
    } catch (error) {
      setWorkspaceError(error.message);
    } finally {
      setWorkspaceLoading(false);
    }
  }, [getToken, organization?.id]);

  useEffect(() => {
    if (userLoaded && organizationLoaded) loadWorkspace();
  }, [userLoaded, organizationLoaded, loadWorkspace]);

  if (!userLoaded || !organizationLoaded || workspaceLoading) return <WorkspaceLoading />;
  if (workspaceError) return <WorkspaceMessage type="error" user={user} detail={workspaceError} />;
  if (workspace?.view === 'internal_admin') return <Navigate to="/admin" replace />;
  if (!workspace || workspace.view === 'organization_required') return <WorkspaceMessage type="organization_required" user={user} />;

  if (workspace.view === 'prospect_intake') {
    return <ProspectOnboarding workspace={workspace} user={user} getToken={getToken} onComplete={setWorkspace} />;
  }

  if (workspace.view === 'prospect_demo') {
    return <ProspectPreview workspace={workspace} user={user} />;
  }

  if (['billing_recovery', 'suspended'].includes(workspace.view)) {
    return <WorkspaceMessage type={workspace.view} user={user} />;
  }

  if (['onboarding', 'provisioning'].includes(workspace.view)) {
    const status = workspace.state?.onboardingStatus || 'needs_onboarding';
    if (location.pathname.startsWith('/app')) return <Navigate to="/onboarding" replace />;
    return <OnboardingPage organization={organization} user={user} status={status} />;
  }

  if (workspace.view === 'live' && location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/app" replace />;
  }

  return <DashboardComponent key={organization.id} account={{ user, organization, membership }} workspace={workspace} />;
}

function DashboardRoutes({ DashboardComponent }) {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/accept-invitation/*" element={<InvitationPage />} />
      <Route path="/sign-in/*" element={<PublicOnly><AuthPage mode="sign-in" /></PublicOnly>} />
      <Route path="/sign-up/*" element={<PublicOnly><AuthPage mode="sign-up" /></PublicOnly>} />
      <Route path="/admin/*" element={<RequireAuth><InternalAdmin /></RequireAuth>} />
      <Route path="/internal/*" element={<Navigate to="/admin" replace />} />
      <Route path="/onboarding/*" element={<RequireAuth><AccountGate DashboardComponent={DashboardComponent} /></RequireAuth>} />
      <Route path="/app/*" element={<RequireAuth><AccountGate DashboardComponent={DashboardComponent} /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ClerkRouter({ DashboardComponent }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
    >
      <DashboardRoutes DashboardComponent={DashboardComponent} />
    </ClerkProvider>
  );
}

export default function DashboardAuth({ DashboardComponent }) {
  const previewScreen = new URLSearchParams(window.location.search).get('preview');
  if (import.meta.env.DEV && ['onboarding', 'preview', 'admin', 'dashboard'].includes(previewScreen)) {
    return <DevPreview screen={previewScreen} DashboardComponent={DashboardComponent} />;
  }
  if (!PUBLISHABLE_KEY) return <ClerkSetupScreen />;
  return (
    <BrowserRouter>
      <ClerkRouter DashboardComponent={DashboardComponent} />
    </BrowserRouter>
  );
}
