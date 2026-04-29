import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...a) => mockFrom(...a) },
}));

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');

import { useFigureARTarget } from '@/hooks/useFigureARTarget';

function row(video_path, ar_target_path) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: video_path == null && ar_target_path == null
              ? null
              : { fig_id: 1, video_path, ar_target_path },
            error: null,
          }),
      }),
    }),
  };
}

function wrap({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => mockFrom.mockReset());

describe('useFigureARTarget', () => {
  it('returns ready=true with videoUrl + targetUrl when both paths present', async () => {
    mockFrom.mockReturnValue(row('1/back-1.mp4', '1/target-1.mind'));
    const { result } = renderHook(() => useFigureARTarget(1), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(true);
    expect(result.current.videoUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/figure-videos/1/back-1.mp4'
    );
    expect(result.current.targetUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/figure-videos/1/target-1.mind'
    );
  });

  it('returns ready=false when video_path missing', async () => {
    mockFrom.mockReturnValue(row(null, '1/target-1.mind'));
    const { result } = renderHook(() => useFigureARTarget(1), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(false);
    expect(result.current.videoUrl).toBeNull();
  });

  it('returns ready=false when ar_target_path missing', async () => {
    mockFrom.mockReturnValue(row('1/back-1.mp4', null));
    const { result } = renderHook(() => useFigureARTarget(1), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(false);
    expect(result.current.targetUrl).toBeNull();
  });

  it('returns ready=false when row absent entirely', async () => {
    mockFrom.mockReturnValue(row(null, null));
    const { result } = renderHook(() => useFigureARTarget(1), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ready).toBe(false);
  });
});
