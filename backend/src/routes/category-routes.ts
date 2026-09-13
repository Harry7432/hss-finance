import { Router } from 'express';

import { createCategoryController } from '../controllers/create-category-controller.js';
import { createDeleteCategoryController } from '../controllers/delete-category-controller.js';
import { createListCategoriesController } from '../controllers/list-categories-controller.js';
import { createUpdateCategoryController } from '../controllers/update-category-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import { CreateCategoryService } from '../services/create-category-service.js';
import { DeleteCategoryService } from '../services/delete-category-service.js';
import { ListCategoriesService } from '../services/list-categories-service.js';
import { UpdateCategoryService } from '../services/update-category-service.js';

export function createCategoryRouter(
  categories: CategoryRepository,
  households: HouseholdRepository,
  jwtSecret: Uint8Array,
): Router {
  const categoryRouter = Router({ mergeParams: true });
  const createCategory = new CreateCategoryService(categories, households);
  const listCategories = new ListCategoriesService(categories, households);
  const updateCategory = new UpdateCategoryService(categories, households);
  const deleteCategory = new DeleteCategoryService(categories, households);
  const authenticate = createAuthenticationMiddleware(jwtSecret);

  categoryRouter.post('/', authenticate, createCategoryController(createCategory));
  categoryRouter.get('/', authenticate, createListCategoriesController(listCategories));
  categoryRouter.patch(
    '/:categoryId',
    authenticate,
    createUpdateCategoryController(updateCategory),
  );
  categoryRouter.delete(
    '/:categoryId',
    authenticate,
    createDeleteCategoryController(deleteCategory),
  );

  return categoryRouter;
}
