import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('presents the HSS Finance foundation screen', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'HSS Finance' })).toBeInTheDocument();
    expect(screen.getByText('Gestão financeira familiar')).toBeInTheDocument();
    expect(screen.getByText(/aplicação está em construção/i)).toBeInTheDocument();
  });
});
