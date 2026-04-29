export const DEMO_LIMIT_MS = 90_000;

const LIVE_RATE = 16_000;
const PLAYBACK_RATE = 24_000;
const PLAYBACK_LEAD_SECONDS = 0.12;

const SYSTEM_PROMPT = `
Eres Orbit AI en una demo breve de onboarding por voz.
Hablas espanol natural, calido y profesional.
Tu objetivo es demostrar un flujo que podriamos implementar en el negocio del usuario.
No des informacion general sobre Orbit AI, precios, tecnologia, implementacion, funciones, planes ni detalles comerciales.
Manten respuestas muy cortas: maximo 1 frase por turno.

Sigue este flujo en orden:
1. Saluda con esta idea: "Hola, soy Orbit AI. Esta es una demo de lo que podemos implementar en tu negocio. Me puedes dar tu nombre, por favor?"
2. Cuando el usuario diga su nombre, pregunta solo por su WhatsApp.
3. Cuando el usuario diga su WhatsApp, llama la herramienta capture_lead con nombre y WhatsApp.
4. Despues de capturar el lead, pregunta: "Te gustaria que te hagamos llegar mas informacion por WhatsApp?"
5. Si responde que si, llama prepare_whatsapp_message y luego di: "Claro, la informacion te va a llegar por WhatsApp en unos minutos. Gracias por tu tiempo."
6. Si responde que no, di: "Entendido, muchas gracias por tu tiempo."
7. Despues del cierre, no sigas preguntando.

Reglas importantes:
- No inventes datos del negocio del usuario.
- No pidas tipo de negocio en esta version.
- No ofrezcas agendar.
- No repitas la introduccion.
- Si el usuario pregunta otra cosa, responde breve y vuelve al dato que falta del flujo.
`;

const DEMO_TOOLS = [
  {
    name: 'capture_lead',
    description: 'Captura datos de un prospecto interesado en una demo de Orbit AI.',
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

async function postLead(args, transcript) {
  await fetch('/api/demo/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...args,
      source: 'voice_demo',
      transcript,
    }),
  });
}

export async function createLiveDemoSession({
  onState,
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
  const playbackNodes = new Set();

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
    playTime = outputContext?.currentTime || 0;
  };

  const cleanup = async (reason = 'ended') => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timeoutId);

    flushMic();
    clearPlayback();
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
    playbackNodes.add(node);
    node.start(startAt);
    emitState('speaking');
    node.onended = () => {
      playbackNodes.delete(node);
      try { node.disconnect(); } catch {}
      if (!closed && playbackNodes.size === 0 && outputContext.currentTime >= playTime - 0.05) {
        emitState(muted ? 'muted' : 'listening');
      }
    };
  };

  const handleToolCall = async (message) => {
    if (!message.toolCall?.functionCalls?.length || !session) return;

    const functionResponses = [];
    for (const call of message.toolCall.functionCalls) {
      const args = call.args || {};
      let response = { result: 'ok' };

      if (call.name === 'capture_lead') {
        await postLead(args, getTranscript?.() || []);
        const action = actionForTool(call.name, args);
        if (action) onAction(action);
        response = { result: 'lead_captured' };
      }

      if (call.name === 'prepare_whatsapp_message') {
        const digits = String(args.whatsapp || '').replace(/\D/g, '');
        const messageText = args.name
          ? `Hola ${args.name}, te compartimos mas informacion sobre la demo de Orbit AI.`
          : 'Hola, te compartimos mas informacion sobre la demo de Orbit AI.';
        const url = digits
          ? `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`
          : `https://wa.me/?text=${encodeURIComponent(messageText)}`;
        await postLead({ ...args, whatsappConsent: true }, getTranscript?.() || []);
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
            pauseMic();
            emitState('thinking');
          }

          if (message.serverContent?.outputTranscription?.text) {
            const text = normalizeTranscript(message.serverContent.outputTranscription.text);
            if (text) onTranscript({ role: 'assistant', text });
          }

          if (message.serverContent?.interrupted) {
            clearPlayback();
            emitState('listening');
          }

          if (message.serverContent?.turnComplete) {
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
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 80,
            silenceDurationMs: 650,
          },
        },
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: DEMO_TOOLS }],
      },
    });

    session.sendClientContent({
      turns: 'Inicia el flujo de onboarding con el saludo indicado y pregunta solo por mi nombre.',
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

    timeoutId = window.setTimeout(() => {
      onTranscript({
        role: 'assistant',
        text: 'Gracias por probar Orbit AI. Para mantener la demo breve, aqui cerramos la llamada.',
      });
      cleanup('ended');
    }, DEMO_LIMIT_MS);
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
