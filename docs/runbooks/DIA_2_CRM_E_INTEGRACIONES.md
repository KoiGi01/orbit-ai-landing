# Día 2: CRM persistente y conexiones por cliente

Estado: la migración ya fue aplicada y verificada en el proyecto Supabase de AutiveX. El bootstrap del primer workspace está pendiente únicamente de configurar una organización real de Clerk.

## Decisión de arquitectura

```text
Clerk
  identidad, organizaciones y roles

Postgres de AutiveX
  workspaces, agentes, contactos, llamadas, pendientes e integraciones

n8n
  automatizaciones posteriores; nunca fuente de verdad ni almacén de tokens de clientes
```

Una conexión pertenece al workspace del negocio, no a la cuenta personal de AutiveX, al usuario que creó el workflow de n8n ni a un empleado. El usuario que inicia la conexión queda registrado únicamente para auditoría.

## Qué quedó construido

- Migración versionada `db/migrations/0001_crm_and_integrations.sql`.
- Esquema privado `app`, sin acceso directo para roles del navegador.
- Tablas de CRM: `workspaces`, `voice_agents`, `contacts`, `calls`, `tasks` y `webhook_events`.
- Catálogo y estado de conexiones: `integration_providers`, `integration_connections` e `integration_oauth_states`.
- Auditoría: `audit_log`.
- Unicidad para llamadas, webhooks, teléfonos y conexiones primarias.
- Relaciones compuestas que impiden asociar contactos o llamadas entre workspaces.
- Cliente Postgres server-only en `lib/server/database.js`.
- Bootstrap repetible del workspace y agente en `lib/server/crm-foundation.js`.
- Pruebas PostgreSQL offline con PGlite; no necesitan credenciales ni Docker.

No se almacenan transcripciones, grabaciones, URLs temporales ni payloads completos de Retell. `safe_payload` deberá construirse por lista permitida cuando se implemente el webhook.

## Activar una base administrada

Supabase se usará como Postgres administrado, no como segundo sistema de autenticación.

1. Crear un proyecto de prueba en Supabase.
2. Abrir la sección de conexión de base de datos y elegir el Session Pooler para migraciones.
3. Usar una URL completa en `DATABASE_URL`, o guardar la contraseña en `.env` y los datos no secretos del pooler en `.env.local`. Nunca crear `VITE_DATABASE_URL` ni `VITE_SUPABASE_DB_PASSWORD`.
4. Configurar una de estas alternativas:

```dotenv
DATABASE_URL=postgresql://...
DATABASE_SSL=require
DATABASE_POOL_MAX=5
```

```dotenv
# .env
SUPABASE_DB_PASSWORD=...

# .env.local
SUPABASE_PROJECT_REF=...
SUPABASE_DB_POOLER_HOST=aws-0-region.pooler.supabase.com
SUPABASE_DB_POOLER_PORT=5432
```

El runtime también admite `DATABASE_MIGRATION_URL` cuando producción utiliza un pooler transaccional separado. Las migraciones de Supabase deben usar conexión directa o Session Pooler, no Transaction Pooler en el puerto 6543.

5. Aplicar la migración:

```bash
npm run db:migrate
```

6. Obtener de Clerk el ID de la organización de prueba y configurar:

```dotenv
AUTIVEX_MVP_CLERK_ORG_ID=org_...
AUTIVEX_MVP_WORKSPACE_NAME=AutiveX MVP
AUTIVEX_MVP_TIMEZONE=America/Mexico_City
AUTIVEX_MVP_RETELL_AGENT_ID=agent_...
```

7. Crear o actualizar la asociación:

```bash
npm run db:seed:mvp
```

El seed falla si el agente Retell ya pertenece a otro workspace. Consultar un workspace desconocido nunca lo crea automáticamente.

## Centro de integraciones

El dashboard tendrá un Centro de integraciones, pero los proveedores se habilitarán uno por uno:

1. Google Calendar.
2. Calendly.
3. WhatsApp Business.

Google Calendar resuelve primero el caso central: consultar disponibilidad y crear citas. Calendly requiere una aplicación OAuth multiusuario. WhatsApp Business requiere un flujo de alta, permisos y activos empresariales propios; no debe representarse todavía como un OAuth genérico.

Cada conexión expone al dashboard solamente:

- Proveedor.
- Nombre de la cuenta conectada.
- Estado.
- Capacidades concedidas.
- Última verificación.
- Error accionable, si existe.

`credential_ref` apunta a un vault o almacén cifrado. Nunca contiene directamente access tokens, refresh tokens o API keys.

## Flujo futuro de conexión

```text
Administrador del workspace
→ Conectar Google Calendar
→ backend resuelve organización Clerk
→ crea state de un solo uso + PKCE + expiración
→ proveedor muestra consentimiento
→ callback valida state, usuario, workspace y redirect URI
→ backend intercambia el código
→ token cifrado en vault
→ AutiveX prueba la cuenta
→ usuario elige agenda
→ conexión pasa a connected
```

Sólo un `org:admin` podrá conectar, cambiar o desconectar cuentas. Un miembro podrá ver el estado. Ocultar botones en React no sustituye la verificación del rol en el servidor.

## Checkpoint del Día 2

El checkpoint está aprobado localmente cuando:

- La migración se aplica dos veces sin romperse.
- Dos organizaciones no pueden compartir accidentalmente un agente Retell.
- Una llamada no puede apuntar a un contacto de otro workspace.
- Un webhook duplicado es rechazado por su `event_key`.
- Una conexión no puede marcarse activa sin cuenta externa y referencia segura.
- Los serializadores no exponen `credential_ref`.
- `npm test` pasa sin conectarse a servicios externos.

El checkpoint externo queda aprobado al ejecutar migración y seed sobre el proyecto Supabase real.

## Fuera de alcance todavía

- Botones OAuth reales.
- Sincronización de calendarios.
- Creación de citas durante la llamada.
- Conexión de WhatsApp de producción.
- Tokens de clientes dentro de n8n.
- Varias conexiones activas para una misma capacidad.
- Importación histórica de calendarios o conversaciones.

## Referencias oficiales

- Google OAuth para aplicaciones web: https://developers.google.com/identity/protocols/oauth2/web-server
- Scopes de Google Calendar: https://developers.google.com/workspace/calendar/api/auth
- Calendly OAuth para aplicaciones multiusuario: https://developer.calendly.com/authentication
- Creación de una aplicación OAuth de Calendly: https://developer.calendly.com/creating-an-oauth-app
- Embedded Signup de WhatsApp Business: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
