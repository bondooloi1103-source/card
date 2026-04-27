import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Collection from '@/pages/Collection';

const mockUseOwnedFigures = vi.fn();
vi.mock('@/hooks/useOwnedFigures', () => ({ useOwnedFigures: (...a) => mockUseOwnedFigures(...a) }));
vi.mock('@/lib/authStore', () => ({ currentSession: () => ({ account_id: 'u1' }) }));

beforeEach(() => { mockUseOwnedFigures.mockReset(); });

function renderPage() {
  return render(<MemoryRouter><Collection /></MemoryRouter>);
}

describe('Collection', () => {
  it('renders empty state when no figures owned', () => {
    mockUseOwnedFigures.mockReturnValue({ figIds: [], loading: false, error: null });
    renderPage();
    expect(screen.getByText(/Карт уншуулаад цуглуулгаа эхлүүл/i)).toBeInTheDocument();
    const demoLink = screen.getByRole('link', { name: /Demo тоглоом/i });
    expect(demoLink).toHaveAttribute('href', '/games/quotes/live?demo=1');
  });

  it('renders the owned figures grid with names and tap-to-chat links', () => {
    mockUseOwnedFigures.mockReturnValue({ figIds: [1, 3, 14], loading: false, error: null });
    renderPage();
    expect(screen.getByText('Чингис Хаан')).toBeInTheDocument();
    expect(screen.getByText('Хубилай Хаан')).toBeInTheDocument();
    expect(screen.getByText('Бөртэ Үжин')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Чингис Хаан/i });
    expect(link).toHaveAttribute('href', '/c/1');
  });

  it('renders a loading state while loading', () => {
    mockUseOwnedFigures.mockReturnValue({ figIds: [], loading: true, error: null });
    renderPage();
    expect(screen.getByText(/Уншиж байна/i)).toBeInTheDocument();
  });
});
