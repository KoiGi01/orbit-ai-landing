import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSignatureHtml, buildSignatureText } from '../dashboard/src/signature-template.js';

const operator = {
  name: 'Cristina Campos',
  role: 'Especialista de implementación',
  email: 'cristina@autivexai.com',
  phone: '+52 55 1234 5678',
};

test('places the operator name and role into the Spanish signature', () => {
  const html = buildSignatureHtml(operator, 'es');
  assert.match(html, /Cristina Campos/);
  assert.match(html, /Especialista de implementación/);
});

test('escapes HTML-special characters in operator-supplied values', () => {
  const html = buildSignatureHtml({ ...operator, name: 'Ana & Sons <script>alert(1)</script>' }, 'es');
  assert.match(html, /Ana &amp; Sons/);
  assert.doesNotMatch(html, /<script>/);
});

test('switches the tagline and call to action into English', () => {
  const spanish = buildSignatureHtml(operator, 'es');
  const english = buildSignatureHtml(operator, 'en');
  assert.match(spanish, /Agenda una demo/);
  assert.match(english, /Book a demo/);
  assert.notEqual(spanish, english);
});

test('references images and links with absolute production URLs', () => {
  const html = buildSignatureHtml(operator, 'es');
  const sources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(sources.length > 0, 'expected the signature to contain links or images');
  for (const source of sources) {
    assert.match(source, /^(https:\/\/|mailto:|tel:)/, `expected an absolute URL, received "${source}"`);
  }
});

test('inlines every style so email clients cannot strip a stylesheet', () => {
  const html = buildSignatureHtml(operator, 'es');
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /class=/i);
});

test('omits the phone row when no phone number is supplied', () => {
  const withPhone = buildSignatureHtml(operator, 'es');
  const withoutPhone = buildSignatureHtml({ ...operator, phone: '' }, 'es');
  assert.match(withPhone, /\+52 55 1234 5678/);
  assert.doesNotMatch(withoutPhone, /tel:/);
});

test('builds a plain-text signature with no markup for the clipboard fallback', () => {
  const text = buildSignatureText(operator, 'es');
  assert.match(text, /Cristina Campos/);
  assert.match(text, /Especialista de implementación/);
  assert.match(text, /cristina@autivexai\.com/);
  assert.doesNotMatch(text, /[<>]/);
  assert.doesNotMatch(text, /&amp;|&#39;/);
});

test('unescapes ampersands in the plain-text signature', () => {
  const text = buildSignatureText({ ...operator, name: 'Ana & Sons' }, 'es');
  assert.match(text, /Ana & Sons/);
});
