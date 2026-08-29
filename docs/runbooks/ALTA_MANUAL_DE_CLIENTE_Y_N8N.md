# Alta manual de un cliente: onboarding, Retell, CRM y n8n

Estado: guía operativa del MVP manual. Describe el proceso desde que el dinero está acreditado hasta la activación controlada del agente. También distingue lo que ya funciona de lo que todavía debe implementarse.

## Resultado esperado

```text
Pago acreditado
→ alta en Operaciones AutiveX
→ organización e invitación en Clerk
→ workspace operativo en Supabase
→ sesión de onboarding
→ agente y telefonía en Retell
→ automatizaciones probadas en n8n
→ llamada real de aceptación
→ activación manual
```

La regla central es:

- Clerk controla identidad, organización y etapa de la cuenta.
- Supabase es la fuente de verdad del CRM operativo.
- Retell atiende las llamadas.
- n8n ejecuta automatizaciones posteriores; no es el CRM ni el almacén de credenciales de los clientes.

## Estado real antes del primer cliente

| Componente | Estado actual |
| --- | --- |
| Panel interno `/admin` | Implementado; requiere Clerk configurado y una cuenta interna autorizada. |
| Pago manual, organización e invitación | Implementados en Clerk. |
| Migración CRM | Aplicada en el proyecto Supabase real. |
| Alta del workspace en CRM | Automática al crear o confirmar un cliente pagado desde `/admin`. |
| Agente Retell por cliente | Creación en Retell aún manual; al guardar IDs y comprobaciones, el panel sincroniza el agente con Supabase. |
| Leads de la landing hacia n8n | La interfaz existe; faltan URL y secreto reales de n8n. |
| Webhook post-llamada Retell → AutiveX | Pendiente de implementar. |
| Escritura automática de llamadas en Supabase | Pendiente de implementar. |
| Automatizaciones operativas hacia n8n | Diseño definido en esta guía; pendiente conectar el endpoint de AutiveX. |
| Calendario y WhatsApp del cliente | Pendientes; no guardar sus tokens en n8n. |

No se debe activar un cliente real mientras el webhook post-llamada y la persistencia en Supabase no hayan sido probados de extremo a extremo.

## Qué se crea automáticamente

Al confirmar un cliente pagado:

- Clerk crea o reutiliza la organización y envía una invitación al propietario.
- Supabase crea o actualiza el workspace y guarda la ficha estructurada del negocio.
- No se crea todavía un agente facturable en Retell.
- No se duplica un workflow de n8n.

La siguiente automatización de Retell debe ocurrir al iniciar **Configuración**, después de revisar la ficha: un botón creará un agente borrador desde una plantilla versionada. El operador seguirá aprobando prompt, voz, número, fallback y llamada de prueba antes de publicar.

n8n usará un workflow compartido. Cada evento llevará `workspace_id`; AutiveX resolverá en Supabase qué calendario, alertas o acciones corresponden al cliente. Crear un cliente no debe crear un workflow independiente.

Google Calendar y Calendly requieren autorización del propietario. Desde Admin se podrá enviar el enlace de conexión o abrirlo durante el onboarding, pero el cliente debe aprobar el acceso. WhatsApp Business seguirá un alta asistida equivalente; AutiveX nunca solicita ni guarda contraseñas.

## Responsabilidades

### Responsable comercial y de cuenta

- Confirma que el dinero llegó realmente.
- Acuerda alcance, horario, límites y fecha de piloto.
- Crea el cliente desde `/admin`.
- Decide si el piloto pasa a producción.

### Responsable de Retell y producto

- Crea o duplica el agente aprobado.
- Configura el número, fallback, prompt y análisis post-llamada.
- Verifica que el workspace creado por el panel tenga el agente correcto.
- Ejecuta las pruebas de aceptación.

### Responsable de n8n

- Mantiene el workflow compartido de eventos operativos.
- Configura únicamente rutas de notificación, no secretos del cliente.
- Revisa ejecuciones fallidas y confirma la entrega durante el piloto.

