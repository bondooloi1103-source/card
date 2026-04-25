import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyCollection from './MyCollection';
import { LangProvider } from '@/lib/i18n';

const { useCollectionMock } = vi.hoisted(() => ({ useCollectionMock: vi.fn() }));
vi.mock('@/hooks/useCollection', () => ({ useCollection: useCollectionMock }));

const renderPage = () => render(
  <LangProvider>
    <MemoryRouter><MyCollection /></MemoryRouter>
  </LangProvider>,
);

beforeEach(() => {
  useCollectionMock.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('MyCollection', () => {
  it('renders Skeleton.Grid while loading', () => {
    useCollectionMock.mockReturnValue({
      collection: null, hasCard: () => false, earnCard: vi.fn(), total: 0, loading: true,
    });
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-skeleton-cell]').length).toBeGreaterThan(0);
  });

  it('renders EmptyState when not loading and total is 0', () => {
    useCollectionMock.mockReturnValue({
      collection: { fig_ids: [], earned_at: {} },
      hasCard: () => false, earnCard: vi.fn(), total: 0, loading: false,
    });
    renderPage();
    // EmptyState title or description (Mongolian default)
    expect(screen.getByText(/Хөзрийн|empty\.collection|codex is empty/i)).toBeInTheDocument();
  });

  it('renders grid of cards when total > 0', () => {
    useCollectionMock.mockReturnValue({
      collection: { fig_ids: [1, 2], earned_at: {} },
      hasCard: (id) => [1, 2].includes(id), earnCard: vi.fn(), total: 2, loading: false,
    });
    const { container } = renderPage();
    // At least one button (card) renders
    expect(container.querySelector('button')).toBeInTheDocument();
  });

  it('scrollIntoView called when filter changes', async () => {
    useCollectionMock.mockReturnValue({
      collection: { fig_ids: [], earned_at: {} },
      hasCard: () => false, earnCard: vi.fn(), total: 0, loading: false,
    });
    renderPage();
    Element.prototype.scrollIntoView.mockClear();
    const khansBtn = screen.getByRole('button', { name: /Хаад|Khans/ });
    fireEvent.click(khansBtn);
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );
    });
  });
});
