import { Queue } from "bullmq";
import { redis } from "../config/redis";

export const emailQueue = new Queue("email-scheduler", {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: {
      count: 1000,
    },
    removeOnFail: {
      count: 1000,
    },
  },
});