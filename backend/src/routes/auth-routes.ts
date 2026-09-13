import { Router } from 'express';

import { createRegisterController } from '../controllers/register-controller.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { RegisterUserService } from '../services/register-user-service.js';

export function createAuthRouter(users: UserRepository): Router {
  const authRouter = Router();
  const registerUser = new RegisterUserService(users);

  authRouter.post('/register', createRegisterController(registerUser));

  return authRouter;
}
