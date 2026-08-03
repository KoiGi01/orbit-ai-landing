import { createClerkClient, verifyToken } from '@clerk/backend';

const PAYMENT_METHODS = new Set([
  'mercado_pago_terminal',
  'mercado_pago_link',
  'transfer',
  'cash',
  'invoice_paid',
  'other',
]);

const CALL_GOALS = new Set([
  'new_patient',
  'reschedule',
  'urgent',
  'services',
  'prices',
  'reception',
]);

const SERVICES = new Set([
  'general',
  'urgent',
  'orthodontics',
  'implants',
  'endodontics',
  'surgery',
  'pediatric',
  'cosmetic',
  'other',
]);

const SCHEDULES = new Set([
  'weekdays',
  'weekdays_saturday',
  'custom',
  'unknown',
]);

const APPOINTMENT_OUTCOMES = new Set([
  'offer_demo_slots',
  'capture_for_confirmation',
  'simulate_transfer',
]);

let cachedClient;

export class ControlError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.name = 'ControlError';
    this.status = status;
    this.code = code;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new ControlError(503, 'server_not_configured', `Missing ${name}`);
  return value;
}

function clerk() {
  if (!cachedClient) cachedClient = createClerkClient({ secretKey: requiredEnv('CLERK_SECRET_KEY') });
  return cachedClient;
}

function cleanText(value, maxLength = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ControlError(400, 'invalid_email', 'Escribe un correo válido.');
  }
  return email;
}

function normalizeArray(value, allowed, maximum, field) {
  const items = [...new Set(Array.isArray(value) ? value.map((item) => cleanText(item, 60)) : [])]
    .filter((item) => allowed.has(item));
  if (!items.length || items.length > maximum) {
    throw new ControlError(400, `invalid_${field}`, `Revisa el campo ${field}.`);
  }
  return items;
}

function arrayFromEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function bearerFromHeader(authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ControlError(401, 'authentication_required');
  return match[1];
}

function organizationClaim(claims) {
  if (claims?.o?.id) {
    return {
      orgId: claims.o.id,
      orgRole: claims.o.rol ? `org:${claims.o.rol}` : null,
    };
  }
  return {
    orgId: claims?.org_id || null,
    orgRole: claims?.org_role || null,
  };
}

export async function authenticateSession(authorization) {
  const secretKey = requiredEnv('CLERK_SECRET_KEY');
  const token = bearerFromHeader(authorization);
  const authorizedParties = arrayFromEnv('CLERK_AUTHORIZED_PARTIES');

  let claims;
  try {
    claims = await verifyToken(token, {
      secretKey,
      ...(authorizedParties.length ? { authorizedParties } : {}),
    });
  } catch {
    throw new ControlError(401, 'invalid_session');
  }

  const { orgId, orgRole } = organizationClaim(claims);
  return {
    userId: claims.sub,
    sessionId: claims.sid,
    orgId,
    orgRole,
  };
}

function primaryEmail(user) {
  return user?.primaryEmailAddress?.emailAddress
    || user?.emailAddresses?.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress
    || user?.emailAddresses?.[0]?.emailAddress
    || '';
}

async function requireInternalAdmin(authorization) {
  const session = await authenticateSession(authorization);
  const allowedIds = new Set(arrayFromEnv('AUTIVEX_ADMIN_USER_IDS'));
  const allowedEmails = new Set(arrayFromEnv('AUTIVEX_ADMIN_EMAILS').map((email) => email.toLowerCase()));

  if (!allowedIds.size && !allowedEmails.size) {
    throw new ControlError(503, 'admin_access_not_configured');
  }

  if (allowedIds.has(session.userId)) return session;

  if (allowedEmails.size) {
    const user = await clerk().users.getUser(session.userId);
    if (allowedEmails.has(primaryEmail(user).toLowerCase())) return session;
  }

  throw new ControlError(403, 'internal_access_denied');
}

