import React, { useMemo, useState } from 'react';
import { useUser } from '@clerk/react';
import { Check, Copy, Mail } from 'lucide-react';

import { buildSignatureHtml, buildSignatureText } from './signature-template.js';

const LOCALES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
];

const ROLE_PLACEHOLDER = {
  es: 'Especialista de implementación',
  en: 'Implementation specialist',
};

// The preview lives in an iframe because the Admin Console is a dark,
// monospaced surface. Rendering the signature inline would let console CSS
// leak in and show something the recipient will never see.
function SignaturePreview({ html }) {
  const document = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:22px;background:#ffffff;">${html}</body></html>`,
    [html]
  );

  return (
    <iframe
      className="ops-signature-frame"
      title="Vista previa de la firma"
      srcDoc={document}
      sandbox=""
    />
  );
}

export default function SignatureStudio() {
  const { user } = useUser();
  const [locale, setLocale] = useState('es');
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');

  const [fields, setFields] = useState(() => ({
    name: user?.fullName || '',
    role: '',
    email: user?.primaryEmailAddress?.emailAddress || '',
    phone: '',
  }));

  const html = useMemo(() => buildSignatureHtml(fields, locale), [fields, locale]);
  const text = useMemo(() => buildSignatureText(fields, locale), [fields, locale]);

  const update = (key) => (event) => {
    setFields((current) => ({ ...current, [key]: event.target.value }));
    setCopied('');
    setCopyError('');
  };

  const copySignature = async () => {
    setCopyError('');
    try {
      // Both flavors: rich clients keep the layout, plain-text targets stay readable.
      await navigator.clipboard.write([
        new window.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      setCopied('html');
      window.setTimeout(() => setCopied(''), 2600);
    } catch (error) {
      setCopyError('Tu navegador bloqueó el portapapeles. Copia el HTML desde el cuadro de abajo.');
    }
  };

  return (
    <section className="ops-signature" aria-label="Firma de correo">
      <header className="ops-signature-head">
        <div>
          <h2><Mail size={17} /> Firma de correo</h2>
          <span>Personaliza tu firma y pégala en Gmail u Outlook. No se guarda: se genera y se copia.</span>
        </div>
        <div className="ops-signature-locale" role="group" aria-label="Idioma de la firma">
          {LOCALES.map((option) => (
            <button
              type="button"
              key={option.id}
              className={locale === option.id ? 'active' : ''}
              onClick={() => { setLocale(option.id); setCopied(''); }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="ops-signature-body">
        <div className="ops-form-grid ops-signature-form">
          <label>
            Nombre
            <input value={fields.name} onChange={update('name')} placeholder="Cristina Campos" />
          </label>
          <label>
            Puesto
            <input value={fields.role} onChange={update('role')} placeholder={ROLE_PLACEHOLDER[locale]} />
          </label>
          <label>
            Correo
            <input type="email" value={fields.email} onChange={update('email')} placeholder="nombre@autivexai.com" />
          </label>
          <label>
            Teléfono / WhatsApp
            <input value={fields.phone} onChange={update('phone')} placeholder="+52 55 1234 5678" />
          </label>
        </div>

        <div className="ops-signature-output">
          <span className="ops-signature-label">Vista previa</span>
          <SignaturePreview html={html} />

          <div className="ops-signature-actions">
            <button type="button" className="ops-signature-copy" onClick={copySignature}>
              {copied ? <><Check size={16} /> Copiada</> : <><Copy size={16} /> Copiar firma</>}
            </button>
            <p>Pega con <kbd>Ctrl</kbd>+<kbd>V</kbd> en la configuración de firma de tu cliente de correo.</p>
          </div>

          {copyError && <p className="ops-signature-error">{copyError}</p>}

          <details className="ops-signature-source">
            <summary>Ver HTML</summary>
            <textarea readOnly value={html} rows={7} onFocus={(event) => event.target.select()} />
          </details>
        </div>
      </div>
    </section>
  );
}
