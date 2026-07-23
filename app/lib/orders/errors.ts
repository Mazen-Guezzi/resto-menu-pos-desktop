/**
 * Translate the wire-level error strings we see from Supabase / fetch into
 * something a restaurant owner can act on, in their language.
 *
 * The dedicated cases here match the actual DB constraints in the SwiftQR
 * schema — everything else falls through to a generic "please try again"
 * so we never surface a Postgres stack trace to the operator.
 */
export type Translator = (key: string, opts?: Record<string, unknown>) => string;

export function friendlyErrorMessage(raw: string | null | undefined, t: Translator): string {
  const src = (raw ?? '').toLowerCase();
  if (!src) return t('orders.error.generic');

  // --- DB check constraints ------------------------------------------------
  if (src.includes('dine_in_requires_table')) return t('orders.error.requiresTable');
  if (src.includes('delivery_requires_location')) return t('orders.error.requiresLocation');
  if (src.includes('delivery_requires_address')) return t('orders.error.requiresAddress');

  // --- FK / uniqueness -----------------------------------------------------
  if (src.includes('duplicate key') || src.includes('unique constraint')) {
    return t('orders.error.duplicate');
  }
  if (src.includes('foreign key')) return t('orders.error.foreignKey');

  // --- Auth / RLS ----------------------------------------------------------
  if (src.includes('permission denied') || src.includes('row-level security')) {
    return t('orders.error.permission');
  }
  if (src.includes('jwt') || src.includes('unauthorized') || src.includes('401')) {
    return t('orders.error.signedOut');
  }

  // --- Network / offline ---------------------------------------------------
  if (
    src.includes('failed to fetch') ||
    src.includes('load failed') ||
    src.includes('network') ||
    src.includes('typeerror')
  ) {
    return t('orders.error.network');
  }

  // --- Fallback ------------------------------------------------------------
  return t('orders.error.generic');
}

/**
 * Translate a single raw printer/transport error message. Used for auto-print
 * and manual print flows where we want the operator to see "no printer" or
 * "unreachable" in their own language instead of a Chromium/Node string.
 */
export function friendlyPrintErrorRaw(raw: string | null | undefined, t: Translator): string {
  const src = (raw ?? '').toLowerCase();
  if (!src) return t('orders.error.print.generic');

  if (
    src.includes('no printers available') ||
    src.includes('no printer') ||
    src.includes('printer not found')
  ) {
    return t('orders.error.print.noPrinter');
  }
  if (src.includes('econnrefused') || src.includes('connection refused')) {
    return t('orders.error.print.refused');
  }
  if (src.includes('etimedout') || src.includes('timeout')) {
    return t('orders.error.print.timeout');
  }
  if (src.includes('ehostunreach') || src.includes('enotfound') || src.includes('enetunreach')) {
    return t('orders.error.print.unreachable');
  }
  if (src.includes('usb') && (src.includes('not authorized') || src.includes('not found'))) {
    return t('orders.error.print.usbNotAuthorized');
  }
  if (src.includes('no bulk-out') || src.includes('no printer-class')) {
    return t('orders.error.print.usbIncompatible');
  }
  if (src.includes('no printer configured') || src.includes('no printer selected')) {
    return t('orders.error.print.noneConfigured');
  }
  return t('orders.error.print.generic');
}

/**
 * The router hands back errors as ["printerName: rawError", …]. Turn that
 * list into a single localized sentence prefixed with "Auto-print" or
 * "Print" so the operator knows what to fix and on which printer.
 */
export function friendlyPrintErrors(
  errors: string[],
  t: Translator,
  context: 'auto' | 'manual' = 'auto',
): string {
  if (errors.length === 0) return '';
  const parts = errors.map((raw) => {
    const idx = raw.indexOf(':');
    if (idx === -1) return friendlyPrintErrorRaw(raw, t);
    const name = raw.slice(0, idx).trim();
    const rest = raw.slice(idx + 1).trim();
    return `${name} — ${friendlyPrintErrorRaw(rest, t)}`;
  });
  const prefix =
    context === 'auto' ? t('orders.error.print.autoPrefix') : t('orders.error.print.manualPrefix');
  return `${prefix}: ${parts.join(' · ')}`;
}
