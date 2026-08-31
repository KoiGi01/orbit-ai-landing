import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSignatureLineHtml, buildSignatureLineText } from '../dashboard/src/signature-template.js';

const operator = {
  name: 'Cristina Campos',
  role: 'Especialista de implementación',
  email: 'cristina@autivexai.com',
  phone: '+52 55 1234 5678',
};

test('links the email and phone so the line stays actionable under the image', () => {
  const html = buildSignatureLineHtml(operator, 'es');
  assert.match(html, /href="mailto:cristina@autivexai\.com"/);
  assert.match(html, /href="tel:\+525512345678"/);
});

test('carries the booking call to action that the image itself cannot', () => {
  const html = buildSignatureLineHtml(operator, 'es');
  assert.match(html, /Agenda una demo/);
  assert.match(html, /href="https:\/\/calendly\.com\/autivex\/consultoria"/);
});

test('switches the call to action into English', () => {
  assert.match(buildSignatureLineHtml(operator, 'en'), /Book a demo/);
});

test('omits the phone link when no phone number is supplied', () => {
  const html = buildSignatureLineHtml({ ...operator, phone: '' }, 'es');
  assert.doesNotMatch(html, /tel:/);
  assert.match(html, /mailto:/);
});

test('escapes HTML-special characters in operator-supplied values', () => {
  const html = buildSignatureLineHtml({ ...operator, email: 'a<script>@b.com' }, 'es');
  assert.doesNotMatch(html, /<script>/);
});

test('inlines every style so email clients cannot strip a stylesheet', () => {
  const html = buildSignatureLineHtml(operator, 'es');
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /class=/i);
});

test('uses only absolute links', () => {
  const html = buildSignatureLineHtml(operator, 'es');
  for (const href of [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])) {
    assert.match(href, /^(https:\/\/|mailto:|tel:)/, `expected absolute, got "${href}"`);
  }
});

test('builds a plain-text twin with no markup for the clipboard', () => {
  const text = buildSignatureLineText(operator, 'es');
  assert.match(text, /cristina@autivexai\.com/);
  assert.doesNotMatch(text, /[<>]/);
});
