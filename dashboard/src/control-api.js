const ERROR_MESSAGES = {
  authentication_required: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  invalid_session: 'No pudimos validar tu sesión. Actualiza la página.',
  organization_required: 'Tu cuenta todavía no tiene una clínica activa.',
  organization_admin_required: 'Solo el administrador de la clínica puede hacer este cambio.',
  internal_access_denied: 'Esta cuenta no tiene acceso a Operaciones AutiveX.',
  admin_access_not_configured: 'Falta configurar la cuenta interna autorizada en el servidor.',
  server_not_configured: 'Falta conectar las llaves privadas de Clerk en el servidor.',
  database_not_configured: 'Falta conectar la base operativa de Supabase en el servidor.',
  invalid_owner_name: 'Escribe el nombre del propietario.',
  invalid_owner_phone: 'Escribe el teléfono del propietario en formato internacional, por ejemplo +525512345678.',
  invalid_city: 'Escribe la ciudad del negocio.',
  invalid_industry: 'Escribe la industria o giro del negocio.',
  invalid_business_description: 'Describe brevemente qué hace el negocio.',
  invalid_business_hours: 'Escribe los horarios del negocio.',
  invalid_timezone: 'Selecciona una zona horaria válida.',
  invalid_website: 'Escribe una URL completa, por ejemplo https://negocio.mx.',
  invalid_services: 'Agrega al menos un servicio principal.',
  invalid_call_goals: 'Agrega al menos un motivo de llamada.',
  invalid_scheduling_provider: 'Selecciona cómo administra actualmente su agenda.',
  invalid_payment_amount: 'Escribe un monto válido.',
  invalid_payment_reference: 'Agrega una referencia o folio del pago.',
  invalid_payment_date: 'Selecciona la fecha en que se acreditó el pago.',
  invalid_retell_agent_id: 'El Retell agent ID no tiene el formato esperado.',
  invalid_assigned_phone_number: 'Escribe el número asignado en formato E.164, por ejemplo +525512345678.',
  invalid_fallback_phone_number: 'Escribe el teléfono humano de respaldo en formato E.164.',
  invalid_retell_call_id: 'El Retell call ID de la prueba no tiene el formato esperado.',
  invalid_provisioning_confirmations: 'Revisa las confirmaciones operativas del provisionamiento.',
  provisioning_phone_conflict: 'El número de AutiveX y el teléfono humano de respaldo deben ser diferentes.',
  provisioning_not_allowed: 'Primero inicia la configuración de esta clínica.',
  provisioning_not_ready: 'Falta completar y verificar el provisionamiento antes de avanzar.',
  invalid_email: 'Escribe un correo válido.',
  payment_already_verified: 'Este pago ya fue verificado.',
  transition_not_allowed: 'Ese cambio todavía no está permitido para esta clínica.',
  clinic_confirmation_mismatch: 'El nombre escrito no coincide con la clínica.',
  multiple_prospect_organizations: 'Ese correo tiene más de una clínica prospecto. Revísalo manualmente.',
  existing_customer_requires_review: 'Ese correo ya pertenece a un cliente pagado. Revisa su cuenta antes de crear otra clínica.',
  workspace_not_provisioned: 'El workspace de Supabase todavía no está preparado para esta cuenta.',
  retell_agent_already_assigned: 'Ese agente de Retell ya pertenece a otro cliente.',
};

export class ControlApiError extends Error {
  constructor(code, message, status) {
    super(message || ERROR_MESSAGES[code] || 'No pudimos completar la operación.');
    this.name = 'ControlApiError';
    this.code = code;
    this.status = status;
  }
}

export async function controlRequest(getToken, path, options = {}) {
  const token = await getToken();
  if (!token) throw new ControlApiError('authentication_required', null, 401);

  const response = await fetch(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ControlApiError(
      payload.error,
      ERROR_MESSAGES[payload.error] || payload.message,
      response.status,
    );
  }
  return payload;
}

export function getWorkspace(getToken) {
  return controlRequest(getToken, '/api/workspace');
}

export function saveWorkspaceProfile(getToken, profile) {
  return controlRequest(getToken, '/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ profile }),
  });
}

export function getInternalClinics(getToken, query = '') {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : '';
  return controlRequest(getToken, `/api/internal/clinics${suffix}`);
}

export function createInternalClinic(getToken, body) {
  return controlRequest(getToken, '/api/internal/clinics', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateInternalClinic(getToken, body) {
  return controlRequest(getToken, '/api/internal/clinics', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
