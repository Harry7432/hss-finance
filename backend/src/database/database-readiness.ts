import { appDataSource } from './data-source.js';

export interface DatabaseReadiness {
  isReady(): Promise<boolean>;
}

export const databaseReadiness: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    if (!appDataSource.isInitialized) {
      return false;
    }

    try {
      await appDataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  },
};
