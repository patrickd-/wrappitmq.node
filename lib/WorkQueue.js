const Client = require('./Client');

class WorkQueue extends Client {

  /**
   * (Optional) Gives you the opportunity to override defaults.
   */
  constructor(config) {
    super();
    this.config = Object.assign({
      // Default queue name.
      queue: 'workqueue',
      // Passed to assertQueue()
      // http://www.squaremobius.net/amqp.node/channel_api.html#channel_assertQueue
      queueOptions: {
        // If true, the queue will survive broker restarts.
        durable: true,
      },
      // Passed to sendToQueue() or publish()
      // http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish
      publishOptions: {
        // If truthy, the message will survive broker restarts.
        persistent: true,
      },
      // Passed to consume()
      // http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume
      consumeOptions: {
        // Name which the server will use to distinguish message deliveries for the consumer.
        // consumerTag: Random string by default (recommended)
        // If true, the broker won't expect an acknowledgement of messages.
        noAck: false,
      },
    }, this.config, config);
  }

  async connect(url) {
    await super.connect(url);
    // Asserts that our queue exists.
    const queue = this.config.queue;
    const options = this.config.queueOptions;
    await this.channel.assertQueue(queue, options);
  }

  /**
   * Enqueue a task.
   *
   * Uses confirmation channels (http://www.rabbitmq.com/confirms.html) to
   * ensure that the task really has been enqueued successfully.
   */
  async enqueue(task) {
    return new Promise((resolve, reject) => {
      const msg = Client.encode(task);
      const queue = this.config.queue;
      const options = this.config.publishOptions;
      // The sendToQueue method is like a write() to a WriteableStream.
      this.channel.sendToQueue(queue, msg, options, (err) => {
        // This callback is called as soon as the server responds to the enqueue.
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  /**
   * Register a consumer function.
   *
   * The consumer function should be async and will get passed a task to work on.
   * When the consumer method is done (promise resolved) the task will be acknowledged.
   * If an error is thrown by the consumer method the task will be rejected and
   * requeued to be retried. The error will be emitted in an error event.
   */
  async consume(consumer) {
    const queue = this.config.queue;
    const options = this.config.consumeOptions;
    const callback = async (msg) => {
      // If the consumer is cancelled by RabbitMQ, the message callback will be invoked with null.
      if (!msg) {
        // If the consumer was cancelled we will not get anymore messages,
        // so let's shut it down.
        await this.close();
        return;
      }
      const task = Client.decode(msg.content);
      try {
        await consumer(task);
        await this.ack(msg);
      } catch (err) {
        this.emit('error', err);
        await this.nack(msg);
      }
    };
    const tag = (await this.channel.consume(queue, callback, options)).consumerTag;
    // Return method for cancelling consumer.
    return async () => {
      await this.channel.cancel(tag);
    };
  }

  /**
   * Deletes the queue.
   *
   * Intended for clean up after running tests.
   */
  async delete() {
    const queue = this.config.queue;
    await this.channel.deleteQueue(queue);
  }

}

module.exports = WorkQueue;
