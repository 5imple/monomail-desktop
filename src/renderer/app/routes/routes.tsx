import { Navigate, RouteObject } from 'react-router-dom';

import AppLayout from '@/renderer/app/containers/layout/AppLayout';
import LinkShareLayout from '@/renderer/app/containers/layout/LinkShareLayout';
import SignInLayout from '@/renderer/app/containers/layout/SignInLayout';
// SubscriptionLayout removed — payment-free build.
import AuthGuard from '@/renderer/app/middlewares/AuthGuard';
import OnBoardingLayout from '@/renderer/app/containers/layout/OnBoardingLayout';
import ElectronGuard from '@/renderer/app/middlewares/ElectronGuard';
import MigrationLayout from '@/renderer/app/containers/layout/MigrationLayout';

// Configuration object to easily enable/disable guards
const config = {
  enableAuthGuard: true,
  enableElectronGuard: false,
  enableMigration: false // Add a flag to easily enable/disable migration mode
};

// Helper function to apply guards conditionally
const applyGuards = (
  component: JSX.Element,
  needsAuth = false,
  requiresSubscription = true
): JSX.Element => {
  let result = component;

  // Apply Auth Guard if needed and enabled
  if (needsAuth && config.enableAuthGuard) {
    result = (
      <AuthGuard to="/sign-in" requiresSubscription={requiresSubscription}>
        {result}
      </AuthGuard>
    );
  }

  // Apply Electron Guard if enabled
  if (config.enableElectronGuard) {
    result = <ElectronGuard>{result}</ElectronGuard>;
  }

  return result;
};

// Define routes
const baseRoutes: RouteObject[] = [
  {
    path: '/',
    element: applyGuards(<AppLayout />, true, false)
  },
  {
    path: '/sign-in',
    element: applyGuards(<SignInLayout />, false, false)
  },
  {
    path: '/onboarding',
    element: applyGuards(<OnBoardingLayout />, false, false) // Requires auth but not subscription
  },
  // /subscription route removed — payment-free build.
  {
    path: '/share/:id',
    // LinkShareLayout doesn't need ElectronGuard by default
    element: <LinkShareLayout />
  },
  {
    path: '/migration',
    element: <MigrationLayout endTime={new Date('2025-04-11T00:35:00-07:00')} />
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
];

// If migration is enabled, override root route to point to migration
const routes: RouteObject[] = config.enableMigration
  ? [
      {
        path: '/',
        element: <Navigate to="/migration" replace />
      },
      {
        path: '/migration',
        element: <MigrationLayout endTime={new Date('2025-07-18T20:00:00-07:00')} />
      },
      {
        path: '*',
        element: <Navigate to="/" replace />
      }
    ]
  : baseRoutes;

export default routes;
