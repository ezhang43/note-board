// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOTKEYS } from '../model/hotkeys';
import { appStore } from '../store/appStore';
import { calendar } from '../store/calendar';
import { handleChecklistKeys, resolveUndoAction } from './useShortcuts';

function makeKeyEvent(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, 'target', { value: target });
  const path: EventTarget[] = [];
  let cur: Node | null = target instanceof Node ? target : null;
  while (cur) {
    path.push(cur);
    cur = cur.parentNode;
  }
  path.push(window);
  e.composedPath = () => path;
  return e;
}

type FakeStore = ReturnType<typeof appStore.storeFor>;

function makeFakePanelStore() {
  return {
    formatBoxes: vi.fn(),
    selectedBoxes: vi.fn(() => [] as ReturnType<typeof appStore.selectedBoxes>),
    selectWholeList: vi.fn(),
    enterOverWords: vi.fn(),
    deleteWords: vi.fn(),
    deleteSelectedItems: vi.fn(),
    clearItemSelection: vi.fn(),
    tabSelectedItems: vi.fn(),
    copyItems: vi.fn(),
    cutItems: vi.fn(),
    pasteItems: vi.fn(() => false),
    trashItem: vi.fn(),
  };
}

function mockAppState(overrides: {
  sidePanel?: ReturnType<typeof appStore.getState>['ui']['sidePanel'];
  itemSel?: ReturnType<typeof appStore.getState>['ui']['itemSel'];
  selection?: string[];
  confirm?: ReturnType<typeof appStore.getState>['ui']['confirm'];
  deleteCompleted?: ReturnType<typeof appStore.getState>['ui']['deleteCompleted'];
  boardCardIds?: string[];
  checklistBoardId?: string;
  checklistCardIds?: string[];
  hotkeys?: typeof DEFAULT_HOTKEYS;
} = {}) {
  const real = appStore.getState();
  const cards: Record<string, unknown> = {};
  for (const id of overrides.boardCardIds ?? ['board-card']) cards[id] = { id };
  const otherCards: Record<string, unknown> = {};
  for (const id of overrides.checklistCardIds ?? ['cl-card']) otherCards[id] = { id };
  const clId = overrides.checklistBoardId ?? 'cl-board';

  const fakeState = {
    ...real,
    board: { ...real.board, cards },
    boards: {
      ...real.boards,
      others: { [clId]: { cards: otherCards } },
    },
    ui: {
      ...real.ui,
      sidePanel: overrides.sidePanel ?? null,
      itemSel: overrides.itemSel ?? null,
      selection: overrides.selection ?? [],
      confirm: overrides.confirm ?? null,
      deleteCompleted: overrides.deleteCompleted ?? null,
    },
    view: {
      ...real.view,
      hotkeys: overrides.hotkeys ?? DEFAULT_HOTKEYS,
    },
  } as unknown as ReturnType<typeof appStore.getState>;

  vi.spyOn(appStore, 'getState').mockReturnValue(fakeState);
  vi.spyOn(appStore, 'checklistBoard').mockReturnValue(clId);
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveUndoAction', () => {
  it('returns null for non-undo keys', () => {
    mockAppState();
    const div = document.createElement('div');
    document.body.append(div);
    expect(resolveUndoAction(makeKeyEvent(div, 'z'))).toBeNull();
    expect(resolveUndoAction(makeKeyEvent(div, 'a', { ctrlKey: true }))).toBeNull();
    expect(resolveUndoAction(makeKeyEvent(div, 'y'))).toBeNull();
  });

  it('routes open-board Ctrl+Z / Ctrl+Y / Meta+Z / Ctrl+Shift+Z', () => {
    mockAppState();
    const div = document.createElement('div');
    document.body.append(div);

    expect(resolveUndoAction(makeKeyEvent(div, 'z', { ctrlKey: true }))).toBe(appStore.undo);
    expect(resolveUndoAction(makeKeyEvent(div, 'z', { metaKey: true }))).toBe(appStore.undo);
    expect(resolveUndoAction(makeKeyEvent(div, 'y', { ctrlKey: true }))).toBe(appStore.redo);
    expect(resolveUndoAction(makeKeyEvent(div, 'y', { metaKey: true }))).toBe(appStore.redo);

    const shiftZ = resolveUndoAction(makeKeyEvent(div, 'z', { ctrlKey: true, shiftKey: true }));
    expect(typeof shiftZ).toBe('function');
    expect(shiftZ).not.toBe(appStore.undo);
    expect(shiftZ).not.toBe(appStore.redo);
  });

  it('leaves typing undo to the browser and swallows other keys while a modal covers the board', () => {
    mockAppState();
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    const input = document.createElement('input');
    const button = document.createElement('button');
    modal.append(input, button);
    document.body.append(modal);

    expect(resolveUndoAction(makeKeyEvent(input, 'z', { ctrlKey: true }))).toBe('browser');
    expect(resolveUndoAction(makeKeyEvent(input, 'y', { ctrlKey: true }))).toBe('browser');

    const onBtn = resolveUndoAction(makeKeyEvent(button, 'z', { ctrlKey: true }));
    expect(typeof onBtn).toBe('function');
    expect(onBtn).not.toBe(appStore.undo);
  });

  it('leaves unsaved habit/weight/rename panel boxes to the browser, except an empty weight box', () => {
    mockAppState({ sidePanel: 'habits' });
    const panel = document.createElement('aside');
    panel.className = 'side-panel';
    const habitNew = document.createElement('div');
    habitNew.className = 'habit-new';
    const habitInput = document.createElement('input');
    habitInput.value = 'Run';
    habitNew.append(habitInput);

    const weightNew = document.createElement('div');
    weightNew.className = 'weight-new';
    const weightInput = document.createElement('input');
    weightInput.value = '70';
    weightNew.append(weightInput);

    const rename = document.createElement('div');
    rename.className = 'jn-rename';
    const renameInput = document.createElement('input');
    renameInput.value = 'Title';
    rename.append(renameInput);

    panel.append(habitNew, weightNew, rename);
    document.body.append(panel);

    expect(resolveUndoAction(makeKeyEvent(habitInput, 'z', { ctrlKey: true }))).toBe('browser');
    expect(resolveUndoAction(makeKeyEvent(weightInput, 'z', { ctrlKey: true }))).toBe('browser');
    expect(resolveUndoAction(makeKeyEvent(renameInput, 'y', { ctrlKey: true }))).toBe('browser');

    // Empty weight box (just saved) steps Habits history instead of browser undo.
    weightInput.value = '';
    expect(resolveUndoAction(makeKeyEvent(weightInput, 'z', { ctrlKey: true }))).toBe(appStore.undoHabits);
    expect(resolveUndoAction(makeKeyEvent(weightInput, 'y', { ctrlKey: true }))).toBe(appStore.redoHabits);
  });

  it('routes Completed, Habits and Journal side panels to their own histories', () => {
    const panel = document.createElement('aside');
    panel.className = 'side-panel';
    const btn = document.createElement('button');
    panel.append(btn);
    const outside = document.createElement('div');
    document.body.append(panel, outside);

    mockAppState({ sidePanel: 'completed' });
    expect(resolveUndoAction(makeKeyEvent(btn, 'z', { ctrlKey: true }))).toBe(appStore.undoCompleted);
    expect(resolveUndoAction(makeKeyEvent(btn, 'y', { ctrlKey: true }))).toBe(appStore.redoCompleted);
    expect(resolveUndoAction(makeKeyEvent(outside, 'z', { ctrlKey: true }))).toBe(appStore.undo);

    mockAppState({ sidePanel: 'habits' });
    expect(resolveUndoAction(makeKeyEvent(btn, 'z', { ctrlKey: true }))).toBe(appStore.undoHabits);
    expect(resolveUndoAction(makeKeyEvent(btn, 'y', { ctrlKey: true }))).toBe(appStore.redoHabits);

    mockAppState({ sidePanel: 'journal' });
    expect(resolveUndoAction(makeKeyEvent(btn, 'z', { ctrlKey: true }))).toBe(appStore.undoJournal);
    expect(resolveUndoAction(makeKeyEvent(btn, 'y', { ctrlKey: true }))).toBe(appStore.redoJournal);
  });

  it('routes Checklist panel, its scoped popovers, and items selected in it to checklist history', () => {
    const fakePanelStore = makeFakePanelStore() as unknown as FakeStore;
    vi.spyOn(appStore, 'storeFor').mockReturnValue(fakePanelStore);
    mockAppState({ itemSel: { cardId: 'cl-card', anchor: 'i1', ids: ['i1'] } });

    const clPanel = document.createElement('aside');
    clPanel.className = 'checklist-panel';
    const clBtn = document.createElement('button');
    clPanel.append(clBtn);

    const scopeEl = document.createElement('div');
    scopeEl.setAttribute('data-checklist-scope', '');
    const scopeBtn = document.createElement('button');
    scopeEl.append(scopeBtn);

    const canvas = document.createElement('div');
    canvas.setAttribute('data-testid', 'canvas');
    const boardInput = document.createElement('input');
    document.body.append(clPanel, scopeEl, canvas, boardInput);

    // Inside .checklist-panel
    expect(resolveUndoAction(makeKeyEvent(clBtn, 'z', { ctrlKey: true }))).toBe(appStore.undoChecklist);
    expect(resolveUndoAction(makeKeyEvent(clBtn, 'y', { ctrlKey: true }))).toBe(appStore.redoChecklist);
    // Inside [data-checklist-scope] (e.g., time picker)
    expect(resolveUndoAction(makeKeyEvent(scopeBtn, 'z', { ctrlKey: true }))).toBe(appStore.undoChecklist);
    // Focus on document.body with itemSel in checklist board
    expect(resolveUndoAction(makeKeyEvent(document.body, 'z', { ctrlKey: true }))).toBe(appStore.undoChecklist);
    // Focus on the board canvas or a text field outside the panel uses board undo
    expect(resolveUndoAction(makeKeyEvent(canvas, 'z', { ctrlKey: true }))).toBe(appStore.undo);
    expect(resolveUndoAction(makeKeyEvent(boardInput, 'z', { ctrlKey: true }))).toBe(appStore.undo);
  });

  it('routes Google Calendar panel undo/redo (including Ctrl+Shift+Z) and leaves .cal-form inputs to the browser', () => {
    mockAppState({ sidePanel: 'calendar' });
    const form = document.createElement('form');
    form.className = 'cal-form';
    const input = document.createElement('input');
    const submit = document.createElement('button');
    form.append(input, submit);
    const body = document.createElement('div');
    document.body.append(form, body);

    expect(resolveUndoAction(makeKeyEvent(input, 'z', { ctrlKey: true }))).toBe('browser');
    const onSubmit = resolveUndoAction(makeKeyEvent(submit, 'z', { ctrlKey: true }));
    expect(typeof onSubmit).toBe('function');
    expect(onSubmit).not.toBe(appStore.undo);
    expect(onSubmit).not.toBe(calendar.undoLast);

    // Calendar newer than board -> calendar undo/redo (and Ctrl+Shift+Z redoes calendar!)
    vi.spyOn(appStore, 'undoMarks').mockReturnValue({ undo: 1, redo: 1, changed: 1 });
    vi.spyOn(calendar, 'marks').mockReturnValue({ undo: 5, redo: 5 });
    expect(resolveUndoAction(makeKeyEvent(body, 'z', { ctrlKey: true }))).toBe(calendar.undoLast);
    expect(resolveUndoAction(makeKeyEvent(body, 'y', { ctrlKey: true }))).toBe(calendar.redo);
    expect(resolveUndoAction(makeKeyEvent(body, 'z', { ctrlKey: true, shiftKey: true }))).toBe(calendar.redo);

    // Board newer than calendar -> falls back to board undo/redo (and Ctrl+Shift+Z is a no-op)
    vi.spyOn(appStore, 'undoMarks').mockReturnValue({ undo: 10, redo: 10, changed: 10 });
    expect(resolveUndoAction(makeKeyEvent(body, 'z', { ctrlKey: true }))).toBe(appStore.undo);
    expect(resolveUndoAction(makeKeyEvent(body, 'y', { ctrlKey: true }))).toBe(appStore.redo);
    const boardShiftZ = resolveUndoAction(makeKeyEvent(body, 'z', { ctrlKey: true, shiftKey: true }));
    expect(typeof boardShiftZ).toBe('function');
    expect(boardShiftZ).not.toBe(calendar.redo);
    expect(boardShiftZ).not.toBe(appStore.redo);
  });
});

