import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ARQueryRedirect from '@/pages/ARQueryRedirect';

function ui(initialUrl) {
  return (
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/ar" element={<ARQueryRedirect />} />
        <Route path="/ar/:figId" element={<div data-testid="ar-landing">{window.location.pathname}</div>} />
        <Route path="/" element={<div data-testid="home" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ARQueryRedirect', () => {
  it('numeric id → /ar/1', () => {
    render(ui('/ar?card=1'));
    expect(screen.getByTestId('ar-landing')).toBeInTheDocument();
  });

  it('canonical slug → /ar/1', () => {
    render(ui('/ar?card=GENGHIS_KHAN_001'));
    expect(screen.getByTestId('ar-landing')).toBeInTheDocument();
  });

  it('FIG_NNN shorthand → /ar/N', () => {
    render(ui('/ar?card=FIG_007'));
    expect(screen.getByTestId('ar-landing')).toBeInTheDocument();
  });

  it('unknown card → home', () => {
    render(ui('/ar?card=BOGUS_999'));
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('missing card param → home', () => {
    render(ui('/ar'));
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });
});