### Cliente

- Entrega información correcta del negocio.
- Designa un responsable operativo y un teléfono humano de respaldo.
- Aprueba guiones, reglas y prueba final.
- **Comparte su Google Calendar con la cuenta de AutiveX** (Paso 4b). Sin esto el agente no puede agendar, y es el cliente quien tiene que hacerlo: nadie más puede darse ese permiso.

## Paso 0: reunir la información de onboarding

No empieces a configurar Retell durante la llamada de venta. Antes de la sesión técnica crea una ficha con:

- Nombre comercial y nombre del propietario o responsable.
- Correo con el que iniciará sesión.
- Ciudad, zona horaria e idioma.
- Horario normal, descansos, días cerrados y manejo fuera de horario.
- Motivos de llamada que debe resolver el agente.
- Preguntas frecuentes y datos que sí puede compartir.
- Acciones prohibidas: diagnósticos, promesas, precios no autorizados o decisiones sensibles.
- Qué significa una llamada exitosa.
- Reglas para solicitar, confirmar, cancelar o cambiar una cita.
- Casos que requieren transferencia o devolución humana.
- Número humano de fallback en formato E.164, por ejemplo `+525512345678`.
- Correo o teléfono que recibirá alertas normales y urgentes.
- Número que recibirá llamadas y estrategia de telefonía.
- Dirección del Google Calendar donde se agendarán las citas: el correo del calendario (`negocio@gmail.com`) o el ID de un calendario secundario (`...@group.calendar.google.com`). Confirma cuál es el calendario que el negocio realmente usa; si tienen varios, pregunta explícitamente en cuál quieren las citas del agente.
- Nombre de la persona que aprobará la prueba final.

No recolectes contraseñas de Google, WhatsApp, Calendly ni del correo del cliente.

Para el primer MVP no se suben documentos. Usa los campos estructurados y notas internas. Si después se requieren menús, listas de precios o políticas, se almacenarán en un bucket privado con control de acceso y retención definidos; nunca en metadata de Clerk.

## Paso 1: verificar el pago

1. Abre Mercado Pago, banco o la fuente real del cobro.
2. Confirma monto, moneda, fecha y que el movimiento esté acreditado.
3. Conserva la referencia o folio.
4. Si sólo existe una captura o promesa de pago, detén el proceso.

Registrar el pago en AutiveX no cobra dinero. Únicamente deja evidencia de que un operador confirmó un cobro externo.

## Paso 2: crear el cliente desde Operaciones

Precondiciones del servidor:

```dotenv
CLERK_SECRET_KEY=sk_...
AUTIVEX_ADMIN_USER_IDS=user_...
AUTIVEX_ADMIN_EMAILS=operador@autivexai.com
CLERK_AUTHORIZED_PARTIES=https://app.autivexai.com
AUTIVEX_APP_URL=https://app.autivexai.com
```

Procedimiento:

1. Inicia sesión con la cuenta interna autorizada.
2. Abre `https://app.autivexai.com/admin` o `/admin` en desarrollo.
3. Selecciona **Crear cliente pagado**.
4. Captura propietario, contacto, industria, descripción, ciudad, zona horaria, horarios, servicios, motivos de llamada, agenda actual, origen y datos del pago.
5. Confirma **Confirmar pago y crear acceso**.
6. El backend crea o reutiliza la organización de Clerk, envía la invitación y crea el workspace de Supabase usando el `org_...` como vínculo.

El backend reutiliza una organización prospecto no pagada cuando el correo ya existe. Si el correo pertenece a un cliente pagado o tiene organizaciones ambiguas, detiene el alta para revisión manual.

Resultado esperado en Clerk:

```text
billingStatus = verified
onboardingStatus = needs_onboarding
serviceStatus = locked
```

Resultado esperado en Supabase:

```text
app.workspaces.clerk_organization_id = org_...
app.workspaces.status = testing
app.workspaces.settings.businessProfile = ficha estructurada del negocio
```

