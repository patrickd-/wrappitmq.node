const amqp = require('amqplib');
const EventEmitter = require('events').EventEmitter;

class Client extends EventEmitter {

  /**
   * (Optional) Gives you the opportunity to override defaults.
   */
  constructor(config) {
    super();
    this.config = Object.assign({
      // How many messages to consume asynchronously.
      // A falsey value indicates no limit.
      prefetch: 1,
      // Passed to connect()
      // http://www.squaremobius.net/amqp.node/channel_api.html#connect
      socket: {
        // Hearbeat in seconds to check connection liveness.
        // If dead the connection will emit an error and close.
        heartbeat: 30,
      },
    }, config);
  }

  /**
   * Establish connection to queue.
   */
  async connect(url) {
    if (url) {
      this.config.url = url;
    }
    // Connect!
    this.connection = await amqp.connect(this.config.url, this.config.socket);
    this.connection.on('close', (err) => {
      // Err will only be set if connection was closed due to an error.
      if (!this.connection) return;
      this.emit('close', err);
      this.connection = null;
    });
    this.connection.on('error', (err) => {
      // Close will also be called after this.
      this.emit('error', err);
    });
    // Channels are like sessions established over the connection.
    // Confirmation channels: http://www.rabbitmq.com/confirms.html
    this.channel = await this.connection.createConfirmChannel();
    this.channel.on('close', () => {
      if (!this.connection || !this.channel) return;
      // Any unresolved operations on the channel will be abandoned.
      this.emit('close');
      this.channel = null;
      this.connection = null;
    });
    this.channel.on('error', (err) => {
      // Server closed the channel for any reason (invalid operation).
      // Will not be triggered on connection error.
      this.emit('error', err);
    });
    // Set max number of messages sent over the channel that can be awaiting acknowledgement.
    this.channel.prefetch(this.config.prefetch);
  }

  /**
   * Cleanly disconnect.
   */
  async close() {
    // Try to requeue unacknowledged messages on this channel.
    try {
      await this.channel.recover();
    } catch (err) {
      // It might happen that this action fails because the channel is already
      // closed due to an other error, we still want to continue closing.
    }
    // Closing connection is not graceful on per operation basis, it will
    // immediately invalidate any unresolved operations!
    try {
      await this.channel.close();
    } catch (err) {
      // It might happen that this action fails because the channel is already
      // closed due to an other error, we still want to continue closing.
    }
    try {
      await this.connection.close();
    } catch (err) {
      // It might happen that this action fails because the connection is
      // already closed due to an other error, then there's nothing else to do.
    }
  }

  /**
   * Acknowledge the specified message.
   *
   * It's an error to supply a message that has already been acknowledged.
   */
  async ack(msg) {
    // We must not acknowledge messages if we turned that feature off.
    if (this.config.consumeOptions.noAck === true) return;
    await this.channel.ack(msg);
  }

  /**
   * Rejects the specified message and requeues it.
   *
   * It's an error to supply a message that has already been acknowledged.
   */
  async nack(msg) {
    // We must not reject messages if we turned acknowledgements off.
    if (this.config.consumeOptions.noAck === true) return;
    await this.channel.nack(msg);
  }

  /**
   * Encodes a message before sending.
   *
   * Turn any javascript value into a Buffer to be send as message.
   */
  static encode(message) {
    return Buffer.from(JSON.stringify(message));
  }

  /**
   * Decodes a message we received.
   *
   * Get the original javascript value from the received Buffer.
   */
  static decode(message) {
    return JSON.parse(message.toString());
  }

}

module.exports = Client;
