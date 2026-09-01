import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('publishes dedicated privacy and terms entries at stable URLs', async () => {
  const [vercel, vite, privacy, terms] = await Promise.all([
    read('vercel.json'),
    read('vite.config.js'),
    read('privacy.html'),
    read('terms.html'),
  ]);

  assert.match(vercel, /"source": "\/privacy"[\s\S]*"destination": "\/privacy\.html"/);
  assert.match(vercel, /"source": "\/terms"[\s\S]*"destination": "\/terms\.html"/);
  assert.match(vite, /privacy: resolve\(import\.meta\.dirname, 'privacy\.html'\)/);
  assert.match(vite, /terms: resolve\(import\.meta\.dirname, 'terms\.html'\)/);
  assert.match(privacy, /<link rel="canonical" href="https:\/\/autivexai\.com\/privacy" \/>/);
  assert.match(terms, /<link rel="canonical" href="https:\/\/autivexai\.com\/terms" \/>/);
});

test('privacy notice documents Google data access, limited use and user controls', async () => {
  const legal = await read('src/legal-pages.jsx');

  assert.match(legal, /calendar\.calendarlist\.readonly/);
  assert.match(legal, /calendar\.events/);
  assert.match(legal, /incluidos sus requisitos de Uso Limitado/);
  assert.match(legal, /No vendemos estos datos/);
  assert.match(legal, /no los usamos para vigilancia, crédito o publicidad/);
  assert.match(legal, /myaccount\.google\.com\/permissions/);
  assert.match(legal, /máximo de 20 días/);
  assert.match(legal, /15 días siguientes/);
  assert.match(legal, /limita a 30 días la retención de contenido de llamada en Retell/);
});

test('terms require lawful call handling and meaningful human oversight', async () => {
  const legal = await read('src/legal-pages.jsx');

  assert.match(legal, /informar de forma clara cuando una persona interactúa con un sistema automatizado/);
  assert.match(legal, /cuando una llamada puede ser grabada o transcrita/);
  assert.match(legal, /Naturaleza y límites de la inteligencia artificial/);
  assert.match(legal, /No emergencias, fraude, llamadas ilícitas/);
  assert.match(legal, /derechos irrenunciables de consumidores/);
});

test('landing and calendar connection expose the privacy notice prominently', async () => {
  const [landing, dashboard] = await Promise.all([
    read('src/landing.jsx'),
    read('dashboard/src/main.jsx'),
  ]);

  assert.match(landing, /href="\/privacy">Privacidad<\/a>/);
  assert.match(landing, /href="\/terms">Condiciones<\/a>/);
  assert.match(dashboard, /href="\/privacy#google-workspace"/);
  assert.match(dashboard, /No usamos estos datos para publicidad ni para entrenar modelos generales/);
});
