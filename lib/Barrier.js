/**
 * Async/Await Barrier
 *
 * // Wait for event to be emitted 5 times.
 * const barrier = new Barrier(5);
 * eventEmitter.on('event', () => {
 *   barrier.resolve();
 * });
 * await barrier.resolution();
 */
module.exports = class Barrier {
  constructor(amount) {
    this.promises = [];
    this.callbacks = [];
    Array.from(Array(amount), () => {
      this.promises.push(new Promise((resolve, reject) => {
        this.callbacks.push({ resolve, reject });
      }));
    });
  }
  resolve(data) {
    this.callbacks.pop().resolve(data);
  }
  reject(err) {
    this.callbacks.pop().reject(err);
  }
  async resolution() {
    return Promise.all(this.promises);
  }
};
