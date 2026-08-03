# AutiveX: contexto y estado actual

**Actualizado:** 3 de agosto de 2026
**Etapa:** desarrollo y validación temprana

## Qué es AutiveX

AutiveX explora agentes de inteligencia artificial que atienden conversaciones de clientes y ayudan a completar el siguiente paso operativo de un negocio.

La dirección que más se ha prototipado es una recepción por voz en español para negocios en México, potencialmente conectada con mensajería, calendarios y sistemas comerciales. Es una dirección inicial, no una definición permanente.

El objetivo no es vender “IA” como concepto. Es mejorar un resultado observable: atención, oportunidades recuperadas, citas, velocidad de respuesta, continuidad del seguimiento o carga operativa.

## Lo que sabemos y lo que sigue abierto

| Tema | Estado | Contexto |
|---|---|---|
| Marca AutiveX | DECISIÓN ACTUAL | Es la marca utilizada en el producto |
| Fase temprana | VERIFICADO | Todavía se está descubriendo el producto y mercado adecuados |
| México y español | DECISIÓN ACTUAL | Contexto de arranque, no frontera permanente |
| Voz como punto de entrada | HIPÓTESIS | Es lo más desarrollado hasta ahora; falta validarlo con clientes |
| Nicho inicial | ABIERTO | Odontología es el caso del prototipo, no el nicho seleccionado |
| Oferta, pricing y métrica principal | ABIERTO | No utilizar cifras o copy de las interfaces como decisiones |
| Modelo operativo | HIPÓTESIS | Probablemente asistido al comienzo y más automatizado después |
| Proveedores e integraciones | ABIERTO | El stack actual puede cambiar conforme se pruebe el producto |

Las etiquetas significan:

- **VERIFICADO:** observado o comprobado directamente.
- **DECISIÓN ACTUAL:** elección vigente del fundador; puede cambiar.
- **HIPÓTESIS:** idea que necesita evidencia.
- **ABIERTO:** todavía no existe una respuesta.

No es necesario utilizar estas etiquetas en cada respuesta; sirven cuando una distinción evita confusión.

## Principios actuales

- Empezar por el problema y su valor económico, no por las herramientas.
- No confundir una interfaz convincente con una capacidad productiva.
- Automatizar progresivamente; el trabajo manual es aceptable si produce aprendizaje.
- Mantener una ruta humana para casos ambiguos, sensibles o fuera de política.
- Prometer únicamente lo que pueda comprobarse de extremo a extremo.
- Preferir pilotos pequeños y reversibles antes que una arquitectura o estrategia extensa.
- Mantener abierto el nicho, stack y modelo comercial hasta tener evidencia suficiente.

## Snapshot técnico

Este snapshot describe el **working tree local inspeccionado el 3 de agosto de 2026**, basado en `ea532b0` más cambios aún no consolidados. No equivale a una prueba del deployment.

### Existe en código

- Landing pública activa en `src/landing.jsx`.
- Demo web de voz conectable a Retell sin exponer la API key al navegador.
- Formulario que intenta entregar leads por email mediante Resend; no hay persistencia ni fallback comprobado.
- Dashboard separado con Clerk para autenticación, organizaciones y rutas protegidas.
- Intake de prospecto, preview y panel interno para registrar pagos declarados como verificados y avanzar onboarding.

El registro orgánico depende de la configuración de Organizations en Clerk. Sin organización asignada, la cuenta no llega automáticamente a la preview.

### Sigue siendo demostrativo

- Las llamadas, citas, oportunidades, gráficas y métricas del dashboard.
- Los resultados e historial mostrados después de una demo.
- Varias acciones que sólo modifican la interfaz.
- Los nombres de agentes, pacientes y negocios utilizados como ejemplo.

Una preview puede abrir una conversación real de Retell cuando existen credenciales, pero no persiste transcripts ni demuestra que se ejecutó una acción externa.

### No está comprobado de extremo a extremo

- Telefonía de un cliente real.
- Calendar, WhatsApp, CRM, GoHighLevel o n8n.
- Procesamiento o consulta directa de pagos en Mercado Pago o un banco.
- Dashboard alimentado por telemetría operacional real.
- Persistencia operacional preparada para producción.

No hay en estos documentos evidencia suficiente para afirmar o negar que existan clientes de pago. Ese dato permanece desconocido hasta registrarlo explícitamente.

## Cómo resolver contradicciones

- **Dirección y estrategia:** manda la instrucción explícita más reciente del fundador y después el registro de decisiones.
- **Estado técnico:** manda una prueba reciente del sistema ejecutado o desplegado, después el código activo y luego la documentación.
- **Mercado:** manda la evidencia actual y fechada; una opinión o claim comercial debe identificarse como tal.

Algunos documentos antiguos del repositorio todavía describen Orbit AI, Gemini o una landing anterior. No deben utilizarse como contexto principal sin verificar el entrypoint y estado actuales.
