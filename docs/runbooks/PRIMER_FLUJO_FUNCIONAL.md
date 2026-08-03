# Primer flujo funcional de AutiveX

Estado: MVP provisional. Este documento explica el primer recorrido real sin convertir las herramientas actuales en decisiones permanentes.

## Resultado que estamos cerrando

```text
Visitante
→ prueba una llamada de voz
→ solicita una demo
→ n8n guarda el lead
→ AutiveX recibe una notificación
→ el cliente paga por fuera
→ un admin verifica el pago
→ Clerk envía la invitación
→ el cliente completa onboarding
→ AutiveX configura y prueba el agente
→ un admin habilita producción
```

El dashboard operativo todavía usa datos demostrativos y lo declara en pantalla. No debe interpretarse como analítica real hasta conectar webhooks y almacenamiento de llamadas.

## Lo que debes pedirle a la persona que maneja n8n

Puedes enviarle este mensaje:

> Necesito un workflow de producción llamado `AutiveX · nuevos leads`. Debe comenzar con un Webhook `POST`, exigir el header `Authorization: Bearer <secreto>`, aceptar el evento `lead.created`, deduplicar por `lead.id` y guardar el lead en una hoja de Google Sheets antes de responder. Las columnas son: `id`, `receivedAt`, `name`, `clinic`, `whatsapp`, `source`, `note`, `status` y `owner`. Al crear el registro, pon `status = nuevo`. Después manda una notificación por email o WhatsApp, pero si falla esa notificación no borres el registro. Responde HTTP 200 sólo después de guardar. Entrégame la URL de producción del webhook y un secreto largo; no la URL de prueba.

Payload enviado por AutiveX:

```json
{
  "event": "lead.created",
  "version": 1,
  "lead": {
    "id": "uuid",
    "receivedAt": "2026-08-03T20:00:00.000Z",
    "name": "Ana Ruiz",
    "clinic": "Clínica Norte",
    "whatsapp": "525512345678",
    "whatsappConsent": true,
    "source": "landing_coverage_review",
    "note": "Fuera de horario. Volumen semanal: Entre 50 y 150."
  }
}
```

Variables del servidor:

```dotenv
LEAD_WEBHOOK_URL=https://n8n.example.com/webhook/...
LEAD_WEBHOOK_SECRET=un-secreto-largo-y-unico
```

Resend es opcional y funciona como notificación secundaria:

```dotenv
RESEND_API_KEY=
RESEND_FROM=AutiveX Website <onboarding@autivexai.com>
RESEND_TO=hola@autivexai.com
```

## Configuración mínima de Clerk

Dashboard (variable pública):

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

Servidor (variables privadas):

```dotenv
CLERK_SECRET_KEY=sk_...
AUTIVEX_ADMIN_USER_IDS=user_...
AUTIVEX_ADMIN_EMAILS=tu-correo@autivexai.com
CLERK_AUTHORIZED_PARTIES=http://127.0.0.1:4184,https://app.autivexai.com
AUTIVEX_APP_URL=https://app.autivexai.com
```

Las invitaciones llegan a `/accept-invitation`, conservan el ticket de Clerk y terminan en `/onboarding`.

## Configuración mínima de Retell

```dotenv
RETELL_API_KEY=
RETELL_AGENT_ID=
RETELL_AGENT_ID_2=
RETELL_AGENT_VERSION=
RETELL_AGENT_VERSION_2=
```

En el prompt del agente de demostración deben existir estas variables:

- `{{business_role}}`
- `{{customer_context}}`
- `{{first_line}}`
- `{{scenario_label}}`
- `{{clinic_name}}`
- `{{clinic_city}}`
- `{{clinic_services}}`
- `{{clinic_schedule}}`
- `{{appointment_outcome}}`

`customer_context` es indispensable: contiene los límites y la conducta específica del caso. No uses datos de pacientes reales durante la demostración.

## Protección inicial

```dotenv
AUTIVEX_PUBLIC_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:4184,https://autivexai.com,https://www.autivexai.com,https://app.autivexai.com
LEAD_RATE_LIMIT_PER_HOUR=4
RETELL_DEMO_RATE_LIMIT_PER_15_MIN=6
```

El límite actual vive en memoria y es suficiente para una prueba pequeña. Antes de tráfico pagado debe moverse al edge o a un almacén compartido.

## Definición de terminado para este primer flujo

- Una llamada de prueba obtiene token y conecta con Retell.
- Un lead aparece una sola vez en Google Sheets con su UUID.
- El propietario recibe una invitación y puede crear/iniciar sesión sin perder el ticket.
- Un pago inválido no crea una organización huérfana.
- Producción no se puede habilitar sin una configuración y llamada de prueba verificadas.
- El dashboard no presenta cifras demostrativas como resultados reales.
