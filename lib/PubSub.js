const Client = require('./Client');

class PubSub extends Client {

  /**
   * (Optional) Gives you the opportunity to override defaults.
   */
  constructor(config) {
    super();
    this.config = Object.assign({
      // Default exchange name.
      exchange: 'pubsub',
      // Passed to assertExchange()
      // http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertExchange
      exchangeOptions: {
        // If true, the exchange will survive broker restarts.
        durable: false,
      },
      // Passed to assertQueue()
      // http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue
      queueOptions: {
        // If true, the queue will be exclusively available to this client.
        exclusive: true,
      },
      // Passed to sendToQueue() or publish()
      // http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish
      publishOptions: {
        // If truthy, the message will survive broker restarts.
        persistent: false,
      },
      // Passed to consume()
      // http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume
      consumeOptions: {
        // Name which the server will use to distinguish message deliveries for the consumer.
        // consumerTag: Random string by default (recommended)
        // If true, the broker won't expect an acknowledgement of messages.
        noAck: true,
      },
    }, this.config, config);
  }

  async connect(url) {
    await super.connect(url);
    const exchange = this.config.exchange;
    const options = this.config.exchangeOptions;
    // Asserts existance of exchange point.
    await this.channel.assertExchange(exchange, 'direct', options);
  }

  /**
   * Publish a message under the specified topic.
   *
   * Uses confirmation channels (http://www.rabbitmq.com/confirms.html) to
   * ensure that the task really has been enqueued successfully.
   */
  async publish(topic, message) {
    return new Promise((resolve, reject) => {
      const exchange = this.config.exchange;
      const msg = Client.encode(message);
      const options = this.config.publishOptions;
      // The sendToQueue method is like a write() to a WriteableStream.
      this.channel.publish(exchange, topic, msg, options, (err) => {
        // This callback is called as soon as the server responds to the enqueue.
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  /**
   * Register a subscriber function for the specified topic.
   */
  async subscribe(topic, subscriber) {
    const exchange = this.config.exchange;
    const queueOptions = this.config.queueOptions;
    // Create queue for our subscription (empty queue name -> random id).
    const queue = (await this.channel.assertQueue('', queueOptions)).queue;
    // Route messages from exchange point to our queue if they match the topic.
    this.channel.bindQueue(queue, exchange, topic);
    // Consume messages send to our queue.
    const callback = async (msg) => {
      // If the consumer is cancelled by RabbitMQ, the message callback will be invoked with null.
      if (!msg) {
        // If the consumer was cancelled we will not get anymore messages,
        // so let's shut it down.
        await this.close();
        return;
      }
      const message = Client.decode(msg.content);
      try {
        await subscriber(message);
        await this.ack(msg);
      } catch (err) {
        this.emit('error', err);
        await this.nack(msg);
      }
    };
    const options = this.config.consumeOptions;
    const tag = (await this.channel.consume(queue, callback, options)).consumerTag;
    // Return method for cancelling consumer.
    return async () => {
      await this.channel.cancel(tag);
    };
  }

  /**
   * Deletes the exchange.
   *
   * Intended for clean up after running tests.
   */
  async delete() {
    const exchange = this.config.exchange;
    await this.channel.deleteExchange(exchange);
  }

}

module.exports = PubSub;
