import { createClerkClient, verifyToken } from '@clerk/backend';
import {
  getWorkspaceFoundation,
  provisionVoiceAgentDraft,
  provisionVoiceAgentFoundation,
  provisionWorkspaceFoundation,
} from './crm-foundation.js';
import {
  createRetellAgentDraft,
  createRetellWorkspaceWebCall,
  deleteRetellAgentDraft,
  notifyProvisioningStarted,
} from './retell-provisioning.js';

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

const SCHEDULING_PROVIDERS = new Set([
  'cal_com',
  'google_calendar',
  'calendly',
  'manual',
  'none',
]);

const LOCATION_ACCESS_ROLES = new Set(['org:admin', 'org:member']);

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

export function normalizeLocationMembers(ownerEmail, rawMembers = []) {
  const owner = normalizeEmail(ownerEmail);
  const members = [{ email: owner, role: 'org:admin' }];
  const seen = new Set([owner]);

  for (const raw of Array.isArray(rawMembers) ? rawMembers : []) {
    const email = normalizeEmail(typeof raw === 'string' ? raw : raw?.email);
    if (seen.has(email)) continue;
    const role = cleanText(typeof raw === 'string' ? 'org:member' : raw?.role, 40) || 'org:member';
    if (!LOCATION_ACCESS_ROLES.has(role)) throw new ControlError(400, 'invalid_location_role');
    seen.add(email);
    members.push({ email, role });
  }

  if (members.length > 25) throw new ControlError(400, 'too_many_location_users');
  return members;
}

function normalizeStringList(value, maximum, field) {
  const items = [...new Set(Array.isArray(value) ? value.map((item) => cleanText(item, 100)) : [])]
    .filter(Boolean);
  if (!items.length || items.length > maximum) {
    throw new ControlError(400, `invalid_${field}`, `Revisa el campo ${field}.`);
  }
  return items;
}

function normalizeOptionalUrl(value) {
  const raw = cleanText(value, 240);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    return url.toString().slice(0, 240);
  } catch {
    throw new ControlError(400, 'invalid_website');
  }
}

function normalizeOptionalPhone(value, errorCode = 'invalid_owner_phone') {
  const phone = cleanText(value, 40).replace(/[\s().-]/g, '');
  if (!phone) return '';
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new ControlError(400, errorCode);
  return phone;
}

function normalizeBusinessProfile(raw = {}, defaults = {}) {
  const clinicName = cleanText(raw.clinicName || defaults.clinicName, 80);
  const ownerName = cleanText(raw.ownerName, 100);
  const city = cleanText(raw.city || defaults.city, 80);
  const industry = cleanText(raw.industry, 80);
  const description = cleanText(raw.description, 600);
  const businessHours = cleanText(raw.businessHours, 300);
  const timezone = cleanText(raw.timezone, 80) || 'America/Mexico_City';
  const schedulingProvider = cleanText(raw.schedulingProvider, 40) || 'none';

  if (clinicName.length < 2) throw new ControlError(400, 'invalid_clinic_name');
  if (ownerName.length < 2) throw new ControlError(400, 'invalid_owner_name');
  if (city.length < 2) throw new ControlError(400, 'invalid_city');
  if (industry.length < 2) throw new ControlError(400, 'invalid_industry');
  if (description.length < 10) throw new ControlError(400, 'invalid_business_description');
  if (businessHours.length < 4) throw new ControlError(400, 'invalid_business_hours');
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(timezone)) {
    throw new ControlError(400, 'invalid_timezone');
  }
  if (!SCHEDULING_PROVIDERS.has(schedulingProvider)) {
    throw new ControlError(400, 'invalid_scheduling_provider');
  }

  return {
    clinicName,
    ownerName,
    ownerPhone: normalizeOptionalPhone(raw.ownerPhone),
    city,
    timezone,
    website: normalizeOptionalUrl(raw.website),
    industry,
    description,
    businessHours,
    services: normalizeStringList(raw.services, 12, 'services'),
    callGoals: normalizeStringList(raw.callGoals, 10, 'call_goals'),
    schedulingProvider,
    internalNotes: cleanText(raw.internalNotes, 800),
    updatedAt: new Date().toISOString(),
  };
}

