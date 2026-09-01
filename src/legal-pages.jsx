import React, { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Mail,
  ShieldCheck,
} from 'lucide-react';

const CONTACT_EMAIL = 'contact@autivexai.com';
const EFFECTIVE_DATE = '1 de septiembre de 2026';

const PRIVACY_SECTIONS = [
  ['responsable', 'Responsable y alcance'],
  ['roles', 'Nuestro papel'],
  ['datos', 'Datos que tratamos'],
  ['finalidades', 'Para qué los usamos'],
  ['google-workspace', 'Google Workspace'],
  ['proveedores', 'Proveedores y transferencias'],
  ['retencion', 'Retención y eliminación'],
  ['seguridad', 'Seguridad'],
  ['derechos', 'Tus derechos y controles'],
  ['menores', 'Menores y datos sensibles'],
  ['cambios', 'Cambios y contacto'],
];

const TERMS_SECTIONS = [
  ['aceptacion', 'Aceptación y elegibilidad'],
  ['servicio', 'El Servicio'],
  ['cuenta', 'Cuenta y seguridad'],
  ['cliente', 'Responsabilidades del Cliente'],
  ['ia', 'Sistemas de inteligencia artificial'],
  ['integraciones', 'Integraciones de terceros'],
  ['uso-aceptable', 'Uso aceptable'],
  ['datos', 'Datos y confidencialidad'],
  ['pagos', 'Planes, pagos y cambios'],
  ['propiedad', 'Propiedad intelectual'],
  ['disponibilidad', 'Disponibilidad y soporte'],
  ['terminacion', 'Suspensión y terminación'],
  ['garantias', 'Garantías y responsabilidad'],
  ['indemnizacion', 'Indemnización'],
  ['ley', 'Ley aplicable y disposiciones generales'],
  ['contacto', 'Contacto'],
];

function LegalBrand() {
  return (
    <a className="brand brand-on-dark" href="/" aria-label="AutiveX, volver al inicio">
      <span className="brand-symbol" aria-hidden="true">
        <img src="/autivex-ribbon.png" alt="" />
      </span>
      <strong>AutiveX</strong>
    </a>
  );
}

