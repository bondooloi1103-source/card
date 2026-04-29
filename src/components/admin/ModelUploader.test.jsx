import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LangProvider } from '@/lib/i18n';

const mockInvoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a) => mockInvoke(...a) } },
}));

import ModelUploader from '@/components/admin/ModelUploader';

const figures = [
  { fig_id: 1, ico: '👑', name: 'Чингис Хаан' },
  { fig_id: 2, ico: '👑', name: 'Хубилай Хаан' },
];

beforeEach(() => mockInvoke.mockReset());

describe('ModelUploader', () => {
  it('renders a row per figure with .glb status', () => {
    render(
      <LangProvider>
        <ModelUploader
          figures={figures}
          videosById={{
            1: { url: 'video1', modelPath: '1/model-1.glb' },
            2: { url: 'video2', modelPath: null },
          }}
          onChange={() => {}}
        />
      </LangProvider>,
    );
    expect(screen.getByText('Чингис Хаан')).toBeInTheDocument();
    expect(screen.getByText('Хубилай Хаан')).toBeInTheDocument();
    expect(screen.getByTestId('model-action-1').textContent).toMatch(/Солих|Replace/i);
    expect(screen.getByTestId('model-action-2').textContent).toMatch(/.glb/i);
  });

  it('disables upload when figure has no video uploaded yet', () => {
    render(
      <LangProvider>
        <ModelUploader
          figures={[{ fig_id: 3, ico: '👑', name: 'Бат Хаан' }]}
          videosById={{}}
          onChange={() => {}}
        />
      </LangProvider>,
    );
    expect(screen.getByTestId('model-action-3')).toBeDisabled();
  });

  it('rejects non-.glb/.gltf files client-side', async () => {
    const onChange = vi.fn();
    render(
      <LangProvider>
        <ModelUploader
          figures={[figures[1]]}
          videosById={{ 2: { url: 'video2', modelPath: null } }}
          onChange={onChange}
        />
      </LangProvider>,
    );
    const input = screen.getByTestId('model-file-input-2');
    const bad = new File(['x'], 'foo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [bad] } });
    expect(mockInvoke).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/.glb|extension/i);
    });
  });

  it('invokes upload-figure-model with action + fig_id when .glb file picked', async () => {
    const onChange = vi.fn();
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    render(
      <LangProvider>
        <ModelUploader
          figures={[figures[1]]}
          videosById={{ 2: { url: 'video2', modelPath: null } }}
          onChange={onChange}
        />
      </LangProvider>,
    );
    const input = screen.getByTestId('model-file-input-2');
    const file = new File([new Uint8Array([1, 2, 3])], 'genghis.glb', { type: 'model/gltf-binary' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith(
      'upload-figure-model',
      expect.objectContaining({ body: expect.any(FormData) }),
    ));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
