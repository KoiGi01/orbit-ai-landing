export const DEMO_LIMIT_MS = 90_000;

const LIVE_RATE = 16_000;
const PLAYBACK_RATE = 24_000;
const PLAYBACK_LEAD_SECONDS = 0.12;
const SPEECH_PREFIX_PADDING_MS = 160;
const SPEECH_SILENCE_DURATION_MS = 1250;
const DEMO_CLOSE_GRACE_MS = 18_000;

const DEFAULT_SCENARIO = {
  label: 'Recepcion comercial',
  businessRole: 'recepcionista de un negocio de servicios',
  customerContext: 'El usuario llama como cliente o prospecto.',
  firstLine: 'Perfecto. Vamos a simular una llamada de recepcion comercial. Yo sere el agente de IA; dime en que te puedo ayudar.',
  leadSource: 'voice_demo',
};

const INTRO_SCRIPT = ' Eres Autivex AI, estas haciendo una demo para posibles leads en un landing page, esto es lo que debes decir: Hola, soy Autivex AI. Esta es una demo de voz que podrias integrar en tu negocio para contestar llamadas, entender la necesidad del cliente y preparar el seguimiento. En un momento vas a ver algunas opciones de servicio. Elige la que mas se parezca a tu tipo de negocio o al caso que quieres probar. Despues entraremos a una llamada simulada, donde tu seras el cliente y yo atendere como lo haria tu recepcionista de IA.';

const INTRO_PROMPT = `
Eres la recepcionista virtual de Autivex AI presentando una demo.

IDIOMA: Espanol mexicano. Trato formal con "usted".

TONO Y VOZ:
- Profesional, serena y confiable
- Calida pero sin entusiasmo exagerado
- Ritmo pausado y natural; deja espacio entre ideas
- Articula con claridad, sin apresurarte
- Nunca uses rellenos como "um", "eh", "este", "o sea"

INSTRUCCION: Di una sola intervencion sin hacer preguntas. Lee exactamente el texto que recibes, sin resumirlo, cambiarlo ni agregar nada.
`;

function buildSystemPrompt(scenario = DEFAULT_SCENARIO) {
  const demo = { ...DEFAULT_SCENARIO, ...scenario };

  return `
Eres la recepcionista virtual de Autivex AI en una llamada de demostracion.

IDIOMA: Espanol mexicano. Trato formal con "usted".

TONO Y VOZ:
- Profesional, serena y confiable — como la mejor recepcionista de un consultorio o empresa de servicios
- Calida pero medida; nunca suenes emocionada ni ansiosa
- Ritmo pausado y natural; deja una pausa breve entre ideas
- No repitas lo que el usuario acaba de decir
- Nunca uses rellenos como "um", "eh", "claro que si", "por supuesto"
- Si no sabes algo, dilo con calma y ofrece escalar

ROL: En esta llamada actuas como ${demo.businessRole}.
Contexto: ${demo.customerContext}

RESPUESTAS: Muy cortas. Maximo una frase por turno. No des informacion que no te pidieron.
No expliques funciones, tecnologia ni precios de Autivex AI.

Sigue este flujo en orden:
1. Abre exactamente con esta idea: "${demo.firstLine}"
2. Atiende la solicitud del usuario como lo haria el negocio del escenario "${demo.label}".
3. Haz una o dos preguntas utiles para entender necesidad, urgencia o contexto.
4. Si el caso requiere cita o seguimiento, ofrecelo de forma breve sin inventar horarios reales.
5. Antes de cerrar, pide nombre y WhatsApp para que el equipo le de seguimiento.
6. Cuando tengas nombre y WhatsApp, llama la herramienta capture_lead.
7. Despues de capturar el lead, pregunta: "Quieres que dejemos listo el seguimiento por WhatsApp?"
8. Si responde que si, llama prepare_whatsapp_message y luego di: "Perfecto, dejo listo el mensaje para seguimiento por WhatsApp. Gracias por tu tiempo."
9. Si responde que no, di: "Entendido, muchas gracias por tu tiempo."
10. Despues del cierre, no sigas preguntando.

Reglas importantes:
- No inventes datos especificos como precios, disponibilidad, diagnosticos, resultados legales o promesas comerciales.
- En clinica medica, no des diagnosticos ni recomendaciones medicas; ofrece agendar o escalar con el equipo.
- En despacho de abogados, no des asesoria legal definitiva; recopila contexto y ofrece seguimiento.
- No digas que un WhatsApp fue enviado. Solo puedes decir que queda listo o preparado.
- Si el usuario pregunta otra cosa, responde breve y vuelve al dato que falta del flujo.
`;
}

