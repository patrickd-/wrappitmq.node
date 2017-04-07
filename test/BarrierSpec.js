/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
const expect = require('chai').expect;
const Barrier = require('../lib/Barrier');

describe('Barrier', () => {
  it('should take the specified about of resolves to resolve', (done) => {
    let calls = 3;
    const barrier = new Barrier(calls);
    barrier.resolution().then(() => {
      expect(calls).to.equal(0);
      done();
    });
    calls -= 1;
    barrier.resolve();
    calls -= 1;
    barrier.resolve();
    calls -= 1;
    barrier.resolve();
  });
  it('should reject after the first rejection', (done) => {
    let calls = 3;
    const barrier = new Barrier(calls);
    barrier.resolution().then(() => {
      expect.fail();
    }).catch(() => {
      expect(calls).to.equal(1);
      done();
    });
    calls -= 1;
    barrier.resolve();
    setImmediate(() => {
      calls -= 1;
      barrier.reject();
      setImmediate(() => {
        calls -= 1;
        barrier.resolve();
      });
    });
  });
});