Si el propietario todavía no tiene cuenta, Clerk envía una invitación de administrador válida durante 30 días y redirige a `/accept-invitation`.

## Paso 3: confirmar el acceso del cliente

1. Pide al cliente abrir la invitación en el mismo navegador donde terminará el registro.
2. Confirma que acepta la organización correcta.
3. Verifica que entra a `/onboarding` y no al panel interno.
4. Desde `/admin`, marca **Onboarding agendado**.
5. Cuando empiece el trabajo técnico, marca **Iniciar configuración**.

La página de onboarding actual muestra progreso y medios de contacto; todavía no configura integraciones automáticamente.

## Paso 4: configurar el agente Retell

1. Duplica el agente base aprobado; no edites el agente compartido de demostración.
2. Nómbralo con una convención estable, por ejemplo `Cliente · Recepción · prod`.
3. Configura zona horaria, saludo, horario, servicios, límites y transferencia humana.
4. Añade sólo conocimiento aprobado por el cliente.
5. Configura análisis post-llamada con campos pequeños y estructurados:

   - intención;
   - urgencia;
   - nombre y teléfono cuando sean necesarios;
   - resultado de la llamada;
   - solicitud de cita;
   - seguimiento requerido.

6. Limita los webhooks a eventos de alto valor: `call_ended` y `call_analyzed`.
7. Publica una versión de prueba y guarda el `agent_id`.
8. Asigna o importa el número telefónico y enlaza el agente entrante con peso `1`.
9. Configura el fallback humano cuando la modalidad de telefonía lo permita.

Para un número mexicano normalmente habrá que usar telefonía propia mediante Twilio, Telnyx u otro proveedor SIP e importarla a Retell. La compra directa de números administrados por Retell no debe asumirse como disponible en México.

## Paso 4b: conectar el Google Calendar del cliente

Sin este paso el agente **no puede agendar**. Es el error de alta más fácil de cometer porque el dashboard no lo detecta: se pinta en verde aunque falte.

### Por qué existe este paso

n8n no usa OAuth por cliente. Escribe en el calendario de **todos** los clientes con una sola cuenta de Google compartida, el "calendar bot":

```text
luismedlozn@gmail.com
```

AutiveX nunca guarda una credencial del calendario del cliente. Sólo guarda **a cuál calendario escribir** (`calendarId`). Para Google, esa cuenta es un tercero cualquiera, así que el dueño del calendario tiene que darle acceso a mano.

### Lo que hace el cliente

Pídeselo por escrito, con estas palabras:

1. Abrir Google Calendar en computadora (desde el celular no se puede compartir).
2. En la barra lateral, pasar el cursor sobre el calendario del negocio → los tres puntos → **Configuración y uso compartido**.
3. Bajar a **Compartir con determinadas personas o grupos** → **Añadir personas**.
4. Agregar `luismedlozn@gmail.com`.
5. En el desplegable de permisos elegir **Hacer cambios en los eventos**.
6. Guardar y avisar cuando esté hecho.

El nivel de permiso importa. Con **Ver todos los detalles de los eventos** el agente puede consultar disponibilidad pero **no** puede agendar, y ese es justo el caso que se ve "casi bien" y falla en producción.

### Lo que haces tú

Una vez que el cliente confirme, captura la dirección del calendario en `/admin` → la Location → conexión de calendario. Eso adjunta la herramienta `manage_calendar` al agente en Retell y regenera el prompt para que sepa que ya tiene agenda.

### Advertencia: conectado no significa funcionando

El guardado **sólo valida el formato** de la dirección (que termine en `@gmail.com` o `@group.calendar.google.com`). No comprueba que el calendar bot tenga acceso. Es decir:

- El dashboard dice **conectado** aunque nadie haya compartido nada.
- Consultar disponibilidad (`list`) puede funcionar si el calendario es visible.
- Crear, cancelar o editar falla con `404 Not Found` de Google.

