# AutiveX Control — Documento de planeación UX/UI

**Estado:** dirección visual y arquitectura de información para prototipo frontend
**Versión:** 0.1
**Objetivo:** definir el carácter, lenguaje visual, tipografía, navegación y secciones del dashboard antes de diseñar pantallas o conectar funcionalidad real.

---

## 1. La idea

### Concepto: Central / Bitácora

AutiveX Control no se presenta como un “dashboard de IA”. Se presenta como la **central operativa del negocio**: el lugar donde las llamadas entran, se enrutan, dejan registro y terminan en una cita, un prospecto o una acción para el equipo.

La interfaz combina dos comportamientos:

- **Central:** muestra qué está ocurriendo, qué está conectado y qué requiere intervención.
- **Bitácora:** conserva el historial de conversaciones, decisiones, citas y resultados.

El producto debe sentirse activo aun cuando no haya una llamada ocurriendo. La actividad se comunica mediante estados, tiempos, rutas y resultados; no mediante partículas, robots ni animaciones futuristas.

### Promesa visual

> Todo está siendo atendido. Todo queda claro.

### Atributos

- Preciso, no frío.
- Técnico, no complicado.
- Premium, no ostentoso.
- Vivo, no inquieto.
- Original, no excéntrico.
- Operativo, no corporativo.

---

## 2. Lectura de las referencias

Las imágenes compartidas no se usarán como layouts para copiar. Funcionan como evidencia de gusto y ayudan a definir el “sabor” deseado.

### Lo que sí se percibe en ellas

1. **Superficies con presencia.** Grandes planos oscuros o marfil, esquinas amplias y contenedores que se sienten como objetos, no como una colección de cards genéricas.
2. **Jerarquía tipográfica fuerte.** Encabezados grandes, texto breve y números con intención editorial.
3. **Densidad controlada.** Los paneles pueden tener mucha información, pero está agrupada con ritmo y aire.
4. **Contraste gráfico.** Negro y blanco dominan; el color aparece como señal, no como decoración continua.
5. **Instrumentación.** Líneas, marcadores, estados, pequeñas gráficas y etiquetas evocan una herramienta de control.
6. **Composición asimétrica.** No todo cae en una cuadrícula predecible de cuatro tarjetas iguales.
7. **Detalles humanos.** Mensajes breves, avatares, notificaciones o asistentes suavizan el carácter técnico.
8. **Un gesto memorable.** Una franja cálida, un mapa, una visualización o una pieza central da identidad a cada pantalla.

### Lo que no debemos trasladar

- Mapas, hexágonos, montañas o visualizaciones que no correspondan con telefonía.
- Interfaces militares, de vigilancia o excesivamente “cyber”.
- Navegación y estructuras propias de los productos mostrados.
- Gradientes arcoíris como recurso permanente.
- Negro absoluto en cada superficie.
- Cards idénticas distribuidas mecánicamente.
- Texto diminuto para aparentar sofisticación.
- Un chat ocupando el centro del producto.

### Interpretación para AutiveX

La pieza gráfica propia será el **pulso de llamadas**: una visualización temporal que conecta volumen, resultado y atención humana. La llamada —no la IA— es el material visual de la marca dentro del dashboard.

---

## 3. Lenguaje visual

### Modo base

El dashboard usará un esquema **oscuro editorial** como experiencia principal. No será negro puro ni tendrá brillo neón. El fondo será carbón cálido; los paneles estarán apenas elevados mediante cambios de tono y bordes finos.

Para configuración extensa, formularios, onboarding y documentos se podrá usar una superficie **papel/marfil**. Esta alternancia no es un “dark mode/light mode”; es una herramienta de jerarquía:

- Operación y monitoreo: oscuro.
- Configuración y lectura prolongada: claro.

Esto produce una identidad más deliberada que aplicar el mismo fondo a todas las pantallas.

### Paleta propuesta

#### Neutros

