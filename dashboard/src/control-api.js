const ERROR_MESSAGES = {
  authentication_required: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  invalid_session: 'No pudimos validar tu sesión. Actualiza la página. Si continúa, cierra sesión desde tu perfil y vuelve a entrar.',
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
  invalid_voice_provider: 'La voz seleccionada no pertenece a ese proveedor.',
  invalid_voice_selection: 'Esa voz ya no está en el catálogo de Retell. Elige otra.',
  voice_catalog_failed: 'No pudimos cargar las voces de Retell en este momento.',
  invalid_voice_emotion: 'Esa emoción de voz no existe en Retell. Elige otra.',
  invalid_stt_mode: 'Ese modo de transcripción no existe en Retell. Elige otro.',
  invalid_agent_runtime: 'Revisa los ajustes avanzados: algún valor no es válido.',
  agent_runtime_update_failed: 'Retell no pudo guardar los ajustes avanzados. Intenta nuevamente.',
  workspace_voice_update_failed: 'Retell no pudo guardar la nueva voz. Intenta nuevamente.',
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
  invalid_location_name: 'Escribe el nombre de la Location.',
  invalid_location_role: 'Selecciona un rol válido para el usuario.',
  too_many_location_users: 'Una Location puede tener hasta 25 usuarios en este MVP.',
  payment_already_verified: 'Este pago ya fue verificado.',
  transition_not_allowed: 'Ese cambio todavía no está permitido para esta clínica.',
  clinic_confirmation_mismatch: 'El nombre escrito no coincide con la clínica.',
  member_not_found: 'Ese miembro todavía no tiene una cuenta activa.',
  member_move_same_location: 'Selecciona otra Location para mover al miembro.',
  member_move_requires_active_user: 'Solo puedes mover miembros que ya aceptaron su invitación.',
  invalid_stage_override: 'Selecciona una etapa válida.',
  invalid_google_calendar_id: 'Escribe el ID completo del calendario de Google.',
  calendar_agent_update_failed: 'No pudimos conectar el calendario al agente de Retell.',
  google_oauth_not_configured: 'La conexión con Google Calendar todavía no está configurada en el servidor.',
  google_calendar_authorization_required: 'Vuelve a conectar tu cuenta de Google para continuar.',
  google_authorization_expired: 'Google retiró el acceso. Vuelve a conectar tu cuenta.',
  google_calendar_not_writable: 'Selecciona un calendario en el que esta cuenta pueda crear citas.',
  google_calendar_request_failed: 'Google Calendar no respondió correctamente. Intenta nuevamente.',
  calendar_read_failed: 'No pudimos leer el calendario seleccionado. Revisa la conexión con Google.',
  multiple_prospect_organizations: 'Ese correo tiene más de una clínica prospecto. Revísalo manualmente.',
  existing_customer_requires_review: 'Ese correo ya pertenece a un cliente pagado. Revisa su cuenta antes de crear otra clínica.',
  workspace_not_provisioned: 'El workspace de Supabase todavía no está preparado para esta cuenta.',
  workspace_has_real_activity: 'Esta Location ya tiene llamadas reales. Escribe su nombre exacto para confirmar que quieres mezclar datos de demostración.',
  retell_agent_already_assigned: 'Ese agente de Retell ya pertenece a otro cliente.',
  retell_provisioning_not_configured: 'Falta configurar la plantilla privada de Retell en el servidor.',
  retell_provisioning_failed: 'Retell no pudo crear el agente borrador. No se activó producción.',
  provisioning_webhook_not_configured: 'El webhook de n8n tiene URL, pero le falta su secreto de firma.',
  provisioning_webhook_failed: 'El agente quedó guardado, pero n8n no confirmó el evento. Intenta iniciar la configuración nuevamente.',
  workspace_agent_not_ready: 'El agente de esta clínica todavía no está listo para probarse.',
  workspace_test_call_not_allowed: 'Esta cuenta todavía no puede iniciar llamadas de prueba.',
  workspace_test_call_failed: 'Retell no pudo iniciar la llamada de prueba. Intenta de nuevo.',
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

export function createWorkspaceTestCall(getToken, scenario) {
  return controlRequest(getToken, '/api/workspace', {
    method: 'POST',
    body: JSON.stringify({ action: 'create_test_call', scenario }),
  });
}

export function getWorkspaceVoices(getToken) {
  return controlRequest(getToken, '/api/workspace?resource=voices');
}

export function getWorkspaceActivity(getToken) {
  return controlRequest(getToken, '/api/workspace?resource=activity');
}

export function getWorkspaceCalendar(getToken, { fromISO, toISO } = {}) {
  const params = new URLSearchParams();
  if (fromISO) params.set('from', fromISO);
  if (toISO) params.set('to', toISO);
  const suffix = params.toString() ? `&${params.toString()}` : '';
  return controlRequest(getToken, `/api/workspace?resource=calendar${suffix}`);
}

export function getWorkspaceNotifications(getToken) {
  return controlRequest(getToken, '/api/workspace?resource=notifications');
}

export function markWorkspaceNotificationRead(getToken, notificationId) {
  return controlRequest(getToken, '/api/workspace', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'mark_notification_read', notificationId }),
  });
}

export function markAllWorkspaceNotificationsRead(getToken) {
  return controlRequest(getToken, '/api/workspace', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'mark_all_notifications_read' }),
  });
}

export function getGoogleCalendarOptions(getToken) {
  return controlRequest(getToken, '/api/google/calendar/options');
}

export function beginGoogleCalendarOAuth(getToken) {
  return controlRequest(getToken, '/api/google/calendar/start', { method: 'POST' });
}

export function saveWorkspaceCalendar(getToken, calendar) {
  return controlRequest(getToken, '/api/workspace', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'save_calendar', calendar }),
  });
}

export function updateWorkspaceVoice(getToken, voiceId) {
  return controlRequest(getToken, '/api/workspace', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'update_voice', voiceId }),
  });
}

export function updateWorkspaceAgentConfiguration(getToken, agent) {
  return controlRequest(getToken, '/api/workspace', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'update_agent_configuration', agent }),
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

export function deleteInternalClinic(getToken, body) {
  return controlRequest(getToken, '/api/internal/clinics', {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
}
