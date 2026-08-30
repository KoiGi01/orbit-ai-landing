import React from 'react';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { LogOut, UserRoundCog } from 'lucide-react';

// Clerk stamps an `act` claim on any session opened through an actor token and
// surfaces it as `actor`. Its presence is the only thing separating an
// impersonated session from a real one, so it is what this bar keys on -- and
// why the bar can live above every route without knowing which one is rendered.
export default function ImpersonationBanner() {
  const { actor, isLoaded } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded || !actor) return null;

  const viewing = user?.primaryEmailAddress?.emailAddress || 'este usuario';
  // Impersonation replaced the operator's own session, so leaving cannot restore
  // it. Sending them to sign-in with a redirect at least lands them back in the
  // console after one more authentication.
  const leave = async () => {
    await signOut();
    window.location.href = '/sign-in?redirect_url=/admin';
  };

  return (
    <div className="impersonation-bar" role="status">
      <span className="impersonation-bar-copy">
        <UserRoundCog size={14} aria-hidden="true" />
        Estás viendo AutiveX como <strong>{viewing}</strong>
      </span>
      <button type="button" className="impersonation-bar-exit" onClick={leave}>
        <LogOut size={13} aria-hidden="true" /> Salir de la sesión
      </button>
    </div>
  );
}
