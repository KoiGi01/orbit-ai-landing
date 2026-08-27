# AutiveX — handoff para Claude Code

**Corte de información:** 26 de agosto de 2026, zona `America/Mexico_City`

**Repositorio:** `KoiGi01/orbit-ai-landing`

**Rama canónica:** `master`

**Commit desplegado:** `ff40fd4` — `Give the calendar its own nav section, add tabs and priced services to Mi Agente` (working tree limpio, `master` alineado con `origin/master` al momento de escribir esto)

**Producción:** <https://autivexai.com>

Este documento reemplaza a `docs/CLAUDE_CODE_HANDOFF_2026-08-05.md`, que queda como registro histórico — describía el estado del proyecto antes de 37 commits y 3 migraciones que cambiaron partes importantes de la arquitectura (webhook de Retell, calendario real, notificaciones, configuración de agente editable). Si algo de este documento contradice el código activo, verifica el código primero; este es un punto de reanudación, no una fuente de verdad permanente.

**Dos cosas que este corte NO reverificó en vivo** (créelas con cautela, confírmalas antes de depender de ellas): el estado de la instancia de Clerk en producción (¿ya es `live`/`pk_live`, o sigue en `development`/`pk_test` como decía el handoff anterior?), y un `GET /api/health/database` fresco contra producción. Todo lo demás en este documento sí está respaldado por commits, migraciones o código leído directamente durante esta sesión.

## 1. Resumen ejecutivo

AutiveX es una plataforma en español para operar recepcionistas de voz con IA para negocios en México. El nicho definitivo sigue abierto — no asumas que todos los clientes son clínicas, aunque el primer cliente real de prueba usa ese giro.

El MVP sigue siendo un servicio asistido, sin self-service:

1. Un prospecto conoce el producto desde la landing y puede correr una demo de voz real.
2. Un operador interno (`/admin` o `/internal`) crea una Location, le asigna usuarios, y AutiveX crea la Clerk Organization y el workspace de Supabase.
3. El flujo de admin intenta crear de inmediato un borrador privado de Retell para la Location; los intentos fallidos quedan reintentables de forma segura.
4. El cliente conecta su Google Calendar (compartiéndolo con una cuenta de Google dedicada — ver §8) para que el agente pueda agendar de verdad, no solo tomar el recado.
5. Los usuarios asignados entran al dashboard compartido de su Location tras aceptar su invitación de Clerk.

**Corrección importante sobre el handoff anterior:** el cobro ya NO es un gate obligatorio del flujo de activación. Una Location nueva usa `billingStatus: not_required` por defecto y puede avanzar por onboarding y provisionamiento sin registro de pago — el flujo de "pago manual verificado" descrito en el handoff de agosto sigue existiendo en el código para reutilizarse después, pero no es el camino que se usa hoy. Ver `README.md` §"Current product flow", que ya refleja esto.

## 2. Estado verificado en producción

### GitHub y Vercel

- `master` está limpio y alineado con `origin/master` en el commit `ff40fd4`.
- El deployment automático de `master` en Vercel se ha usado repetidamente esta sesión (múltiples `git push origin master` sin intervención manual en Vercel) — el pipeline auto-deploy sigue funcionando tal como describía el handoff anterior.
- No se corrió un health check fresco contra `https://autivexai.com` en esta sesión — hazlo antes de asumir que el deployment activo ya incluye `ff40fd4`.

### Validación local más reciente

- `npm test`: **71/71** pruebas aprobadas (subieron de 18 en el corte anterior — cobertura nueva de webhook de Retell, citas, calendario, y prompt del agente).
- `npm run build` y `npm run build:dashboard`: aprobados, sin errores. Persiste la advertencia de bundles > 500 kB (deuda de optimización conocida, no bloqueante).

### Actividad real verificada esta sesión

Un cliente de prueba real ("test location 1") completó, en producción, el flujo completo: agente Retell activo, calendario de Google conectado, llamada de prueba que agenda una cita real (crea el evento en Google Calendar), y el dashboard mostrándola. Esto contradice directamente al handoff anterior (§7 decía "la demo de voz y el inicio de configuración deben considerarse deshabilitados"); esa afirmación ya no es cierta.

## 3. Arquitectura actual

