import { AxiosError } from 'axios';

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  shouldRetry?: (error: AxiosError) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delayMs: 500,
  backoffMultiplier: 2,
  shouldRetry: (error: AxiosError) => {
    // Retry on network errors, timeouts, and 5xx errors
    if (!error.response) return true; // Network error
    if (error.code === 'ECONNABORTED') return true; // Timeout
    return (error.response.status ?? 0) >= 500; // Server error
  },
};

/**
 * Wraps a promise-based function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      const isLastAttempt = attempt === mergedConfig.maxRetries;
      const axiosError = error as AxiosError;

      // Check if we should retry
      if (isLastAttempt || !mergedConfig.shouldRetry?.(axiosError)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = mergedConfig.delayMs * Math.pow(mergedConfig.backoffMultiplier, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Creates a reusable retry wrapper for a function
 */
export function createRetryableFunction<Args extends any[], Return>(
  fn: (...args: Args) => Promise<Return>,
  config: Partial<RetryConfig> = {}
) {
  return async (...args: Args): Promise<Return> => {
    return withRetry(() => fn(...args), config);
  };
}

/**
 * Timeout utility for promises
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private lastCallTime = 0;

  constructor(private minDelayMs: number = 100) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.process();
    });
  }

  private async process() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      if (!fn) break;

      const timeSinceLastCall = Date.now() - this.lastCallTime;
      if (timeSinceLastCall < this.minDelayMs) {
        await new Promise((resolve) => 
          setTimeout(resolve, this.minDelayMs - timeSinceLastCall)
        );
      }

      await fn();
      this.lastCallTime = Date.now();
    }

    this.isProcessing = false;
  }
}

/**
 * Circuit breaker pattern for API calls
 */
export class CircuitBreaker {
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private failureThreshold: number = 5,
    private successThreshold: number = 2,
    private resetTimeoutMs: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.lastFailureTime || 0) > this.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open - service unavailable');
      }
    }

    try {
      const result = await fn();

      if (this.state === 'half-open') {
        this.successCount++;
        if (this.successCount >= this.successThreshold) {
          this.state = 'closed';
          this.failureCount = 0;
          this.successCount = 0;
        }
      } else if (this.state === 'closed') {
        this.failureCount = Math.max(0, this.failureCount - 1);
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'open';
      }

      throw error;
    }
  }

  getState() {
    return this.state;
  }

  reset() {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }
}

/**
 * Exponential backoff calculator
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number = 100,
  maxDelayMs: number = 30000,
  jitter: boolean = true
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponentialDelay, maxDelayMs);
  
  if (jitter) {
    // Add random jitter (±10%)
    const jitterAmount = capped * 0.1;
    return capped + (Math.random() - 0.5) * 2 * jitterAmount;
  }
  
  return capped;
}
