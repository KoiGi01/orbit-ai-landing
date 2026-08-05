# AutiveX — handoff para Claude Code

**Corte de información:** 5 de agosto de 2026, zona `America/Mexico_City`

**Repositorio:** `KoiGi01/orbit-ai-landing`

**Rama canónica:** `master`

**Commit desplegado:** `8e822b4` — `Make AutiveX onboarding and voice demo functional (#1)`

**Producción:** <https://autivexai.com>

**PR consolidado:** <https://github.com/KoiGi01/orbit-ai-landing/pull/1>

Este documento es el punto de reanudación técnico. Describe el estado comprobado del sistema, no una visión aspiracional. Si otro documento contradice este handoff, primero verifica el código activo, el deployment y la fecha de cada fuente.

## 1. Resumen ejecutivo

AutiveX es una plataforma en español para operar recepcionistas de voz con IA para negocios en México. El prototipo visual y de conversación está orientado a clínicas dentales, pero el nicho definitivo sigue abierto. No conviertas odontología en una restricción permanente del modelo de datos o arquitectura.

El MVP se está construyendo como un servicio asistido:

1. Un prospecto conoce el producto desde la landing.
2. Puede registrarse, completar un intake y ver una experiencia demostrativa.
3. El cobro se verifica manualmente fuera de la plataforma.
4. Un operador interno crea o activa al cliente desde `/admin`.
5. Se prepara un workspace de Clerk y Supabase.
6. AutiveX crea y prueba un agente privado de Retell.
7. El cliente conecta sus integraciones.
8. Un operador publica el servicio únicamente después de comprobar telefonía, fallback y webhooks.

La plataforma todavía no es un SaaS completamente self-service. Esta decisión es intencional para los primeros clientes: permite hacer onboarding local, cobrar con Mercado Pago/transferencia y controlar manualmente el paso a producción.

## 2. Estado verificado en producción

### GitHub y Vercel

- PR #1 fue fusionado con squash a `master` el 5 de agosto de 2026.
- La rama temporal `agent/autivex-platform-refresh` fue eliminada.
- El working tree quedó limpio y `master` alineado con `origin/master`.
- El deployment automático de `master` quedó `Ready` en Vercel.
- Deployment verificado: `dpl_GmRNAN7N5hU6zy7z4sYVyne7BDiC`.
- Alias activos verificados:
  - `https://autivexai.com`
  - `https://www.autivexai.com`
  - `https://orbit-ai-landing.vercel.app`

### Navegación y autenticación

- `https://autivexai.com/` sirve la landing.
- “Iniciar sesión” apunta a `https://autivexai.com/sign-in`; no debe volver a aparecer `127.0.0.1` en producción.
- Landing y dashboard se construyen juntos mediante `npm run build:platform`.
- Vercel reescribe las rutas protegidas hacia `dashboard.html`:
  - `/sign-in`
  - `/sign-up`
  - `/accept-invitation`
  - `/onboarding`
  - `/app`
  - `/admin`
  - `/internal`
- Clerk cargó correctamente en una sesión limpia de navegador con cero errores de consola.
- `contact@autivexai.com` está configurado como operador interno.
- Después de autenticarse, un operador interno recibe `workspace.view = internal_admin` y el frontend lo redirige automáticamente a `/admin`.
- Un usuario de cliente continúa hacia `/app` o `/onboarding`, según el estado de su organización.

### Supabase

- Proyecto enlazado: `llyxspttialehvjspolv` (`AutiveX AI DB`).
- `GET /api/health/database` respondió en producción:

```json
{
  "ok": true,
  "database": "connected",
  "schema": "ready"
}
```

- `GET /api/workspace` sin token responde `401 authentication_required`, confirmando que la función está publicada y protegida.
- La migración canónica actual es `supabase/migrations/20260804000000_crm_and_integrations.sql`.
- No hagas cambios estructurales manuales en SQL Editor sin crear una nueva migración en el repositorio.

### Validación local más reciente

- `npm test`: 18/18 pruebas aprobadas.
- `npm run build:platform`: aprobado.
- El build muestra una advertencia por bundles mayores a 500 kB; no bloquea el MVP, pero queda como deuda de optimización.

## 3. Arquitectura actual