function normalizeProfile(raw = {}) {
  const clinicName = cleanText(raw.clinicName, 80);
  const city = cleanText(raw.city, 80);
  const callGoals = normalizeArray(raw.callGoals, CALL_GOALS, 3, 'call_goals');
  const services = normalizeArray(raw.services, SERVICES, 9, 'services');
  const otherService = services.includes('other') ? cleanText(raw.otherService, 80) : '';
  const schedule = cleanText(raw.schedule, 40);
  const customSchedule = schedule === 'custom' ? cleanText(raw.customSchedule, 160) : '';
  const appointmentOutcome = cleanText(raw.appointmentOutcome, 60);

  if (clinicName.length < 2) throw new ControlError(400, 'invalid_clinic_name');
  if (city.length < 2) throw new ControlError(400, 'invalid_city');
  if (!SCHEDULES.has(schedule)) throw new ControlError(400, 'invalid_schedule');
  if (schedule === 'custom' && customSchedule.length < 4) throw new ControlError(400, 'invalid_custom_schedule');
  if (!APPOINTMENT_OUTCOMES.has(appointmentOutcome)) throw new ControlError(400, 'invalid_appointment_outcome');
  if (services.includes('other') && otherService.length < 2) throw new ControlError(400, 'invalid_other_service');

  return {
    clinicName,
    city,
    callGoals,
    services,
    otherService,
    schedule,
    customSchedule,
    appointmentOutcome,
    updatedAt: new Date().toISOString(),
  };
}

function normalizePayment(raw = {}) {
  const method = cleanText(raw.method, 60);
  const reference = cleanText(raw.reference, 120);
  const note = cleanText(raw.note, 400);
  const paidAt = cleanText(raw.paidAt, 40) || new Date().toISOString();
  const amountCents = Number(raw.amountCents);

  if (!PAYMENT_METHODS.has(method)) throw new ControlError(400, 'invalid_payment_method');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
    throw new ControlError(400, 'invalid_payment_amount');
  }
  if (reference.length < 3) throw new ControlError(400, 'invalid_payment_reference');
  if (Number.isNaN(Date.parse(paidAt))) throw new ControlError(400, 'invalid_payment_date');

  return {
    method,
    reference,
    note,
    amountCents,
    currency: 'MXN',
    paidAt: new Date(paidAt).toISOString(),
  };
}

function normalizeRetellId(value, errorCode) {
  const id = cleanText(value, 160);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new ControlError(400, errorCode);
  return id;
}

function normalizeE164(value, errorCode) {
  const phone = cleanText(value, 40).replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new ControlError(400, errorCode);
  return phone;
}

function provisioningReadiness(raw = {}) {
  const checks = {
    retellAgentConfigured: /^[A-Za-z0-9_-]{8,128}$/.test(String(raw.retellAgentId || '')),
    assignedNumberConfigured: /^\+[1-9]\d{7,14}$/.test(String(raw.assignedPhoneNumber || '')),
    fallbackNumberConfigured: /^\+[1-9]\d{7,14}$/.test(String(raw.fallbackPhoneNumber || '')),
    approvedTestCallRecorded: /^[A-Za-z0-9_-]{8,128}$/.test(String(raw.approvedTestCallId || '')),
    fallbackTested: raw.fallbackTested === true,
    postCallWebhookVerified: raw.postCallWebhookVerified === true,
  };
  return { ready: Object.values(checks).every(Boolean), checks };
}

function normalizeProvisioning(raw = {}) {
  const retellAgentId = normalizeRetellId(raw.retellAgentId, 'invalid_retell_agent_id');
  const assignedPhoneNumber = normalizeE164(raw.assignedPhoneNumber, 'invalid_assigned_phone_number');
  const fallbackPhoneNumber = normalizeE164(raw.fallbackPhoneNumber, 'invalid_fallback_phone_number');
  const approvedTestCallId = normalizeRetellId(raw.approvedTestCallId, 'invalid_retell_call_id');

  if (assignedPhoneNumber === fallbackPhoneNumber) {
    throw new ControlError(400, 'provisioning_phone_conflict');
  }
  if (typeof raw.fallbackTested !== 'boolean' || typeof raw.postCallWebhookVerified !== 'boolean') {
    throw new ControlError(400, 'invalid_provisioning_confirmations');
  }

  return {
    retellAgentId,
    assignedPhoneNumber,
    fallbackPhoneNumber,
    approvedTestCallId,
    fallbackTested: raw.fallbackTested,
    postCallWebhookVerified: raw.postCallWebhookVerified,
  };
}

function serializeProvisioningForAdmin(raw = {}) {
  const readiness = provisioningReadiness(raw);
  return {
    retellAgentId: cleanText(raw.retellAgentId, 160),
    assignedPhoneNumber: cleanText(raw.assignedPhoneNumber, 40),
    fallbackPhoneNumber: cleanText(raw.fallbackPhoneNumber, 40),
    approvedTestCallId: cleanText(raw.approvedTestCallId, 160),
    fallbackTested: raw.fallbackTested === true,
    postCallWebhookVerified: raw.postCallWebhookVerified === true,
    updatedAt: raw.updatedAt || null,
    updatedByUserId: cleanText(raw.updatedByUserId, 80) || null,
    ...readiness,
  };
}