```text
autivexai.com
├── Landing React/Vite
├── Dashboard React/Vite + Clerk (KPIs, llamadas, tareas y calendario reales)
├── Vercel Functions /api/*
│   ├── autenticación y organizaciones Clerk
│   ├── acceso privado a Supabase/Postgres
│   ├── creación de web calls en Retell
│   ├── recepción de leads
│   ├── recepción de eventos de ciclo de vida de llamadas de Retell (webhook firmado)
│   └── recepción de confirmaciones de citas agendadas por el agente (webhook firmado)
├── Supabase Postgres
│   └── CRM, agentes, llamadas, tareas, citas, notificaciones, integraciones y auditoría
└── n8n (ya conectado, no "pendiente")
    ├── Workflow de leads (`lead.created`)
    ├── Workflow de provisionamiento de cliente (`workspace.provisioning_started`)
    └── "Retell Calendar Manager": recibe la tool call `manage_calendar` de Retell,
        resuelve el calendario del workspace en Postgres, opera sobre Google Calendar
        (list/create/cancel/edit), y notifica de vuelta a /api/appointments/sync
        cuando el agente agenda/cancela/edita algo
```

### Responsabilidad de cada sistema

| Sistema | Fuente de verdad |
|---|---|
| Clerk | Usuarios, sesiones, organizaciones, membresías y roles |
| Supabase/Postgres | Workspace operativo, agentes, CRM, llamadas, tareas, **citas, notificaciones**, integraciones, auditoría e idempotencia |
| Retell | Agentes de voz, LLM de conversación, llamadas y telefonía |
| n8n | Orquestación asíncrona **y el único camino de escritura hacia Google Calendar** (ver abajo); no está en el camino de audio en tiempo real |
| Google Calendar | Calendario real de cada cliente; **no** es dueño de qué evento fue creado por el agente — eso lo decide `app.appointments` |
| Vercel | Hosting, builds, rutas y funciones serverless |

**El patrón del "calendar bot" (nuevo, no documentado en ningún otro lugar del repo):** n8n usa **una sola credencial OAuth de Google Calendar**, compartida entre todos los clientes — no una por cliente. El `calendarId` de destino sí es dinámico por request (viene de `app.integration_connections`), pero la *identidad* que escribe en Google Calendar es siempre la misma cuenta. Para que un cliente nuevo pueda agendar de verdad, tiene que **compartir manualmente su Google Calendar con esa cuenta dedicada**, dándole permiso de "Hacer cambios en los eventos" — si no lo hace, la lectura (`list`) puede funcionar pero la escritura (`create`/`cancel`/`edit`) falla con `404 Not Found` de la API de Google (confirmado en vivo). **Esto debe ser un paso explícito del checklist de onboarding de cada cliente nuevo** — hoy no está automatizado ni hay UI que lo recuerde. Un verdadero OAuth por cliente (self-service, sin este paso manual) fue considerado y explícitamente descartado por ahora (ver `d151c57 Drop unused OAuth self-service scaffolding`) — es la ruta correcta si el modelo de negocio escala a decenas de clientes auto-registrados, pero es semanas de trabajo (app de Google Cloud, pantalla de consentimiento, vault de tokens por tenant) y no se ha empezado.

Nunca guardes access tokens de terceros en Clerk metadata. En Postgres sólo existe `credential_ref`; los tokens reales deben residir en un vault o almacén cifrado del servidor.

## 4. Entrypoints y archivos importantes

### Frontend

- `src/landing.jsx` / `src/landing.css`: landing activa.
- `dashboard/src/auth.jsx`: Clerk, rutas, gates de cuenta y redirección de admin.
- `dashboard/src/workspace.jsx`: intake, demo y estados de onboarding del cliente.
- `dashboard/src/main.jsx`: dashboard operativo. **Ya no es mayormente demostrativo** — KPIs, conversaciones, tareas y la sección "Agenda" (calendario color-coded por origen: agendado por el agente vs. ya existente) usan datos reales. "Mi agente" tiene pestañas (Identidad/Horario/Servicios/Voz) y servicios con duración/costo/detalles editables. Ver §6 para lo que sigue siendo mock.
- `dashboard/src/internal-admin.jsx`: consola interna de clientes, cobros y provisionamiento; también edita la misma configuración de agente que ve el cliente.
- `dashboard/src/control-api.js`: cliente autenticado para `/api/workspace` y `/api/internal/clinics`.
- `vercel.json`: rewrites de landing/dashboard.
- `scripts/build-platform.js`: construye ambas aplicaciones y las combina en `dist/`.

