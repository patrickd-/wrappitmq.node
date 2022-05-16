/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
const expect = require('chai').expect;
const Client = require('./..').Client;

const config = {
  url: process.env.AMQP_URL || 'amqp://localhost:5672',
  consumeOptions: {
    noAck: false,
  },
};

describe('Client', () => {
  describe('connect()', () => {
    it('should throw error if connecting fails', (done) => {
      const client = new Client();
      client.connect('amqp://nowaythisexistsamiright:12345').catch((err) => {
        expect(err).to.be.an.instanceof(Error);
        done();
      });
    });
  });
  describe('close()', () => {
    it('should properly close the channel and disconnect', async () => {
      const client = new Client(config);
      await client.connect();
      const connection = client.connection;
      const channel = client.channel;
      // Connection & channel should be active.
      expect(connection.connection.expectSocketClose).to.equal(false);
      expect(channel.pending).to.deep.equal([]);
      await client.close();
      // Connection & channel references in client should be cleared.
      expect(client.connection).to.equal(null);
      expect(client.channel).to.equal(null);
      // Connection & channel should have been really closed.
      expect(connection.connection.expectSocketClose).to.equal(true);
      expect(channel.pending).to.equal(null);
    });
  });
  it('should emit an error when one happens', (done) => {
    const client = new Client(config);
    client.on('error', (err) => {
      expect(err).to.be.an.instanceof(Error);
      done();
    });
    client.connect().then(() => {
      // Cause an error on purpose
      client.ack({ fields: { deliveryTag: 1 } });
    });
  });
  it('should emit a close event with err when a fatal error occurred', (done) => {
    const client = new Client(config);
    client.on('error', () => {});
    client.on('close', (err) => {
      expect(err).to.be.an.instanceof(Error);
      done();
    });
    client.connect().then(() => {
      // Cause an error on purpose
      client.ack({ fields: { deliveryTag: 1 } });
    });
  });
  it('should emit a close event when it`s closed', (done) => {
    const client = new Client(config);
    client.on('error', () => {});
    client.on('close', (err) => {
      expect(err).to.equal(undefined);
      done();
    });
    client.connect().then(() => {
      client.close();
    });
  });
  it('should not emit a close event when it`s already closed', (done) => {
    const client = new Client(config);
    client.on('error', () => {});
    client.on('close', (err) => {
      expect(err).to.equal(undefined);
      done(new Error('this should not have been called'));
    });
    client.connect().then(() => {
      client.close();
      client.connection = null;
      done();
    });
  });
  it('should not emit a close event when the channel already closed', (done) => {
    const client = new Client(config);
    client.on('error', () => {});
    client.on('close', (err) => {
      expect(err).to.equal(undefined);
      done(new Error('this should not have been called'));
    });
    client.connect().then(() => {
      const connection = client.connection;
      client.connection = null;
      connection.emit('close');
      done();
    });
  });
  describe('encode() and decode()', () => {
    it('should return the same message decoded as when it was encoded to a Buffer', async () => {
      const originalMessage = { Test: 123, TestTest: '123', t: [{ a: 'b' }] };
      const buffer = Client.encode(originalMessage);
      expect(buffer).to.be.an.instanceof(Buffer);
      const decodedMessage = Client.decode(buffer);
      expect(decodedMessage).to.deep.equal(originalMessage);
    });
  });
});
