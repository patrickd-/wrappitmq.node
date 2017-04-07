/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
const expect = require('chai').expect;
const PubSub = require('./..').PubSub;
const Barrier = require('../lib/Barrier');

const config = {
  url: process.env.AMQP_URL || 'amqp://localhost:5672',
  exchange: process.env.AMQP_QUEUE || 'ipc-test',
};
const config2 = {
  url: config.url,
  exchange: `${config.exchange}-2`,
};

describe('PubSub', () => {
  describe('publish() and subscribe()', () => {
    it('should consume a message on a topic we published it on', async () => {
      const barrier = new Barrier(2);
      const pub = new PubSub(config);
      const sub = new PubSub(config);
      const sub2 = new PubSub(config);
      await pub.connect();
      await sub.connect();
      await sub2.connect();
      const originalMessage = { Test: 123, TestTest: '123', t: [{ a: 'b' }] };
      await sub.subscribe('testtopic', async (message) => {
        expect(message).to.deep.equal(originalMessage);
        barrier.resolve();
      });
      await sub2.subscribe('testtopic', async (message) => {
        expect(message).to.deep.equal(originalMessage);
        barrier.resolve();
      });
      await pub.publish('testtopic', originalMessage);
      await barrier.resolution();
      await pub.close();
      await sub.close();
      await sub2.delete();
      await sub2.close();
    });
    it.skip('should wait until server acknowledges publish()', async () => {
      // How to test this?
    });
    it('should receive messages in the order they were published', async () => {
      const barrier = new Barrier(3);
      const pub = new PubSub(config);
      const sub = new PubSub(config);
      await pub.connect();
      await sub.connect();
      const messages = [];
      await sub.subscribe('tt', async (message) => {
        messages.push(message);
        barrier.resolve();
      });
      await pub.publish('tt', 1);
      await pub.publish('tt', 2);
      await pub.publish('tt', 3);
      await barrier.resolution();
      expect(messages).to.deep.equal([1, 2, 3]);
      await pub.close();
      await sub.delete();
      await sub.close();
    });
    it('should not receive messages on cancelled subscriptions', async () => {
      const barrier1 = new Barrier(3);
      const barrier2 = new Barrier(4);
      const pub = new PubSub(config);
      const sub = new PubSub(config);
      await pub.connect();
      await sub.connect();
      const messages1 = [];
      const messages2 = [];
      const cancel1 = await sub.subscribe('tt', async (message) => {
        messages1.push(message);
        barrier1.resolve();
      });
      await sub.subscribe('tt', async (message) => {
        messages2.push(message);
        barrier2.resolve();
      });
      await pub.publish('tt', 1);
      await pub.publish('tt', 2);
      await pub.publish('tt', 3);
      await barrier1.resolution();
      await cancel1();
      await pub.publish('tt', 4);
      await barrier2.resolution();
      expect(messages1).to.deep.equal([1, 2, 3]);
      expect(messages2).to.deep.equal([1, 2, 3, 4]);
      await pub.close();
      await sub.delete();
      await sub.close();
    });
    it('should subscribe to messages from the correct exchange', async () => {
      const barrier = new Barrier(2);
      const pub = new PubSub(config);
      const pub2 = new PubSub(config2);
      const sub = new PubSub(config);
      const sub2 = new PubSub(config2);
      await pub.connect();
      await pub2.connect();
      await sub.connect();
      await sub2.connect();
      const messages = [];
      const messages2 = [];
      await sub.subscribe('testtopic', async (message) => {
        messages.push(message);
        barrier.resolve();
      });
      await sub2.subscribe('testtopic', async (message) => {
        messages2.push(message);
        barrier.resolve();
      });
      await pub.publish('testtopic', 1);
      await pub2.publish('testtopic', 2);
      await barrier.resolution();
      expect(messages).to.deep.equal([1]);
      expect(messages2).to.deep.equal([2]);
      await pub.close();
      await pub2.close();
      await sub.delete();
      await sub.close();
      await sub2.delete();
      await sub2.close();
    });
    it('should subscribe to messages from the correct topic', async () => {
      const barrier = new Barrier(2);
      const pub = new PubSub(config);
      const sub = new PubSub(config);
      await pub.connect();
      await sub.connect();
      const messages = [];
      const messages2 = [];
      await sub.subscribe('testtopic1', async (message) => {
        messages.push(message);
        barrier.resolve();
      });
      await sub.subscribe('testtopic2', async (message) => {
        messages2.push(message);
        barrier.resolve();
      });
      await pub.publish('testtopic1', 1);
      await pub.publish('testtopic2', 2);
      await barrier.resolution();
      expect(messages).to.deep.equal([1]);
      expect(messages2).to.deep.equal([2]);
      await pub.close();
      await sub.delete();
      await sub.close();
    });
  });
  describe('ack() and nack()', () => {
    it('ack() calls should be ignored', async () => {
      const pubsub = new PubSub(config);
      await pubsub.nack();
    });
    it('nack() calls should be ignored', async () => {
      const pubsub = new PubSub(config);
      await pubsub.ack();
    });
  });
});
