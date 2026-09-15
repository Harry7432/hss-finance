import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { appRoutes } from './router';

describe('app router', () => {
  it('renders a recovery path for unknown URLs', () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/unknown'] });

    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});
