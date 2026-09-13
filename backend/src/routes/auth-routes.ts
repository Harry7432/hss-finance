import { Router } from 'express';

import { createGetCurrentUserController } from '../controllers/get-current-user-controller.js';
import { createLoginController } from '../controllers/login-controller.js';
import { createRegisterController } from '../controllers/register-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { GetCurrentUserService } from '../services/get-current-user-service.js';
import { LoginUserService } from '../services/login-user-service.js';
import { RegisterUserService } from '../services/register-user-service.js';

export function createAuthRouter(users: UserRepository, jwtSecret: Uint8Array): Router {
  const authRouter = Router();
  const getCurrentUser = new GetCurrentUserService(users);
  const loginUser = new LoginUserService(users, jwtSecret);
  const registerUser = new RegisterUserService(users);

  authRouter.post('/login', createLoginController(loginUser));
  authRouter.post('/register', createRegisterController(registerUser));
  authRouter.get(
    '/me',
    createAuthenticationMiddleware(jwtSecret),
    createGetCurrentUserController(getCurrentUser),
  );

  return authRouter;
}
