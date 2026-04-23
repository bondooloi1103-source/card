import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Timer from '@/components/game/Timer';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Timer', () => {
  it('renders a bar with width ~100% at start', () => {
    vi.setSystemTime(new Date(0));
    render(<Timer sentAt={new Date(0)} timerS={10} onExpire={() => {}} />);
    const bar = screen.getByTestId('timer-bar');
    expect(parseFloat(bar.style.width)).toBeGreaterThan(95);
  });

  it('width shrinks over time', () => {
    vi.setSystemTime(new Date(0));
    const { rerender } = render(<Timer sentAt={new Date(0)} timerS={10} onExpire={() => {}} />);
    act(() => { vi.advanceTimersByTime(5000); });
    rerender(<Timer sentAt={new Date(0)} timerS={10} onExpire={() => {}} />);
    const bar = screen.getByTestId('timer-bar');
    expect(parseFloat(bar.style.width)).toBeLessThan(60);
    expect(parseFloat(bar.style.width)).toBeGreaterThan(40);
  });

  it('calls onExpire exactly once at deadline', () => {
    vi.setSystemTime(new Date(0));
    const onExpire = vi.fn();
    render(<Timer sentAt={new Date(0)} timerS={3} onExpire={onExpire} />);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
