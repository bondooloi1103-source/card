import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LangProvider } from '@/lib/i18n';

const mockInvoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a) => mockInvoke(...a) } },
}));

import ARTargetUploader from '@/components/admin/ARTargetUploader';

const figures = [
  { fig_id: 1, ico: '👑', name: 'Чингис Хаан' },
  { fig_id: 2, ico: '👑', name: 'Хубилай Хаан' },
];

beforeEach(() => mockInvoke.mockReset());

describe('ARTargetUploader', () => {
  it('renders a row per figure with status', () => {
    render(
      <LangProvider>
        <ARTargetUploader
          figures={figures}
          videosById={{
            1: { url: 'video1', arTargetPath: '1/target-1.mind' },
            2: { url: 'video2', arTargetPath: null },
          }}
          onChange={() => {}}
        />
      </LangProvider>,
    );
    expect(screen.getByText('Чингис Хаан')).toBeInTheDocument();
    expect(screen.getByText('Хубилай Хаан')).toBeInTheDocument();
    expect(screen.getByTestId('ar-action-1').textContent).toMatch(/Солих|Replace/i);
    expect(screen.getByTestId('ar-action-2').textContent).toMatch(/.mind/i);
  });

  it('disables upload when figure has no video uploaded yet', () => {
    render(
      <LangProvider>
        <ARTargetUploader
          figures={[{ fig_id: 3, ico: '👑', name: 'Бат Хаан' }]}
          videosById={{}}
          onChange={() => {}}
        />
      </LangProvider>,
    );
    expect(screen.getByTestId('ar-action-3')).toBeDisabled();
  });

  it('rejects non-.mind files client-side', async () => {
    const onChange = vi.fn();
    render(
      <LangProvider>
        <ARTargetUploader
          figures={[figures[1]]}
          videosById={{ 2: { url: 'video2', arTargetPath: null } }}
          onChange={onChange}
        />
      </LangProvider>,
    );
    const input = screen.getByTestId('ar-target-file-input-2');
    const bad = new File(['x'], 'foo.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [bad] } });
    expect(mockInvoke).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/.mind|extension/i);
    });
  });

  it('invokes upload-figure-ar-target with action + fig_id when .mind file picked', async () => {
    const onChange = vi.fn();
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    render(
      <LangProvider>
        <ARTargetUploader
          figures={[figures[1]]}
          videosById={{ 2: { url: 'video2', arTargetPath: null } }}
          onChange={onChange}
        />
      </LangProvider>,
    );
    const input = screen.getByTestId('ar-target-file-input-2');
    const file = new File([new Uint8Array([1, 2, 3])], 'card.mind', { type: 'application/octet-stream' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith(
      'upload-figure-ar-target',
      expect.objectContaining({ body: expect.any(FormData) }),
    ));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
