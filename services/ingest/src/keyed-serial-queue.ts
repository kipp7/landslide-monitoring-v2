export class KeyedSerialQueue<Key> {
  private readonly tails = new Map<Key, Promise<void>>();

  get activeKeyCount(): number {
    return this.tails.size;
  }

  run<Result>(key: Key, task: () => Promise<Result>): Promise<Result> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(
      () => undefined,
      () => undefined
    );

    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });

    return result;
  }

  async waitForIdle(): Promise<void> {
    while (this.tails.size > 0) {
      await Promise.all(this.tails.values());
    }
  }
}