El resultado en vivo es el peor posible: el agente le dice a quien llama "listo, quedó agendada para el martes" y en el calendario no aparece nada. **Nunca des por buena la conexión sin la verificación de abajo.**

### Verificación obligatoria

1. Haz una llamada de prueba y agenda una cita real.
2. Confirma que el evento aparece en el Google Calendar del cliente.
3. Confirma que aparece en **Agenda** del dashboard **en color coral** (agendada por el agente), no en gris (evento preexistente). Si sale gris, el evento se creó pero el callback de n8n a `/api/appointments/sync` no llegó.
4. Cancela esa cita de prueba desde una segunda llamada y confirma que desaparece de Google.

Si el paso 2 falla, casi siempre es permiso: el calendario no se compartió, o se compartió como sólo lectura.

## Paso 5: crear el workspace en Supabase

Desde PowerShell, en la raíz del repositorio:

```powershell
$env:AUTIVEX_MVP_CLERK_ORG_ID = "org_del_cliente"
$env:AUTIVEX_MVP_WORKSPACE_NAME = "Nombre del negocio"
$env:AUTIVEX_MVP_TIMEZONE = "America/Mexico_City"
$env:AUTIVEX_MVP_RETELL_AGENT_ID = "agent_id_de_retell"

npm.cmd run db:seed:mvp

Remove-Item Env:AUTIVEX_MVP_CLERK_ORG_ID
Remove-Item Env:AUTIVEX_MVP_WORKSPACE_NAME
Remove-Item Env:AUTIVEX_MVP_TIMEZONE
Remove-Item Env:AUTIVEX_MVP_RETELL_AGENT_ID
```

Después verifica:

- El workspace usa exactamente el `org_...` de Clerk.
- El agente pertenece al workspace correcto.
- Su estado inicial es `testing`.
- El mismo agente Retell no aparece en otro workspace.

No edites filas directamente desde el navegador de Supabase para saltarte este paso.

## Paso 6: cómo usaremos n8n

Para los primeros clientes usaremos **un workflow compartido**, no una copia completa por cada negocio:

```text
Retell
→ webhook protegido de AutiveX
→ validación de firma e idempotencia
→ Supabase guarda la llamada
→ AutiveX emite un evento mínimo
→ n8n enruta la notificación o tarea
```

n8n queda fuera de la conversación en tiempo real. No debe decidir disponibilidad, crear contexto para cada turno ni almacenar el historial principal del cliente. Si n8n falla, la llamada y su resultado deben permanecer guardados en Supabase.

### Workflow actual de prospectos

El workflow `AutiveX · nuevos leads` sólo atiende formularios de la landing. Usa `LEAD_WEBHOOK_URL` y `LEAD_WEBHOOK_SECRET`. No crea clientes, agentes ni workspaces y no debe duplicarse por cliente.

### Workflow operativo que debe preparar la responsable de n8n

Puedes enviarle este mensaje:

> Necesito un workflow llamado `AutiveX · eventos operativos · v1`. Debe recibir `POST` en un Webhook protegido con Header Auth, usar la URL de producción y aceptar únicamente eventos versión 1 enviados por AutiveX. Primero valida `event_id`, `event_type`, `occurred_at`, `workspace.id` y `data`; luego responde `202 accepted` y continúa el procesamiento. Enruta `call.analyzed`, `appointment.requested`, `follow_up.created` y `call.urgent`. Para el MVP usa una tabla de routing sin credenciales con `workspace_id`, `active`, `timezone`, `alert_email`, `alert_whatsapp` y `urgent_phone`. Deduplica por `event_id` antes de enviar mensajes. Crea un Error Workflow separado que avise a AutiveX cuando falle una ejecución. No guardes API keys de Retell, Clerk, Supabase ni tokens de Google o WhatsApp del cliente. Entrégame la URL de producción, un secreto largo generado para AutiveX, una captura de una ejecución exitosa y otra del manejo de un evento duplicado.

