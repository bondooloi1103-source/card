import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Tournaments from '@/pages/Tournaments';

vi.mock('@/lib/gameApi', () => ({
  fetchTournaments: vi.fn(),
  fetchTournamentParticipantCounts: vi.fn(),
  fetchMyTournamentEntries: vi.fn(),
  createSession: vi.fn(),
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

import {
  fetchTournaments,
  fetchTournamentParticipantCounts,
  fetchMyTournamentEntries,
  createSession,
} from '@/lib/gameApi';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function R() {
  return render(
    <MemoryRouter>
      <Tournaments />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchTournamentParticipantCounts.mockResolvedValue({});
  fetchMyTournamentEntries.mockResolvedValue(new Set());
});

describe('Tournaments page', () => {
  it('renders active, upcoming, and past sections', async () => {
    const now = Date.now();
    fetchTournaments.mockResolvedValue([
      { id: 'a', name: 'Active T', lang: 'mn', round_size: 10,
        starts_at: new Date(now - 1000).toISOString(), ends_at: new Date(now + 3_600_000).toISOString(), published: false },
      { id: 'u', name: 'Upcoming T', lang: 'en', round_size: 10,
        starts_at: new Date(now + 3_600_000).toISOString(), ends_at: new Date(now + 7_200_000).toISOString(), published: false },
      { id: 'p', name: 'Past T', lang: 'mn', round_size: 10,
        starts_at: new Date(now - 7_200_000).toISOString(), ends_at: new Date(now - 3_600_000).toISOString(), published: true },
    ]);
    R();
    await waitFor(() => {
      expect(screen.getByText('Active T')).toBeInTheDocument();
      expect(screen.getByText('Upcoming T')).toBeInTheDocument();
      expect(screen.getByText('Past T')).toBeInTheDocument();
    });
    expect(screen.getByText(/Play/i)).toBeInTheDocument();
    expect(screen.getByText(/View leaderboard/i)).toBeInTheDocument();
  });

  it('Play button creates tournament session and navigates to quote game', async () => {
    const now = Date.now();
    fetchTournaments.mockResolvedValue([
      { id: 'a', name: 'Active T', lang: 'mn', round_size: 10,
        starts_at: new Date(now - 1000).toISOString(), ends_at: new Date(now + 3_600_000).toISOString(), published: false },
    ]);
    createSession.mockResolvedValue({ id: 'sess-1' });
    R();
    await waitFor(() => expect(screen.getByText('Active T')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Play/i }));
    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith({ mode: 'tournament', tournament_id: 'a' });
      expect(navigateMock).toHaveBeenCalledWith('/games/quotes?session=sess-1');
    });
  });

  it('shows View-your-result when user has already entered an active tournament', async () => {
    const now = Date.now();
    fetchTournaments.mockResolvedValue([
      { id: 'a', name: 'Active T', lang: 'mn', round_size: 10,
        starts_at: new Date(now - 1000).toISOString(), ends_at: new Date(now + 3_600_000).toISOString(), published: false },
    ]);
    fetchMyTournamentEntries.mockResolvedValue(new Set(['a']));
    R();
    await waitFor(() => expect(screen.getByText(/View your result/i)).toBeInTheDocument());
  });

  it('shows empty state when there are no tournaments', async () => {
    fetchTournaments.mockResolvedValue([]);
    R();
    await waitFor(() => {
      expect(screen.getByText(/No tournaments yet/i)).toBeInTheDocument();
    });
  });
});