| Token | Color | Uso |
|---|---|---|
| `ink-950` | `#0B0C0E` | Fondo profundo, navegación |
| `ink-900` | `#121417` | Superficie principal oscura |
| `ink-850` | `#191C20` | Panel elevado |
| `ink-700` | `#30343A` | Bordes fuertes, controles |
| `mist-500` | `#8D939C` | Texto secundario oscuro |
| `paper-100` | `#F2EFEB` | Superficie clara cálida |
| `paper-50` | `#FAF8F5` | Formularios y fondos claros |
| `white` | `#FFFFFF` | Texto de máximo contraste |

#### Señales

| Token | Color | Significado |
|---|---|---|
| `signal-blue` | `#6B7CFF` | Acción primaria, navegación activa |
| `signal-coral` | `#FF664A` | Llamada activa, elemento distintivo |
| `signal-lime` | `#C9F36B` | Éxito, cita confirmada, conexión sana |
| `signal-amber` | `#F4B942` | Advertencia, consumo cercano al límite |
| `signal-red` | `#EF4D61` | Fallo, bloqueo, límite máximo |
| `signal-cyan` | `#8CD5DC` | Información, transferencia, datos auxiliares |

El violeta no será el “color de IA” dominante. Puede aparecer dentro del orb de Ava y en transiciones de marca, pero no cubrirá botones, tarjetas y gráficas simultáneamente.

### Regla de color

En una pantalla normal:

- 80–90% neutros.
- Un color de acción dominante.
- Uno o dos colores semánticos cuando los datos lo necesiten.

El color debe responder siempre una pregunta: ¿está activo?, ¿salió bien?, ¿requiere atención?, ¿qué serie estoy leyendo?

### Geometría

- Radio general de panel: `16px`.
- Controles pequeños: `8–10px`.
- Contenedores principales: `20–24px` cuando deban sentirse como una superficie física.
- Bordes: `1px`, con contraste bajo.
- Sombras: raras; se prefieren tono, borde y solapamiento.
- Separación de página: generosa, entre `24–32px`.
- Espaciado interno: basado en una escala de `4, 8, 12, 16, 24, 32, 48`.

No se usarán bordes redondeados indiscriminadamente. Tablas, líneas de tiempo y paneles de datos pueden tener cortes más rectos para conservar precisión.

---

## 4. Tipografía

### Familia principal: Instrument Sans

**Instrument Sans** será la fuente de interfaz y comunicación. Tiene suficiente carácter editorial para evitar el aspecto de plantilla, conserva excelente legibilidad en tamaños pequeños y maneja bien títulos, números y español.

Usos:

- Navegación.
- Encabezados.
- Tablas.
- Formularios.
- Mensajes de Ava.
- Métricas.

Pesos recomendados: `400`, `500`, `600` y, de forma limitada, `700`.

### Familia técnica: IBM Plex Mono

**IBM Plex Mono** se utilizará con moderación para información que se comporta como registro o instrumento:

- Horas y duraciones.
- Identificadores de llamada.
- Números telefónicos.
- Consumo y unidades.
- Etiquetas de eventos.
- Datos dentro de la línea temporal.

No se empleará en párrafos ni como recurso “futurista”. Su función es separar visualmente el dato operacional del lenguaje humano.

### Escala inicial

| Estilo | Tamaño / línea | Peso | Uso |
|---|---|---|---|
| Display | `40/44` | 600 | Momento editorial u onboarding |
| H1 | `30/36` | 600 | Título de pantalla |
| H2 | `22/28` | 600 | Sección principal |
| H3 | `16/22` | 600 | Panel o grupo |
| Body | `15/22` | 400 | Texto normal |
| Small | `13/18` | 400–500 | Información secundaria |
| Label | `11/16` | 600 | Etiqueta corta, preferentemente no uppercase |
| Metric | `32/36` | 500 | Indicador principal |
| Data Mono | `12/18` | 400–500 | Registro y metadatos |

### Criterios tipográficos

- Sentence case en navegación y botones.
- Mayúsculas sólo en códigos o etiquetas instrumentales muy cortas.
- Números tabulares para métricas y tablas.
- Títulos cortos; el contexto vive en subtítulos.
- No usar más de tres tamaños protagonistas en una misma pantalla.

---

## 5. Arquitectura de información