### Backend

- `api/workspace.js`: estado autenticado de prospecto/cliente/admin; también sirve `?resource=voices|activity|calendar|notifications` y acepta `PATCH action=update_agent_configuration|save_calendar|update_voice|mark_notification_read|mark_all_notifications_read`.
- `api/internal/clinics.js`: operaciones internas de clientes.
- `api/retell/token.js`: genera web-call tokens de Retell.
- `api/retell/webhook.js`: **nuevo desde el corte anterior.** Verifica firma (`X-Retell-Signature`) y persiste `call_started`/`call_ended`/`call_analyzed` en `app.calls`/`app.contacts`/`app.tasks`, idempotente por evento.
- `api/appointments/sync.js`: **nuevo.** Recibe el callback firmado de n8n (`X-Autivex-Signature`) cuando el agente crea/cancela/edita una cita, y la registra en `app.appointments`.
- `api/demo/lead.js`: recibe y entrega leads de landing.
- `api/health/database.js`: health check de Postgres.
- `server/index.js`: equivalente local de todas las rutas anteriores; mantén comportamiento alineado con Vercel.
- `lib/server/clerk-control.js`: autorización, state machine, onboarding, admin, provisionamiento, y edición compartida de configuración de agente (`updateAgentBusinessProfile`, usado tanto por admin como por cliente).
- `lib/server/crm-foundation.js`: persistencia multi-tenant en Postgres (calls, contacts, tasks, actividad, conexión de Google Calendar).
- `lib/server/appointments.js`: **nuevo.** Upsert idempotente de citas agendadas por el agente, verificación de firma del callback de n8n, y lectura del calendario completo reusando el webhook `list` de n8n.
- `lib/server/retell-demo.js`: variables y políticas server-side para la demo pública.
- `lib/server/retell-provisioning.js`: creación de agentes Retell privados, prompt de negocio (`buildRetellBusinessPrompt` — ahora condicional según si hay calendario conectado, y renderiza duración/costo/detalles de cada servicio vía `formatServiceList`), actualización de voz/calendario/prompt sobre un agente ya creado.
- `lib/server/database.js`: conexión server-only a Postgres.

## 5. Modelo de datos actual

Migraciones actuales, en orden (`supabase/migrations/`):

1. `20260804000000_crm_and_integrations.sql` — línea base: `workspaces`, `voice_agents`, `contacts`, `calls`, `tasks`, `webhook_events`, `integration_providers`, `integration_connections`, `integration_oauth_states`, `audit_log`.
2. `20260823000000_simplify_unused_integration_scaffolding.sql` — **elimina** `integration_oauth_states` y recorta `integration_providers` a solo `google_calendar` (decisión explícita del fundador: "no tenemos clientes aún, simplifica"; ver commit `d151c57`).
3. `20260825000000_add_notifications.sql` — agrega `app.notifications` (usada por el dashboard del cliente).
4. `20260826000000_add_appointments.sql` — agrega `app.appointments` (citas agendadas por el agente, distintas de eventos preexistentes en el calendario).

El esquema privado `app` hoy contiene: `workspaces`, `voice_agents`, `contacts`, `calls`, `tasks`, `webhook_events`, `integration_providers`, `integration_connections`, `audit_log`, `notifications`, `appointments`.

Reglas relevantes (sin cambios respecto al handoff anterior):

- Cada workspace se enlaza a una `clerk_organization_id` única.
- Un `external_agent_id` de Retell no puede pertenecer a dos tenants.
- Todas las relaciones operativas validan que los registros pertenezcan al mismo workspace.
- `webhook_events` proporciona idempotencia para no procesar dos veces un evento externo; el mismo patrón de upsert idempotente se usa en `app.appointments` (clave única `workspace_id, external_event_id`).
- Las conexiones guardan estado y `credential_ref`, nunca secretos OAuth en claro.
- El esquema `app` no tiene grants directos para roles de navegador; RLS está habilitado en todas las tablas sin políticas — solo el rol propietario (el que corre las migraciones) tiene acceso directo, todo lo demás pasa por `lib/server/database.js`.