function auditEntry(action, actorUserId, details = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    action,
    actorUserId,
    at: new Date().toISOString(),
    ...details,
  };
}

function nextAudit(privateMetadata, entry) {
  const previous = Array.isArray(privateMetadata?.auditTrail) ? privateMetadata.auditTrail : [];
  return [...previous.slice(-24), entry];
}

function metadataState(organization) {
  const publicMetadata = organization?.publicMetadata || {};
  return {
    billingStatus: cleanText(publicMetadata.billingStatus || 'unpaid', 40),
    onboardingStatus: cleanText(publicMetadata.onboardingStatus || 'prospect_intake', 40),
    serviceStatus: cleanText(publicMetadata.serviceStatus || 'demo', 40),
    profileComplete: publicMetadata.profileComplete === true,
  };
}

export function resolveWorkspaceView(state) {
  if (state.serviceStatus === 'suspended') return 'suspended';
  if (['past_due', 'canceled', 'refunded', 'disputed'].includes(state.billingStatus)) return 'billing_recovery';
  if (state.billingStatus === 'verified' && state.serviceStatus === 'live' && state.onboardingStatus === 'active') return 'live';
  if (state.billingStatus === 'verified' && ['configuring', 'review'].includes(state.onboardingStatus)) return 'provisioning';
  if (state.billingStatus === 'verified') return 'onboarding';
  return state.profileComplete ? 'prospect_demo' : 'prospect_intake';
}

function serializeWorkspace(organization) {
  const state = metadataState(organization);
  const profile = organization.privateMetadata?.prospectProfile || null;
  return {
    view: resolveWorkspaceView(state),
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    state,
    profile,
  };
}

export async function getWorkspace(authorization) {
  const session = await authenticateSession(authorization);
  if (!session.orgId) {
    return { view: 'organization_required', state: null, profile: null, organization: null };
  }
  const organization = await clerk().organizations.getOrganization({ organizationId: session.orgId });
  return serializeWorkspace(organization);
}

export async function saveProspectProfile(authorization, rawProfile) {
  const session = await authenticateSession(authorization);
  if (!session.orgId) throw new ControlError(409, 'organization_required');
  if (session.orgRole && session.orgRole !== 'org:admin') throw new ControlError(403, 'organization_admin_required');

  const profile = normalizeProfile(rawProfile);
  const organization = await clerk().organizations.getOrganization({ organizationId: session.orgId });
  const state = metadataState(organization);

  await clerk().organizations.updateOrganization(session.orgId, { name: profile.clinicName });
  await clerk().organizations.updateOrganizationMetadata(session.orgId, {
    publicMetadata: {
      profileComplete: true,
      businessType: 'Clínica dental',
      ...(state.billingStatus === 'unpaid' ? {
        onboardingStatus: 'prospect_ready',
        serviceStatus: 'demo',
      } : {}),
    },
    privateMetadata: {
      prospectProfile: profile,
      auditTrail: nextAudit(
        organization.privateMetadata,
        auditEntry('prospect_profile_completed', session.userId),
      ),
    },
  });

  const updated = await clerk().organizations.getOrganization({ organizationId: session.orgId });
  return serializeWorkspace(updated);
}

function stageLabel(state) {
  const view = resolveWorkspaceView(state);
  const labels = {
    prospect_intake: 'Registro incompleto',
    prospect_demo: 'Prospecto en demo',
    onboarding: 'Onboarding',
    provisioning: 'Configuración',
    live: 'En producción',
    billing_recovery: 'Cobro pendiente',
    suspended: 'Suspendido',
  };
  return labels[view] || view;
}

async function ownerForOrganization(organizationId, fallbackEmail = '') {
  if (fallbackEmail) return { email: fallbackEmail, name: '' };
  try {
    const { data } = await clerk().users.getUserList({ organizationId: [organizationId], limit: 5 });
    const owner = data[0];
    return {
      email: primaryEmail(owner),
      name: owner?.fullName || [owner?.firstName, owner?.lastName].filter(Boolean).join(' '),
    };
  } catch {
    return { email: '', name: '' };
  }
}

