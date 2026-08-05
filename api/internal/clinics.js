import {
  confirmManualPayment,
  createPaidClinic,
  errorResponse,
  listClinics,
  saveProvisioning,
  startClinicConfiguration,
  transitionClinic,
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
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
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
      const clinic = await withDatabase((database) => createPaidClinic(
        authorization,
        req.body,
        database,
      ));
      sendJson(res, 201, { clinic });
      return;
    }

    const { organizationId, action } = req.body || {};
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
    } else {
      clinic = await transitionClinic(authorization, organizationId, action, req.body?.confirmation);
    }
    sendJson(res, 200, { clinic });
  } catch (error) {
    const response = errorResponse(error);
    sendJson(res, response.status, response.body);
  }
}
