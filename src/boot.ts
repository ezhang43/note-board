import { createRoot } from 'react-dom/client';
import './styles.css';

// Motion is for what the pointer does. Anything the keyboard starts (a shortcut, Enter on a button) happens
// at once: the styles read this switch (html[data-input='keys']). Any press of the pointer turns it off again.
addEventListener('keydown', (e) => {
  if (!/^(Shift|Control|Alt|Meta)$/.test(e.key)) document.documentElement.dataset.input = 'keys'; // a held Shift while dragging is still the pointer
}, true);
addEventListener('pointerdown', () => delete document.documentElement.dataset.input, true);

/** What both entry points (main.tsx for `npm run dev` and the tests, mainPublished.tsx for the published site) draw into. */
export const root = createRoot(document.getElementById('root')!);