const DEMO_TOOLS = [
  {
    name: 'capture_lead',
    description: 'Captura datos de un prospecto interesado en una demo de Autivex AI.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Nombre del prospecto.' },
        whatsapp: { type: 'STRING', description: 'Numero de WhatsApp del prospecto.' },
      },
      required: ['name', 'whatsapp'],
    },
  },
  {
    name: 'prepare_whatsapp_message',
    description: 'Confirma que el usuario acepto recibir mas informacion por WhatsApp y prepara el seguimiento.',
    parameters: {
      type: 'OBJECT',
      properties: {
        whatsapp: { type: 'STRING', description: 'Numero de WhatsApp destino.' },
        name: { type: 'STRING', description: 'Nombre del prospecto.' },
      },
      required: ['whatsapp'],
    },
  },
];

function blobToBase64(blob) {
  const bytes = new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function audioRateFromMime(mimeType) {
  const match = String(mimeType || '').match(/rate=(\d+)/i);
  return match ? Number(match[1]) : PLAYBACK_RATE;
}

function downsampleToPcm(input, inputRate) {
  if (inputRate === LIVE_RATE) {
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }

  const ratio = inputRate / LIVE_RATE;
  const length = Math.floor(input.length / ratio);
  const pcm = new Int16Array(length);

  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return pcm;
}

function buildPcmLevels(pcm, sampleRate = PLAYBACK_RATE) {
  const frameRate = 30;
  const frameSize = Math.max(1, Math.floor((sampleRate || PLAYBACK_RATE) / frameRate));
  const levels = [];

  for (let start = 0; start < pcm.length; start += frameSize) {
    const end = Math.min(pcm.length, start + frameSize);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      const sample = pcm[i] / 0x8000;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    levels.push(Math.min(1, rms * 7.5));
  }

  return { frameRate, levels };
}

function createOutputLevelMeter({ getContext, onLevel, isClosed }) {
  const clips = new Set();
  let timer = 0;
  let smooth = 0;

  const tick = () => {
    const context = getContext?.();
    if (isClosed?.() || !context) {
      stop();
      return;
    }

    const now = context.currentTime;
    let level = 0;
    for (const clip of Array.from(clips)) {
      if (now > clip.endAt + 0.08) {
        clips.delete(clip);
        continue;
      }
      const index = Math.floor((now - clip.startAt) * clip.frameRate);
      if (index >= 0 && index < clip.levels.length) {
        level = Math.max(level, clip.levels[index]);
      }
    }

    smooth += (level - smooth) * (level > smooth ? 0.42 : 0.16);
    onLevel?.(smooth < 0.015 ? 0 : smooth);

    if (clips.size === 0 && smooth < 0.015) stop();
  };

  const ensure = () => {
    if (!timer && onLevel) timer = window.setInterval(tick, 33);
  };

  function stop() {
    window.clearInterval(timer);
    timer = 0;
    clips.clear();
    smooth = 0;
    onLevel?.(0);
  }

  return {
    add(startAt, pcm, sampleRate) {
      if (!onLevel) return null;
      const { frameRate, levels } = buildPcmLevels(pcm, sampleRate);
      const clip = {
        startAt,
        endAt: startAt + pcm.length / (sampleRate || PLAYBACK_RATE),
        frameRate,
        levels,
      };
      clips.add(clip);
      ensure();
      return clip;
    },
    remove(clip) {
      if (clip) clips.delete(clip);
    },
    stop,
  };
}

function normalizeTranscript(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function actionForTool(name, args, extra = {}) {
  if (name === 'capture_lead') {
    return {
      id: `lead-${Date.now()}`,
      type: 'lead',
      title: 'Lead capturado',
      text: args.name ? `Nombre: ${args.name}` : 'Datos guardados para seguimiento.',
      href: null,
    };
  }

  if (name === 'prepare_whatsapp_message') {
    return {
      id: `whatsapp-${Date.now()}`,
      type: 'whatsapp',
      title: 'WhatsApp preparado',
      text: 'El seguimiento quedo listo para enviar informacion.',
      href: extra.url,
    };
  }

  return null;
}

async function postLead(args, transcript, source = DEFAULT_SCENARIO.leadSource) {
  await fetch('/api/demo/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...args,
      source,
      transcript,
    }),
  });
}