La navegación se organiza según el trabajo del cliente, no según la arquitectura técnica de AutiveX.

### Navegación principal

#### Hoy

El estado actual del negocio y las acciones importantes.

- Resumen del periodo.
- Pulso de llamadas.
- Resultados.
- Uso del plan.
- Actividad reciente.
- Situaciones que requieren atención.

#### Conversaciones

La bitácora completa de llamadas.

- Todas las llamadas.
- Filtros y búsqueda.
- Llamadas activas.
- Llamadas marcadas para revisión.
- Detalle, transcripción, grabación y eventos.

#### Oportunidades

Personas y resultados comerciales originados por las conversaciones.

- Prospectos.
- Citas.
- Seguimientos pendientes.
- Estados y responsables.

Prospectos y citas vivirán bajo una misma sección durante el MVP. Son dos vistas del mismo flujo, no dos productos separados.

#### Mi recepcionista

La configuración comprensible del servicio.

- Estado general.
- Horarios y días especiales.
- Servicios y preguntas frecuentes.
- Transferencias.
- Mensaje inicial.
- Reglas fuera de horario.
- Solicitudes de cambio.

No se muestran prompts, modelos, temperatura, webhooks ni herramientas internas.

#### Conexiones

Relaciones con sistemas externos.

- Calendario.
- WhatsApp.
- CRM.
- Telefonía.
- Estado y última sincronización.

#### Uso y plan

Capacidad, proyección y costo.

- Minutos incluidos y consumidos.
- Proyección mensual.
- Excedentes.
- Límite máximo.
- Concurrencia.
- Historial.
- Alertas.
- Plan y facturación.

### Navegación secundaria

Ubicada en el perfil o al pie de la navegación:

- Equipo y permisos.
- Preferencias de notificación.
- Privacidad y retención.
- Datos del negocio.
- Cerrar sesión.

### Elementos persistentes

- Selector de organización, sólo si aplica.
- Estado de la recepcionista.
- Indicador compacto de uso cuando supera un umbral.
- Acceso al perfil.
- Ava en la esquina inferior derecha.

---

## 6. Estructura de cada sección

### 6.1 Hoy

La pantalla no será una cuadrícula uniforme de KPI cards.

Composición propuesta:

1. **Encabezado editorial:** saludo, periodo y una frase de resultado.
2. **Pulso:** visualización central del volumen de llamadas y sus resultados a través del tiempo.
3. **Tres cifras clave:** llamadas atendidas, citas y oportunidades recuperadas.
4. **Bitácora reciente:** flujo cronológico de eventos importantes.
5. **Atención:** llamadas problemáticas o acciones pendientes.
6. **Capacidad:** módulo compacto de uso mensual y proyección.

El “pulso” puede convertirse en la firma visual del producto: una línea o banda temporal con marcas de llamadas, agrupadas por resultado y hora. No será una onda de audio decorativa.

### 6.2 Conversaciones

Vista principal:

- Encabezado con total y tendencia.
- Barra de búsqueda y filtros.
- Lista/tablero de conversaciones.
- Panel de detalle lateral en escritorio.
- Página completa de detalle en móvil.

La fila prioriza resultado y motivo, no el identificador técnico.

Detalle:

- Resumen de una frase.
- Resultado.
- Contacto.
- Reproductor.
- Transcripción.
- Línea temporal de acciones.
- Información capturada.
- Evaluación y reporte.

### 6.3 Oportunidades

Dos vistas conmutables:

- **Prospectos:** lista operacional por estado.
- **Agenda:** lista/semana de citas.

El MVP evita un CRM completo. Se muestra lo necesario para saber quién llamó, qué quiere, qué ocurrió y cuál es el siguiente paso.

### 6.4 Mi recepcionista

Esta sección debe sentirse como una ficha de operación, no como un constructor no-code.

Cabecera:

- Nombre asignado a la recepcionista.
- Estado.
- Número.
- Horario actual.
- Última modificación.

Bloques:

- Disponibilidad.
- Servicios que puede atender.
- Transferencia y fallback.
- Información que conoce.
- Mensaje inicial.
- Solicitudes recientes.

