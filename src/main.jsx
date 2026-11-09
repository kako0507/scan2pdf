import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App.jsx';
import { initialLang, saveLang } from './i18n.js';
import { createAppStore } from './store/index.js';
import { settingsSlice, statusSet } from './store/slices.js';
import './styles.css';

const store = createAppStore({ settings: { ...settingsSlice.getInitialState(), lang: initialLang() } });
window.__scan2pdfStore = store; // read-only access for debugging and the end-to-end tests

// Persist the language choice outside the reducers.
let lang = store.getState().settings.lang;
store.subscribe(() => {
  const next = store.getState().settings.lang;
  if (next !== lang) { lang = next; saveLang(next); }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
    if (navigator.serviceWorker.controller) return;
    reg.installing?.addEventListener('statechange', (e) => {
      if (e.target.state === 'activated') store.dispatch(statusSet({ key: 'offlineReady' }));
    });
  }).catch((err) => console.warn('service worker', err));
}