async function serializeClinicForAdmin(organization) {
  const state = metadataState(organization);
  const owner = await ownerForOrganization(organization.id, organization.privateMetadata?.ownerEmail);
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt,
    membersCount: organization.membersCount || 0,
    owner,
    state,
    stage: stageLabel(state),
    profile: organization.privateMetadata?.prospectProfile || null,
    payment: organization.privateMetadata?.payment || null,
    provisioning: serializeProvisioningForAdmin(organization.privateMetadata?.provisioning),
    invitation: organization.privateMetadata?.invitation || null,
    auditTrail: Array.isArray(organization.privateMetadata?.auditTrail)
      ? organization.privateMetadata.auditTrail.slice(-12).reverse()
      : [],
  };
}

export async function listClinics(authorization, query = '') {
  await requireInternalAdmin(authorization);
  const response = await clerk().organizations.getOrganizationList({
    limit: 100,
    orderBy: '-created_at',
    ...(cleanText(query, 100) ? { query: cleanText(query, 100) } : {}),
    includeMembersCount: true,
  });

  const clinics = await Promise.all(response.data.map(serializeClinicForAdmin));
  return { clinics, totalCount: response.totalCount };
}

async function writeVerifiedPayment(organization, session, rawPayment, extraPrivate = {}) {
  const payment = normalizePayment(rawPayment);
  const verifiedAt = new Date().toISOString();
  const record = {
    ...payment,
    status: 'verified',
    verificationMode: 'manual_admin',
    verifiedAt,
    verifiedByUserId: session.userId,
  };

  await clerk().organizations.updateOrganizationMetadata(organization.id, {
    publicMetadata: {
      accountStage: 'customer',
      billingStatus: 'verified',
      onboardingStatus: 'needs_onboarding',
      serviceStatus: 'locked',
    },
    privateMetadata: {
      ...extraPrivate,
      payment: record,
      auditTrail: nextAudit(
        organization.privateMetadata,
        auditEntry('manual_payment_verified', session.userId, {
          amountCents: payment.amountCents,
          currency: payment.currency,
          method: payment.method,
          reference: payment.reference,
        }),
      ),
    },
  });

  return record;
}

export async function confirmManualPayment(authorization, organizationId, rawPayment) {
  const session = await requireInternalAdmin(authorization);
  const id = cleanText(organizationId, 80);
  if (!id.startsWith('org_')) throw new ControlError(400, 'invalid_organization');
  const organization = await clerk().organizations.getOrganization({ organizationId: id });
  const state = metadataState(organization);
  if (state.billingStatus === 'verified') throw new ControlError(409, 'payment_already_verified');

  await writeVerifiedPayment(organization, session, rawPayment);
  const updated = await clerk().organizations.getOrganization({ organizationId: id });
  return serializeClinicForAdmin(updated);
}

async function findReusableOrganization(email) {
  const { data: users } = await clerk().users.getUserList({ emailAddress: [email], limit: 2 });
  if (!users.length) return { user: null, organization: null };
  const user = users[0];
  const { data: memberships } = await clerk().users.getOrganizationMembershipList({ userId: user.id, limit: 10 });
  const organizations = await Promise.all(memberships
    .map((membership) => membership.organization?.id)
    .filter(Boolean)
    .map((organizationId) => clerk().organizations.getOrganization({ organizationId })));
  const candidates = organizations
    .filter((organization) => metadataState(organization).billingStatus !== 'verified');

  if (candidates.length > 1) throw new ControlError(409, 'multiple_prospect_organizations');
  if (!candidates.length && organizations.length) throw new ControlError(409, 'existing_customer_requires_review');
  return { user, organization: candidates[0] || null };
}

export async function createPaidClinic(authorization, raw = {}) {
  const session = await requireInternalAdmin(authorization);
  const clinicName = cleanText(raw.clinicName, 80);
  const city = cleanText(raw.city, 80);
  const email = normalizeEmail(raw.email);
  if (clinicName.length < 2) throw new ControlError(400, 'invalid_clinic_name');
  const payment = normalizePayment(raw.payment);

  const reusable = await findReusableOrganization(email);
  let organization = reusable.organization;
  let invitation = null;

  if (organization) {
    await clerk().organizations.updateOrganization(organization.id, { name: clinicName });
    organization = await clerk().organizations.getOrganization({ organizationId: organization.id });
  } else {
    organization = await clerk().organizations.createOrganization({
      name: clinicName,
      maxAllowedMemberships: 3,
      ...(reusable.user ? { createdBy: reusable.user.id } : {}),
    });
  }

  if (!reusable.user) {
    const appUrl = String(process.env.AUTIVEX_APP_URL || 'http://127.0.0.1:4184').replace(/\/$/, '');
    invitation = await clerk().organizations.createOrganizationInvitation({
      organizationId: organization.id,
      emailAddress: email,
      role: 'org:admin',
      expiresInDays: 30,
      redirectUrl: `${appUrl}/accept-invitation`,
    });
  }

  await writeVerifiedPayment(organization, session, payment, {
    ownerEmail: email,
    acquisitionSource: cleanText(raw.source || 'local_sales', 60),
    ...(city ? { intakeSeed: { city } } : {}),
    ...(invitation ? {
      invitation: {
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      },
    } : {}),
  });

  const updated = await clerk().organizations.getOrganization({ organizationId: organization.id });
  return serializeClinicForAdmin(updated);
}

