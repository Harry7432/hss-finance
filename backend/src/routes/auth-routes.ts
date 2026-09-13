import { Router } from 'express';

import { createLoginController } from '../controllers/login-controller.js';
import { createRegisterController } from '../controllers/register-controller.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { LoginUserService } from '../services/login-user-service.js';
import { RegisterUserService } from '../services/register-user-service.js';

export function createAuthRouter(users: UserRepository, jwtSecret: Uint8Array): Router {
  const authRouter = Router();
  const loginUser = new LoginUserService(users, jwtSecret);
  const registerUser = new RegisterUserService(users);

  authRouter.post('/login', createLoginController(loginUser));
  authRouter.post('/register', createRegisterController(registerUser));

  return authRouter;
}
