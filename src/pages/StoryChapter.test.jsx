import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StoryChapter from '@/pages/StoryChapter';

vi.mock('@/hooks/useNarration', () => ({
  useNarration: vi.fn(() => ({
    status: 'idle', progress: 0, charIndex: 0,
    play: vi.fn(), pause: vi.fn(), stop: vi.fn(),
    audioProps: {}, mode: 'tts', source: 'tts',
  })),
}));

vi.mock('@/hooks/useVoices', () => ({
  useVoices: vi.fn(() => ({ isLoading: false, voiceIdFor: () => null })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock('@/components/story/StoryMapPanel', () => ({
  default: () => <div data-testid="map-panel" />,
}));

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/story/:chapter" element={<StoryChapter />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { sessionStorage.clear(); });

describe('StoryChapter', () => {
  it('renders the intro slide by default', async () => {
    renderAt('/story/founding');
    await waitFor(() => expect(screen.getByText(/01 \//)).toBeInTheDocument());
  });

  it('?s= deep-link jumps to the requested slide', async () => {
    renderAt('/story/founding?s=3');
    await waitFor(() => expect(screen.getByText(/04 \//)).toBeInTheDocument());
  });

  it('next button advances slideIdx', async () => {
    renderAt('/story/founding');
    await waitFor(() => expect(screen.getByText(/01 \//)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/story\.next/i));
    await waitFor(() => expect(screen.getByText(/02 \//)).toBeInTheDocument());
  });

  it('previous at slide 0 is a no-op', async () => {
    renderAt('/story/founding');
    await waitFor(() => expect(screen.getByText(/01 \//)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/story\.prev/i));
    await waitFor(() => expect(screen.getByText(/01 \//)).toBeInTheDocument());
  });

  it('ArrowRight keyboard shortcut advances', async () => {
    renderAt('/story/founding');
    await waitFor(() => expect(screen.getByText(/01 \//)).toBeInTheDocument());
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    await waitFor(() => expect(screen.getByText(/02 \//)).toBeInTheDocument());
  });

  it('persists slideIdx to sessionStorage', async () => {
    renderAt('/story/founding');
    await waitFor(() => expect(screen.getByText(/01 \//)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/story\.next/i));
    await waitFor(() => {
      const raw = sessionStorage.getItem('story:resume');
      expect(raw).toBeTruthy();
      const saved = JSON.parse(raw);
      expect(saved.chapter).toBe('founding');
      expect(saved.slideIdx).toBe(1);
    });
  });

  it('resumes from sessionStorage when no ?s= is present', async () => {
    sessionStorage.setItem('story:resume', JSON.stringify({ chapter: 'founding', slideIdx: 2 }));
    renderAt('/story/founding');
    await waitFor(() => expect(screen.getByText(/03 \//)).toBeInTheDocument());
  });

  it('?s= overrides sessionStorage resume', async () => {
    sessionStorage.setItem('story:resume', JSON.stringify({ chapter: 'founding', slideIdx: 2 }));
    renderAt('/story/founding?s=5');
    await waitFor(() => expect(screen.getByText(/06 \//)).toBeInTheDocument());
  });
});