function requireDatabase(database) {
  if (!database?.query || !database?.transaction) {
    throw new ControlError(503, 'database_not_configured');
  }
  return database;
}

async function syncWorkspaceFoundation(database, input) {
  try {
    return await provisionWorkspaceFoundation(requireDatabase(database), input);
  } catch (error) {
    if (error?.message === 'workspace_not_provisioned') {
      throw new ControlError(409, 'workspace_not_provisioned');
    }
    throw error;
  }
}

async function syncVoiceAgentFoundation(database, input) {
  try {
    return await provisionVoiceAgentFoundation(requireDatabase(database), input);
  } catch (error) {
    if (error?.message === 'workspace_not_provisioned') {
      throw new ControlError(409, 'workspace_not_provisioned');
    }
    if (error?.message === 'retell_agent_already_assigned') {
      throw new ControlError(409, 'retell_agent_already_assigned');
    }
    throw error;
  }
}

async function syncVoiceAgentDraft(database, input) {
  try {
    return await provisionVoiceAgentDraft(requireDatabase(database), input);
  } catch (error) {
    if (error?.message === 'workspace_not_provisioned') {
      throw new ControlError(409, 'workspace_not_provisioned');
    }
    if (error?.message === 'retell_agent_already_assigned') {
      throw new ControlError(409, 'retell_agent_already_assigned');
    }
    throw error;
  }
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

async function isInternalAdmin(session) {
  const allowedIds = new Set(arrayFromEnv('AUTIVEX_ADMIN_USER_IDS'));
  const allowedEmails = new Set(arrayFromEnv('AUTIVEX_ADMIN_EMAILS').map((email) => email.toLowerCase()));
  if (allowedIds.has(session.userId)) return true;

  if (allowedEmails.size) {
    const user = await clerk().users.getUser(session.userId);
    if (allowedEmails.has(primaryEmail(user).toLowerCase())) return true;
  }

  return false;
}

async function requireInternalAdmin(authorization) {
  const session = await authenticateSession(authorization);
  const configured = arrayFromEnv('AUTIVEX_ADMIN_USER_IDS').length
    || arrayFromEnv('AUTIVEX_ADMIN_EMAILS').length;
  if (!configured) throw new ControlError(503, 'admin_access_not_configured');
  if (await isInternalAdmin(session)) return session;

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

function serializeProvisioningDraftForAdmin(raw = {}) {
  return {
    retellAgentId: cleanText(raw.retellAgentId, 160),
    retellLlmId: cleanText(raw.retellLlmId, 160),
    status: cleanText(raw.status, 40) || null,
    environment: cleanText(raw.environment, 40) || null,
    promptTemplateVersion: cleanText(raw.promptTemplateVersion, 80) || null,
    voiceId: cleanText(raw.voiceId, 160) || null,
    voiceModel: cleanText(raw.voiceModel, 80) || null,
    language: cleanText(raw.language, 40) || null,
    n8nStatus: cleanText(raw.n8nStatus, 40) || null,
    createdAt: raw.createdAt || null,
    createdByUserId: cleanText(raw.createdByUserId, 80) || null,
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

function serializeProfileForClient(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const { internalNotes: _internalNotes, ...safeProfile } = profile;
  return safeProfile;
}

export function resolveWorkspaceView(state) {
  if (state.serviceStatus === 'suspended') return 'suspended';
  if (['past_due', 'canceled', 'refunded', 'disputed'].includes(state.billingStatus)) return 'billing_recovery';
  if (accountProvisioningEnabled(state) && state.serviceStatus === 'live' && state.onboardingStatus === 'active') return 'live';
  if (accountProvisioningEnabled(state) && ['configuring', 'review'].includes(state.onboardingStatus)) return 'provisioning';
  if (accountProvisioningEnabled(state)) return 'onboarding';
  return state.profileComplete ? 'prospect_demo' : 'prospect_intake';
}

export function accountProvisioningEnabled(state = {}) {
  return ['verified', 'not_required'].includes(state.billingStatus);
}

function serializeWorkspace(organization) {
  const state = metadataState(organization);
  const profile = serializeProfileForClient(organization.privateMetadata?.businessProfile
    || organization.privateMetadata?.prospectProfile
    || null);
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
  if (await isInternalAdmin(session)) {
    return { view: 'internal_admin', state: null, profile: null, organization: null };
  }
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

async function ownerForOrganization(organizationId, fallbackEmail = '', fallbackName = '') {
  if (fallbackEmail) return { email: fallbackEmail, name: fallbackName };
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
  const businessProfile = organization.privateMetadata?.businessProfile || null;
  const provisioningDraft = organization.privateMetadata?.provisioningDraft || {};
  const owner = await ownerForOrganization(
    organization.id,
    organization.privateMetadata?.ownerEmail,
    businessProfile?.ownerName || '',
  );
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt,
    membersCount: organization.membersCount || 0,
    owner,
    state,
    stage: stageLabel(state),
    profile: businessProfile || organization.privateMetadata?.prospectProfile || null,
    payment: organization.privateMetadata?.payment || null,
    provisioning: serializeProvisioningForAdmin({
      retellAgentId: provisioningDraft.retellAgentId,
      ...organization.privateMetadata?.provisioning,
    }),
    provisioningDraft: serializeProvisioningDraftForAdmin(provisioningDraft),
    invitation: organization.privateMetadata?.invitation || null,
    accessAssignments: Array.isArray(organization.privateMetadata?.accessAssignments)
      ? organization.privateMetadata.accessAssignments.map((assignment) => ({
        email: cleanText(assignment?.email, 254),
        role: cleanText(assignment?.role, 40),
        status: cleanText(assignment?.status, 40),
      })).filter((assignment) => assignment.email)
      : [],
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

async function writeVerifiedPayment(
  organization,
  session,
  rawPayment,
  extraPrivate = {},
  extraPublic = {},
) {
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
      ...extraPublic,
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

export async function confirmManualPayment(authorization, organizationId, rawPayment, database) {
  const session = await requireInternalAdmin(authorization);
  const id = cleanText(organizationId, 80);
  if (!id.startsWith('org_')) throw new ControlError(400, 'invalid_organization');
  const organization = await clerk().organizations.getOrganization({ organizationId: id });
  const state = metadataState(organization);
  if (state.billingStatus === 'verified') throw new ControlError(409, 'payment_already_verified');

  const existingProfile = organization.privateMetadata?.businessProfile
    || organization.privateMetadata?.prospectProfile
    || {};
  await syncWorkspaceFoundation(database, {
    clerkOrganizationId: organization.id,
    displayName: organization.name,
    timezone: existingProfile.timezone || 'America/Mexico_City',
    settings: {
      businessProfile: existingProfile,
      ownerEmail: organization.privateMetadata?.ownerEmail || '',
      acquisitionSource: organization.privateMetadata?.acquisitionSource || 'inbound',
    },
  });

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

export async function createWorkspaceTestCall(authorization, raw = {}, database, dependencies = {}) {
  const session = await authenticateSession(authorization);
  if (!session.orgId) throw new ControlError(409, 'organization_required');

  const organization = await clerk().organizations.getOrganization({ organizationId: session.orgId });
  const state = metadataState(organization);
  if (!accountProvisioningEnabled(state)) throw new ControlError(409, 'workspace_test_call_not_allowed');

  const foundation = await getWorkspaceFoundation(requireDatabase(database), session.orgId);
  if (!foundation?.workspace) throw new ControlError(409, 'workspace_not_provisioned');
  const agent = foundation.voiceAgents.find((item) => (
    item.provider === 'retell'
    && item.enabled !== false
    && ['draft', 'testing', 'active'].includes(item.status)
  ));
  if (!agent?.externalAgentId) throw new ControlError(409, 'workspace_agent_not_ready');

  const profile = organization.privateMetadata?.businessProfile || {};
  try {
    return await createRetellWorkspaceWebCall({
      agentId: agent.externalAgentId,
      workspaceId: foundation.workspace.id,
      clerkOrganizationId: session.orgId,
      businessName: profile.clinicName || organization.name,
      city: profile.city,
      testContext: cleanText(raw.scenario?.description || raw.scenario?.label, 500),
    }, dependencies);
  } catch (error) {
    if (['missing_retell_api_key', 'missing_retell_agent_id'].includes(error?.message)) {
      throw new ControlError(503, 'retell_provisioning_not_configured');
    }
    throw new ControlError(502, 'workspace_test_call_failed');
  }
}

async function userForEmail(email) {
  const { data } = await clerk().users.getUserList({ emailAddress: [email], limit: 2 });
  return data[0] || null;
}

async function findIncompleteLocation(locationName, ownerEmail) {
  const response = await clerk().organizations.getOrganizationList({
    query: locationName,
    limit: 20,
    orderBy: '-created_at',
  });
  const normalizedName = locationName.toLowerCase();
  return response.data.find((organization) => {
    const metadata = organization.privateMetadata || {};
    const auditTrail = Array.isArray(metadata.auditTrail) ? metadata.auditTrail : [];
    return organization.name.toLowerCase() === normalizedName
      && String(metadata.ownerEmail || '').trim().toLowerCase() === ownerEmail
      && metadataState(organization).billingStatus === 'not_required'
      && !Array.isArray(metadata.accessAssignments)
      && auditTrail.some((entry) => entry?.action === 'location_created');
  }) || null;
}

async function assignLocationAccess(organizationId, members, ownerUserId) {
  const appUrl = String(process.env.AUTIVEX_APP_URL || 'http://127.0.0.1:4184').replace(/\/$/, '');
  const assignments = [];

  for (const member of members) {
    try {
      const user = await userForEmail(member.email);
      if (user) {
        if (user.id !== ownerUserId) {
          const { data: memberships } = await clerk().users.getOrganizationMembershipList({
            userId: user.id,
            limit: 100,
          });
          const alreadyAssigned = memberships.some((membership) => (
            membership.organization?.id === organizationId
          ));
          if (!alreadyAssigned) {
            await clerk().organizations.createOrganizationMembership({
              organizationId,
              userId: user.id,
              role: member.role,
            });
          }
        }
        assignments.push({ email: member.email, role: member.role, status: 'active' });
        continue;
      }

      await clerk().organizations.createOrganizationInvitation({
        organizationId,
        emailAddress: member.email,
        role: member.role,
        expiresInDays: 30,
        redirectUrl: `${appUrl}/accept-invitation`,
      });
      assignments.push({ email: member.email, role: member.role, status: 'invited' });
    } catch {
      assignments.push({ email: member.email, role: member.role, status: 'error' });
    }
  }

  return assignments;
}

export async function createLocation(authorization, raw = {}, database) {
  const session = await requireInternalAdmin(authorization);
  const locationName = cleanText(raw.locationName || raw.clinicName, 80);
  const city = cleanText(raw.city, 80);
  const ownerEmail = normalizeEmail(raw.ownerEmail || raw.email);
  if (locationName.length < 2) throw new ControlError(400, 'invalid_location_name');
  const businessProfile = normalizeBusinessProfile(raw.businessProfile, {
    clinicName: locationName,
    city,
  });
  const members = normalizeLocationMembers(ownerEmail, raw.members);
  const ownerUser = await userForEmail(ownerEmail);
  const acquisitionSource = cleanText(raw.source || 'manual_admin', 60);
  const createdAt = new Date().toISOString();

  let organization = await findIncompleteLocation(locationName, ownerEmail);
  if (!organization) {
    organization = await clerk().organizations.createOrganization({
      name: locationName,
      maxAllowedMemberships: 25,
      ...(ownerUser ? { createdBy: ownerUser.id } : {}),
      publicMetadata: {
        accountStage: 'customer',
        billingStatus: 'not_required',
        onboardingStatus: 'needs_onboarding',
        serviceStatus: 'locked',
        profileComplete: true,
        businessType: businessProfile.industry,
      },
      privateMetadata: {
        ownerEmail,
        ownerName: businessProfile.ownerName,
        acquisitionSource,
        businessProfile,
        auditTrail: [auditEntry('location_created', session.userId, { billingDeferred: true })],
      },
    });
  }

  await syncWorkspaceFoundation(database, {
    clerkOrganizationId: organization.id,
    displayName: locationName,
    timezone: businessProfile.timezone,
    settings: {
      businessProfile,
      ownerEmail,
      acquisitionSource,
      schedulingProvider: businessProfile.schedulingProvider,
      accountModel: 'assisted_mvp',
      createdAt,
    },
  });

  const assignments = await assignLocationAccess(
    organization.id,
    members,
    ownerUser?.id || null,
  );
  await clerk().organizations.updateOrganizationMetadata(organization.id, {
    privateMetadata: {
      accessAssignments: assignments,
      auditTrail: nextAudit(
        organization.privateMetadata,
        auditEntry('location_access_assigned', session.userId, {
          activeUsers: assignments.filter((item) => item.status === 'active').length,
          invitedUsers: assignments.filter((item) => item.status === 'invited').length,
          failedUsers: assignments.filter((item) => item.status === 'error').length,
        }),
      ),
    },
  });

  organization = await clerk().organizations.getOrganization({ organizationId: organization.id });
  return serializeClinicForAdmin(organization);
}

export async function createPaidClinic(authorization, raw = {}, database) {
  const session = await requireInternalAdmin(authorization);
  const clinicName = cleanText(raw.clinicName, 80);
  const city = cleanText(raw.city, 80);
  const email = normalizeEmail(raw.email);
  if (clinicName.length < 2) throw new ControlError(400, 'invalid_clinic_name');
  const businessProfile = normalizeBusinessProfile(raw.businessProfile, { clinicName, city });
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

  const acquisitionSource = cleanText(raw.source || 'local_sales', 60);
  await syncWorkspaceFoundation(database, {
    clerkOrganizationId: organization.id,
    displayName: clinicName,
    timezone: businessProfile.timezone,
    settings: {
      businessProfile,
      ownerEmail: email,
      acquisitionSource,
      schedulingProvider: businessProfile.schedulingProvider,
    },
  });

  await writeVerifiedPayment(organization, session, payment, {
    ownerEmail: email,
    ownerName: businessProfile.ownerName,
    acquisitionSource,
    businessProfile,
    ...(invitation ? {
      invitation: {
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      },
    } : {}),
  }, {
    profileComplete: true,
    businessType: businessProfile.industry,
  });

  const updated = await clerk().organizations.getOrganization({ organizationId: organization.id });
  return serializeClinicForAdmin(updated);
}

export async function saveProvisioning(authorization, organizationId, rawProvisioning, database) {
  const session = await requireInternalAdmin(authorization);
  const id = cleanText(organizationId, 80);
  if (!id.startsWith('org_')) throw new ControlError(400, 'invalid_organization');

  const organization = await clerk().organizations.getOrganization({ organizationId: id });
  const state = metadataState(organization);
  if (!accountProvisioningEnabled(state) || !['configuring', 'review'].includes(state.onboardingStatus)) {
    throw new ControlError(409, 'provisioning_not_allowed');
  }

  const provisioning = normalizeProvisioning(rawProvisioning);
  const readiness = provisioningReadiness(provisioning);
  const record = {
    ...provisioning,
    updatedAt: new Date().toISOString(),
    updatedByUserId: session.userId,
  };

  await syncVoiceAgentFoundation(database, {
    clerkOrganizationId: id,
    externalAgentId: provisioning.retellAgentId,
    displayName: organization.privateMetadata?.provisioning?.agentDisplayName || 'Lucía',
    assignedPhoneNumber: provisioning.assignedPhoneNumber,
    fallbackPhoneNumber: provisioning.fallbackPhoneNumber,
    approvedTestCallId: provisioning.approvedTestCallId,
    webhookVerified: provisioning.postCallWebhookVerified,
    fallbackTested: provisioning.fallbackTested,
  });

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

function mapProvisioningError(error) {
  if (error instanceof ControlError) return error;
  if (['missing_retell_api_key', 'missing_retell_template_agent'].includes(error?.message)) {
    return new ControlError(503, 'retell_provisioning_not_configured');
  }
  if (error?.message === 'missing_provisioning_webhook_secret') {
    return new ControlError(503, 'provisioning_webhook_not_configured');
  }
  if (String(error?.message || '').startsWith('provisioning_webhook_')) {
    return new ControlError(502, 'provisioning_webhook_failed');
  }
  if (String(error?.message || '').startsWith('retell_')) {
    return new ControlError(502, 'retell_provisioning_failed');
  }
  return error;
}

export async function startClinicConfiguration(
  authorization,
  organizationId,
  database,
  dependencies = {},
) {
  const session = await requireInternalAdmin(authorization);
  const id = cleanText(organizationId, 80);
  if (!id.startsWith('org_')) throw new ControlError(400, 'invalid_organization');

  const organization = await clerk().organizations.getOrganization({ organizationId: id });
  const state = metadataState(organization);
  const canStart = accountProvisioningEnabled(state)
    && ['needs_onboarding', 'scheduled'].includes(state.onboardingStatus);
  if (!canStart) throw new ControlError(409, 'transition_not_allowed');

  const profile = organization.privateMetadata?.businessProfile
    || organization.privateMetadata?.prospectProfile
    || {};
  let foundation = await getWorkspaceFoundation(requireDatabase(database), id);
  if (!foundation?.workspace) {
    await syncWorkspaceFoundation(database, {
      clerkOrganizationId: id,
      displayName: organization.name,
      timezone: profile.timezone || 'America/Mexico_City',
      settings: {
        businessProfile: profile,
        ownerEmail: organization.privateMetadata?.ownerEmail || '',
        acquisitionSource: organization.privateMetadata?.acquisitionSource || 'manual_admin',
        schedulingProvider: profile.schedulingProvider || 'none',
        accountModel: 'assisted_mvp',
        reconciledAt: new Date().toISOString(),
      },
    });
    foundation = await getWorkspaceFoundation(requireDatabase(database), id);
  }
  if (!foundation?.workspace) throw new ControlError(409, 'workspace_not_provisioned');
  const existingDraft = foundation.voiceAgents.find((agent) => (
    agent.provider === 'retell'
    && agent.environment === 'staging'
    && ['draft', 'testing'].includes(agent.status)
    && agent.settings?.retellLlmId
  ));

  let draft = existingDraft ? {
    agentId: existingDraft.externalAgentId,
    agentVersion: existingDraft.externalAgentVersion,
    llmId: existingDraft.settings.retellLlmId,
    llmVersion: existingDraft.settings.retellLlmVersion || null,
    templateAgentId: existingDraft.settings.templateAgentId || null,
    templateAgentVersion: existingDraft.settings.templateAgentVersion || null,
    promptTemplateVersion: existingDraft.settings.promptTemplateVersion || null,
    voiceId: existingDraft.settings.voiceId || null,
    voiceModel: existingDraft.settings.voiceModel || null,
    language: existingDraft.settings.language || 'es-419',
  } : null;
  let createdRemotely = false;

  try {
    if (!draft) {
      draft = await createRetellAgentDraft({
        workspaceId: foundation.workspace.id,
        clerkOrganizationId: id,
        profile,
      }, dependencies);
      createdRemotely = true;
      await syncVoiceAgentDraft(database, {
        clerkOrganizationId: id,
        externalAgentId: draft.agentId,
        externalAgentVersion: draft.agentVersion,
        displayName: 'Lucía',
        settings: {
          retellLlmId: draft.llmId,
          retellLlmVersion: draft.llmVersion,
          templateAgentId: draft.templateAgentId,
          templateAgentVersion: draft.templateAgentVersion,
          promptTemplateVersion: draft.promptTemplateVersion,
          voiceId: draft.voiceId,
          voiceModel: draft.voiceModel,
          language: draft.language,
          createdByUserId: session.userId,
        },
      });
      createdRemotely = false;
    }

    const requestedIntegrations = [
      'autivex_crm',
      ...(['cal_com', 'google_calendar', 'calendly'].includes(profile.schedulingProvider)
        ? [profile.schedulingProvider]
        : []),
    ];
    const n8n = await notifyProvisioningStarted({
      workspaceId: foundation.workspace.id,
      clerkOrganizationId: id,
      agentId: draft.agentId,
      llmId: draft.llmId,
      promptTemplateVersion: draft.promptTemplateVersion,
      requestedIntegrations,
    }, dependencies);
    const createdAt = organization.privateMetadata?.provisioningDraft?.createdAt
      || new Date().toISOString();

    await clerk().organizations.updateOrganizationMetadata(id, {
      publicMetadata: { onboardingStatus: 'configuring', serviceStatus: 'provisioning' },
      privateMetadata: {
        provisioningDraft: {
          retellAgentId: draft.agentId,
          retellLlmId: draft.llmId,
          status: 'draft',
          environment: 'staging',
          promptTemplateVersion: draft.promptTemplateVersion,
          voiceId: draft.voiceId,
          voiceModel: draft.voiceModel,
          language: draft.language,
          n8nStatus: n8n.status,
          n8nEventId: n8n.eventId || null,
          n8nDeliveredAt: n8n.deliveredAt,
          createdAt,
          createdByUserId: session.userId,
        },
        auditTrail: nextAudit(
          organization.privateMetadata,
          auditEntry('start_configuration', session.userId, {
            previous: state,
            retellAgentId: draft.agentId,
            reusedDraft: Boolean(existingDraft),
            n8nStatus: n8n.status,
          }),
        ),
      },
    });
  } catch (error) {
    if (createdRemotely && draft) {
      await deleteRetellAgentDraft({ agentId: draft.agentId, llmId: draft.llmId }, dependencies);
    }
    throw mapProvisioningError(error);
  }

  const updated = await clerk().organizations.getOrganization({ organizationId: id });
  return serializeClinicForAdmin(updated);
}

const ADMIN_TRANSITIONS = {
  schedule_onboarding: {
    allowed: (state) => accountProvisioningEnabled(state) && ['needs_onboarding', 'prospect_ready'].includes(state.onboardingStatus),
    publicMetadata: { onboardingStatus: 'scheduled', serviceStatus: 'locked' },
  },
  publish_test: {
    allowed: (state) => accountProvisioningEnabled(state) && state.onboardingStatus === 'configuring',
    publicMetadata: { onboardingStatus: 'review', serviceStatus: 'provisioning' },
  },
  go_live: {
    allowed: (state) => accountProvisioningEnabled(state) && state.onboardingStatus === 'review',
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