## 6. Qué sigue siendo demo

Ya no es cierto que "métricas, llamadas, citas, historial operativo" sean demo — eso se resolvió (`b1df851`, `6bfe072`, `40925f5`, `a0925f5`/`6a41c30`). Lo que sigue siendo estático/falso, confirmado leyendo el código:

- `StatusPopover` en `dashboard/src/main.jsx` — su rama "no-demo" (`Lucía está en línea`) tiene números fijos ("2 de 3 libres", "Hasta las 19:00", "Sincronizado") que nunca se conectaron a datos reales. Solo la rama "demo" es honesta.
- `UsageModule` y `CapacityPanel` — muestran honestamente "sin datos" en vez de números falsos, pero eso es porque **no existe ningún concepto de plan/límite de minutos todavía**, no porque estén conectados a algo real.
- Claims numéricos de la landing (sin cambios respecto al handoff anterior — no se tocó esta sesión).

## 7. Retell AI

### Decisión vigente

Retell AI es el único proveedor de voz. No reintroducir otro transporte de voz, SDK de cliente, endpoint de token o demo de respaldo sin decisión explícita del fundador.

### Prompt del agente (`buildRetellBusinessPrompt`, `lib/server/retell-provisioning.js`)

El prompt ahora es condicional según si el negocio tiene un calendario conectado (`profile.calendarId`):

- **Con calendario:** le dice al agente que use la herramienta `manage_calendar` para consultar disponibilidad real y confirmar antes de decir que una cita quedó agendada; si la herramienta falla, debe ofrecer otro horario o tomar el recado.
- **Sin calendario:** instrucción de respaldo — tomar nombre, teléfono, servicio, fecha y horario preferidos, y explicar que el equipo confirmará.

Esta rama se regenera automáticamente cada vez que se conecta un calendario (`saveClinicCalendar` ahora llama tanto a `updateRetellCalendarIntegration` como a `updateRetellAgentPrompt`) — antes de esta sesión, conectar el calendario adjuntaba la herramienta pero *nunca* actualizaba el texto del prompt, así que el agente seguía comportándose como si no tuviera calendario aunque sí lo tuviera. Ya está corregido, pero cualquier agente creado/conectado *antes* de este fix se queda con el prompt viejo hasta que se le vuelva a guardar la configuración del calendario o del negocio.

Los servicios del negocio (`profile.services`) ya no son solo nombres — cada uno puede tener `duration`, `price` y `details`. `formatServiceList` los renderiza en el prompt como `"Limpieza dental (45 min, $800) — incluye revisión inicial"`, y una regla operativa nueva le dice al agente que use esos datos si le preguntan cuánto dura o cuesta algo, o que lo admita con honestidad si no los tiene. Compatible hacia atrás: perfiles guardados antes de este cambio siguen teniendo `services` como arreglo de strings simples, y todo el código que los lee los normaliza al vuelo.

### Provisionamiento de clientes

Sin cambios de fondo respecto al handoff anterior: `start_configuration` crea un LLM + agente privado no publicado, guarda en `app.voice_agents`, notifica a n8n si está configurado, y es idempotente/limpia recursos remotos si falla. `agentPayload()` ahora también incluye `webhook_url` automáticamente (apuntando a `/api/retell/webhook`) cuando `AUTIVEX_APP_URL` es una URL https real — antes había que configurarlo a mano y los agentes viejos podían quedarse sin él (hay un self-heal, `syncRetellAgentWebhook`, que se ejecuta cuando se edita la configuración del agente).

No crear agentes reales durante unit tests — `test/retell-provisioning.test.js` usa mocks para todo esto.

## 8. n8n

n8n **ya está conectado de extremo a extremo** para dos flujos — esto contradice al handoff anterior, que lo describía como "todavía no conectado."

### Lead público

Sin cambios: `LEAD_WEBHOOK_URL`/`LEAD_WEBHOOK_SECRET`, evento `lead.created`.

### Provisionamiento de cliente

Sin cambios: `AUTIVEX_PROVISIONING_WEBHOOK_URL`/`AUTIVEX_PROVISIONING_WEBHOOK_SECRET`, evento `workspace.provisioning_started`, HMAC SHA-256 en `x-autivex-signature`.

