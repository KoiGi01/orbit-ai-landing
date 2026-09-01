import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import './landing.css';
import { LegalDocumentPage } from './legal-pages.jsx';

const pagePath = window.location.pathname.replace(/\/+$/, '') || '/';
const legalType = pagePath === '/terms' ? 'terms' : 'privacy';

createRoot(document.getElementById('root')).render(<LegalDocumentPage type={legalType} />);