```text
autivexai.com
├── Landing React/Vite
├── Dashboard React/Vite + Clerk
├── Vercel Functions /api/*
│   ├── autenticación y organizaciones Clerk
│   ├── acceso privado a Supabase/Postgres
│   ├── creación de web calls en Retell
│   └── recepción de leads
├── Supabase Postgres
│   └── CRM, agentes, llamadas, tareas, integraciones y auditoría
└── Servicios externos pendientes/parciales
    ├── Retell AI
    ├── n8n
    ├── Google Calendar / Calendly
    └── WhatsApp
```

### Responsabilidad de cada sistema

| Sistema | Fuente de verdad |
|---|---|
| Clerk | Usuarios, sesiones, organizaciones, membresías y roles |
| Supabase/Postgres | Workspace operativo, agentes, CRM, llamadas, tareas, integraciones, auditoría e idempotencia |
| Retell | Agentes de voz, LLM de conversación, llamadas y telefonía |
| n8n | Orquestación asíncrona y workflows compartidos; no debe estar en el camino de audio en tiempo real |
| Vercel | Hosting, builds, rutas y funciones serverless |

Nunca guardes access tokens de terceros en Clerk metadata. En Postgres sólo existe `credential_ref`; los tokens reales deben residir en un vault o almacén cifrado del servidor.

## 4. Entrypoints y archivos importantes

### Frontend

- `src/landing.jsx`: landing activa y URL de acceso al dashboard.
- `src/landing.css`: estilos de landing.
- `dashboard/src/auth.jsx`: Clerk, rutas, gates de cuenta y redirección de admin.
- `dashboard/src/workspace.jsx`: intake, demo y estados de onboarding del cliente.
- `dashboard/src/main.jsx`: dashboard operativo; gran parte de sus datos sigue siendo demostrativa.
- `dashboard/src/internal-admin.jsx`: consola interna de clientes, cobros y provisionamiento.
- `dashboard/src/control-api.js`: cliente autenticado para `/api/workspace` y `/api/internal/clinics`.
- `vercel.json`: rewrites de landing/dashboard.
- `scripts/build-platform.js`: construye ambas aplicaciones y las combina en `dist/`.

### Backend

- `api/workspace.js`: estado autenticado de prospecto/cliente/admin.
- `api/internal/clinics.js`: operaciones internas de clientes.
- `api/retell/token.js`: genera web-call tokens de Retell.
- `api/demo/lead.js`: recibe y entrega leads de landing.
- `api/health/database.js`: health check de Postgres.
- `server/index.js`: equivalente local de las rutas anteriores; mantén comportamiento alineado con Vercel.
- `lib/server/clerk-control.js`: autorización, state machine, onboarding, admin y provisionamiento.
- `lib/server/crm-foundation.js`: persistencia multi-tenant en Postgres.
- `lib/server/retell-demo.js`: variables y políticas server-side para la demo.
- `lib/server/retell-provisioning.js`: creación de agentes Retell privados en borrador y evento hacia n8n.
- `lib/server/database.js`: conexión server-only a Postgres.

## 5. Modelo de datos actual

El esquema privado `app` contiene:

- `workspaces`
- `voice_agents`
- `contacts`
- `calls`
- `tasks`
- `webhook_events`
- `integration_providers`
- `integration_connections`
- `integration_oauth_states`
- `audit_log`

Reglas relevantes:

- Cada workspace se enlaza a una `clerk_organization_id` única.
- Un `external_agent_id` de Retell no puede pertenecer a dos tenants.
- Todas las relaciones operativas validan que los registros pertenezcan al mismo workspace.
- `webhook_events` proporciona idempotencia para no procesar dos veces un evento externo.
- Las conexiones guardan estado y `credential_ref`, nunca secretos OAuth en claro.
- El esquema `app` no tiene grants directos para roles de navegador.

## 6. Flujo de cuentas

### Operador interno

1. Inicia sesión con un correo autorizado por `AUTIVEX_ADMIN_EMAILS` o un ID incluido en `AUTIVEX_ADMIN_USER_IDS`.
2. `/api/workspace` responde `view: internal_admin`.
3. El frontend redirige `/app` a `/admin`.
4. Desde Admin puede crear un cliente pagado, verificar cobro, agendar onboarding, iniciar configuración y controlar el paso a producción.

### Prospecto orgánico

1. Se registra con Clerk.
2. Necesita una Clerk Organization activa; si no existe, actualmente verá `organization_required`.
3. Con organización, completa el perfil de negocio.
4. El estado pasa de `prospect_intake` a `prospect_demo`.
5. Puede explorar la demo, pero no obtiene servicio real hasta pago y activación manual.

La creación automática de una organización para todo signup todavía no está implementada. No asumas que Clerk la crea solo.

