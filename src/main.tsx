import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { appStore } from './store/appStore';
import './styles.css';

// Save any pan/zoom that is still waiting when the tab is closed or hidden.
window.addEventListener('pagehide', appStore.flush);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
