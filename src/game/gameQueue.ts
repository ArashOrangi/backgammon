type Task = () => Promise<void>;

export class GameQueue {
  private queues = new Map<number, Promise<void>>();

  enqueue(gameId: number, task: Task) {
    const prev = this.queues.get(gameId) ?? Promise.resolve();

    const next = prev
      .catch(() => {})
      .then(async () => {
        await task();
      });

    this.queues.set(gameId, next);

    return next;
  }
}
