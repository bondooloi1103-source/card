import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LangProvider } from '@/lib/i18n';

const mockInvoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a) => mockInvoke(...a) } },
}));

const mockPack = vi.fn();
vi.mock('@/hooks/useFigureARPack', () => ({
  useFigureARPack: (...a) => mockPack(...a),
}));

import ARPackUploader from '@/components/admin/ARPackUploader';

beforeEach(() => {
  mockInvoke.mockReset();
  mockPack.mockReset();
});

describe('ARPackUploader', () => {
  it('shows "no pack" status when ready=false and only Upload button', () => {
    mockPack.mockReturnValue({ ready: false, targetOrder: null });
    render(<LangProvider><ARPackUploader /></LangProvider>);
    expect(screen.getByText(/Багц хуулагдаагүй|No pack uploaded/i)).toBeInTheDocument();
    expect(screen.queryByTestId('ar-pack-delete-button')).toBeNull();
  });

  it('shows target count + Replace + Delete when pack present', () => {
    mockPack.mockReturnValue({ ready: true, targetOrder: [1, 2, 3, 4, 5] });
    render(<LangProvider><ARPackUploader /></LangProvider>);
    expect(screen.getByText(/5 targets/)).toBeInTheDocument();
    expect(screen.getByTestId('ar-pack-delete-button')).toBeInTheDocument();
  });

  it('rejects non-.mind file client-side', async () => {
    mockPack.mockReturnValue({ ready: false, targetOrder: null });
    render(<LangProvider><ARPackUploader /></LangProvider>);
    const input = screen.getByTestId('ar-pack-file-input');
    const bad = new File(['x'], 'pack.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [bad] } });
    expect(mockInvoke).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/.mind|extension/i);
    });
  });

  it('invokes upload-figure-ar-pack with action + file + target_order on .mind upload', async () => {
    mockPack.mockReturnValue({ ready: false, targetOrder: null });
    mockInvoke.mockResolvedValue({ data: { ok: true, target_count: 52 }, error: null });
    render(<LangProvider><ARPackUploader /></LangProvider>);
    const input = screen.getByTestId('ar-pack-file-input');
    const file = new File([new Uint8Array([1, 2, 3])], 'all-cards.mind', { type: 'application/octet-stream' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith(
      'upload-figure-ar-pack',
      expect.objectContaining({ body: expect.any(FormData) }),
    ));
  });

  it('rejects malformed JSON in target_order textarea', async () => {
    mockPack.mockReturnValue({ ready: false, targetOrder: null });
    render(<LangProvider><ARPackUploader /></LangProvider>);
    const textarea = screen.getByTestId('ar-pack-order-input');
    fireEvent.change(textarea, { target: { value: 'not json' } });
    const input = screen.getByTestId('ar-pack-file-input');
    const file = new File([new Uint8Array([1])], 'pack.mind');
    fireEvent.change(input, { target: { files: [file] } });
    expect(mockInvoke).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
