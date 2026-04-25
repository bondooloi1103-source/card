import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Toast, notify, Toaster } from '../Toast';
import { LangProvider, STRINGS } from '@/lib/i18n';

const wrap = (ui) => (
  <LangProvider>
    <Toast />
    <Toaster />
    {ui}
  </LangProvider>
);

afterEach(() => { cleanup(); notify.dismissAll?.(); });

describe('notify / Toast', () => {
  it('resolves an i18n key against current locale', async () => {
    render(wrap(null));
    notify.success('toast.admin.saved');
    expect(await screen.findByText(STRINGS['toast.admin.saved'].mn)).toBeInTheDocument();
  });

  it('uses raw string when not a known key', async () => {
    render(wrap(null));
    notify.success('Custom message');
    expect(await screen.findByText('Custom message')).toBeInTheDocument();
  });

  it('error variant has role=alert and aria-live=assertive', async () => {
    render(wrap(null));
    notify.error('Boom');
    const el = await screen.findByText('Boom');
    const live = el.closest('[role]');
    expect(live).toHaveAttribute('role', 'alert');
    expect(live).toHaveAttribute('aria-live', 'assertive');
  });

  it('success variant has role=status and aria-live=polite', async () => {
    render(wrap(null));
    notify.success('Saved');
    const el = await screen.findByText('Saved');
    const live = el.closest('[role]');
    expect(live).toHaveAttribute('role', 'status');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('notify.error resolves Error.message when no explicit message', async () => {
    render(wrap(null));
    const err = new Error('NetworkDown');
    notify.error(err);
    expect(await screen.findByText('NetworkDown')).toBeInTheDocument();
  });

  it('notify.error falls back to fallbackKey when err.message empty', async () => {
    render(wrap(null));
    const err = new Error('');
    notify.error(err, { fallbackKey: 'toast.generic.networkError' });
    expect(await screen.findByText(STRINGS['toast.generic.networkError'].mn)).toBeInTheDocument();
  });

  it('notify.error final fallback is toast.generic.unknownError', async () => {
    render(wrap(null));
    notify.error(null);
    expect(await screen.findByText(STRINGS['toast.generic.unknownError'].mn)).toBeInTheDocument();
  });
});