Los cambios delicados se convierten en una solicitud revisable por AutiveX.

### 6.5 Conexiones

No usar una pared de logotipos. Cada conexión debe mostrar su función dentro del flujo:

> Google Calendar
> Consulta disponibilidad y crea citas.
> Conectado · sincronizado hace 4 min

Estados: conectado, requiere atención, desconectado y disponible próximamente.

### 6.6 Uso y plan

La visualización principal será una **reserva de capacidad**, no un velocímetro.

- Minutos usados / incluidos.
- Proyección al cierre.
- Días restantes.
- Excedente potencial.
- Límite máximo.
- Consumo por día.
- Historial por periodo.

El sistema distingue visualmente entre “superaste lo incluido, pero estás cubierto” y “tu servicio está en riesgo de interrupción”. Sólo el segundo estado usa rojo.

---

## 7. Ava: soporte contextual

### Rol

Ava es la capa humana del producto y el acceso principal al soporte. No ocupa una sección de navegación ni intenta reemplazar la interfaz.

Funciones futuras:

- Explicar datos visibles.
- Llevar al usuario a una sección.
- Ayudar a formular una solicitud de cambio.
- Recopilar contexto para soporte humano.
- Mostrar alertas relevantes.

### Presencia visual

- Orb de `48px` en escritorio y `44px` en móvil.
- Posición inferior derecha.
- Panel de `400–420px` en escritorio.
- Vista completa en móvil.
- Pulso sólo cuando haya información nueva o una acción activa.
- Color contenido dentro del orb; el panel conserva los neutros del sistema.

### Estados

- Disponible: azul suave.
- Procesando: transición azul–violeta.
- Resuelto: lima.
- Requiere confirmación: ámbar.
- Soporte humano requerido: coral.
- Sin conexión: gris.

### Voz y tono

Ava habla de forma breve, concreta y servicial. No exagera empatía ni finge emociones.

Correcto:

> Encontré tres llamadas marcadas para revisión. Dos terminaron durante una transferencia.

Incorrecto:

> ¡Hola! Soy Ava, tu increíble asistente impulsada por inteligencia artificial. ¿Cómo puedo revolucionar tu día?

### Relación con la recepcionista

Para evitar confusión:

- **Ava** es la asistente de AutiveX dentro del dashboard.
- La recepcionista telefónica tiene el nombre elegido por el negocio.

---

## 8. Componentes distintivos

El sistema necesita componentes propios que eviten el aspecto de plantilla.

### Pulso de llamadas

Una banda temporal donde cada llamada es una marca. Color, altura o símbolo comunican resultado, duración y necesidad de revisión.

### Tira de estado

Un renglón compacto que conecta recepcionista, número, horario, integraciones y capacidad. Se comporta como instrumentación de la central.

### Bitácora

Lista cronológica con tiempo monoespaciado, acción principal y contexto humano.

### Reserva de capacidad

Barra segmentada que muestra incluidos, excedentes permitidos y límite máximo. Es más informativa que un porcentaje circular.

### Ficha de conversación

Combina resumen, resultado y línea temporal. Evita presentar la transcripción como un bloque interminable de chat.

### Solicitud de cambio

Documento breve con cambio, impacto, estado, responsable y fecha. Hace visible el servicio administrado de AutiveX.

---

## 9. Principios de composición

1. **Una pieza dominante por pantalla.** El resto explica o permite actuar sobre ella.
2. **No más de tres KPI al primer nivel.** Los demás datos viven en contexto.
3. **Agrupar por decisión.** Si dos datos llevan a la misma acción, deben estar cerca.
4. **Asimetría útil.** Las proporciones reflejan importancia, no variedad visual arbitraria.
5. **Color como señal.** Nunca para rellenar espacio.
6. **Controles al aparecer la intención.** Las acciones secundarias pueden mostrarse al seleccionar o abrir detalle.
7. **Detalles operativos monoespaciados.** El contenido humano permanece en Instrument Sans.
8. **Vacío con propósito.** El espacio libre organiza y da autoridad; no debe llenarse por miedo.

---

## 10. Estados que deben diseñarse

Cada sección se diseñará al menos en estos estados:

