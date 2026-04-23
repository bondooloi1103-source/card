import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LiveRoomNew from '@/pages/LiveRoomNew';

vi.mock('@/lib/gameApi', () => ({ createSession: vi.fn() }));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { createSession } from '@/lib/gameApi';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games/quotes/live/new" element={<LiveRoomNew />} />
        <Route path="/games/quotes/live/:code" element={<div data-testid="lobby-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('LiveRoomNew', () => {
  it('creates session with mode=live_room on submit', async () => {
    createSession.mockResolvedValue({ id: 's1', seed: 'S', join_code: 'KHANAX', share_path: '/games/quotes/live/KHANAX' });
    renderAt('/games/quotes/live/new');
    fireEvent.click(screen.getByRole('button', { name: /live.new.submit/i }));
    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ mode: 'live_room' }));
    });
  });

  it('navigates to /games/quotes/live/<join_code> after success', async () => {
    createSession.mockResolvedValue({ id: 's1', seed: 'S', join_code: 'KHANAX', share_path: '/games/quotes/live/KHANAX' });
    renderAt('/games/quotes/live/new');
    fireEvent.click(screen.getByRole('button', { name: /live.new.submit/i }));
    await waitFor(() => expect(screen.getByTestId('lobby-stub')).toBeInTheDocument());
  });
});
