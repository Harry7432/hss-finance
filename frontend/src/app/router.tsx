import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';

import { RequireAuth } from '../auth/require-auth';
import { AuthenticatedPage } from '../pages/authenticated/authenticated-page';
import { HomePage } from '../pages/home/home-page';
import { LoginPage } from '../pages/login/login-page';
import { NotFoundPage } from '../pages/not-found/not-found-page';
import { RouteErrorPage } from '../pages/route-error/route-error-page';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Outlet />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'app',
            element: <AuthenticatedPage />,
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
];

export const appRouter = createBrowserRouter(appRoutes);
