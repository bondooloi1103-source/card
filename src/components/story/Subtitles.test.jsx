import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Subtitles, { chunkText } from '@/components/story/Subtitles';

describe('chunkText', () => {
  it('splits on sentence boundaries', () => {
    const chunks = chunkText('First sentence. Second sentence. Third sentence.');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatch(/First sentence\./);
  });

  it('handles empty input', () => {
    expect(chunkText('')).toEqual([]);
  });
});

describe('Subtitles', () => {
  it('renders the first chunk at charIndex 0', () => {
    render(<Subtitles text="First sentence. Second sentence." charIndex={0} />);
    expect(screen.getByText(/First sentence/)).toBeInTheDocument();
  });

  it('advances to a later chunk as charIndex grows', () => {
    render(<Subtitles text="First sentence. Second sentence." charIndex={20} />);
    expect(screen.getByText(/Second sentence/)).toBeInTheDocument();
  });

  it('renders full text when static is true', () => {
    render(<Subtitles text="One sentence." charIndex={0} static />);
    expect(screen.getByText(/One sentence/)).toBeInTheDocument();
  });
});
