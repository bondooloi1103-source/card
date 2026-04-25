import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

describe('Skeleton', () => {
  it('Card renders with aspect-[3/4] and rounded-xl', () => {
    const { container } = render(<Skeleton.Card />);
    const el = container.firstChild;
    expect(el.className).toContain('aspect-[3/4]');
    expect(el.className).toContain('rounded-xl');
    expect(el.className).toContain('animate-pulse');
  });

  it('Row renders with h-12 and w-full', () => {
    const { container } = render(<Skeleton.Row />);
    const el = container.firstChild;
    expect(el.className).toContain('h-12');
    expect(el.className).toContain('w-full');
  });

  it('Grid renders count children with default variant=card', () => {
    const { container } = render(<Skeleton.Grid count={5} />);
    const cells = container.querySelectorAll('[data-skeleton-cell]');
    expect(cells).toHaveLength(5);
    expect(cells[0].className).toContain('aspect-[3/4]');
  });

  it('Grid renders n Row cells when variant=row', () => {
    const { container } = render(<Skeleton.Grid count={3} variant="row" />);
    const cells = container.querySelectorAll('[data-skeleton-cell]');
    expect(cells).toHaveLength(3);
    expect(cells[0].className).toContain('h-12');
  });

  it('Text renders n bars', () => {
    const { container } = render(<Skeleton.Text lines={4} />);
    const bars = container.querySelectorAll('[data-skeleton-line]');
    expect(bars).toHaveLength(4);
  });

  it('Text uses default lines=3 when omitted', () => {
    const { container } = render(<Skeleton.Text />);
    expect(container.querySelectorAll('[data-skeleton-line]')).toHaveLength(3);
  });

  it('container is aria-hidden so screen readers skip it', () => {
    const { container } = render(<Skeleton.Card />);
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
  });
});
