const { Queue } = require('bullmq');
const connection = require('../config/redis');

const VIDEO_QUEUE_NAME = 'video-generation';

const videoQueue = new Queue(VIDEO_QUEUE_NAME, {
  connection: connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 1000,
    },
  },
});

module.exports = {
  VIDEO_QUEUE_NAME,
  videoQueue,
};
