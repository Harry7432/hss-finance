import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';

import { RequireAuth } from '../auth/require-auth';
import { AppShell } from '../components/app-shell/app-shell';
import { CategoriesPage } from '../pages/categories/categories-page';
import { DashboardPage } from '../pages/dashboard/dashboard-page';
import { HomePage } from '../pages/home/home-page';
import { LoginPage } from '../pages/login/login-page';
import { NotFoundPage } from '../pages/not-found/not-found-page';
import { RegisterPage } from '../pages/register/register-page';
import { RouteErrorPage } from '../pages/route-error/route-error-page';
import { TransactionsPage } from '../pages/transactions/transactions-page';

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
        path: 'register',
        element: <RegisterPage />,
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                path: 'app',
                element: <DashboardPage />,
              },
              {
                path: 'app/transactions',
                element: <TransactionsPage />,
              },
              {
                path: 'app/categories',
                element: <CategoriesPage />,
              },
            ],
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
