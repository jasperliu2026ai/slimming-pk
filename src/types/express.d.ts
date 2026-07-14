declare global {
  namespace Express {
    interface Request {
      traceId: string;
      userId?: string;
    }
  }
}

export {};
