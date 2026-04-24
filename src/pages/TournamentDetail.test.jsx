import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TournamentDetail from '@/pages/TournamentDetail';

vi.mock('@/lib/gameApi', () => ({
  fetchTournament: vi.fn(),
  fetchTournamentLeaderboard: vi.fn(),
}));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));
vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { fetchTournament, fetchTournamentLeaderboard } from '@/lib/gameApi';

function R(id = 't1') {
  return render(
    <MemoryRouter initialEntries={[`/app/tournaments/${id}`]}>
      <Routes>
        <Route path="/app/tournaments/:id" element={<TournamentDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TournamentDetail', () => {
  it('renders leaderboard rows and medal icons for top-3 after publish', async () => {
    fetchTournament.mockResolvedValue({
      id: 't1', name: 'Spring Cup', lang: 'mn', round_size: 10,
      starts_at: '2026-04-01T00:00:00Z', ends_at: '2026-04-02T00:00:00Z',
      published: true,
    });
    fetchTournamentLeaderboard.mockResolvedValue([
      { user_id: 'u2', username: 'alpha', score: 10, total: 10, completed_at: '2026-04-01T10:00:00Z', rank: 1 },
      { user_id: 'u3', username: 'bravo', score: 9, total: 10, completed_at: '2026-04-01T10:05:00Z', rank: 2 },
      { user_id: 'u1', username: 'you',   score: 8, total: 10, completed_at: '2026-04-01T10:10:00Z', rank: 3 },
      { user_id: 'u4', username: 'delta', score: 7, total: 10, completed_at: '2026-04-01T10:20:00Z', rank: 4 },
    ]);
    R();
    await waitFor(() => expect(screen.getByText('Spring Cup')).toBeInTheDocument());
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('delta')).toBeInTheDocument();
    // Medals — the MedalIcon uses emoji labels; aria-label comes from the title prop
    expect(screen.getByLabelText(/Gold/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Silver/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Bronze/i)).toBeInTheDocument();
    // Current user row highlighted with "(you)"
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  it('does not show medals when tournament is not published', async () => {
    fetchTournament.mockResolvedValue({
      id: 't1', name: 'Running Cup', lang: 'en', round_size: 10,
      starts_at: '2026-04-01T00:00:00Z', ends_at: '2026-04-02T00:00:00Z',
      published: false,
    });
    fetchTournamentLeaderboard.mockResolvedValue([
      { user_id: 'u2', username: 'alpha', score: 10, total: 10, completed_at: '2026-04-01T10:00:00Z', rank: 1 },
    ]);
    R();
    await waitFor(() => expect(screen.getByText('Running Cup')).toBeInTheDocument());
    expect(screen.queryByLabelText(/Gold/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Results pending/i)).toBeInTheDocument();
  });

  it('shows empty state when no entries', async () => {
    fetchTournament.mockResolvedValue({
      id: 't1', name: 'Empty Cup', lang: 'mn', round_size: 10,
      starts_at: '2026-04-01T00:00:00Z', ends_at: '2026-04-02T00:00:00Z',
      published: true,
    });
    fetchTournamentLeaderboard.mockResolvedValue([]);
    R();
    await waitFor(() => expect(screen.getByText(/No entries yet/i)).toBeInTheDocument());
  });
});
