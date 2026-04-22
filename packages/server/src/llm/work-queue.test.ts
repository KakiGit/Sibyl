import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { llmWorkQueue } from "./work-queue.js";

async function waitForQueueIdle(): Promise<void> {
  while (llmWorkQueue.getStatus().active || llmWorkQueue.getStatus().queueLength > 0) {
    await new Promise<void>((r) => setTimeout(r, 5));
  }
}

describe("Work Queue", () => {
  beforeEach(async () => {
    await waitForQueueIdle();
  });

  afterEach(async () => {
    await waitForQueueIdle();
  });

  test("initial status shows inactive queue", async () => {
    await waitForQueueIdle();
    const status = llmWorkQueue.getStatus();
    expect(status.active).toBe(false);
    expect(status.queueLength).toBe(0);
    expect(status.currentItem).toBe(null);
  });

  test("enqueue adds item to queue", async () => {
    let taskExecuted = false;
    const promise = llmWorkQueue.enqueue("test_op", "Test task", async () => {
      taskExecuted = true;
      await new Promise<void>((r) => setTimeout(r, 10));
      return "result";
    });
    
    const statusAfterEnqueue = llmWorkQueue.getStatus();
    expect(statusAfterEnqueue.active).toBe(true);
    
    const result = await promise;
    expect(result).toBe("result");
    expect(taskExecuted).toBe(true);
    
    await waitForQueueIdle();
    const statusAfterComplete = llmWorkQueue.getStatus();
    expect(statusAfterComplete.active).toBe(false);
    expect(statusAfterComplete.queueLength).toBe(0);
  });

  test("processes items sequentially", async () => {
    const executionOrder: string[] = [];
    
    const promise1 = llmWorkQueue.enqueue("op1", "Task 1", async () => {
      executionOrder.push("1-start");
      await new Promise<void>((r) => setTimeout(r, 20));
      executionOrder.push("1-end");
      return "result1";
    });
    
    const promise2 = llmWorkQueue.enqueue("op2", "Task 2", async () => {
      executionOrder.push("2-start");
      await new Promise<void>((r) => setTimeout(r, 10));
      executionOrder.push("2-end");
      return "result2";
    });
    
    await Promise.all([promise1, promise2]);
    
    expect(executionOrder).toEqual(["1-start", "1-end", "2-start", "2-end"]);
  });

  test("handles task errors", async () => {
    let errorCaught = false;
    
    try {
      await llmWorkQueue.enqueue("error_op", "Error task", async () => {
        throw new Error("Test error");
      });
    } catch (error) {
      errorCaught = true;
      expect((error as Error).message).toBe("Test error");
    }
    
    expect(errorCaught).toBe(true);
    
    await waitForQueueIdle();
    const status = llmWorkQueue.getStatus();
    expect(status.active).toBe(false);
    expect(status.queueLength).toBe(0);
  });

  test("subscribe notifies listeners on status change", async () => {
    const statusChanges: number[] = [];
    
    const unsubscribe = llmWorkQueue.subscribe((status) => {
      statusChanges.push(status.queueLength);
    });
    
    await llmWorkQueue.enqueue("notify_op", "Notify task", async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
      return "done";
    });
    
    await waitForQueueIdle();
    expect(statusChanges.length).toBeGreaterThan(0);
    
    unsubscribe();
  });

  test("currentItem contains task details", async () => {
    let capturedStatus = llmWorkQueue.getStatus();
    
    const longPromise = llmWorkQueue.enqueue("long_op", "Long task description", async () => {
      capturedStatus = llmWorkQueue.getStatus();
      await new Promise<void>((r) => setTimeout(r, 50));
      return "long-result";
    });
    
    await longPromise;
    
    expect(capturedStatus.currentItem).not.toBe(null);
    expect(capturedStatus.currentItem?.operation).toBe("long_op");
    expect(capturedStatus.currentItem?.description).toBe("Long task description");
  });
});