export async function saveProvisioning(authorization, organizationId, rawProvisioning) {
  const session = await requireInternalAdmin(authorization);
  const id = cleanText(organizationId, 80);
  if (!id.startsWith('org_')) throw new ControlError(400, 'invalid_organization');

  const organization = await clerk().organizations.getOrganization({ organizationId: id });
  const state = metadataState(organization);
  if (state.billingStatus !== 'verified' || !['configuring', 'review'].includes(state.onboardingStatus)) {
    throw new ControlError(409, 'provisioning_not_allowed');
  }

  const provisioning = normalizeProvisioning(rawProvisioning);
  const readiness = provisioningReadiness(provisioning);
  const record = {
    ...provisioning,
    updatedAt: new Date().toISOString(),
    updatedByUserId: session.userId,
  };

  await clerk().organizations.updateOrganizationMetadata(id, {
    privateMetadata: {
      provisioning: record,
      auditTrail: nextAudit(
        organization.privateMetadata,
        auditEntry('provisioning_saved', session.userId, { ready: readiness.ready }),
      ),
    },
  });

  const updated = await clerk().organizations.getOrganization({ organizationId: id });
  return serializeClinicForAdmin(updated);
}

const ADMIN_TRANSITIONS = {
  schedule_onboarding: {
    allowed: (state) => state.billingStatus === 'verified' && ['needs_onboarding', 'prospect_ready'].includes(state.onboardingStatus),
    publicMetadata: { onboardingStatus: 'scheduled', serviceStatus: 'locked' },
  },
  start_configuration: {
    allowed: (state) => state.billingStatus === 'verified' && ['needs_onboarding', 'scheduled'].includes(state.onboardingStatus),
    publicMetadata: { onboardingStatus: 'configuring', serviceStatus: 'provisioning' },
  },
  publish_test: {
    allowed: (state) => state.billingStatus === 'verified' && state.onboardingStatus === 'configuring',
    publicMetadata: { onboardingStatus: 'review', serviceStatus: 'provisioning' },
  },
  go_live: {
    allowed: (state) => state.billingStatus === 'verified' && state.onboardingStatus === 'review',
    publicMetadata: { onboardingStatus: 'active', serviceStatus: 'live' },
  },
  suspend: {
    allowed: (state) => state.serviceStatus === 'live',
    publicMetadata: { serviceStatus: 'suspended' },
  },
};

export async function transitionClinic(authorization, organizationId, action, confirmation = '') {
  const session = await requireInternalAdmin(authorization);
  const id = cleanText(organizationId, 80);
  const transition = ADMIN_TRANSITIONS[cleanText(action, 60)];
  if (!id.startsWith('org_') || !transition) throw new ControlError(400, 'invalid_transition');

  const organization = await clerk().organizations.getOrganization({ organizationId: id });
  const state = metadataState(organization);
  if (!transition.allowed(state)) throw new ControlError(409, 'transition_not_allowed');

  if (['publish_test', 'go_live'].includes(action)
    && !provisioningReadiness(organization.privateMetadata?.provisioning).ready) {
    throw new ControlError(409, 'provisioning_not_ready');
  }

  if (action === 'go_live' && cleanText(confirmation, 80).toLowerCase() !== organization.name.toLowerCase()) {
    throw new ControlError(400, 'clinic_confirmation_mismatch');
  }

  await clerk().organizations.updateOrganizationMetadata(id, {
    publicMetadata: transition.publicMetadata,
    privateMetadata: {
      auditTrail: nextAudit(
        organization.privateMetadata,
        auditEntry(action, session.userId, { previous: state }),
      ),
    },
  });

  const updated = await clerk().organizations.getOrganization({ organizationId: id });
  return serializeClinicForAdmin(updated);
}

export function errorResponse(error) {
  if (error instanceof ControlError) {
    return { status: error.status, body: { error: error.code, message: error.message } };
  }
  console.error('AutiveX control error:', error?.message || error);
  return { status: 500, body: { error: 'internal_error' } };
}
