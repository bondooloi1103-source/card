import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DuelSummary from '@/pages/DuelSummary';

vi.mock('@/lib/gameApi', () => ({
  fetchSession: vi.fn(),
  fetchSessionResults: vi.fn(),
  createSession: vi.fn(),
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
        <Route path="/duel/:id/summary" element={<DuelSummary />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DuelSummary', () => {
  it('shows both scores side by side', async () => {
    fetchSession.mockResolvedValue({
      id: 's1',
      host_user_id: 'user-A',
      round_size: 10,
      lang: 'en',
    });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-A', score: 8, total: 10, answers: [] },
      { user_id: 'user-B', score: 7, total: 10, answers: [] },
    ]);

    renderAt('/duel/s1/summary');

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });
  });

  it('tells current user they lost when host scored higher', async () => {
    fetchSession.mockResolvedValue({
      id: 's1',
      host_user_id: 'user-A',
      round_size: 10,
      lang: 'en',
    });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-A', score: 9, total: 10, answers: [] },
      { user_id: 'user-B', score: 5, total: 10, answers: [] },
    ]);

    renderAt('/duel/s1/summary');

    await waitFor(() => {
      expect(screen.getByText(/duel.summary.theyWon/i)).toBeInTheDocument();
    });
  });

  it('shows waiting state if opponent has not played', async () => {
    fetchSession.mockResolvedValue({
      id: 's1',
      host_user_id: 'user-A',
      round_size: 10,
      lang: 'en',
    });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-B', score: 7, total: 10, answers: [] },
    ]);

    renderAt('/duel/s1/summary');

    await waitFor(() => {
      expect(screen.getByText(/duel.waiting/i)).toBeInTheDocument();
    });
  });

  it('shows tie when scores are equal', async () => {
    fetchSession.mockResolvedValue({
      id: 's1',
      host_user_id: 'user-A',
      round_size: 10,
      lang: 'en',
    });
    fetchSessionResults.mockResolvedValue([
      { user_id: 'user-A', score: 6, total: 10, answers: [] },
      { user_id: 'user-B', score: 6, total: 10, answers: [] },
    ]);

    renderAt('/duel/s1/summary');

    await waitFor(() => {
      expect(screen.getByText(/duel.summary.tie/i)).toBeInTheDocument();
    });
  });
});