function LegalSection({ id, number, title, children }) {
  return (
    <section className="legal-section" id={id}>
      <div className="legal-section-heading">
        <span>{String(number).padStart(2, '0')}</span>
        <h2>{title}</h2>
      </div>
      <div className="legal-section-body">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <div className="legal-summary-grid" aria-label="Compromisos principales de privacidad">
        <article><strong>Datos mínimos</strong><span>Solicitamos únicamente lo necesario para atender llamadas, operar cuentas y gestionar citas.</span></article>
        <article><strong>Sin venta de datos</strong><span>No vendemos datos personales ni datos obtenidos de Google Workspace.</span></article>
        <article><strong>Control del usuario</strong><span>Puedes revocar Google, solicitar eliminación y ejercer derechos ARCO.</span></article>
      </div>

      <LegalSection id="responsable" number={1} title="Responsable y alcance">
        <p>AutiveX AI ("AutiveX", "nosotros" o "nuestro"), servicio digital con operaciones en México, es responsable del tratamiento descrito en este Aviso respecto de visitantes, prospectos, usuarios de cuenta y administradores de una Location. El domicilio contractual del responsable es el indicado en la orden de servicio aplicable. El canal central para privacidad y derechos de datos es <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
        <p>Este Aviso aplica a <a href="https://autivexai.com">autivexai.com</a>, al dashboard de AutiveX, a nuestras demostraciones, integraciones y servicios de recepción de voz. No sustituye los avisos que cada negocio cliente debe proporcionar a sus propios clientes, empleados o personas que llaman.</p>
      </LegalSection>

      <LegalSection id="roles" number={2} title="Nuestro papel frente a cada tipo de dato">
        <p>AutiveX actúa como responsable de los datos necesarios para administrar cuentas, seguridad, facturación, soporte, relación comercial y cumplimiento propio.</p>
        <p>Cuando un negocio usa AutiveX para atender a sus clientes, ese negocio determina la finalidad de la llamada y normalmente actúa como responsable de los datos de la persona que llama; AutiveX los trata por cuenta del negocio como encargado o proveedor de servicios, conforme a sus instrucciones, la orden de servicio y, cuando corresponda, un acuerdo de tratamiento de datos.</p>
        <p>Si recibiste una llamada de un agente de AutiveX, también puedes dirigir tu solicitud al negocio al que llamaste. Colaboraremos con ese negocio para atender solicitudes válidas.</p>
      </LegalSection>

      <LegalSection id="datos" number={3} title="Datos personales que tratamos">
        <h3>Datos de cuenta y del negocio</h3>
        <ul>
          <li>Nombre, correo, teléfono, organización, rol, credenciales de sesión y asignaciones de acceso.</li>
          <li>Información operativa de la Location: horarios, servicios, precios, instrucciones, números telefónicos, rutas de transferencia y configuración del agente.</li>
          <li>Solicitudes de soporte, preferencias, historial administrativo, evidencia de consentimiento y registros de auditoría.</li>
        </ul>

        <h3>Datos de llamadas y citas</h3>
        <ul>
          <li>Número telefónico, fecha, hora, duración, identificadores técnicos y estado de la llamada.</li>
          <li>Audio, transcripción, resumen, intención, resultado y datos que la persona decida comunicar, según la configuración y aviso del negocio cliente.</li>
          <li>Nombre, correo, motivo, horario solicitado, identificador del evento y demás datos necesarios para crear, cambiar o cancelar una cita.</li>
        </ul>

        <h3>Datos técnicos</h3>
        <ul>
          <li>Dirección IP, navegador, dispositivo, registros de seguridad, solicitudes API, errores y eventos de autenticación.</li>
          <li>Cookies y almacenamiento estrictamente necesarios para sesión, seguridad y el flujo OAuth. Actualmente no usamos datos de Google para publicidad ni para seguimiento publicitario.</li>
        </ul>

        <h3>Demostración pública</h3>
        <p>La demostración solicita acceso al micrófono y procesa la conversación para mostrar el producto. Está diseñada para datos ficticios: no debes proporcionar nombres, teléfonos, datos de salud ni información real de terceros durante una demo.</p>
      </LegalSection>

      <LegalSection id="finalidades" number={4} title="Finalidades del tratamiento">
        <p>Usamos los datos para:</p>
        <ul>
          <li>crear y proteger cuentas, autenticar usuarios y aislar la información de cada Location;</li>
          <li>recibir llamadas, entender solicitudes, seguir instrucciones aprobadas y transferir o registrar el siguiente paso;</li>
          <li>consultar disponibilidad y crear, modificar o cancelar citas autorizadas;</li>
          <li>mostrar actividad, resultados, notificaciones y registros operativos al negocio correspondiente;</li>
          <li>prevenir fraude, abuso y accesos no autorizados; investigar incidentes y mantener la disponibilidad;</li>
          <li>dar soporte, ejecutar contratos, administrar cobros y cumplir obligaciones legales;</li>
          <li>mejorar el Servicio mediante métricas agregadas o disociadas que no identifiquen a una persona.</li>
        </ul>
        <p>No usamos el contenido de Google Workspace para anuncios, perfiles publicitarios, determinación crediticia ni para entrenar modelos generales de inteligencia artificial.</p>
      </LegalSection>

      <LegalSection id="google-workspace" number={5} title="Uso de datos de Google Workspace">
        <div className="legal-callout">
          <ShieldCheck size={24} aria-hidden="true" />
          <p>El uso de información recibida de las APIs de Google Workspace cumple la <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Política de Datos de Usuario de Google API Services</a>, incluidos sus requisitos de Uso Limitado.</p>
        </div>
        <p>Cuando un administrador elige "Conectar cuenta de Google", AutiveX solicita únicamente:</p>
        <ul>
          <li><code>calendar.calendarlist.readonly</code>, para mostrar la lista, nombre, zona horaria, identificador y nivel de acceso de los calendarios disponibles;</li>
          <li><code>calendar.events</code>, para consultar horarios ocupados y crear, leer, modificar o cancelar eventos en el calendario seleccionado.</li>
        </ul>
        <p>AutiveX no recibe ni almacena tu contraseña de Google. Guardamos el identificador del calendario elegido, la etiqueta de la cuenta, los permisos concedidos y credenciales OAuth cifradas. La información de eventos existentes se consulta cuando hace falta para disponibilidad y no se convierte en una copia permanente del calendario. Conservamos metadatos de las citas gestionadas por el agente para presentarlas en el dashboard y mantener consistencia operativa.</p>
        <p>El acceso se usa exclusivamente para la función de agenda que el administrador activa. No vendemos estos datos; no los transferimos a redes publicitarias o corredores de datos; no los usamos para vigilancia, crédito o publicidad; y no permitimos acceso humano salvo con autorización específica para soporte, por seguridad o por obligación legal.</p>
        <p>Los proveedores que procesen estos datos por cuenta de AutiveX sólo pueden hacerlo para prestar o proteger esta función y bajo obligaciones de confidencialidad y seguridad.</p>
      </LegalSection>

      <LegalSection id="proveedores" number={6} title="Proveedores, divulgaciones y transferencias">
        <p>Podemos compartir datos limitados con proveedores que nos ayudan a operar el Servicio:</p>
        <ul>
          <li><strong>Clerk</strong>, para autenticación, sesiones, organizaciones y control de acceso.</li>
          <li><strong>Supabase y proveedores de infraestructura de base de datos</strong>, para almacenamiento operativo aislado por Location.</li>
          <li><strong>Retell AI</strong>, para transportar y procesar conversaciones de voz y ejecutar herramientas durante una llamada.</li>
          <li><strong>Vercel</strong>, para alojamiento, entrega y ejecución de la aplicación.</li>
          <li><strong>Google</strong>, cuando el usuario conecta Google Calendar y solicita una acción.</li>
          <li><strong>Proveedores de automatización, telefonía, correo o soporte</strong>, únicamente cuando estén configurados para una Location y sean necesarios para el servicio contratado.</li>
        </ul>
        <p>También podremos divulgar información cuando sea razonablemente necesario para cumplir la ley, responder a una autoridad competente, proteger derechos o seguridad, investigar abuso, o ejecutar una operación corporativa legítima con las salvaguardas correspondientes.</p>
        <p>Algunos proveedores procesan información fuera de México. Aplicamos medidas contractuales y técnicas razonables para que las transferencias se limiten a las finalidades informadas. No vendemos ni rentamos datos personales.</p>
      </LegalSection>

      <LegalSection id="retencion" number={7} title="Retención, desconexión y eliminación">
        <p>Conservamos datos sólo durante el periodo razonablemente necesario para las finalidades descritas, la relación contractual, seguridad, resolución de controversias y obligaciones legales. En particular:</p>
        <ul>
          <li>el estado temporal de OAuth expira aproximadamente diez minutos después de iniciar una conexión;</li>
          <li>las credenciales de Google permanecen cifradas mientras la integración siga activa y se eliminan o inutilizan al procesar una desconexión, revocación o solicitud válida, sujeto a respaldos y conservación legal;</li>
          <li>la configuración estándar de los agentes nuevos limita a 30 días la retención de contenido de llamada en Retell;</li>
          <li>los metadatos de cuenta, llamadas, citas, resúmenes y auditoría pueden conservarse durante la vigencia del servicio y después durante el plazo necesario para continuidad, soporte, defensa y cumplimiento;</li>
          <li>las copias de respaldo se eliminan mediante ciclos programados o quedan bloqueadas hasta su sobrescritura.</li>
        </ul>
        <p>Cuando una solicitud de eliminación sea procedente, eliminaremos, anonimizaremos o bloquearemos la información en los sistemas activos. Cierta información podrá conservarse cuando exista una obligación legal, reclamación pendiente, necesidad antifraude o excepción aplicable.</p>
      </LegalSection>

      <LegalSection id="seguridad" number={8} title="Cómo protegemos la información">
        <p>Usamos medidas administrativas, técnicas y organizativas proporcionales al riesgo, entre ellas HTTPS, credenciales de servidor separadas del navegador, aislamiento por organización, control de acceso basado en roles, verificación de firmas para webhooks, registro de operaciones y cifrado autenticado de credenciales OAuth.</p>
        <p>Ningún sistema es completamente infalible. Si identificamos un incidente que afecte significativamente datos personales, actuaremos para contenerlo, documentarlo y notificar a las personas o autoridades cuando la ley lo requiera.</p>
      </LegalSection>

      <LegalSection id="derechos" number={9} title="Tus derechos y controles">
        <p>Puedes solicitar acceso, rectificación, cancelación o formular oposición (derechos ARCO), retirar un consentimiento cuando corresponda, limitar determinados usos y solicitar información sobre el tratamiento.</p>
        <p>Envía tu solicitud a <a href={`mailto:${CONTACT_EMAIL}?subject=Solicitud%20de%20privacidad`}>{CONTACT_EMAIL}</a> con: nombre, medio para recibir respuesta, relación con AutiveX o la Location, derecho que deseas ejercer, descripción de los datos y documentos razonables para acreditar identidad o representación. No envíes identificaciones completas hasta que te indiquemos un canal seguro.</p>
        <p>Conforme a la legislación mexicana aplicable, comunicaremos la determinación normalmente dentro de un máximo de 20 días y, si procede, la haremos efectiva dentro de los 15 días siguientes; estos plazos pueden ampliarse cuando la ley lo permita.</p>
        <p>Puedes revocar el acceso de AutiveX desde <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Permisos de tu Cuenta de Google <ExternalLink size={15} /></a>. Revocar detiene nuevas llamadas a la API, pero no elimina automáticamente registros que debamos conservar; puedes pedir su eliminación por correo.</p>
      </LegalSection>

      <LegalSection id="menores" number={10} title="Menores, emergencias y datos sensibles">
        <p>El Servicio empresarial no está dirigido a menores de edad. Los negocios no deben configurar AutiveX para recopilar deliberadamente datos de menores o datos personales sensibles sin una base jurídica, avisos, consentimientos y salvaguardas adecuados.</p>
        <p>AutiveX no es un servicio de emergencias ni sustituye atención médica, legal, financiera o profesional. Si una llamada puede implicar riesgo inmediato, debe dirigirse a los servicios de emergencia o a personal humano competente.</p>
      </LegalSection>

      <LegalSection id="cambios" number={11} title="Cambios al Aviso y contacto">
        <p>Podemos actualizar este Aviso para reflejar cambios legales, técnicos o del Servicio. Publicaremos la nueva fecha y, cuando el cambio sea material, daremos un aviso adicional o solicitaremos consentimiento si corresponde. No ampliaremos el uso de datos de Google a una finalidad nueva sin la transparencia y autorización exigidas.</p>
        <p>Para privacidad, derechos ARCO o dudas sobre datos:</p>
        <a className="legal-contact-card" href={`mailto:${CONTACT_EMAIL}`}>
          <Mail size={22} />
          <span><strong>{CONTACT_EMAIL}</strong><small>Asunto sugerido: Solicitud de privacidad</small></span>
          <ArrowUpRight size={19} />
        </a>
      </LegalSection>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <div className="legal-summary-grid" aria-label="Resumen de condiciones">
        <article><strong>Servicio empresarial</strong><span>AutiveX automatiza recepción, seguimiento y agenda bajo reglas del Cliente.</span></article>
        <article><strong>Supervisión necesaria</strong><span>La IA puede equivocarse; el Cliente conserva control y responsabilidad operativa.</span></article>
        <article><strong>Uso responsable</strong><span>No emergencias, fraude, llamadas ilícitas ni decisiones profesionales automatizadas.</span></article>
      </div>

      <LegalSection id="aceptacion" number={1} title="Aceptación, partes y elegibilidad">
        <p>Estas Condiciones del Servicio ("Condiciones") regulan el acceso y uso de los sitios, dashboard, agentes de voz, integraciones, APIs y servicios relacionados de AutiveX AI (el "Servicio"). Al crear una cuenta, aceptar una orden de servicio o usar el Servicio, tú y la entidad que representas (el "Cliente") aceptan estas Condiciones.</p>
        <p>Debes tener al menos 18 años y capacidad para contratar. Si actúas en nombre de una empresa, declaras que tienes facultades para obligarla. Si no aceptas estas Condiciones, no uses el Servicio.</p>
        <p>Una orden de servicio, propuesta, anexo de tratamiento de datos o acuerdo escrito firmado por ambas partes puede establecer condiciones adicionales. En caso de conflicto, prevalecerá el documento más específico respecto de su objeto.</p>
      </LegalSection>

      <LegalSection id="servicio" number={2} title="Descripción y alcance del Servicio">
        <p>AutiveX proporciona herramientas para que negocios configuren agentes de voz, reciban o gestionen llamadas, registren resultados, transfieran conversaciones, consulten disponibilidad y administren citas. Las funciones, números, volumen, integraciones, soporte y niveles de servicio dependen del plan u orden contratada.</p>
        <p>Los pilotos, demos, previews y funciones beta pueden tener límites adicionales, datos de ejemplo, disponibilidad reducida y cambios frecuentes. La demostración pública no debe usarse con información real.</p>
        <p>AutiveX no es operador de servicios de emergencia, centro médico, despacho jurídico, institución financiera ni sustituto de personal profesional. El Servicio no debe configurarse para tomar decisiones finales que produzcan efectos legales o de alto impacto sin revisión humana adecuada.</p>
      </LegalSection>

      <LegalSection id="cuenta" number={3} title="Cuenta, organizaciones y seguridad">
        <p>El Cliente debe proporcionar información correcta, mantener actualizados sus contactos y proteger credenciales, sesiones, dispositivos y métodos de acceso. Cada cuenta es personal; no debe compartirse. El Cliente es responsable de asignar y retirar oportunamente roles dentro de su organización.</p>
        <p>Debes notificarnos de inmediato si sospechas acceso no autorizado. Podemos aplicar autenticación, límites, verificaciones y bloqueos razonables para proteger el Servicio. El Cliente responde por las acciones realizadas desde sus cuentas, salvo que deriven directamente de una vulneración atribuible a AutiveX.</p>
      </LegalSection>

      <LegalSection id="cliente" number={4} title="Responsabilidades del Cliente">
        <p>El Cliente determina las instrucciones, finalidades y mensajes del agente. Debe:</p>
        <ul>
          <li>contar con derechos, avisos y consentimientos necesarios para proporcionar datos, contactar personas, grabar o transcribir llamadas y usar integraciones;</li>
          <li>informar de forma clara cuando una persona interactúa con un sistema automatizado y cuando una llamada puede ser grabada o transcrita;</li>
          <li>mantener horarios, servicios, precios, políticas, rutas de transferencia y disponibilidad correctos;</li>
          <li>revisar el funcionamiento antes de activarlo y supervisar regularmente conversaciones, citas y excepciones;</li>
          <li>ofrecer una vía humana cuando el contexto, la ley o el riesgo lo exijan;</li>
          <li>cumplir leyes de privacidad, telecomunicaciones, consumo, marketing, salud, no discriminación y cualquier norma sectorial aplicable.</li>
        </ul>
        <p>El Cliente es responsable de responder frente a sus propios usuarios y personas que llaman por la legalidad de sus instrucciones y su uso del Servicio.</p>
      </LegalSection>

      <LegalSection id="ia" number={5} title="Naturaleza y límites de la inteligencia artificial">
        <p>Las respuestas de voz y análisis se generan con modelos probabilísticos. Pueden contener errores, malinterpretar lenguaje, omitir contexto o no ejecutar una acción. El Cliente no debe presentar una respuesta de IA como garantía, diagnóstico o decisión profesional.</p>
        <p>AutiveX diseña controles para reducir errores —como instrucciones, herramientas con parámetros, rutas de transferencia y pruebas—, pero no garantiza exactitud perfecta, ausencia de interrupciones ni que toda llamada produzca el resultado esperado. El Cliente debe validar configuraciones y mantener procesos de respaldo.</p>
      </LegalSection>

      <LegalSection id="integraciones" number={6} title="Google Calendar y otras integraciones">
        <p>Las integraciones son opcionales y requieren autorización del Cliente. Al conectar una cuenta, el Cliente instruye a AutiveX para acceder a los datos y ejecutar las acciones visibles en el producto dentro de los permisos concedidos.</p>
        <p>Para Google Calendar, AutiveX muestra calendarios disponibles y usa el calendario que un administrador selecciona para consultar disponibilidad y crear, cambiar o cancelar citas. El Cliente puede revocar el acceso desde Google. Nuestro tratamiento se describe en el <a href="/privacy#google-workspace">Aviso de Privacidad</a>.</p>
        <p>Google, Retell, Clerk, proveedores de telefonía y otros servicios de terceros se rigen por sus propias condiciones. AutiveX no controla sus cambios, suspensiones o fallas, pero procurará configurar integraciones de forma razonable y comunicar incidencias materiales.</p>
      </LegalSection>

      <LegalSection id="uso-aceptable" number={7} title="Uso aceptable y actividades prohibidas">
        <p>No puedes usar el Servicio para:</p>
        <ul>
          <li>violar leyes, derechos, sanciones, órdenes judiciales o condiciones de terceros;</li>
          <li>realizar fraude, suplantación, engaño, acoso, amenazas, discriminación o manipulación abusiva;</li>
          <li>hacer spam, llamadas automatizadas o campañas sin la autorización y consentimiento exigidos;</li>
          <li>capturar credenciales, datos financieros completos, secretos, datos de menores o categorías sensibles sin autorización y controles adecuados;</li>
          <li>operar emergencias o sustituir decisiones médicas, jurídicas, crediticias, laborales o de seguridad;</li>
          <li>interferir con el Servicio, eludir límites, probar vulnerabilidades sin permiso, introducir malware o acceder a otra Location;</li>
          <li>copiar, revender, descompilar o usar el Servicio para construir un producto competidor, salvo autorización escrita o derecho inderogable.</li>
        </ul>
      </LegalSection>

      <LegalSection id="datos" number={8} title="Datos del Cliente, privacidad y confidencialidad">
        <p>Entre las partes, el Cliente conserva sus derechos sobre la información, instrucciones y contenido que proporciona ("Datos del Cliente"). El Cliente otorga a AutiveX una autorización limitada, no exclusiva y durante la vigencia necesaria para alojar, transmitir, transformar y usar los Datos del Cliente sólo para prestar, proteger y dar soporte al Servicio.</p>
        <p>AutiveX tratará datos personales conforme al <a href="/privacy">Aviso de Privacidad</a>, la orden de servicio y cualquier acuerdo de tratamiento aplicable. No adquiere propiedad sobre los datos de Google del usuario y no los vende.</p>
        <p>Cada parte protegerá la información confidencial de la otra con medidas razonables y la usará sólo para la relación comercial. Esta obligación no cubre información pública sin incumplimiento, obtenida legítimamente de un tercero, desarrollada de forma independiente o cuya divulgación sea legalmente obligatoria.</p>
      </LegalSection>

      <LegalSection id="pagos" number={9} title="Planes, pagos, impuestos y cambios">
        <p>Los precios, moneda, volumen incluido, cargos variables, impuestos, fechas de pago, renovación y cancelación se indican en la orden de servicio o checkout aplicable. Salvo que se indique lo contrario, los importes devengados no son reembolsables y los impuestos corresponden al Cliente.</p>
        <p>Podemos ajustar precios o límites para periodos futuros con aviso previo razonable. Si un pago está vencido, podremos limitar o suspender el Servicio después del aviso correspondiente, salvo que la ley o el contrato dispongan otra cosa.</p>
      </LegalSection>

      <LegalSection id="propiedad" number={10} title="Propiedad intelectual y comentarios">
        <p>AutiveX y sus licenciantes conservan los derechos sobre el Servicio, software, interfaces, diseños, flujos, documentación, marcas y mejoras. Estas Condiciones conceden únicamente un derecho limitado, revocable, no transferible y no sublicenciable para usar el Servicio durante la relación aplicable.</p>
        <p>Si proporcionas sugerencias, podremos utilizarlas sin obligación de pago, siempre que no revelemos tus Datos del Cliente ni información confidencial.</p>
      </LegalSection>

      <LegalSection id="disponibilidad" number={11} title="Disponibilidad, mantenimiento y soporte">
        <p>Procuramos una operación confiable, pero el Servicio depende de internet, telefonía, proveedores de IA y APIs externas. Puede haber mantenimiento, latencia, límites, degradaciones o interrupciones. Los compromisos específicos de disponibilidad o soporte sólo aplican si constan en una orden o acuerdo de nivel de servicio.</p>
        <p>Podemos modificar funciones para mejorar seguridad, cumplimiento o desempeño. No eliminaremos materialmente una función pagada durante un periodo contratado sin ofrecer una solución razonable, salvo que sea necesario por ley, seguridad o la terminación de un proveedor esencial.</p>
      </LegalSection>

      <LegalSection id="terminacion" number={12} title="Suspensión, terminación y efectos">
        <p>El Cliente puede dejar de usar el Servicio y terminar conforme a su orden de servicio. AutiveX puede suspender acceso cuando exista riesgo de seguridad, uso ilegal, incumplimiento material, falta de pago o amenaza para terceros o la plataforma. Cuando sea razonable, daremos aviso y oportunidad de corregir.</p>
        <p>Al terminar, cesa el derecho de uso y las integraciones podrán desconectarse. La eliminación, devolución o conservación de datos se rige por el Aviso de Privacidad, la orden de servicio y la ley. Las cláusulas que por su naturaleza deban continuar —pagos devengados, propiedad, confidencialidad, responsabilidad y controversias— permanecerán vigentes.</p>
      </LegalSection>

      <LegalSection id="garantias" number={13} title="Garantías, exclusiones y limitación de responsabilidad">
        <p>El Servicio se proporciona con cuidado comercial razonable y conforme al alcance contratado. Excepto por garantías expresas escritas y aquellas que no puedan excluirse por ley, se ofrece "tal cual" y "según disponibilidad".</p>
        <p>En la máxima medida permitida, ninguna parte responderá por daños indirectos, especiales, punitivos, pérdida de oportunidades, reputación o beneficios que no fueran previsibles razonablemente. La responsabilidad total de AutiveX derivada del Servicio no excederá las cantidades efectivamente pagadas por el Cliente a AutiveX durante los tres meses anteriores al hecho que originó la reclamación.</p>
        <p>Estas limitaciones no aplican a fraude, dolo, violación de confidencialidad, infracción de propiedad intelectual, obligaciones de indemnización ni responsabilidades que la ley prohíba limitar. Nada en estas Condiciones reduce derechos irrenunciables de consumidores cuando resulten aplicables.</p>
      </LegalSection>

      <LegalSection id="indemnizacion" number={14} title="Indemnización">
        <p>En la medida permitida por la ley, el Cliente defenderá e indemnizará a AutiveX frente a reclamaciones de terceros derivadas de Datos del Cliente, instrucciones ilegales, falta de avisos o consentimientos, incumplimiento de estas Condiciones o uso del Servicio contrario a derecho. AutiveX notificará razonablemente la reclamación y permitirá al Cliente dirigir la defensa, sin aceptar acuerdos que impongan obligaciones a AutiveX sin consentimiento.</p>
      </LegalSection>

      <LegalSection id="ley" number={15} title="Ley aplicable y disposiciones generales">
        <p>Estas Condiciones se rigen por las leyes federales aplicables de México, sin perjuicio de normas imperativas que correspondan. La jurisdicción o mecanismo de solución se determinará conforme a la orden de servicio y, en su ausencia, por los tribunales competentes conforme a la ley aplicable.</p>
        <p>Antes de iniciar una controversia, las partes intentarán resolverla de buena fe durante al menos 30 días después de un aviso escrito, salvo medidas urgentes. Si una disposición es inválida, se aplicará en la máxima medida posible y el resto continuará vigente. La falta de ejercicio de un derecho no implica renuncia.</p>
        <p>El Cliente no podrá ceder estas Condiciones sin consentimiento de AutiveX, salvo como parte de una reorganización o venta sustancial de activos y siempre que el cesionario asuma las obligaciones. AutiveX podrá cederlas como parte de una reorganización, financiamiento o transacción corporativa, sujeto a las protecciones de datos aplicables.</p>
      </LegalSection>

      <LegalSection id="contacto" number={16} title="Cambios, avisos y contacto">
        <p>Podemos actualizar estas Condiciones para reflejar cambios del Servicio, legales o de seguridad. Indicaremos la fecha de actualización y notificaremos cambios materiales antes de que produzcan efectos cuando resulte razonable. El uso continuado después de la fecha efectiva constituye aceptación, salvo que la ley exija otra forma.</p>
        <p>Los avisos a AutiveX deben enviarse a:</p>
        <a className="legal-contact-card" href={`mailto:${CONTACT_EMAIL}`}>
          <Mail size={22} />
          <span><strong>{CONTACT_EMAIL}</strong><small>Asunto sugerido: Aviso legal o soporte contractual</small></span>
          <ArrowUpRight size={19} />
        </a>
      </LegalSection>
    </>
  );
}

