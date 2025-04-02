import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/modern.css';
import '../i18n/i18n';

// Use non-null assertion as we know the element exists in index.html
const container = document.getElementById('root')!;
const root = createRoot(container);

// Render app
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 