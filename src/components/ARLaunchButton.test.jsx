import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LangProvider } from '@/lib/i18n';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockHook = vi.fn();
vi.mock('@/hooks/useFigureARTarget', () => ({
  useFigureARTarget: (...a) => mockHook(...a),
}));

import ARLaunchButton from '@/components/ARLaunchButton';

function ui(props) {
  return (
    <MemoryRouter>
      <LangProvider>
        <ARLaunchButton {...props} />
      </LangProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockHook.mockReset();
});

describe('ARLaunchButton', () => {
  it('renders loading state', () => {
    mockHook.mockReturnValue({ ready: false, loading: true });
    render(ui({ figId: 7, variant: 'full' }));
    expect(screen.getByTestId('ar-launch-loading')).toBeInTheDocument();
  });

  it('navigates to /ar/:figId when ready and clicked (full)', () => {
    mockHook.mockReturnValue({ ready: true, loading: false });
    render(ui({ figId: 7, variant: 'full' }));
    fireEvent.click(screen.getByRole('button', { name: /AR харах|View in AR/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/ar/7');
  });

  it('shows coming-soon disabled state when not ready', () => {
    mockHook.mockReturnValue({ ready: false, loading: false });
    render(ui({ figId: 7, variant: 'full' }));
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/Тун удахгүй|Coming soon/i);
    fireEvent.click(btn);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('compact variant renders an icon-only button with accessible label', () => {
    mockHook.mockReturnValue({ ready: true, loading: false });
    render(ui({ figId: 7, variant: 'compact' }));
    const btn = screen.getByRole('button', { name: /AR харах|View in AR/i });
    expect(btn).toHaveAttribute('data-variant', 'compact');
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith('/ar/7');
  });
});