### Cliente pagado manualmente

1. Admin captura correo, negocio, perfil y comprobación de pago.
2. El servidor crea o reutiliza la Clerk Organization adecuada.
3. Si el usuario aún no existe, Clerk envía una invitación a `/accept-invitation`.
4. Se crea el workspace correspondiente en Supabase.
5. El cliente entra a onboarding.
6. Admin inicia configuración.
7. Sólo después de pruebas se permite marcar producción.

### State machine resumida

Estados públicos importantes:

- `billingStatus`: `unpaid`, `verified` y estados de recuperación.
- `onboardingStatus`: `prospect_intake`, `prospect_ready`, `needs_onboarding`, `scheduled`, `configuring`, `review`, `active`.
- `serviceStatus`: `demo`, `locked`, `provisioning`, `live`, `suspended`.

Transiciones internas principales:

```text
confirm_payment
→ schedule_onboarding
→ start_configuration
→ publish_test
→ go_live
```

`go_live` requiere que las seis verificaciones de provisionamiento estén completas:

- agente Retell configurado
- número asignado
- número fallback
- llamada de prueba aprobada
- fallback probado
- webhook post-llamada verificado

## 7. Retell AI

### Decisión vigente

Retell AI es el único proveedor de voz. Gemini Voice fue eliminado del código y no debe reintroducirse, ni siquiera para demos, salvo decisión explícita del fundador.

### Demo web

El frontend solicita un token a `POST /api/retell/token`. El servidor controla el escenario y envía variables dinámicas seguras a Retell. El navegador nunca recibe `RETELL_API_KEY`.

Variables esperadas por el prompt del agente demo:

- `business_role`
- `customer_context`
- `first_line`
- `scenario_label`
- `clinic_name`
- `clinic_city`
- `clinic_services`
- `clinic_schedule`
- `appointment_outcome`

### Provisionamiento de clientes

`start_configuration` intenta:

1. Validar que el cliente pagó y tiene workspace.
2. Reutilizar un borrador staging existente si ya fue creado.
3. Crear un Retell LLM con prompt español mexicano.
4. Crear un agente privado y no publicado.
5. Guardar agente + LLM + template en `app.voice_agents`.
6. Notificar a un workflow compartido de n8n si está configurado.
7. Guardar metadata de borrador en Clerk.

El proceso es idempotente y limpia recursos remotos si falla antes de persistirlos.

### Estado real de credenciales

- El usuario cambió recientemente la API key en `.env` local.
- Los IDs antiguos `RETELL_AGENT_ID` y `RETELL_AGENT_ID_2` fueron eliminados del código, `.env` y Vercel.
- El código ahora usa nombres explícitos:
  - `RETELL_DEMO_AGENT_ID`
  - `RETELL_DEMO_AGENT_VERSION` opcional
  - `RETELL_PROVISIONING_TEMPLATE_AGENT_ID`
- Al último corte no había nuevos IDs configurados. Por lo tanto, la demo de voz y el inicio de configuración deben considerarse deshabilitados hasta colocar agentes nuevos.
- Vercel conserva una variable `RETELL_API_KEY`, pero puede seguir conteniendo la clave anterior. Verifícala y reemplázala antes de probar voz en producción; no imprimas el valor.
- No crees agentes reales durante unit tests. `test/retell-provisioning.test.js` usa mocks.

Una primera configuración razonable es crear un agente nuevo en la cuenta Retell actual y usar su ID tanto como `RETELL_DEMO_AGENT_ID` como `RETELL_PROVISIONING_TEMPLATE_AGENT_ID`. Después se pueden separar.

## 8. n8n

n8n todavía no está conectado de extremo a extremo.

Hay dos contratos diferentes:

### Lead público

- Variables: `LEAD_WEBHOOK_URL`, `LEAD_WEBHOOK_SECRET`.
- Evento: `lead.created`.
- n8n debe persistir primero, deduplicar por `lead.id` y responder 200 después de guardar.
- La notificación secundaria puede fallar sin borrar el lead.

### Provisionamiento de cliente

- Variables: `AUTIVEX_PROVISIONING_WEBHOOK_URL`, `AUTIVEX_PROVISIONING_WEBHOOK_SECRET`.
- Evento: `workspace.provisioning_started`.
- Firma: HMAC SHA-256 del body JSON crudo en `x-autivex-signature` con formato `sha256=<digest>`.
- n8n debe deduplicar por `eventId`.
- Nombre sugerido: `AVX-00 Provision Client`.
- Debe responder rápido; las tareas lentas continúan después.

