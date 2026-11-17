import { useEffect } from 'react';
import { appStore } from '../store/appStore';
import { calendar } from '../store/calendar';
import type { DayKey } from '../model/calendar';
import { isTextField, panelCovers } from './textField';

/**
 * Keys in the Google Calendar panel (owner request 2026-11-17): N adds an event on the day looked at (12:00 to 13:00, as
 * its + does), T goes to today, ← and → show the week or month before or after. Only with the keyboard in the panel, never
 * while typing in a text field, and not while the event form or the guest-email question is open (`off`).
 * `add` opens the form for that day from the button given, as a click on the day's + would.
 */
export function useCalendarKeys(off: boolean, add: (day: DayKey, opener: HTMLElement) => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { shortcutsOpen, confirm, deleteCompleted, sidePanel } = appStore.getState().ui;
      if (off || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || sidePanel !== 'calendar') return;
      if (shortcutsOpen || confirm || deleteCompleted || panelCovers() || isTextField(e.target)) return;
      if (!(e.target instanceof Element && e.target.closest('.side-panel'))) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'n') {
        e.preventDefault();
        if (e.repeat) return; // a held key opens one form
        const day = calendar.get().day;
        add(day, document.querySelector<HTMLElement>(`.side-panel section[data-day="${day}"] .cal-add`) ?? (e.target as HTMLElement));
      } else if (k === 't') {
        e.preventDefault();
        void calendar.goToday();
      } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.shiftKey) {
        e.preventDefault();
        void calendar.step(k === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
}
