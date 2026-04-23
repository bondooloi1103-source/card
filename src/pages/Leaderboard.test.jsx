import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Leaderboard from '@/pages/Leaderboard';

vi.mock('@/lib/gameApi', () => ({
  fetchLeaderboard: vi.fn(),
}));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'en' }) };
});
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

import { fetchLeaderboard } from '@/lib/gameApi';

function R() {
  return render(
    <MemoryRouter>
      <Leaderboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Leaderboard', () => {
  it('fetches and shows weekly by default', async () => {
    fetchLeaderboard.mockResolvedValue([
      { user_id: 'u1', username: 'alpha', total_points: 42, games_played: 6, accuracy_pct: 84.2 },
      { user_id: 'u2', username: 'bravo', total_points: 30, games_played: 5, accuracy_pct: 75.0 },
    ]);
    R();
    await waitFor(() => {
      expect(screen.getByText('alpha')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    expect(fetchLeaderboard).toHaveBeenCalledWith('weekly', 20);
  });

  it('switches to all-time when the tab is clicked', async () => {
    fetchLeaderboard.mockResolvedValue([]);
    R();
    await waitFor(() => expect(fetchLeaderboard).toHaveBeenCalled());

    fetchLeaderboard.mockClear();
    fetchLeaderboard.mockResolvedValue([]);

    fireEvent.click(screen.getByRole('button', { name: /leaderboard.tab.all/i }));
    await waitFor(() => expect(fetchLeaderboard).toHaveBeenCalledWith('all_time', 20));
  });

  it('shows empty state', async () => {
    fetchLeaderboard.mockResolvedValue([]);
    R();
    await waitFor(() => {
      expect(screen.getByText(/leaderboard.empty/i)).toBeInTheDocument();
    });
  });
});
