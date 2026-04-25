import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { authStoreMock, notifyMocks } = vi.hoisted(() => ({
  authStoreMock: {
    checkInviteCode: vi.fn(),
    registerWithCode: vi.fn(),
    login: vi.fn(),
    currentSession: vi.fn().mockReturnValue(null),
    bootstrapCode: vi.fn().mockResolvedValue(null),
  },
  notifyMocks: {
    error: vi.fn(), success: vi.fn(), info: vi.fn(),
    loading: vi.fn(), promise: vi.fn(), dismiss: vi.fn(), dismissAll: vi.fn(),
  },
}));
vi.mock('@/lib/authStore', () => authStoreMock);
vi.mock('@/lib/feedback', () => ({ notify: notifyMocks }));

import OtpLogin from './OtpLogin';

const renderPage = () => render(
  <MemoryRouter><OtpLogin /></MemoryRouter>,
);

beforeEach(() => {
  authStoreMock.checkInviteCode.mockReset();
  authStoreMock.registerWithCode.mockReset();
  authStoreMock.login.mockReset();
  Object.values(notifyMocks).forEach((m) => m.mockClear?.());
});

afterEach(() => { cleanup(); });

describe('OtpLogin polish', () => {
  it('error message has role=alert and aria-live=assertive', async () => {
    authStoreMock.login.mockResolvedValue({ ok: false, reason: 'bad_password' });
    renderPage();
    fireEvent.click(screen.getByText('Нэвтрэх')); // tab toggle
    const usernameInput = screen.getAllByPlaceholderText('ner')[0];
    const pwInput = screen.getAllByPlaceholderText('********')[0];
    fireEvent.change(usernameInput, { target: { value: 'u' } });
    fireEvent.change(pwInput, { target: { value: 'wrong' } });
    // Two buttons match "Нэвтрэх": the tab toggle and the submit. Pick the last (submit).
    const navAndSubmit = screen.getAllByRole('button', { name: /Нэвтрэх/ });
    fireEvent.click(navAndSubmit[navAndSubmit.length - 1]);
    await waitFor(() => {
      const errorEl = screen.getByText(/Нууц үг буруу/);
      expect(errorEl).toHaveAttribute('role', 'alert');
      expect(errorEl).toHaveAttribute('aria-live', 'assertive');
    });
  });

  it('password show/hide toggle reveals plaintext', () => {
    renderPage();
    fireEvent.click(screen.getByText('Нэвтрэх'));
    const pw = screen.getAllByPlaceholderText('********')[0];
    expect(pw).toHaveAttribute('type', 'password');
    const toggle = screen.getByLabelText(/харах|нуух/);
    fireEvent.click(toggle);
    expect(pw).toHaveAttribute('type', 'text');
  });

  it('fires success toast before navigate on login', async () => {
    authStoreMock.login.mockResolvedValue({ ok: true });
    renderPage();
    fireEvent.click(screen.getByText('Нэвтрэх'));
    const usernameInput = screen.getAllByPlaceholderText('ner')[0];
    const pwInput = screen.getAllByPlaceholderText('********')[0];
    fireEvent.change(usernameInput, { target: { value: 'u' } });
    fireEvent.change(pwInput, { target: { value: 'p' } });
    // Two buttons match "Нэвтрэх": the tab toggle and the submit. Pick the last (submit).
    const navAndSubmit = screen.getAllByRole('button', { name: /Нэвтрэх/ });
    fireEvent.click(navAndSubmit[navAndSubmit.length - 1]);
    await waitFor(() => expect(notifyMocks.success).toHaveBeenCalledWith('toast.auth.loginSuccess'));
  });
});
