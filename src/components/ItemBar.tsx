import { useEffect, useState, type ReactNode } from 'react';
import { appStore } from '../store/appStore';
import { ArrowIcon, CheckIcon, IndentIcon, TrashIcon } from './icons';

type Typing = { cardId: string; itemId: string; field: HTMLTextAreaElement };

/** The checklist item whose text is being typed in, if any. */
function typingIn(): Typing | null {
  const field = document.activeElement;
  if (!(field instanceof HTMLTextAreaElement)) return null;
  const itemId = field.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
  const cardId = field.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
  return itemId && cardId ? { cardId, itemId, field } : null;
}

/** How much of the bottom of the window the on-screen keyboard covers (0 with no keyboard up). */
function keyboardCover() {
  const v = window.visualViewport;
  return v ? Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)) : 0;
}

/**
 * Phone layout (owner request): while typing in a checklist item, a row of buttons for what a
 * keyboard would do on a computer (Tab, Shift+Tab, Ctrl+Shift+Up / Down, ticking, deleting).
 * It sits just above the on-screen keyboard.
 */
export function ItemBar() {
  const [typing, setTyping] = useState<Typing | null>(null);
  const [cover, setCover] = useState(0);

  useEffect(() => {
    // After a change the item's text box can be redrawn, so look again once focus has settled.
    const update = () => setTimeout(() => setTyping(typingIn()));
    const v = window.visualViewport;
    const onViewport = () => setCover(keyboardCover());
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    v?.addEventListener('resize', onViewport);
    v?.addEventListener('scroll', onViewport);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      v?.removeEventListener('resize', onViewport);
      v?.removeEventListener('scroll', onViewport);
    };
  }, []);

  if (!typing) return null;
  const { cardId, itemId, field } = typing;
  const button = (label: string, icon: ReactNode, act: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Pressing a button keeps the cursor (and the phone keyboard) in the item.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={act}
    >
      {icon}
    </button>
  );
  return (
    <div className="item-bar" role="toolbar" aria-label="Item actions" style={{ bottom: cover }}>
      {button('Outdent', <IndentIcon out />, () => appStore.itemTab(cardId, itemId, true))}
      {button('Indent', <IndentIcon />, () => appStore.itemTab(cardId, itemId, false))}
      {button('Move up', <ArrowIcon />, () => appStore.moveItem(cardId, itemId, -1, field.selectionStart))}
      {button('Move down', <ArrowIcon down />, () => appStore.moveItem(cardId, itemId, 1, field.selectionStart))}
      {button('Tick', <CheckIcon />, () => appStore.toggleItem(cardId, itemId))}
      {button('Delete item', <TrashIcon />, () => appStore.trashItem(cardId, itemId))}
    </div>
  );
}