export async function createDemoIntroSession({
  onState,
  onOutputLevel,
  onEnded,
  onError,
}) {
  let closed = false;
  let session;
  let outputContext;
  let playTime = 0;
  let timeoutId;
  let turnComplete = false;
  const playbackNodes = new Set();
  const outputLevelMeter = createOutputLevelMeter({
    getContext: () => outputContext,
    onLevel: onOutputLevel,
    isClosed: () => closed,
  });

  const cleanup = async (reason = 'ended') => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timeoutId);
    outputLevelMeter.stop();
    for (const node of playbackNodes) {
      try { node.onended = null; node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    }
    playbackNodes.clear();
    try { session?.close?.(); } catch {}
    try { await outputContext?.close(); } catch {}
    onEnded?.(reason);
  };

  const maybeFinish = () => {
    if (!closed && turnComplete && playbackNodes.size === 0) {
      cleanup('ended');
    }
  };

  const playAudio = (base64, sampleRate = PLAYBACK_RATE) => {
    if (!base64 || closed || !outputContext) return;
    const pcm = base64ToInt16(base64);
    if (!pcm.length) return;

    const buffer = outputContext.createBuffer(1, pcm.length, sampleRate || PLAYBACK_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000;

    const node = outputContext.createBufferSource();
    node.buffer = buffer;
    node.connect(outputContext.destination);

    const startAt = Math.max(outputContext.currentTime + PLAYBACK_LEAD_SECONDS, playTime);
    playTime = startAt + buffer.duration;
    const levelClip = outputLevelMeter.add(startAt, pcm, sampleRate || PLAYBACK_RATE);
    playbackNodes.add(node);
    node.start(startAt);
    onState?.('speaking');
    node.onended = () => {
      playbackNodes.delete(node);
      outputLevelMeter.remove(levelClip);
      try { node.disconnect(); } catch {}
      maybeFinish();
    };
  };

  onState?.('connecting');

  try {
    const tokenResponse = await fetch('/api/demo/token', { method: 'POST' });
    if (!tokenResponse.ok) throw new Error('token_failed');
    const { token, model } = await tokenResponse.json();
    const { GoogleGenAI, Modality } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    outputContext = new AudioContext({ sampleRate: PLAYBACK_RATE });
    await outputContext.resume();

    session = await ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          onState?.('speaking');
        },
        onmessage: (message) => {
          const parts = message.serverContent?.modelTurn?.parts || [];
          let playedInlineAudio = false;
          for (const part of parts) {
            const inlineData = part.inlineData?.data ? part.inlineData : part.inlineData?.inlineData;
            if (inlineData?.data) {
              playedInlineAudio = true;
              playAudio(inlineData.data, audioRateFromMime(inlineData.mimeType));
            }
          }

          if (!playedInlineAudio && message.data) playAudio(message.data);

          if (message.serverContent?.turnComplete) {
            turnComplete = true;
            maybeFinish();
          }
        },
        onerror: (event) => {
          onError?.(event?.message || 'La presentacion de voz tuvo un problema.');
          cleanup('error');
        },
        onclose: () => {
          if (!closed) cleanup('ended');
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        enableAffectiveDialog: true,
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } },
        },
        systemInstruction: INTRO_PROMPT,
      },
    });

    session.sendClientContent({
      turns: INTRO_SCRIPT,
      turnComplete: true,
    });

    timeoutId = window.setTimeout(() => cleanup('ended'), 32_000);
  } catch (error) {
    console.error('Demo intro failed:', error?.message || error);
    onError?.('No pude reproducir la presentacion de voz.');
    await cleanup('error');
    return null;
  }

  return {
    end: () => cleanup('ended'),
  };
}

