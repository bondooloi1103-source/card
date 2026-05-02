import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Collection from '@/pages/Collection';

const mockUseOwnedFigures = vi.fn();
vi.mock('@/hooks/useOwnedFigures', () => ({ useOwnedFigures: (...a) => mockUseOwnedFigures(...a) }));
vi.mock('@/lib/authStore', () => ({ currentSession: () => ({ account_id: 'u1' }) }));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return { ...actual, useLang: () => ({ t: (k) => k, lang: 'mn', setLang: vi.fn() }) };
});

beforeEach(() => { mockUseOwnedFigures.mockReset(); });

function renderPage() {
  return render(<MemoryRouter><Collection /></MemoryRouter>);
}

describe('Collection', () => {
  it('renders empty state with scan CTA when no figures owned', () => {
    mockUseOwnedFigures.mockReturnValue({ figIds: [], loading: false, error: null });
    renderPage();
    expect(screen.getByText(/Цуглуулгаа эхлүүл/)).toBeInTheDocument();
    const scanLink = screen.getByRole('link', { name: /Карт уншуулах/ });
    expect(scanLink).toHaveAttribute('href', '/ar');
    const allLink = screen.getByRole('link', { name: /Бүх дүрсийг үзэх/ });
    expect(allLink).toHaveAttribute('href', '/figures');
  });

  it('renders the owned figures grid with names and a tile per figure', () => {
    mockUseOwnedFigures.mockReturnValue({ figIds: [1, 3, 14], loading: false, error: null });
    renderPage();
    expect(screen.getByText('Чингис Хаан')).toBeInTheDocument();
    expect(screen.getByText('Хубилай Хаан')).toBeInTheDocument();
    expect(screen.getByText('Бөртэ Үжин')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Чингис Хаан/i })).toBeInTheDocument();
  });

  it('renders a loading state while loading', () => {
    mockUseOwnedFigures.mockReturnValue({ figIds: [], loading: true, error: null });
    renderPage();
    expect(screen.getByText(/Уншиж байна/)).toBeInTheDocument();
  });
});