### Retell Calendar Manager (nuevo — no existía en el handoff anterior)

Workflow real en producción (mantenido por el equipo, no por este repo) que atiende dos roles:

1. **Tool call de Retell (`manage_calendar`)**: recibe `{name, call, args}` de Retell, resuelve el `calendarId` del workspace consultando `app.voice_agents`/`app.integration_connections` en Postgres por `call.agent_id`, y ejecuta `list`/`create`/`cancel`/`edit` sobre Google Calendar con la credencial OAuth compartida del "calendar bot" (ver §3).
2. **Callback de confirmación**: después de crear/cancelar/editar, debe llamar a `POST /api/appointments/sync` (firmado con `AUTIVEX_APPOINTMENTS_WEBHOOK_SECRET`, mismo esquema HMAC que el resto) para que quede registrado en `app.appointments` y el dashboard lo pinte como "agendado por el agente" (coral) en vez de "evento preexistente" (gris). **Este paso del callback fue especificado pero su implementación en n8n queda pendiente de confirmación** — el lado de lectura (mostrar el calendario completo en el dashboard) ya funciona sin él.

Bugs reales ya encontrados y corregidos en este workflow durante esta sesión (documentar aquí para no repetir el diagnóstico):

- La consulta SQL a Postgres no calificaba el schema (`voice_agents` en vez de `app.voice_agents`) — probablemente fallaba con `relation does not exist`.
- Insertar el nodo de consulta SQL entre el webhook y el resto del flujo eliminó el `body` original del item de n8n (el nodo de Postgres reemplaza `$json` por el resultado de la query) — toda referencia a `$json.body...` después de ese punto quedó rota; hay que referenciar el nodo del webhook explícitamente (`$('Retell Webhook').item.json.body...`).
- El campo `attendees` del nodo de Google Calendar truena (`Cannot read properties of null (reading 'split')`) si el llamante no da un correo — la mayoría de las llamadas telefónicas no lo dan. Hay que armar el arreglo condicionalmente (`attendee ? [attendee] : []`), no meter siempre un slot con `null`.
- Sin calendario compartido con la cuenta del "calendar bot" (ver §3), cualquier escritura (`create`/`cancel`/`edit`) falla con `404 Not Found` de Google — la lectura puede seguir funcionando si el calendario es visible.

No crear un workflow completo por cliente. Mantén workflows compartidos por capacidad y usa `workspaceId`/`calendarId` dinámico.

## 9. Integraciones

- **Google Calendar: implementado**, no "previsto." Lectura y escritura funcionando en producción con al menos un cliente real. El modelo es el "calendar bot" compartido (§3), no OAuth por cliente.
- El principio de "cada cliente conecta su propia cuenta vía OAuth desde el dashboard" que proponía el handoff anterior fue evaluado y **explícitamente descartado por ahora** (`d151c57 Drop unused OAuth self-service scaffolding`) — el fundador priorizó simplicidad sobre self-service mientras no hay clientes reales que lo necesiten.
- Calendly, WhatsApp, GoHighLevel u otro CRM externo: sin cambios, siguen sin construirse.

## 10. Variables de entorno

Fuentes de referencia: `.env.example` (servidor), `dashboard/.env.example` (browser-safe), Vercel → Project Settings → Environment Variables. Nunca copies valores secretos a este documento ni a Git.

Grupos sin cambios respecto al handoff anterior: Clerk, Supabase/Postgres, Retell (`RETELL_API_KEY`, `RETELL_DEMO_AGENT_ID`, `RETELL_DEMO_AGENT_VERSION`, `RETELL_PROVISIONING_TEMPLATE_AGENT_ID`, `RETELL_PROVISIONING_LLM_MODEL`), n8n de leads y provisionamiento.

**Grupo nuevo — Calendario y citas:**

- `RETELL_CALENDAR_WEBHOOK_URL` — URL del workflow "Retell Calendar Manager" de n8n. Ya tiene un valor por defecto en `.env.example` apuntando al n8n de producción; se usa tanto para la tool call de Retell como para que el dashboard lea el calendario completo (`fetchCalendarEvents` en `lib/server/appointments.js`).
- `AUTIVEX_APPOINTMENTS_WEBHOOK_SECRET` — secreto compartido que n8n usa para firmar su callback a `POST /api/appointments/sync` (`X-Autivex-Signature: sha256=<hmac>`). **No estaba documentado en ningún lugar antes de este handoff** — agregado a `.env.example` en esta misma actualización. Sin esta variable configurada en el servidor, el endpoint responde `503 appointments_webhook_not_configured`.

