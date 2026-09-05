"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
exports.emailQueue = new bullmq_1.Queue("email-scheduler", {
    connection: redis_1.redis,
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
