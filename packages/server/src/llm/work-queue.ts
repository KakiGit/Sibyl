import { logger } from "@sibyl/shared";

export type WorkQueueItem = {
  id: string;
  operation: string;
  description: string;
  startedAt: number;
};

export type WorkQueueStatus = {
  active: boolean;
  queueLength: number;
  currentItem: WorkQueueItem | null;
};

class WorkQueue {
  private queue: Array<{
    id: string;
    operation: string;
    description: string;
    task: () => Promise<unknown>;
  }> = [];
  private currentItem: WorkQueueItem | null = null;
  private processing = false;
  private listeners: Set<(status: WorkQueueStatus) => void> = new Set();

  enqueue<T>(
    operation: string,
    description: string,
    task: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      
      this.queue.push({
        id,
        operation,
        description,
        task: async () => {
          try {
            const result = await task();
            resolve(result as T);
            return result;
          } catch (error) {
            reject(error);
            throw error;
          }
        },
      });

      logger.debug("Work queue item added", { id, operation, queueLength: this.queue.length });
      this.notifyListeners();
      
      if (!this.processing) {
        this.processNext();
      }
    });
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      this.currentItem = null;
      this.notifyListeners();
      logger.debug("Work queue empty, processing stopped");
      return;
    }

    this.processing = true;
    const item = this.queue.shift()!;
    
    this.currentItem = {
      id: item.id,
      operation: item.operation,
      description: item.description,
      startedAt: Date.now(),
    };
    
    this.notifyListeners();
    logger.info("Processing work queue item", { id: item.id, operation: item.operation });

    try {
      await item.task();
      logger.info("Work queue item completed", { id: item.id, operation: item.operation });
    } catch (error) {
      logger.error("Work queue item failed", { id: item.id, operation: item.operation, error: (error as Error).message });
    }

    this.currentItem = null;
    this.notifyListeners();
    
    this.processNext();
  }

  getStatus(): WorkQueueStatus {
    return {
      active: this.processing || this.queue.length > 0,
      queueLength: this.queue.length + (this.currentItem ? 1 : 0),
      currentItem: this.currentItem,
    };
  }

  subscribe(listener: (status: WorkQueueStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export const llmWorkQueue = new WorkQueue();