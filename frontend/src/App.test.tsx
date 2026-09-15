import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('presents the HSS Finance foundation screen', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'HSS Finance' })).toBeInTheDocument();
    expect(screen.getByText('Gestão financeira familiar')).toBeInTheDocument();
    expect(screen.getByText(/aplicação está em construção/i)).toBeInTheDocument();
  });
});
