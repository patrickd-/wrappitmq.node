/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
const expect = require('chai').expect;
const WorkQueue = require('./..').WorkQueue;
const Barrier = require('../lib/Barrier');

const config = {
  url: process.env.AMQP_URL || 'amqp://localhost:5672',
  queue: process.env.AMQP_QUEUE || 'ipc-test',
};
const config2 = {
  url: config.url,
  queue: `${config.queue}-2`,
};
const configWithPrefetch = Object.assign({
  prefetch: 3,
}, config);

describe('WorkQueue', () => {
  const cleanUp = async () => {
    const queue1 = new WorkQueue(config);
    await queue1.connect();
    await queue1.delete();
    await queue1.close();
    const queue2 = new WorkQueue(config2);
    await queue2.connect();
    await queue2.delete();
    await queue2.close();
  };
  beforeEach(cleanUp);
  afterEach(cleanUp);

  describe('enqueue() and consume()', () => {
    it('should consume the same message we enqueue', async () => {
      const barrier = new Barrier(1);
      const prodQ = new WorkQueue(config);
      const consQ = new WorkQueue(config);
      await prodQ.connect();
      await consQ.connect();
      const originalMessage = { Test: 123, TestTest: '123', t: [{ a: 'b' }] };
      await consQ.consume(async (message) => {
        expect(message).to.deep.equal(originalMessage);
        barrier.resolve();
      });
      await prodQ.enqueue(originalMessage);
      await barrier.resolution();
      await prodQ.close();
      await consQ.close();
    });
    it('should persistently enqueue messages even if no consumer is active', async () => {
      const barrier = new Barrier(1);
      const prodQ = new WorkQueue(config);
      const consQ = new WorkQueue(config);
      await prodQ.connect();
      await consQ.connect();
      const originalMessage = { Test: 123, TestTest: '123', t: [{ a: 'b' }] };
      await prodQ.enqueue(originalMessage);
      await consQ.consume(async (message) => {
        expect(message).to.deep.equal(originalMessage);
        barrier.resolve();
      });
      await barrier.resolution();
      await prodQ.close();
      await consQ.close();
    });
    it.skip('should wait until server acknowledges enqueue()', async () => {
      // How to test this?
    });
    it('should consume messages in the order they were enqueued', async () => {
      const barrier = new Barrier(3);
      const prodQ = new WorkQueue(config);
      const consQ = new WorkQueue(config);
      await prodQ.connect();
      await consQ.connect();
      const messages = [];
      await consQ.consume(async (message) => {
        messages.push(message);
        barrier.resolve();
      });
      await prodQ.enqueue(1);
      await prodQ.enqueue(2);
      await prodQ.enqueue(3);
      await barrier.resolution();
      expect(messages).to.deep.equal([1, 2, 3]);
      await prodQ.close();
      await consQ.close();
    });
    it('should not receive messages on cancelled consumers', async () => {
      const barrier1 = new Barrier(3);
      const barrier2 = new Barrier(3);
      const prodQ = new WorkQueue(config);
      const consQ = new WorkQueue(config);
      await prodQ.connect();
      await consQ.connect();
      const messages1 = [];
      const messages2 = [];
      const cancel1 = await consQ.consume(async (message) => {
        messages1.push(message);
        barrier1.resolve();
      });
      await prodQ.enqueue(1);
      await prodQ.enqueue(2);
      await prodQ.enqueue(3);
      await barrier1.resolution();
      await cancel1();
      await consQ.consume(async (message) => {
        messages2.push(message);
        barrier2.resolve();
      });
      await prodQ.enqueue(4);
      await prodQ.enqueue(5);
      await prodQ.enqueue(6);
      await barrier2.resolution();
      expect(messages1).to.deep.equal([1, 2, 3]);
      expect(messages2).to.deep.equal([4, 5, 6]);
      await prodQ.close();
      await consQ.close();
    });
    it('should consume messages from the correct queue', async () => {
      const barrier = new Barrier(2);
      const prodQ = new WorkQueue(config);
      const prodQ2 = new WorkQueue(config2);
      const consQ = new WorkQueue(config);
      const consQ2 = new WorkQueue(config2);
      await prodQ.connect();
      await prodQ2.connect();
      await consQ.connect();
      await consQ2.connect();
      const messages = [];
      const messages2 = [];
      await consQ.consume(async (message) => {
        messages.push(message);
        barrier.resolve();
      });
      await consQ2.consume(async (message) => {
        messages2.push(message);
        barrier.resolve();
      });
      await prodQ.enqueue(1);
      await prodQ2.enqueue(2);
      await barrier.resolution();
      expect(messages).to.deep.equal([1]);
      expect(messages2).to.deep.equal([2]);
      await prodQ.close();
      await prodQ2.close();
      await consQ.close();
      await consQ2.close();
    });
    it('should acknowledge the correct message', async () => {
      const barrierFirstTry = new Barrier(3);
      const barrierSecondTry = new Barrier(5);
      const prodQ = new WorkQueue(config);
      const consQ = new WorkQueue(configWithPrefetch);
      await prodQ.connect();
      await consQ.connect();
      const messages = [];
      const error = new Error('Not going to ack that');
      consQ.on('error', (err) => {
        expect(err).to.equal(error);
      });
      await consQ.consume(async (message) => {
        if (messages.length > 5) return;
        messages.push(message);
        barrierSecondTry.resolve();
        if (messages.length > 3) return;
        barrierFirstTry.resolve();
        if (message !== 2) {
          await barrierFirstTry.resolution();
          throw error;
        }
      });
      await prodQ.enqueue(1);
      await prodQ.enqueue(2);
      await prodQ.enqueue(3);
      await barrierSecondTry.resolution();
      expect(messages).to.deep.equal([1, 2, 3, 1, 3]);
      await prodQ.close();
      await consQ.close();
    });
    it('should reject enqueue() if broker nacked message', async () => {
      const barrier = new Barrier(1);
      const queue = new WorkQueue(config);
      queue.on('error', () => {});
      await queue.connect();
      queue.channel.sendToQueue = async (q, msg, options, cb) => {
        cb(new Error('i do not want that message'));
      };
      try {
        await queue.enqueue({});
      } catch (err) {
        expect(err).to.be.an.instanceof(Error);
        barrier.resolve();
        return;
      } finally {
        await barrier.resolution();
        await queue.close();
      }
    });
    it('should emit an error if one happens decoding a message', async () => {
      const barrier = new Barrier(1);
      const queue = new WorkQueue(config);
      queue.on('error', (err) => {
        expect(err.message).to.be.equal('Unexpected token i in JSON at position 0');
        if (barrier.callbacks.length > 0) barrier.resolve();
      });
      await queue.connect();
      const cancel = await queue.consume(async () => {
        await cancel();
      });
      await new Promise((resolve, reject) => {
        queue.channel.sendToQueue(queue.config.queue, Buffer.from('invalid json'), queue.config.publishOptions, (err) => {
          if (err) return reject(err);
          return resolve();
        });
      });
      await barrier.resolution();
      await queue.close();
    });
    it('should emit an error if one happens within a consumer', async () => {
      const barrier = new Barrier(1);
      const queue = new WorkQueue(config);
      const error = new Error('consumer error');
      queue.on('error', (err) => {
        expect(err).to.be.equal(error);
        barrier.resolve();
      });
      await queue.connect();
      const cancel = await queue.consume(async () => {
        await cancel();
        throw error;
      });
      queue.enqueue({});
      await barrier.resolution();
      await queue.close();
    });
    it('should still be usable after cancelling a consumer', async () => {
      const barrier = new Barrier(1);
      const queue = new WorkQueue(config);
      const originalMessage = { Test: 123, TestTest: '123', t: [{ a: 'b' }] };
      await queue.connect();
      const cancel = await queue.consume(async () => {
        throw new Error('this one was cancelled and still received something');
      });
      await cancel();
      await queue.consume(async (message) => {
        expect(message).to.deep.equal(originalMessage);
        barrier.resolve();
      });
      queue.enqueue(originalMessage);
      await barrier.resolution();
      await queue.close();
    });
    it('should close connection if unsubscibed remotely', async () => {
      const barrier = new Barrier(1);
      const queue = new WorkQueue(config);
      await queue.connect();
      const close = queue.close;
      queue.close = () => {
        barrier.resolve();
      };
      queue.channel.consume = async (q, callback) => {
        await callback(null);
        return { consumerTag: 0 };
      };
      await queue.consume(async () => {
        throw new Error('this one was cancelled and still received something');
      });
      await barrier.resolution();
      await close();
    });
  });
});
