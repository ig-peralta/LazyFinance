type Success<T> = {
  value: T;
  error: null;
};

type Failure<E> = {
  value: null;
  error: E;
};

type Result<T, E> = Success<T> | Failure<E>;

/**
 * executes an asynchronous function and returns a Result object containing either the value or the error
 * @param promise - the asynchronous function to execute
 * @returns a Result object containing either the value or the error
 */
export async function settleAsync<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return { value, error: null };
  } catch (error) {
    return { value: null, error: error as E };
  }
}

/**
 * executes a synchronous function and returns a Result object containing either the value or the error
 * @param fn - the synchronous function to execute
 * @returns a Result object containing either the value or the error
 */
export function settleSync<T, E = Error>(fn: () => T): Result<T, E> {
  try {
    const value = fn();
    return { value, error: null };
  } catch (error) {
    return { value: null, error: error as E };
  }
}

