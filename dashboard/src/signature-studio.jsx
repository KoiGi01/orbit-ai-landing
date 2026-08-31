import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/react';
import { Check, Copy, Download, Mail } from 'lucide-react';
import '@fontsource-variable/manrope';

import { CANVAS, drawSignature, FONT } from './signature-canvas.js';
import { buildSignatureLineHtml, buildSignatureLineText, SIGNATURE_COPY } from './signature-template.js';

const LOCALES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
];

const ROLE_PLACEHOLDER = {
  es: 'Especialista de implementación',
  en: 'Implementation specialist',
};

const LOGO_SRC = '/autivex-signature-logo.png';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export default function SignatureStudio() {
  const { user } = useUser();
  const canvasRef = useRef(null);
  const [locale, setLocale] = useState('es');
  const [photoImage, setPhotoImage] = useState(null);
  const [logoImage, setLogoImage] = useState(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const [fields, setFields] = useState(() => ({
    name: user?.fullName || '',
    role: '',
    email: user?.primaryEmailAddress?.emailAddress || '',
    phone: '',
  }));

  const lineHtml = useMemo(() => buildSignatureLineHtml(fields, locale), [fields, locale]);
  const lineText = useMemo(() => buildSignatureLineText(fields, locale), [fields, locale]);

  // The brand face has to be resident before the canvas draws, otherwise the
  // first paint silently falls back to Arial.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([
          document.fonts.load(`800 21px "${FONT}"`),
          document.fonts.load(`700 14px "${FONT}"`),
          document.fonts.load(`500 12px "${FONT}"`),
        ]);
      } catch {
        // Fall through: the canvas still renders in the fallback stack.
      }
      const logo = await loadImage(LOGO_SRC).catch(() => null);
      if (cancelled) return;
      setLogoImage(logo);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawSignature(context, { fields, locale, photoImage, logoImage, copy: SIGNATURE_COPY[locale] });
  }, [ready, fields, locale, photoImage, logoImage]);

  const update = (key) => (event) => {
    setFields((current) => ({ ...current, [key]: event.target.value }));
    setCopied(false);
  };

  const onPhoto = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setPhotoImage(image);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      setError('No pudimos leer esa imagen. Prueba con un PNG o JPG.');
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }, []);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('No se pudo generar el PNG.');
        return;
      }
      const slug = (fields.name || 'autivex')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `firma-autivex-${slug || 'autivex'}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const copyLine = async () => {
    setError('');
    try {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          'text/html': new Blob([lineHtml], { type: 'text/html' }),
          'text/plain': new Blob([lineText], { type: 'text/plain' }),
        }),
      ]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      setError('Tu navegador bloqueó el portapapeles. Copia la línea manualmente.');
    }
  };

  return (
    <section className="ops-signature" aria-label="Firma de correo">
      <header className="ops-signature-head">
        <div>
          <h2><Mail size={17} /> Firma de correo</h2>
          <span>Descarga el PNG, súbelo a Gmail y pega debajo la línea con tus enlaces. No se guarda nada aquí.</span>
        </div>
        <div className="ops-signature-locale" role="group" aria-label="Idioma de la firma">
          {LOCALES.map((option) => (
            <button
              type="button"
              key={option.id}
              className={locale === option.id ? 'active' : ''}
              onClick={() => { setLocale(option.id); setCopied(false); }}
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
          <label>
            Foto de perfil
            <input type="file" accept="image/*" onChange={onPhoto} />
            <small>Se dibuja dentro del PNG. No se sube a ningún servidor ni se guarda.</small>
          </label>
        </div>

        <div className="ops-signature-output">
          <span className="ops-signature-label">1 · Imagen de la firma</span>
          <div className="ops-signature-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={CANVAS.width * CANVAS.scale}
              height={CANVAS.height * CANVAS.scale}
              style={{ width: `${CANVAS.width}px`, height: `${CANVAS.height}px` }}
              aria-label="Vista previa de la firma"
            />
          </div>
          <div className="ops-signature-actions">
            <button type="button" className="ops-signature-copy" onClick={downloadPng}>
              <Download size={16} /> Descargar PNG
            </button>
            <p>En Gmail: Configuración → Firma → Insertar imagen.</p>
          </div>

          <span className="ops-signature-label">2 · Línea con tus enlaces</span>
          <div className="ops-signature-line" dangerouslySetInnerHTML={{ __html: lineHtml }} />
          <div className="ops-signature-actions">
            <button type="button" className="ops-signature-copy ops-signature-copy-ghost" onClick={copyLine}>
              {copied ? <><Check size={16} /> Copiada</> : <><Copy size={16} /> Copiar línea</>}
            </button>
            <p>Pégala justo debajo de la imagen. Aquí los enlaces sí funcionan.</p>
          </div>

          {error && <p className="ops-signature-error">{error}</p>}
        </div>
      </div>
    </section>
  );
}
