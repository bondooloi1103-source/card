import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const { notifyMocks } = vi.hoisted(() => ({
  notifyMocks: {
    error: vi.fn(), success: vi.fn(), info: vi.fn(),
    loading: vi.fn(), promise: vi.fn((p) => p), dismiss: vi.fn(), dismissAll: vi.fn(),
  },
}));
vi.mock('@/lib/feedback', () => ({
  notify: notifyMocks,
  useDebouncedValue: (v) => v,
}));

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: vi.fn().mockResolvedValue({ id: 'a1', is_admin: true }) },
    entities: {
      Figure: {
        list: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        subscribe: vi.fn(() => () => {}),
      },
    },
    integrations: {
      Core: { UploadFile: vi.fn() },
    },
  },
}));

vi.mock('@/hooks/useAppSettings', () => ({
  useAppSettings: () => ({ settings: { site_name: '', site_logo: '' }, saveSetting: vi.fn() }),
}));

vi.mock('@/hooks/useFigureBackVideos', () => ({
  useFigureBackVideos: () => ({ data: {}, refetch: vi.fn() }),
}));

vi.mock('@/components/admin/BackVideos', () => ({
  default: () => null,
}));

vi.mock('@/lib/authStore', () => ({
  listInviteCodes: vi.fn().mockResolvedValue([]),
  createInviteCode: vi.fn(),
  deleteInviteCode: vi.fn(),
  listAccounts: vi.fn().mockResolvedValue([]),
}));

import AdminPanel from './AdminPanel';

afterEach(() => { cleanup(); document.body.style.overflow = ''; Object.values(notifyMocks).forEach((m) => m.mockClear?.()); });

describe('AdminPanel polish', () => {
  it('mounts without crashing', () => {
    render(<AdminPanel figures={[]} onClose={() => {}} onFiguresChange={() => {}} />);
    expect(screen.getByText(/Админ Панел/)).toBeInTheDocument();
  });
});