export function LegalDocumentPage({ type }) {
  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? 'Aviso de Privacidad' : 'Condiciones del Servicio';
  const description = isPrivacy
    ? 'Cómo AutiveX accede, usa, protege, conserva y elimina datos personales, incluidos los obtenidos mediante Google Workspace.'
    : 'Las reglas para usar AutiveX de forma segura, responsable y conforme al alcance contratado.';
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  useEffect(() => {
    document.title = `${title} · AutiveX`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', description);
  }, [description, title]);

  return (
    <div className="legal-shell">
      <a className="skip-link" href="#legal-content">Saltar al documento</a>
      <header className="legal-header">
        <div className="legal-header-inner">
          <LegalBrand />
          <nav aria-label="Documentos legales">
            <a className={isPrivacy ? 'is-current' : ''} href="/privacy">Privacidad</a>
            <a className={!isPrivacy ? 'is-current' : ''} href="/terms">Condiciones</a>
            <a className="legal-login" href="/sign-in">Iniciar sesión</a>
          </nav>
        </div>
      </header>

      <main id="legal-content">
        <section className="legal-hero">
          <div>
            <a className="legal-back" href="/"><ArrowLeft size={17} /> Volver a AutiveX</a>
            <span className="legal-eyebrow">Legal · AutiveX AI</span>
            <h1>{title}</h1>
            <p>{description}</p>
            <div className="legal-meta"><span>Vigente desde {EFFECTIVE_DATE}</span><span>Idioma oficial: español</span></div>
          </div>
        </section>

        <div className="legal-layout">
          <aside className="legal-toc">
            <strong>Contenido</strong>
            <nav aria-label={`Contenido de ${title}`}>
              {sections.map(([id, label], index) => <a key={id} href={`#${id}`}><span>{String(index + 1).padStart(2, '0')}</span>{label}</a>)}
            </nav>
          </aside>
          <article className="legal-document">
            {isPrivacy ? <PrivacyPolicy /> : <TermsOfService />}
          </article>
        </div>
      </main>

      <footer className="legal-footer">
        <div>
          <LegalBrand />
          <span>AutiveX · México · {new Date().getFullYear()}</span>
        </div>
        <nav aria-label="Enlaces legales">
          <a href="/privacy">Aviso de Privacidad</a>
          <a href="/terms">Condiciones del Servicio</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>Contacto</a>
        </nav>
      </footer>
    </div>
  );
}
