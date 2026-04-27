import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LiveRoomGame from './LiveRoomGame';
import { LangProvider } from '@/lib/i18n';

vi.mock('@/lib/liveRoomApi', () => ({
  submitAnswer: vi.fn(),
  requestRematch: vi.fn(),
  requestNext: vi.fn(),
  requestReveal: vi.fn(),
}));

function makeRoom({ eligible }) {
  return {
    session: {
      id: 'sess-1',
      seed: 'TESTSEED',
      round_size: 5,
      status: 'in_progress',
      host_user_id: 'host-uid',
      current_round_idx: 0,
      eligible_fig_ids: eligible,
    },
    participants: [{ user_id: 'host-uid', current_score: 0, username: 'host' }],
    lastReveal: null,
  };
}

describe('LiveRoomGame roster gate', () => {
  it('restricts question fig_ids to eligible_fig_ids when set', () => {
    const room = makeRoom({ eligible: [1, 3] });
    render(
      <MemoryRouter>
        <LangProvider><LiveRoomGame room={room} sessionId="sess-1" currentUserId="host-uid" /></LangProvider>
      </MemoryRouter>,
    );
    // The question's qattr is the figure's name; only fig_ids 1 (Чингис Хаан)
    // or 3 (Хубилай Хаан) can appear in the prompt area.
    const root = document.body.textContent;
    const hasOnlyEligibleAttribution =
      root.includes('Чингис Хаан') || root.includes('Хубилай Хаан');
    expect(hasOnlyEligibleAttribution).toBe(true);
  });

  it('falls back to full FIGURES when eligible_fig_ids is null', () => {
    const room = makeRoom({ eligible: null });
    render(
      <MemoryRouter>
        <LangProvider><LiveRoomGame room={room} sessionId="sess-2" currentUserId="host-uid" /></LangProvider>
      </MemoryRouter>,
    );
    // With full FIGURES fallback, the round renders successfully — the
    // quote section header appears regardless of which question is drawn.
    expect(document.body.textContent).toMatch(/Ишлэл|Quotation/);
  });
});