Si no existe URL de n8n, el borrador Retell puede guardarse y Admin muestra n8n como pendiente. Si existe URL sin secreto, el servidor falla de forma segura.

No crear un workflow completo por cliente. Mantén workflows compartidos por capacidad y usa `workspaceId`, configuración y feature flags. Sólo crea una variante cuando el comportamiento sea genuinamente distinto y no pueda expresarse con configuración.

## 9. Integraciones previstas

El catálogo inicial de Supabase contempla conexiones multi-tenant. Prioridad probable:

1. Google Calendar
2. Calendly
3. WhatsApp
4. GoHighLevel u otro CRM externo

Principio de UX acordado: cada cliente debería poder conectar sus propias cuentas desde el dashboard mediante OAuth. El admin también debería ver el estado y ayudar a conectar, pero no debe recibir contraseñas del cliente.

Todavía faltan:

- endpoints OAuth por proveedor
- vault/almacenamiento cifrado real
- UI de conectar/desconectar
- refresh de tokens
- health checks y errores accionables
- webhooks de proveedores

## 10. Qué sigue siendo demo

No confundir UI terminada con backend real:

- métricas, llamadas, citas, pacientes, gráficas y follow-ups del dashboard principal
- historial operativo mostrado en varias tarjetas
- algunas acciones visuales del panel de producto
- claims numéricos en la landing

Sí existe una base de datos operacional, pero todavía no se ingieren webhooks de llamadas Retell para alimentar estas pantallas. Hasta hacerlo, la UI debe seguir identificando los datos como ejemplo/demo.

## 11. Variables de entorno

Fuentes de referencia:

- servidor: `.env.example`
- frontend dashboard: `dashboard/.env.example`
- Vercel: Project Settings → Environment Variables

Nunca copies valores secretos a este documento ni a Git.

### Clerk

- `VITE_CLERK_PUBLISHABLE_KEY` — pública por diseño.
- `CLERK_SECRET_KEY` — privada.
- `AUTIVEX_ADMIN_USER_IDS` — privada/opcional.
- `AUTIVEX_ADMIN_EMAILS` — privada; actualmente incluye `contact@autivexai.com`.
- `CLERK_AUTHORIZED_PARTIES`.
- `AUTIVEX_APP_URL` — en producción debe ser `https://autivexai.com` con la arquitectura actual.

Producción sigue usando una instancia Clerk Development (`pk_test`/`sk_test`). Funciona para validación, pero muestra warning y tiene límites estrictos. Antes de clientes reales hay que crear/configurar la instancia Clerk Production y reemplazar por `pk_live`/`sk_live`. No mezclar una publishable key de una instancia con el secret de otra.

### Supabase/Postgres

- `DATABASE_URL` o `POSTGRES_URL`.
- `DATABASE_SSL`.
- `SUPABASE_PROJECT_REF`.
- `SUPABASE_DB_PASSWORD`.
- `SUPABASE_DB_POOLER_HOST`.
- `SUPABASE_DB_POOLER_PORT`.

No crear variables `VITE_` con credenciales de base de datos.

### Retell

- `RETELL_API_KEY`.
- `RETELL_DEMO_AGENT_ID`.
- `RETELL_DEMO_AGENT_VERSION`.
- `RETELL_PROVISIONING_TEMPLATE_AGENT_ID`.
- `RETELL_PROVISIONING_LLM_MODEL`, actualmente default `gpt-4.1`.

### n8n y leads

- `AUTIVEX_PROVISIONING_WEBHOOK_URL`.
- `AUTIVEX_PROVISIONING_WEBHOOK_SECRET`.
- `LEAD_WEBHOOK_URL`.
- `LEAD_WEBHOOK_SECRET`.
- `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_TO` como notificación opcional.

## 12. Seguridad y límites operativos

- Nunca exponer `CLERK_SECRET_KEY`, `RETELL_API_KEY`, contraseñas Postgres ni secretos de webhooks.
- No imprimir `.env`, `.env.local` o archivos de Vercel con secretos.
- Mantener autorización server-side aunque el frontend oculte rutas.
- Resolver siempre el workspace desde los claims de Clerk; no confiar en un workspace enviado por el navegador.
- Validar firmas y deduplicar todos los webhooks.
- No publicar un agente ni asignar telefonía durante pruebas unitarias.
- No marcar un cliente `live` sin completar verificaciones.
- El rate limiting público actual vive en memoria. Antes de anuncios o tráfico importante debe migrarse a infraestructura compartida/edge.
- Hay una variable antigua `GEMINI_API_KEY` todavía visible en la configuración de Vercel, pero el código ya no la usa. Antes de limpiar configuración productiva, confirmar que ningún deployment histórico o servicio externo depende de ella; no reintroducir Gemini en código.

