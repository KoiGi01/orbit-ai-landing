import { GoogleGenAI } from '@google/genai';

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';
const SPEECH_PREFIX_PADDING_MS = 160;
const SPEECH_SILENCE_DURATION_MS = 1250;

function sendJson(res, status, body) {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    sendJson(res, 500, { error: 'missing_gemini_api_key' });
    return;
  }

  try {
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { apiVersion: 'v1alpha' },
    });
    const expireTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: ['AUDIO'],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: SPEECH_PREFIX_PADDING_MS,
                silenceDurationMs: SPEECH_SILENCE_DURATION_MS,
              },
            },
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    sendJson(res, 200, {
      token: token.name,
      model: LIVE_MODEL,
      expireTime,
    });
  } catch (error) {
    console.error('Failed to create Gemini Live token:', error?.message || error);
    sendJson(res, 502, { error: 'token_creation_failed' });
  }
}
