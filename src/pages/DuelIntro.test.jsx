import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DuelIntro from '@/pages/DuelIntro';

vi.mock('@/lib/gameApi', () => ({
  fetchSession: vi.fn(),
  fetchSessionResults: vi.fn(),
}));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-B' } }),
}));

import { fetchSession, fetchSessionResults } from '@/lib/gameApi';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/duel/:id" element={<DuelIntro />} />
        <Route path="/duel/:id/summary" element={<div>SUMMARY STUB</div>} />
        <Route path="/games/quotes" element={<div>GAME STUB</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DuelIntro', () => {
  it('shows the score-to-beat and a Play button when B has not yet played', async () => {
    fetchSession.mockResolvedValue({
      id: 's1',
      mode: 'async_duel',
      lang: 'en',
      round_size: 10,
      host_user_id: 'user-A',
      status: 'open',
    });
    fetchSessionResults.mockResolvedValue([{ user_id: 'user-A', score: 8, total: 10 }]);

    renderAt('/duel/s1');

    await waitFor(() => {
      expect(screen.getByText(/duel.intro.toBeat/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /duel.intro.start/i })).toBeInTheDocument();
      expect(screen.getByText(/^\s*8\s*$/)).toBeInTheDocument();
    });
  });

  it('redirects to summary when current user already submitted', async () => {
    fetchSession.mockResolvedValue({ id: 's1', mode: 'async_duel', status: 'complete' });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-A', score: 8, total: 10 },
      { user_id: 'user-B', score: 7, total: 10 },
    ]);

    renderAt('/duel/s1');

    await waitFor(() => {
      expect(screen.getByText('SUMMARY STUB')).toBeInTheDocument();
    });
  });

  it('shows expired message when status is abandoned', async () => {
    fetchSession.mockResolvedValue({ id: 's1', mode: 'async_duel', status: 'abandoned' });
    fetchSessionResults.mockResolvedValue([]);

    renderAt('/duel/s1');

    await waitFor(() => {
      expect(screen.getByText(/duel.expired/i)).toBeInTheDocument();
    });
  });
});