- Con datos normales.
- Primera vez / sin datos.
- Cargando.
- Error recuperable.
- Sin permiso.
- Búsqueda sin resultados.
- Recepcionista fuera de horario.
- Integración desconectada.
- Cerca del límite mensual.
- Límite máximo alcanzado.
- Vista móvil.

Un prototipo que sólo representa el “happy path” no se considera terminado.

---

## 11. Responsive

### Escritorio

- Navegación lateral compacta.
- Contenido con ancho flexible y máximo legible.
- Panel de detalle lateral en conversaciones.
- Ava como ventana flotante.

### Tablet

- Navegación colapsable.
- Módulos principales apilados en dos columnas.
- Detalles en overlay.

### Móvil

- Navegación inferior para Hoy, Conversaciones y Oportunidades.
- Menú secundario para administración.
- Listas convertidas en filas/tarjetas compactas.
- Filtros en hoja inferior.
- Ava en pantalla completa.
- Acciones principales fijas sólo cuando sean necesarias.

---

## 12. Alcance del primer prototipo

### Se construye

- Login simulado.
- Shell responsive.
- Hoy.
- Conversaciones y detalle.
- Oportunidades: prospectos y citas.
- Mi recepcionista.
- Conexiones.
- Uso y plan.
- Equipo y preferencias básicas.
- Ava simulada y contextual.
- Datos ficticios consistentes.
- Estados vacíos, carga, error y límites.

### No se construye todavía

- Autenticación real.
- Persistencia.
- Retell o telefonía real.
- Supabase.
- Pagos.
- WhatsApp real.
- Calendarios reales.
- Modificación de prompts.
- Automatizaciones.
- IA detrás de Ava.

---

## 13. Criterios para evitar una apariencia “AI generated”

- No usar el patrón repetitivo “título + cuatro KPI cards + gráfica + tabla” en todas las páginas.
- No utilizar gradientes morados como identidad completa.
- No añadir íconos a cada etiqueta.
- No escribir titulares promocionales dentro de herramientas operativas.
- No inventar métricas sólo para llenar tarjetas.
- No usar ilustraciones 3D genéricas, robots ni estrellas de IA.
- No redondear cada elemento hasta convertirlo en una cápsula.
- No esconder una jerarquía débil detrás de glassmorphism.
- No usar datos aleatorios sin una historia coherente entre llamadas, prospectos, citas y consumo.
- Diseñar primero los flujos y decisiones; decorar después.

La originalidad provendrá de la relación entre llamadas, pulso, bitácora, capacidad y soporte administrado; no de aplicar efectos visuales inusuales.

---

## 14. Decisiones pendientes antes del diseño de alta fidelidad

1. Confirmar Instrument Sans + IBM Plex Mono con pruebas reales de números, tablas y español.
2. Probar el dashboard oscuro en operación prolongada y el contraste WCAG.
3. Definir el nombre que recibirá la recepcionista de la organización demo.
4. Elegir qué tres resultados encabezarán “Hoy” para el primer vertical.
5. Definir el vertical y datos del negocio demo; recomendado: clínica dental.
6. Decidir si “valor recuperado” será una estimación visible o una función posterior.
7. Validar si Prospectos y Citas permanecen unidos bajo “Oportunidades” después de pruebas con usuarios.
8. Definir el comportamiento exacto al alcanzar el límite mensual.

---

## 15. Próximo entregable recomendado

Antes de programar todo el dashboard:

1. Crear un **moodboard destilado** con color, tipografía, densidad, estados y geometría; sin pantallas de terceros completas.
2. Diseñar tres exploraciones de la pantalla **Hoy** usando la misma arquitectura pero distinta composición.
3. Elegir una dirección.
4. Diseñar Conversaciones, Uso y Ava con esa dirección.
5. Validar el sistema con una vista móvil.
6. Sólo entonces construir el prototipo frontend completo.

Las primeras tres pantallas que deben demostrar la identidad son:

- Hoy: la central.
- Conversación: la bitácora.
- Uso y plan: la capacidad.

Si esas tres se sienten propias, el resto del producto podrá crecer de manera coherente.
