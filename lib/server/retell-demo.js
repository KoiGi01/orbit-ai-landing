import { cleanText } from './lead-delivery.js';

const DEMO_SCENARIOS = {
  urgent: {
    id: 'urgent',
    label: 'Posible urgencia',
    context: 'La persona reporta dolor dental. Recopila contexto básico, no diagnostiques y explica que el equipo debe valorar la urgencia.',
  },
  'first-visit': {
    id: 'first-visit',
    label: 'Primera valoración',
    context: 'La persona llama por primera vez y busca una valoración. Haz preguntas breves, toma contexto y ofrece seguimiento sin inventar disponibilidad.',
  },
  'new-patient': {
    id: 'new-patient',
    label: 'Primera visita',
    context: 'La persona quiere agendar su primera consulta. Haz preguntas breves, toma contexto y ofrece el siguiente paso configurado para la demostración.',
  },
  existing: {
    id: 'existing',
    label: 'Mover una cita',
    context: 'La persona quiere cambiar una cita existente. Pide los datos necesarios y explica que el equipo confirmará el nuevo horario; no inventes disponibilidad.',
  },
  reschedule: {
    id: 'reschedule',
    label: 'Cambio de cita',
    context: 'La persona quiere mover una cita existente. Confirma qué necesita cambiar sin afirmar que un calendario real fue modificado.',
  },
  question: {
    id: 'question',
    label: 'Pregunta clínica',
    context: 'La persona pregunta por un tratamiento y puede solicitar información clínica o un precio definitivo. Responde sólo información general, reconoce límites y ofrece seguimiento del equipo.',
  },
  services: {
    id: 'services',
    label: 'Información de tratamiento',
    context: 'La persona pregunta por servicios. Responde sólo con el catálogo proporcionado y ofrece que el equipo confirme cualquier detalle no disponible.',
  },
  prices: {
    id: 'prices',
    label: 'Pregunta de precio',
    context: 'La persona pregunta precios. No inventes montos; explica que el equipo confirmará costos y ofrece recopilar datos para seguimiento.',
  },
  reception: {
    id: 'reception',
    label: 'Hablar con recepción',
    context: 'La persona pide hablar con recepción. Recopila el motivo y simula una transferencia con contexto, sin afirmar que llamaste a una línea real.',
  },
};

const APPOINTMENT_OUTCOMES = {
  offer_demo_slots: 'ofrecer horarios ficticios claramente identificados como demo',
  capture_for_confirmation: 'capturar datos para que el equipo confirme después',
  simulate_transfer: 'simular una transferencia sin afirmar que se llamó a una línea real',
};

function safeBusinessText(value, maxLength, fallback) {
  const text = cleanText(value, maxLength)
    .replace(/[{}<>`]/g, '')
    .replace(/\b(ignore|system prompt|developer message|instructions?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

export function buildRetellDemoVariables(raw = {}) {
  const requestedKey = cleanText(raw.key, 60);
  const scenario = DEMO_SCENARIOS[requestedKey] || DEMO_SCENARIOS['new-patient'];
  const clinicName = safeBusinessText(raw.clinic_name, 80, 'Clínica dental de demostración');

  return {
    scenarioId: scenario.id,
    variables: {
      business_role: 'recepcionista de una clínica dental',
      customer_context: scenario.context,
      first_line: `${clinicName}, buenas tardes. ¿En qué le puedo ayudar?`,
      scenario_label: scenario.label,
      clinic_name: clinicName,
      clinic_city: safeBusinessText(raw.clinic_city, 80, 'México'),
      clinic_services: safeBusinessText(raw.clinic_services, 240, 'servicios por confirmar'),
      clinic_schedule: safeBusinessText(raw.clinic_schedule, 180, 'horario por confirmar'),
      appointment_outcome: APPOINTMENT_OUTCOMES[cleanText(raw.appointment_outcome, 80)]
        || 'capturar datos para seguimiento',
    },
  };
}

export function configuredAgentVersion(value) {
  const version = cleanText(value, 80);
  if (!version) return null;
  if (/^\d+$/.test(version)) return Number(version);
  if (/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(version)) return version;
  return null;
}
