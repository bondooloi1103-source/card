import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LiveRoomLobby from './LiveRoomLobby';
import { LangProvider } from '@/lib/i18n';

vi.mock('@/lib/liveRoomApi', () => ({ startRoom: vi.fn() }));

const { notifyMocks } = vi.hoisted(() => ({
  notifyMocks: {
    error: vi.fn(), success: vi.fn(), info: vi.fn(),
    loading: vi.fn(), promise: vi.fn(), dismiss: vi.fn(), dismissAll: vi.fn(),
  },
}));
vi.mock('@/lib/feedback', () => ({ notify: notifyMocks }));

const room = {
  session: { host_user_id: 'u1', join_code: 'AB12', player_cap: 8 },
  participants: [
    { user_id: 'u1', username: 'host' },
    { user_id: 'u2', username: 'guest' },
  ],
};

beforeEach(() => { Object.values(notifyMocks).forEach((m) => m.mockClear?.()); });

describe('LiveRoomLobby', () => {
  it('does not call window.alert on start error', async () => {
    const { startRoom } = await import('@/lib/liveRoomApi');
    startRoom.mockRejectedValue(new Error('room_not_started'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <LangProvider>
        <LiveRoomLobby room={room} sessionId="s1" currentUserId="u1" />
      </LangProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /start|эхлэх/i }));
    await waitFor(() => expect(notifyMocks.error).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('renders copy + share buttons next to the join code', () => {
    render(
      <LangProvider>
        <LiveRoomLobby room={room} sessionId="s1" currentUserId="u1" />
      </LangProvider>,
    );
    expect(screen.getByRole('button', { name: /copy code|кодыг хуулах/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share link|холбоос хуваалцах/i })).toBeInTheDocument();
  });
});

function makeRoom({ eligible, hostId = 'host-uid' }) {
  return {
    session: {
      id: 'sess-1',
      join_code: 'ABCDEF',
      host_user_id: hostId,
      player_cap: 8,
      status: 'open',
      eligible_fig_ids: eligible,
    },
    participants: [{ user_id: hostId, username: 'host' }],
  };
}

describe('LiveRoomLobby roster badge', () => {
  it('renders the roster-figures badge with count when eligible_fig_ids is non-empty', () => {
    render(
      <LangProvider>
        <LiveRoomLobby room={makeRoom({ eligible: [1, 3, 4, 17, 34, 36] })}
          sessionId="sess-1" currentUserId="host-uid" />
      </LangProvider>,
    );
    expect(screen.getByText(/Roster figures|Цуглуулсан дүрсүүд/)).toBeInTheDocument();
    expect(screen.getByText(/· 6/)).toBeInTheDocument();
  });

  it('renders the All-figures badge when eligible_fig_ids is null', () => {
    render(
      <LangProvider>
        <LiveRoomLobby room={makeRoom({ eligible: null })}
          sessionId="sess-1" currentUserId="host-uid" />
      </LangProvider>,
    );
    expect(screen.getByText(/All figures|Бүгд/)).toBeInTheDocument();
  });
});
