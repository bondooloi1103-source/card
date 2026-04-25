import { useEffect } from 'react';
import { Toaster, toast as hotToast } from 'react-hot-toast';
import { useLang, STRINGS } from '@/lib/i18n';

let _t = (key) => key;

function resolve(input) {
  if (input == null) return null;
  if (typeof input !== 'string') return null;
  if (STRINGS[input]) return _t(input);
  return input;
}

function resolveError(err, opts = {}) {
  if (typeof err === 'string') {
    const r = resolve(err);
    if (r) return r;
  }
  if (err instanceof Error && err.message) {
    const r = resolve(err.message);
    if (r) return r;
  }
  if (opts.fallbackKey) {
    const r = resolve(opts.fallbackKey);
    if (r) return r;
  }
  return _t('toast.generic.unknownError');
}

const ariaFor = (variant) =>
  variant === 'error'
    ? { role: 'alert', 'aria-live': 'assertive' }
    : { role: 'status', 'aria-live': 'polite' };

export const notify = {
  success(input) {
    const msg = resolve(input);
    return hotToast.success(msg, { duration: 4000, ariaProps: ariaFor('success') });
  },
  info(input) {
    const msg = resolve(input);
    return hotToast(msg, { duration: 4000, ariaProps: ariaFor('info') });
  },
  error(err, opts = {}) {
    const msg = resolveError(err, opts);
    if (import.meta.env?.DEV && err) console.error('[notify.error]', err);
    return hotToast.error(msg, { duration: 6000, ariaProps: ariaFor('error') });
  },
  loading(input) {
    const msg = resolve(input);
    return hotToast.loading(msg, { ariaProps: ariaFor('info') });
  },
  promise(promise, msgs) {
    return hotToast.promise(promise, {
      loading: resolve(msgs.loading),
      success: resolve(msgs.success),
      error: resolve(msgs.error),
    });
  },
  dismiss(id) { hotToast.dismiss(id); },
  dismissAll() { hotToast.dismiss(); },
};

export function Toast() {
  const { t } = useLang();
  useEffect(() => { _t = t; return () => { _t = (k) => k; }; }, [t]);
  return null;
}

export { Toaster };
