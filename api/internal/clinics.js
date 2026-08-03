import {
  confirmManualPayment,
  createPaidClinic,
  errorResponse,
  listClinics,
  saveProvisioning,
  transitionClinic,
} from '../../lib/server/clerk-control.js';

function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
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
      const clinic = await createPaidClinic(authorization, req.body);
      sendJson(res, 201, { clinic });
      return;
    }

    const { organizationId, action } = req.body || {};
    const clinic = action === 'confirm_payment'
      ? await confirmManualPayment(authorization, organizationId, req.body?.payment)
      : action === 'save_provisioning'
        ? await saveProvisioning(authorization, organizationId, req.body?.provisioning)
      : await transitionClinic(authorization, organizationId, action, req.body?.confirmation);
    sendJson(res, 200, { clinic });
  } catch (error) {
    const response = errorResponse(error);
    sendJson(res, response.status, response.body);
  }
}
