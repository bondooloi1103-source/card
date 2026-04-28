import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Three.js needs WebGL which jsdom doesn't have. Mock the renderer minimally.
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  class MockRenderer {
    constructor() { this.domElement = document.createElement('canvas'); }
    setSize() {}
    setPixelRatio() {}
    setClearColor() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }
  class MockVideoTexture { constructor() {} dispose() {} }
  return { ...actual, WebGLRenderer: MockRenderer, VideoTexture: MockVideoTexture };
});

vi.mock('@/lib/cardVideoLeader', () => ({
  takeLeadership: vi.fn(),
  releaseLeadership: vi.fn(),
  getCurrentId: vi.fn(),
}));

vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual('@/lib/i18n');
  return {
    ...actual,
    useLang: () => ({ t: (k) => k, lang: 'mn' }),
  };
});

vi.mock('@/components/StoryPlayer', () => ({
  default: () => null,
}));

const figureNoVideo = {
  fig_id: 1, cat: 'khans', ico: '👑', card: 'Туз', name: 'Чингис Хаан',
  yrs: '1162-1227', role: 'X', bio: 'Y', achs: [], fact: '', quote: null, qattr: null, rel: [],
};

const figureWithVideo = {
  ...figureNoVideo,
  back_video_url: 'https://x/back.mp4',
  back_captions_url: 'https://x/back.vtt',
  back_video_duration: 30,
};

beforeEach(() => {
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ isIntersecting: true, intersectionRatio: 1, target: el }]); }
    disconnect() {}
  };

  // Prevent the rAF animation loop from firing in jsdom and overriding
  // the isFlipped-effect's setOverlayVisible(true) before tests can act.
  global.requestAnimationFrame = vi.fn(() => 0);
  global.cancelAnimationFrame = vi.fn();

  // Stub canvas 2d context so makeCardCanvas doesn't throw in jsdom
  const ctx2d = {
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    roundRect: () => {},
    drawImage: () => {},
    set fillStyle(_) {},
    set strokeStyle(_) {},
    set lineWidth(_) {},
    set font(_) {},
    set textAlign(_) {},
    set textBaseline(_) {},
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx2d);

  // Stub media element methods jsdom doesn't implement
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
  if (!HTMLMediaElement.prototype.play.mock) {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  }
});

describe('Card3D back video', () => {
  it('does not create a <video> element when no back_video_url is set', async () => {
    const Card3D = (await import('@/components/Card3D')).default;
    render(<Card3D figure={figureNoVideo} onClick={() => {}} />);
    expect(document.querySelector('video[data-card-video]')).toBeNull();
  });

  it('shows a play overlay when back_video_url is set and card is flipped', async () => {
    const Card3D = (await import('@/components/Card3D')).default;
    render(<Card3D figure={figureWithVideo} onClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ар|Нүүр/ }));
    await waitFor(() => {
      expect(screen.getByTestId('card-video-play')).toBeInTheDocument();
    });
  });

  it('clicking play creates a <video> element and calls play()', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const Card3D = (await import('@/components/Card3D')).default;
    render(<Card3D figure={figureWithVideo} onClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ар|Нүүр/ }));
    fireEvent.click(await screen.findByTestId('card-video-play'));
    await waitFor(() => {
      const video = document.querySelector('video[data-card-video]');
      expect(video).toBeTruthy();
      expect(video.src).toContain('back.mp4');
    });
    expect(playSpy).toHaveBeenCalled();
    playSpy.mockRestore();
  });

  it('mute toggle flips videoEl.muted', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const Card3D = (await import('@/components/Card3D')).default;
    render(<Card3D figure={figureWithVideo} onClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ар|Нүүр/ }));
    fireEvent.click(await screen.findByTestId('card-video-play'));
    const muteBtn = await screen.findByTestId('card-video-mute');
    fireEvent.click(muteBtn);
    const video = document.querySelector('video[data-card-video]');
    expect(video.muted).toBe(true);
  });

  it('replay button appears after ended event', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const Card3D = (await import('@/components/Card3D')).default;
    render(<Card3D figure={figureWithVideo} onClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ар|Нүүр/ }));
    fireEvent.click(await screen.findByTestId('card-video-play'));
    let video;
    await waitFor(() => {
      video = document.querySelector('video[data-card-video]');
      expect(video).toBeTruthy();
    });
    fireEvent.ended(video);
    expect(await screen.findByTestId('card-video-replay')).toBeInTheDocument();
  });
});
