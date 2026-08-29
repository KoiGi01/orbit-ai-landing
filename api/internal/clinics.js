import {
  bypassClinicLive,
  confirmManualPayment,
  createLocation,
  deleteClinicRecord,
  errorResponse,
  listClinics,
  manageClinicMember,
  overrideClinicStage,
  saveClinicAgentConfiguration,
  saveClinicAgentRuntime,
  saveProvisioning,
  saveClinicCalendar,
  startClinicConfiguration,
  transitionClinic,
  updateClinicRecord,
} from '../../lib/server/clerk-control.js';
import { createDatabase } from '../../lib/server/database.js';

function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

async function withDatabase(callback) {
  const database = createDatabase();
  try {
    return await callback(database);
  } finally {
    await database.close();
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const authorization = req.headers.authorization;

    if (req.method === 'GET') {
      const result = await listClinics(authorization, req.query?.query);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST') {
      const clinic = await withDatabase((database) => createLocation(
        authorization,
        req.body,
        database,
      ));
      sendJson(res, 201, { clinic });
      return;
    }

    const { organizationId, action } = req.body || {};
    if (req.method === 'DELETE') {
      const result = await withDatabase((database) => deleteClinicRecord(authorization, organizationId, req.body?.confirmation, database));
      sendJson(res, 200, result);
      return;
    }
    let clinic;
    if (action === 'confirm_payment') {
      clinic = await withDatabase((database) => confirmManualPayment(
        authorization,
        organizationId,
        req.body?.payment,
        database,
      ));
    } else if (action === 'save_provisioning') {
      clinic = await withDatabase((database) => saveProvisioning(
        authorization,
        organizationId,
        req.body?.provisioning,
        database,
      ));
    } else if (action === 'start_configuration') {
      clinic = await withDatabase((database) => startClinicConfiguration(
        authorization,
        organizationId,
        database,
      ));
    } else if (action === 'update_location') {
      clinic = await updateClinicRecord(authorization, organizationId, req.body?.location);
    } else if (action === 'manage_member') {
      clinic = await manageClinicMember(authorization, organizationId, req.body?.member);
    } else if (action === 'bypass_live') {
      clinic = await bypassClinicLive(authorization, organizationId, req.body?.confirmation);
    } else if (action === 'override_stage') {
      clinic = await overrideClinicStage(authorization, organizationId, req.body?.stage);
    } else if (action === 'save_calendar') {
      clinic = await withDatabase((database) => saveClinicCalendar(authorization, organizationId, req.body?.calendar, database));
    } else if (action === 'update_agent_configuration') {
      clinic = await saveClinicAgentConfiguration(authorization, organizationId, req.body?.agent);
    } else if (action === 'update_agent_advanced') {
      clinic = await saveClinicAgentRuntime(authorization, organizationId, req.body?.advanced);
    } else {
      clinic = await transitionClinic(authorization, organizationId, action, req.body?.confirmation);
    }
    sendJson(res, 200, { clinic });
  } catch (error) {
    const response = errorResponse(error);
    sendJson(res, response.status, response.body);
  }
}