export async function createLiveDemoSession({
  scenario = DEFAULT_SCENARIO,
  onState,
  onOutputLevel,
  onTranscript,
  onAction,
  onError,
  onEnded,
  getTranscript,
}) {
  let closed = false;
  let muted = false;
  let micMode = 'paused';
  let playTime = 0;
  let session;
  let inputContext;
  let outputContext;
  let source;
  let processor;
  let zeroGain;
  let stream;
  let timeoutId;
  let forceCloseTimeoutId;
  let closingForLimit = false;
  let limitCloseTurnComplete = false;
  const playbackNodes = new Set();
  const leadSource = scenario?.leadSource || DEFAULT_SCENARIO.leadSource;
  const outputLevelMeter = createOutputLevelMeter({
    getContext: () => outputContext,
    onLevel: onOutputLevel,
    isClosed: () => closed,
  });

  const maybeFinishLimitClose = () => {
    if (!closed && closingForLimit && limitCloseTurnComplete && playbackNodes.size === 0) {
      cleanup('ended');
    }
  };

  const emitState = (nextState) => {
    if (closed && nextState !== 'ended' && nextState !== 'error') return;
    if (nextState === 'listening' && muted) {
      micMode = 'paused';
      onState('muted');
      return;
    }

    micMode = nextState === 'listening' ? 'listening' : 'paused';
    onState(nextState);
  };

  const flushMic = () => {
    try { session?.sendRealtimeInput?.({ audioStreamEnd: true }); } catch {}
  };

  const pauseMic = () => {
    if (micMode === 'listening') flushMic();
    micMode = 'paused';
  };

  const clearPlayback = () => {
    for (const node of playbackNodes) {
      try { node.onended = null; node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    }
    playbackNodes.clear();
    outputLevelMeter.stop();
    playTime = outputContext?.currentTime || 0;
  };

  const cleanup = async (reason = 'ended') => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timeoutId);
    window.clearTimeout(forceCloseTimeoutId);

    flushMic();
    clearPlayback();
    outputLevelMeter.stop();
    try { session?.close?.(); } catch {}
    try { processor?.disconnect(); } catch {}
    try { source?.disconnect(); } catch {}
    try { zeroGain?.disconnect(); } catch {}
    try { stream?.getTracks().forEach((track) => track.stop()); } catch {}
    try { await inputContext?.close(); } catch {}
    try { await outputContext?.close(); } catch {}

    onState(reason);
    onEnded?.(reason);
  };

  const playAudio = (base64, sampleRate = PLAYBACK_RATE) => {
    if (!base64 || closed || !outputContext) return;
    pauseMic();
    const pcm = base64ToInt16(base64);
    if (!pcm.length) return;

    const buffer = outputContext.createBuffer(1, pcm.length, sampleRate || PLAYBACK_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000;

    const node = outputContext.createBufferSource();
    node.buffer = buffer;
    node.connect(outputContext.destination);

    const nextSafeStart = outputContext.currentTime + PLAYBACK_LEAD_SECONDS;
    const startAt = playTime < nextSafeStart ? nextSafeStart : playTime;
    playTime = startAt + buffer.duration;
    const levelClip = outputLevelMeter.add(startAt, pcm, sampleRate || PLAYBACK_RATE);
    playbackNodes.add(node);
    node.start(startAt);
    emitState('speaking');
    node.onended = () => {
      playbackNodes.delete(node);
      outputLevelMeter.remove(levelClip);
      try { node.disconnect(); } catch {}
      maybeFinishLimitClose();
      if (!closed && playbackNodes.size === 0 && outputContext.currentTime >= playTime - 0.05) {
        if (closingForLimit) return;
        emitState(muted ? 'muted' : 'listening');
      }
    };
  };

  const closeWithLimitMessage = () => {
    if (closed || closingForLimit || !session) return;
    closingForLimit = true;
    limitCloseTurnComplete = false;
    muted = true;
    pauseMic();
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    clearPlayback();
    emitState('speaking');
    session.sendClientContent({
      turns: 'Interrumpe la conversacion de forma amable y di exactamente: "Hasta aqui llega la demo por ahora. Para mantenerla breve, voy a cerrar la llamada. Gracias por probar Autivex AI."',
      turnComplete: true,
    });
    forceCloseTimeoutId = window.setTimeout(() => cleanup('ended'), DEMO_CLOSE_GRACE_MS);
  };

  const handleToolCall = async (message) => {
    if (!message.toolCall?.functionCalls?.length || !session) return;

    const functionResponses = [];
    for (const call of message.toolCall.functionCalls) {
      const args = call.args || {};
      let response = { result: 'ok' };

      if (call.name === 'capture_lead') {
        await postLead(args, getTranscript?.() || [], leadSource);
        const action = actionForTool(call.name, args);
        if (action) onAction(action);
        response = { result: 'lead_captured' };
      }

      if (call.name === 'prepare_whatsapp_message') {
        const digits = String(args.whatsapp || '').replace(/\D/g, '');
        const messageText = args.name
          ? `Hola ${args.name}, dejamos listo el seguimiento de tu llamada con Autivex AI.`
          : 'Hola, dejamos listo el seguimiento de tu llamada con Autivex AI.';
        const url = digits
          ? `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`
          : `https://wa.me/?text=${encodeURIComponent(messageText)}`;
        await postLead({ ...args, whatsappConsent: true }, getTranscript?.() || [], leadSource);
        const action = actionForTool(call.name, args, { url });
        if (action) onAction(action);
        response = { result: 'whatsapp_message_prepared', url };
      }

      functionResponses.push({
        id: call.id,
        name: call.name,
        response,
      });
    }

    session.sendToolResponse({ functionResponses });
  };

  onState('requesting_mic');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    onError('No pude acceder al microfono. Puedes dejar tus datos en el formulario.');
    await cleanup('error');
    return null;
  }

  onState('connecting');

  try {
    const tokenResponse = await fetch('/api/demo/token', { method: 'POST' });
    if (!tokenResponse.ok) throw new Error('token_failed');
    const { token, model } = await tokenResponse.json();
    const {
      EndSensitivity,
      GoogleGenAI,
      Modality,
      StartSensitivity,
    } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    outputContext = new AudioContext({ sampleRate: PLAYBACK_RATE });
    await outputContext.resume();

    session = await ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          emitState('listening');
        },
        onmessage: (message) => {
          const parts = message.serverContent?.modelTurn?.parts || [];
          let playedInlineAudio = false;
          for (const part of parts) {
            const inlineData = part.inlineData?.data ? part.inlineData : part.inlineData?.inlineData;
            if (inlineData?.data) {
              playedInlineAudio = true;
              playAudio(inlineData.data, audioRateFromMime(inlineData.mimeType));
            }
          }

          if (!playedInlineAudio && message.data) playAudio(message.data);

          if (message.serverContent?.inputTranscription?.text) {
            const text = normalizeTranscript(message.serverContent.inputTranscription.text);
            if (text) onTranscript({ role: 'user', text });
          }

          if (message.serverContent?.outputTranscription?.text) {
            const text = normalizeTranscript(message.serverContent.outputTranscription.text);
            if (text) onTranscript({ role: 'assistant', text });
          }

          if (message.serverContent?.interrupted) {
            clearPlayback();
            if (closingForLimit) return;
            emitState('listening');
          }

          if (message.serverContent?.turnComplete) {
            if (closingForLimit) {
              limitCloseTurnComplete = true;
              maybeFinishLimitClose();
              return;
            }
            if (playbackNodes.size === 0) emitState(muted ? 'muted' : 'listening');
          }

          handleToolCall(message).catch((error) => {
            console.error('Tool handling failed:', error?.message || error);
          });
        },
        onerror: (event) => {
          onError(event?.message || 'La sesion de voz tuvo un problema.');
        },
        onclose: () => {
          if (!closed) cleanup('ended');
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        enableAffectiveDialog: true,
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: SPEECH_PREFIX_PADDING_MS,
            silenceDurationMs: SPEECH_SILENCE_DURATION_MS,
          },
        },
        systemInstruction: buildSystemPrompt(scenario),
        tools: [{ functionDeclarations: DEMO_TOOLS }],
      },
    });

    session.sendClientContent({
      turns: `Inicia ahora la demo del escenario "${scenario?.label || DEFAULT_SCENARIO.label}" con la apertura indicada.`,
      turnComplete: true,
    });

    inputContext = new AudioContext();
    await inputContext.resume();
    source = inputContext.createMediaStreamSource(stream);
    processor = inputContext.createScriptProcessor(4096, 1, 1);
    zeroGain = inputContext.createGain();
    zeroGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      if (closed || muted || !session || micMode !== 'listening' || playbackNodes.size > 0) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsampleToPcm(input, inputContext.sampleRate);
      session.sendRealtimeInput({
        audio: {
          data: blobToBase64(pcm),
          mimeType: `audio/pcm;rate=${LIVE_RATE}`,
        },
      });
    };

    source.connect(processor);
    processor.connect(zeroGain);
    zeroGain.connect(inputContext.destination);

    timeoutId = window.setTimeout(closeWithLimitMessage, DEMO_LIMIT_MS);
  } catch (error) {
    console.error('Live demo failed:', error?.message || error);
    onError('No pude iniciar la demo de voz. Revisa la API key o intenta de nuevo.');
    await cleanup('error');
    return null;
  }

  return {
    end: () => cleanup('ended'),
    setMuted(nextMuted) {
      muted = nextMuted;
      stream?.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
      if (nextMuted) {
        pauseMic();
        emitState('muted');
      } else {
        emitState(playbackNodes.size > 0 ? 'speaking' : 'listening');
      }
    },
  };
}
