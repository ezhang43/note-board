/** Said when code loaded on demand can't be downloaded: the site was updated and this page's files are gone. */
export const UPDATED_NOTICE = 'BusyAnts was updated. Reload the page to use this.';

/**
 * Whether an error is a failed download of code loaded on demand (`import()`), worded as Chrome,
 * Firefox and Safari word it. Offline gives the same error, and the same advice (reload) still fits.
 */
export const isStaleCodeError = (e: unknown): boolean => e instanceof Error && /dynamically imported module|importing a module script failed/i.test(e.message);
