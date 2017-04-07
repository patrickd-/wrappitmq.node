/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
const expect = require('chai').expect;
const Client = require('./..').Client;

describe('Client', () => {
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
