declare global {
  namespace Express {
    interface Request {
      auth?: {
        readonly userId: string;
      };
    }
  }
}

export {};
