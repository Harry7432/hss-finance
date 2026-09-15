import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';

import { HomePage } from '../pages/home/home-page';
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
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
];

export const appRouter = createBrowserRouter(appRoutes);