Nodos mínimos:

1. **Webhook** `POST`, con Header Auth y ruta estable.
2. **Edit Fields/Set** para conservar sólo los campos permitidos.
3. **IF** para rechazar versión, workspace o tipo de evento desconocidos.
4. **Respond to Webhook** con `202` después de validar.
5. **Data Table o almacén operativo** para deduplicar `event_id` y resolver routing temporal.
6. **Switch** por `event_type`.
7. **Email/WhatsApp interno** para alertas; al principio deben ser credenciales propiedad de AutiveX.
8. **Registro de resultado** con estado `sent`, `ignored` o `failed`.
9. **Error Trigger** en un segundo workflow para alertar errores.

La tabla de routing es una solución manual temporal. Cuando exista el Centro de integraciones, la configuración vivirá en AutiveX y n8n recibirá destinatarios y acciones ya resueltos.

### Alta de cada cliente dentro de n8n

No clones el workflow. Después de ejecutar el seed de Supabase:

1. Copia el UUID del workspace devuelto por `npm run db:seed:mvp`.
2. Agrega una fila a la tabla temporal de routing.
3. Configura `active = false`, zona horaria y destinatarios aprobados.
4. Envía el payload de prueba usando ese UUID.
5. Confirma que la rama correcta se ejecutó y que un duplicado fue ignorado.
6. Cambia `active = true` sólo después de la prueba de aceptación.

La fila contiene preferencias de routing, no contraseñas ni tokens. El `org_...` identifica la organización en Clerk; el UUID identifica su workspace operativo en Supabase. No los intercambies.

Payload de prueba:

```json
{
  "event_id": "evt_test_001",
  "event_type": "call.analyzed",
  "version": 1,
  "occurred_at": "2026-08-03T20:00:00.000Z",
  "workspace": {
    "id": "workspace_uuid",
    "name": "Negocio de prueba"
  },
  "data": {
    "call_id": "call_retell_001",
    "intent": "solicitar_cita",
    "urgency": "normal",
    "outcome": "follow_up_required",
    "contact": {
      "name": "Paciente de prueba",
      "phone": "+525500000001"
    }
  }
}
```

No incluir en el evento enviado a n8n:

- API keys o tokens.
- Transcripción completa.
- Grabación o URL firmada.
- Payload crudo de Retell.
- Datos no necesarios para la acción.

## Paso 7: pieza técnica pendiente antes de producción

AutiveX todavía debe implementar el receptor post-llamada. El endpoint deberá:

1. Recibir el cuerpo crudo de Retell.
2. Verificar `x-retell-signature` antes de parsearlo.
3. Aceptar sólo eventos configurados.
4. Resolver `agent_id` a un único workspace.
5. Deduplicar por proveedor y `event_key`.
6. Guardar primero llamada, contacto o tarea en Supabase.
7. Construir un payload permitido y enviarlo al workflow operativo de n8n.
8. Registrar éxito o error sin guardar secretos ni payloads completos.

Variables propuestas para esa conexión futura:

```dotenv
AUTIVEX_N8N_EVENTS_URL=https://n8n.example.com/webhook/autivex-events
AUTIVEX_N8N_EVENTS_SECRET=secreto-largo-y-único
```

Estas variables todavía no son consumidas por el código actual. No marques **Webhook verificado** hasta que una llamada real haya creado registros en `app.calls` y `app.webhook_events` y aparezca como ejecución exitosa en n8n.

## Paso 8: prueba de aceptación

Usa datos ficticios y el número telefónico real asignado al cliente.

1. Llama al número y confirma saludo, identidad y audio.
2. Prueba una pregunta frecuente.
3. Solicita una cita sin confirmar datos suficientes.
4. Prueba un caso urgente o prioritario.
5. Pide transferencia o fallback humano.
6. Finaliza la llamada y espera el análisis.
7. Confirma en Retell el `call_id` y la versión del agente.
8. Confirma una sola fila en `app.calls`.
9. Confirma un evento procesado en `app.webhook_events`.
10. Confirma la ejecución correspondiente en n8n.
11. Reenvía el mismo `event_id` y verifica que no genere una segunda notificación.
12. Confirma que la persona correcta recibió la alerta y entendió qué hacer.

