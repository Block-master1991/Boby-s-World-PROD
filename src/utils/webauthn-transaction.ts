/**
 * WebAuthn Transaction Manager
 *
 * Prevents multiple concurrent WebAuthn requests which can cause
 * "OperationError: A request is already pending."
 */

class WebAuthnTransactionManager {
  private static isPending = false;
  private static currentController: AbortController | null = null;

  /**
   * Start a new WebAuthn transaction.
   * Throws if another transaction is already in progress.
   */
  public static start(): AbortSignal {
    if (this.isPending) {
      throw new Error("A WebAuthn request is already pending.");
    }

    this.isPending = true;
    this.currentController = new AbortController();
    return this.currentController.signal;
  }

  /**
   * Mark the current transaction as complete.
   */
  public static complete(): void {
    this.isPending = false;
    this.currentController = null;
  }

  /**
   * Cancel the current transaction.
   */
  public static cancel(): void {
    if (this.currentController) {
      this.currentController.abort();
    }
    this.complete();
  }

  /**
   * Check if a transaction is currently pending.
   */
  public static isActive(): boolean {
    return this.isPending;
  }
}

export default WebAuthnTransactionManager;