describe('handleChecklistKeys', () => {
  it('formats the focused item box on the board or in the panel via the matching store', () => {
    const panelStore = makeFakePanelStore();
    vi.spyOn(appStore, 'storeFor').mockReturnValue(panelStore as unknown as FakeStore);
    const boardFormat = vi.spyOn(appStore, 'formatBoxes').mockImplementation(() => {});
    mockAppState();

    // Board checklist item textarea
    const boardWrap = document.createElement('div');
    boardWrap.dataset.box = 'item:board-card:i1';
    const boardTa = document.createElement('textarea');
    boardWrap.append(boardTa);
    document.body.append(boardWrap);
    boardTa.focus();

    const eBoard = makeKeyEvent(boardTa, 'b', { ctrlKey: true });
    expect(handleChecklistKeys(eBoard, 'b', true, 'board', 'editing')).toBe(true);
    expect(eBoard.defaultPrevented).toBe(true);
    expect(boardFormat).toHaveBeenCalledWith([{ cardId: 'board-card', itemId: 'i1' }], 'bold');

    // Checklist panel item textarea
    const panelWrap = document.createElement('div');
    panelWrap.dataset.box = 'item:cl-card:i2';
    const panelTa = document.createElement('textarea');
    panelWrap.append(panelTa);
    document.body.append(panelWrap);
    panelTa.focus();

    const ePanel = makeKeyEvent(panelTa, 'i', { ctrlKey: true });
    expect(handleChecklistKeys(ePanel, 'i', true, 'panel', 'editing')).toBe(true);
    expect(ePanel.defaultPrevented).toBe(true);
    expect(panelStore.formatBoxes).toHaveBeenCalledWith([{ cardId: 'cl-card', itemId: 'i2' }], 'italic');
  });

  it('swallows Alt+arrows in the Checklist panel without jumping board cards', () => {
    mockAppState();
    const div = document.createElement('div');
    document.body.append(div);

    const e = makeKeyEvent(div, 'ArrowLeft', { altKey: true });
    expect(handleChecklistKeys(e, 'arrowleft', false, 'panel', 'editing')).toBe(true);
    expect(e.defaultPrevented).toBe(true);
  });

  it('handles Ctrl+A step 2 in a checklist item textarea when all text is already selected', () => {
    const panelStore = makeFakePanelStore();
    vi.spyOn(appStore, 'storeFor').mockReturnValue(panelStore as unknown as FakeStore);
    const boardSelectAll = vi.spyOn(appStore, 'selectWholeList').mockImplementation(() => {});
    mockAppState();

    const makeItemField = (cardId: string) => {
      const card = document.createElement('article');
      card.dataset.cardId = cardId;
      const item = document.createElement('div');
      item.dataset.itemId = 'i1';
      const ta = document.createElement('textarea');
      ta.value = 'hello';
      item.append(ta);
      card.append(item);
      document.body.append(card);
      ta.focus();
      return ta;
    };

    const boardTa = makeItemField('board-card');
    boardTa.setSelectionRange(0, 3); // partial selection -> browser handles
    expect(handleChecklistKeys(makeKeyEvent(boardTa, 'a', { ctrlKey: true }), 'a', true, 'board', 'editing')).toBe(false);
    expect(boardSelectAll).not.toHaveBeenCalled();

    boardTa.setSelectionRange(0, 5); // full selection -> selects whole list
    const eBoard = makeKeyEvent(boardTa, 'a', { ctrlKey: true });
    expect(handleChecklistKeys(eBoard, 'a', true, 'board', 'editing')).toBe(true);
    expect(eBoard.defaultPrevented).toBe(true);
    expect(boardSelectAll).toHaveBeenCalledWith('board-card');

    const panelTa = makeItemField('cl-card');
    panelTa.setSelectionRange(0, 5);
    const ePanel = makeKeyEvent(panelTa, 'a', { ctrlKey: true });
    expect(handleChecklistKeys(ePanel, 'a', true, 'panel', 'editing')).toBe(true);
    expect(panelStore.selectWholeList).toHaveBeenCalledWith('cl-card');
  });

  it('routes item-selection keys and word-highlight typing to appStore on the board and storeOfCard in the panel', () => {
    const panelStore = makeFakePanelStore();
    panelStore.pasteItems.mockReturnValue(true);
    vi.spyOn(appStore, 'storeFor').mockReturnValue(panelStore as unknown as FakeStore);

    const boardSelectStep = vi.spyOn(appStore, 'selectAllStep').mockImplementation(() => {});
    const boardDelete = vi.spyOn(appStore, 'deleteSelectedItems').mockReturnValue(true);
    const boardTab = vi.spyOn(appStore, 'tabSelectedItems').mockImplementation(() => {});
    const boardCopy = vi.spyOn(appStore, 'copyItems').mockReturnValue(true);
    const boardCut = vi.spyOn(appStore, 'cutItems').mockReturnValue(true);
    const boardPaste = vi.spyOn(appStore, 'pasteItems').mockReturnValue(true);
    const boardClear = vi.spyOn(appStore, 'clearItemSelection').mockImplementation(() => {});
    const boardEnterWords = vi.spyOn(appStore, 'enterOverWords').mockReturnValue(true);
    const boardDeleteWords = vi.spyOn(appStore, 'deleteWords').mockReturnValue(true);

    const div = document.createElement('div');
    document.body.append(div);

    const words = { anchor: { id: 'i1', offset: 0 }, focus: { id: 'i2', offset: 2 } };

    // Board item selection with word highlight
    mockAppState({
      itemSel: { cardId: 'board-card', anchor: 'i1', ids: ['i1', 'i2'], words },
    });
    expect(handleChecklistKeys(makeKeyEvent(div, 'Enter'), 'enter', false, 'board', 'items')).toBe(true);
    expect(boardEnterWords).toHaveBeenCalledTimes(1);

    expect(handleChecklistKeys(makeKeyEvent(div, 'x'), 'x', false, 'board', 'items')).toBe(true);
    expect(boardDeleteWords).toHaveBeenCalledWith('x');

    expect(handleChecklistKeys(makeKeyEvent(div, 'Delete'), 'delete', false, 'board', 'items')).toBe(true);
    expect(boardDelete).toHaveBeenCalledTimes(1);

    expect(handleChecklistKeys(makeKeyEvent(div, 'a', { ctrlKey: true }), 'a', true, 'board', 'items')).toBe(true);
    expect(boardSelectStep).toHaveBeenCalledTimes(1);

    expect(handleChecklistKeys(makeKeyEvent(div, 'Tab', { shiftKey: true }), 'tab', false, 'board', 'items')).toBe(true);
    expect(boardTab).toHaveBeenCalledWith(true);

    expect(handleChecklistKeys(makeKeyEvent(div, 'c', { ctrlKey: true }), 'c', true, 'board', 'items')).toBe(true);
    expect(boardCopy).toHaveBeenCalledTimes(1);

    expect(handleChecklistKeys(makeKeyEvent(div, 'x', { ctrlKey: true }), 'x', true, 'board', 'items')).toBe(true);
    expect(boardCut).toHaveBeenCalledTimes(1);

    expect(handleChecklistKeys(makeKeyEvent(div, 'v', { ctrlKey: true }), 'v', true, 'board', 'items')).toBe(true);
    expect(boardPaste).toHaveBeenCalledTimes(1);

    expect(handleChecklistKeys(makeKeyEvent(div, 'Escape'), 'escape', false, 'board', 'items')).toBe(true);
    expect(boardClear).toHaveBeenCalledTimes(1);

    // Checklist panel item selection: Ctrl+A calls selectWholeList, everything routes to panelStore
    mockAppState({
      itemSel: { cardId: 'cl-card', anchor: 'i1', ids: ['i1', 'i2'], words },
    });
    expect(handleChecklistKeys(makeKeyEvent(div, 'a', { ctrlKey: true }), 'a', true, 'panel', 'items')).toBe(true);
    expect(panelStore.selectWholeList).toHaveBeenCalledWith('cl-card');
    expect(boardSelectStep).toHaveBeenCalledTimes(1); // unchanged

    expect(handleChecklistKeys(makeKeyEvent(div, 'y'), 'y', false, 'panel', 'items')).toBe(true);
    expect(panelStore.deleteWords).toHaveBeenCalledWith('y');

    expect(handleChecklistKeys(makeKeyEvent(div, 'Backspace'), 'backspace', false, 'panel', 'items')).toBe(true);
    expect(panelStore.deleteSelectedItems).toHaveBeenCalledTimes(1);

    expect(handleChecklistKeys(makeKeyEvent(div, 'v', { ctrlKey: true }), 'v', true, 'panel', 'items')).toBe(true);
    expect(panelStore.pasteItems).toHaveBeenCalledTimes(1);
  });

  it('deletes a focused checklist item button on Delete/Backspace with board selection guard', () => {
    const panelStore = makeFakePanelStore();
    vi.spyOn(appStore, 'storeFor').mockReturnValue(panelStore as unknown as FakeStore);
    const boardTrash = vi.spyOn(appStore, 'trashItem').mockReturnValue(true);
    const boardDeleteSel = vi.spyOn(appStore, 'deleteSelectedItems').mockReturnValue(true);

    const makeCheckbox = (cardId: string, itemId: string) => {
      const card = document.createElement('article');
      card.dataset.cardId = cardId;
      const item = document.createElement('div');
      item.dataset.itemId = itemId;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      item.append(cb);
      card.append(item);
      document.body.append(card);
      return cb;
    };

    const boardCb = makeCheckbox('board-card', 'i1');
    // Another card is also selected -> board does NOT trash just this item
    mockAppState({ selection: ['board-card', 'other-card'] });
    expect(handleChecklistKeys(makeKeyEvent(boardCb, 'Delete'), 'delete', false, 'board', 'items')).toBe(false);
    expect(boardTrash).not.toHaveBeenCalled();

    // Only this card (or none) selected -> trashes this item
    mockAppState({ selection: ['board-card'] });
    expect(handleChecklistKeys(makeKeyEvent(boardCb, 'Delete'), 'delete', false, 'board', 'items')).toBe(true);
    expect(boardTrash).toHaveBeenCalledWith('board-card', 'i1');

    // In Checklist panel: trashes the focused panel item even when another card or board itemSel is selected on the board
    const panelCb = makeCheckbox('cl-card', 'i9');
    mockAppState({
      selection: ['other-card'],
      itemSel: { cardId: 'board-card', anchor: 'i1', ids: ['i1'] },
    });
    expect(handleChecklistKeys(makeKeyEvent(panelCb, 'Backspace'), 'backspace', false, 'panel')).toBe(true);
    expect(panelStore.trashItem).toHaveBeenCalledWith('cl-card', 'i9');
    expect(boardDeleteSel).not.toHaveBeenCalled();
  });

  it('handles Escape out of text fields only inside cards/columns on the board, and for any field in the panel', () => {
    mockAppState();
    const toolbarInput = document.createElement('input');
    const card = document.createElement('article');
    card.dataset.cardId = 'board-card';
    const cardInput = document.createElement('textarea');
    card.append(cardInput);
    const panel = document.createElement('aside');
    panel.className = 'checklist-panel';
    const panelInput = document.createElement('textarea');
    panel.append(panelInput);
    document.body.append(toolbarInput, card, panel);

    expect(handleChecklistKeys(makeKeyEvent(toolbarInput, 'Escape'), 'escape', false, 'board', 'editing')).toBe(false);
    expect(handleChecklistKeys(makeKeyEvent(cardInput, 'Escape'), 'escape', false, 'board', 'editing')).toBe(true);
    expect(handleChecklistKeys(makeKeyEvent(panelInput, 'Escape'), 'escape', false, 'panel', 'editing')).toBe(true);
  });

  it('does not route checklist-panel itemSel to panelStore when called in board scope', () => {
    const panelStore = makeFakePanelStore();
    vi.spyOn(appStore, 'storeFor').mockReturnValue(panelStore as unknown as FakeStore);
    const boardDelete = vi.spyOn(appStore, 'deleteSelectedItems').mockReturnValue(false);
    mockAppState({ itemSel: { cardId: 'cl-card', anchor: 'i1', ids: ['i1'] } });

    const canvas = document.createElement('div');
    canvas.setAttribute('data-testid', 'canvas');
    document.body.append(canvas);

    handleChecklistKeys(makeKeyEvent(canvas, 'Delete'), 'delete', false, 'board', 'items');
    expect(panelStore.deleteSelectedItems).not.toHaveBeenCalled();
    expect(boardDelete).toHaveBeenCalledTimes(1);
  });
});