13. Confirma que la cita creada en la prueba existe en el Google Calendar del cliente y sale coral en **Agenda** (Paso 4b). Si el agente dijo que agendó y el evento no está, el calendario no se compartió con permiso de escritura.

Registra en `/admin`:

- Retell agent ID.
- Número asignado en E.164.
- Número de fallback en E.164.
- Retell call ID aprobado.
- Fallback probado.
- Webhook post-llamada verificado.
- Calendario compartido con el calendar bot y escritura verificada.

## Paso 9: publicar y activar

1. Guarda las seis comprobaciones de provisionamiento.
2. Selecciona **Publicar llamada de prueba**.
3. Pide al cliente confirmar por escrito el comportamiento aprobado.
4. Realiza un piloto controlado antes de mover todo el tráfico.
5. Revisa las primeras ejecuciones de Retell, Supabase y n8n.
6. En `/admin`, selecciona **Activar producción** y escribe el nombre exacto del negocio.

Aunque el estado cambie a `live`, no presentes las gráficas del dashboard como resultados reales hasta que consulten datos persistidos de Supabase.

## Paso 10: entrega al cliente

Entrega únicamente:

- URL para iniciar sesión.
- Número telefónico activo.
- Horario y comportamiento aprobados.
- Qué ocurre fuera de horario.
- Ruta de escalamiento humano.
- Canal para reportar cambios.
- Fecha de revisión del piloto.

No entregues acceso a Retell, n8n, Supabase o secretos internos durante el MVP salvo que exista una decisión operativa explícita.

## Monitoreo durante el piloto

Durante las primeras 24 a 72 horas:

- Revisa llamadas fallidas o sin análisis.
- Revisa ejecuciones fallidas en n8n y reintenta sólo después de entender la causa.
- Compara alertas urgentes con llamadas reales.
- Confirma que no existan notificaciones duplicadas.
- Corrige el prompt mediante una nueva versión; no edites producción sin dejar registro.
- Mantén disponible el fallback humano.

## Pausa o reversión

Si hay un problema serio:

1. Suspende el cliente desde `/admin`.
2. Desasigna el agente del número o enruta temporalmente al humano.
3. Desactiva el routing del workspace en n8n.
4. Conserva llamadas, eventos y auditoría para investigar.
5. Corrige y repite la prueba completa antes de reactivar.

## Definición de terminado

- El pago fue verificado contra la fuente real.
- La organización Clerk y el workspace Supabase comparten el mismo `org_...`.
- El propietario aceptó la invitación y puede entrar.
- El agente Retell y el número pertenecen al cliente correcto.
- Fallback y límites fueron probados.
- Una llamada real se guardó una sola vez en Supabase.
- n8n procesó el evento una sola vez y notificó al destinatario correcto.
- No se expusieron secretos ni se guardaron tokens del cliente en n8n.
- El cliente aprobó la prueba.
- Un administrador de AutiveX ejecutó la activación final.

## Referencias oficiales

- Webhooks y verificación de firma de Retell: https://docs.retellai.com/features/webhook-overview
- Llamadas entrantes en Retell: https://docs.retellai.com/deploy/inbound-call
- Telefonía propia mediante SIP: https://docs.retellai.com/deploy/custom-telephony
- Integración de Twilio con Retell: https://docs.retellai.com/deploy/twilio
- Ejecuciones y reintentos de n8n: https://docs.n8n.io/workflows/executions/all-executions/
- Seguridad y webhooks sin protección en n8n: https://docs.n8n.io/hosting/securing/security-audit/
- Compartir workflows y credenciales en n8n: https://docs.n8n.io/workflows/sharing/