## 11. Seguridad y límites operativos

Sin cambios respecto al handoff anterior — sigue vigente todo lo que decía, más:

- El "calendar bot" de Google es una identidad compartida entre tenants por diseño actual (ver §3) — es una excepción consciente y temporal a "nunca compartir credenciales entre tenants"; no la repliques para ninguna otra integración sin la misma discusión explícita.
- El rate limiting público sigue en memoria — sin cambios, sigue siendo deuda antes de tráfico real.

## 12. Próximos checkpoints recomendados

### Completado desde el handoff anterior

- ~~Checkpoint 4 — Retell webhooks y dashboard real~~: hecho. `api/retell/webhook.js` persiste `call_started`/`call_ended`/`call_analyzed`; el dashboard usa datos reales para KPIs, conversaciones, tareas y calendario.
- ~~Checkpoint 5 — OAuth self-service~~: **no se hizo — se decidió explícitamente no hacerlo por ahora** (`d151c57`). No lo retomes sin que el fundador lo pida; el modelo vigente es el "calendar bot" compartido.

### Pendientes reales

1. **Confirmar Clerk Production.** Sigue sin reverificarse esta sesión si la instancia sigue en `pk_test`/`sk_test` o ya se movió a `live`. Repite el Checkpoint 1 del handoff anterior si no se hizo.
2. **Callback de n8n → `/api/appointments/sync`.** El endpoint y la especificación existen; falta confirmar que el workflow de n8n realmente lo esté llamando después de crear/cancelar/editar una cita (ver §8).
3. **Documentar/automatizar el paso de "compartir calendario con el calendar bot"** en el checklist de onboarding de cada cliente nuevo — hoy es tribal knowledge, no hay UI ni doc de onboarding que lo mencione.
4. **`StatusPopover`/`UsageModule` siguen con datos falsos o vacíos** (§6) — no es urgente, pero no lo confundas con trabajo terminado si alguien pregunta por el estado del dashboard.
5. **OAuth por cliente**, si el negocio crece más allá de onboarding manual asistido — deliberadamente no iniciado.

## 13. Comandos para continuar

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build:platform
npm.cmd run dev
npm.cmd run dev:control
npm.cmd run db:migrate
```

Verificación Git:

```powershell
git status -sb
git log -5 --oneline
```

Health check público (no se corrió esta sesión — hazlo antes de asumir el estado de producción):

```powershell
Invoke-WebRequest https://autivexai.com/api/health/database -UseBasicParsing
```

## 14. Instrucción para Claude Code

Antes de implementar:

1. Ejecuta `git status -sb` y confirma que estás en `master` limpio o crea una rama `agent/<objetivo>`.
2. Lee `CLAUDE.md` y este handoff completo.
3. Inspecciona el entrypoint real antes de tocar UI.
4. Verifica el estado externo actual (Vercel, Clerk, n8n) — este documento es una foto fechada, y dos cosas puntuales (§ encabezado) no se reverificaron en este corte.
5. No inventes IDs de Clerk, Retell, Vercel, Supabase o n8n, ni secretos de ningún tipo.
6. No cambies producción para "probar" una hipótesis sin validar localmente primero. Esta sesión sí usó producción directamente para pruebas reales (no hay entorno de dev separado por decisión explícita del fundador mientras no hay clientes) — eso es intencional en este proyecto, no una mala práctica a corregir.
7. Mantén Retell como único proveedor de voz.
8. Ejecuta `npm test` y ambos builds (`npm run build`, `npm run build:dashboard`) antes de dar por terminado un cambio cross-aplicación.
9. Documenta cualquier cambio de arquitectura o variable nueva — este mismo documento es un ejemplo de qué tan rápido se vuelve obsoleto si no se actualiza.
10. Si falta una credencial o decisión del fundador, avanza con mocks seguros y deja el bloqueo explícito; no uses valores falsos en producción.
