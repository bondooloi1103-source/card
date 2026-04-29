import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LangProvider } from '@/lib/i18n';

const mockHook = vi.fn();
const mockMobile = vi.fn();
vi.mock('@/hooks/useFigureARTarget', () => ({
  useFigureARTarget: (...a) => mockHook(...a),
}));
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: (...a) => mockMobile(...a),
}));
vi.mock('@/components/ar/MindARScene', () => ({
  default: (props) => (
    <div data-testid="mindar-scene-stub" data-fig={props.figId} />
  ),
}));
vi.mock('@/components/ar/DesktopFallback', () => ({
  default: ({ figId }) => <div data-testid="desktop-fallback-stub" data-fig={figId} />,
}));

import ARView from '@/pages/ARView';

function ui(figId) {
  return (
    <LangProvider>
      <MemoryRouter initialEntries={[`/ar/${figId}`]}>
        <Routes>
          <Route path="/ar/:figId" element={<ARView />} />
        </Routes>
      </MemoryRouter>
    </LangProvider>
  );
}

beforeEach(() => {
  mockHook.mockReset();
  mockMobile.mockReset();
});

describe('ARView', () => {
  it('shows DesktopFallback on desktop', () => {
    mockMobile.mockReturnValue(false);
    mockHook.mockReturnValue({ ready: true, loading: false, videoUrl: 'v', targetUrl: 't' });
    render(ui(7));
    expect(screen.getByTestId('desktop-fallback-stub')).toHaveAttribute('data-fig', '7');
  });

  it('shows MindARScene on mobile when assets ready', () => {
    mockMobile.mockReturnValue(true);
    mockHook.mockReturnValue({ ready: true, loading: false, videoUrl: 'v', targetUrl: 't' });
    render(ui(7));
    expect(screen.getByTestId('mindar-scene-stub')).toHaveAttribute('data-fig', '7');
  });

  it('shows assets-missing panel on mobile when not ready', () => {
    mockMobile.mockReturnValue(true);
    mockHook.mockReturnValue({ ready: false, loading: false, videoUrl: null, targetUrl: null });
    render(ui(7));
    expect(screen.getByText(/AR хараахан нээгдээгүй|AR is not available/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mindar-scene-stub')).toBeNull();
  });

  it('shows loading spinner while loading', () => {
    mockMobile.mockReturnValue(true);
    mockHook.mockReturnValue({ ready: false, loading: true });
    render(ui(7));
    expect(screen.getByTestId('ar-view-loading')).toBeInTheDocument();
  });
});