## 13. Orden recomendado de próximos checkpoints

### Checkpoint 1 — Clerk Production

1. Crear o abrir la instancia Production de Clerk.
2. Configurar `autivexai.com` y redirects permitidos.
3. Reemplazar `VITE_CLERK_PUBLISHABLE_KEY` por `pk_live`.
4. Reemplazar `CLERK_SECRET_KEY` por el `sk_live` de la misma instancia.
5. Volver a configurar `contact@autivexai.com` como admin.
6. Desplegar y probar email/password, Google login, sign-up, invitación y logout.

### Checkpoint 2 — Retell nuevo

1. Confirmar que `RETELL_API_KEY` de Vercel coincide con la cuenta nueva.
2. Crear un nuevo agente Retell en español `es-419`.
3. Configurar `RETELL_DEMO_AGENT_ID` y `RETELL_PROVISIONING_TEMPLATE_AGENT_ID`.
4. Probar `/api/retell/token` sin mostrar la API key.
5. Ejecutar una demo web.
6. Crear un cliente interno de prueba y usar “Iniciar configuración”.
7. Confirmar que se crea un solo borrador y que el retry no duplica.

### Checkpoint 3 — n8n

1. Crear `AVX-00 Provision Client`.
2. Validar HMAC y deduplicación.
3. Configurar URL + secreto en Vercel.
4. Crear workflow de leads si aún no existe.
5. Guardar leads en el sistema de registro antes de notificar.

### Checkpoint 4 — Retell webhooks y dashboard real

1. Endpoint firmado para eventos Retell.
2. Persistir `call_started`, `call_ended` y `call_analyzed`.
3. Crear/actualizar contactos, llamadas y tareas idempotentemente.
4. Reemplazar gradualmente los mocks del dashboard.
5. Mantener etiquetas “demo” hasta que cada widget use datos reales.

### Checkpoint 5 — OAuth self-service

1. Google Calendar primero.
2. Estados OAuth server-side con expiración y PKCE cuando aplique.
3. Vault de credenciales.
4. UI por workspace.
5. Revocación, errores y reconexión.

## 14. Comandos para continuar

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build:platform
npm.cmd run dev
npm.cmd run dev:control
npm.cmd run db:migrate
```

Verificación Git/Vercel:

```powershell
git status -sb
git log -3 --oneline
npx.cmd vercel inspect autivexai.com
```

Health check público:

```powershell
Invoke-WebRequest https://autivexai.com/api/health/database -UseBasicParsing
```

El endpoint `/api/workspace` debe responder `401` sin token; eso es correcto.

## 15. Definición de terminado del próximo MVP

El siguiente hito no está terminado sólo porque el dashboard se vea bien. Debe comprobarse:

- login de producción con Clerk `live`
- admin AutiveX entra automáticamente a `/admin`
- cliente invitado entra a su organización correcta
- demo de voz funciona con agente Retell nuevo
- pago manual crea workspace Clerk + Supabase sin duplicados
- “Iniciar configuración” crea un único borrador Retell
- n8n recibe el evento firmado y lo procesa una sola vez
- una llamada real produce un registro real en `app.calls`
- una acción posterior crea una tarea o cita comprobable
- el dashboard distingue claramente demo de telemetría real
- ninguna credencial aparece en browser, logs o Git

## 16. Instrucción para Claude Code

Antes de implementar:

1. Ejecuta `git status -sb` y confirma que estás en `master` limpio o crea una rama `agent/<objetivo>`.
2. Lee `CLAUDE.md` y este handoff completo.
3. Inspecciona el entrypoint real antes de tocar UI.
4. Verifica el estado externo actual; este documento es una foto fechada.
5. No inventes IDs de Clerk, Retell, Vercel, Supabase o n8n.
6. No cambies producción para “probar” una hipótesis sin validar localmente y en Preview.
7. Mantén Retell como único proveedor de voz.
8. Ejecuta pruebas y `npm run build:platform` antes de publicar.
9. Documenta cualquier cambio de arquitectura o variable nueva.
10. Si falta una credencial o decisión del fundador, avanza con mocks seguros y deja el bloqueo explícito; no uses valores falsos en producción.
