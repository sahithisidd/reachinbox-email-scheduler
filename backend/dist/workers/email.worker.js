"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const prisma_1 = require("../config/prisma");
const email_queue_1 = require("../queues/email.queue");
const email_service_1 = require("../services/email.service");
const search_service_1 = require("../services/search.service");
const slack_service_1 = require("../services/slack.service");
const defaultHourlyLimit = Number(process.env.MAX_EMAILS_PER_HOUR) || 200;
const minSendDelay = Number(process.env.MIN_SEND_DELAY_MS) || 2000;
const concurrency = Number(process.env.WORKER_CONCURRENCY) || 5;
/**
 * Atomically checks and increments the hourly
 * rate counter for a sender.
 *
 * Returns:
 * allowed = whether the email can be sent
 * count   = current number of emails used this hour
 */
async function checkHourlyLimit(senderId, hourlyLimit) {
    const hour = Math.floor(Date.now() / 3600000);
    const key = `email-rate-${senderId}-${hour}`;
    const script = `
    local current = redis.call("GET", KEYS[1])

    if not current then
      redis.call(
        "SET",
        KEYS[1],
        1,
        "EX",
        7200
      )

      return 1
    end

    current = tonumber(current)

    if current >= tonumber(ARGV[1]) then
      return 0
    end

    return redis.call(
      "INCR",
      KEYS[1]
    )
  `;
    const result = await redis_1.redis.eval(script, 1, key, hourlyLimit);
    const count = Number(result);
    return {
        allowed: count > 0,
        count,
    };
}
function getNextHourTimestamp() {
    const hour = Math.floor(Date.now() / 3600000);
    return (hour + 1) * 3600000;
}
const worker = new bullmq_1.Worker("email-scheduler", async (job) => {
    const { emailId } = job.data;
    const email = await prisma_1.prisma.email.findUnique({
        where: {
            id: emailId,
        },
        include: {
            sender: true,
        },
    });
    if (!email) {
        console.log(`Email ${emailId} not found.`);
        return;
    }
    /**
     * Idempotency protection.
     */
    if (email.status === "SENT") {
        console.log(`Email ${emailId} already sent. Skipping.`);
        return;
    }
    if (email.status === "PROCESSING") {
        console.log(`Email ${emailId} is already processing. Skipping.`);
        return;
    }
    /**
     * Use the sender-specific hourly limit.
     */
    const hourlyLimit = email.sender.hourlyLimit ||
        defaultHourlyLimit;
    const rate = await checkHourlyLimit(email.senderId, hourlyLimit);
    /**
     * The sender has reached the hourly limit.
     *
     * Because the Redis operation is atomic,
     * only one worker can detect the exact
     * limit boundary.
     */
    if (rate.allowed &&
        rate.count === hourlyLimit) {
        await (0, slack_service_1.sendSlackRateLimitNotification)(email.userId, `⚠️ ReachInbox rate limit reached: sender ${email.sender.email} has reached ${hourlyLimit} emails for the current hour. Remaining scheduled emails will be delayed until the next hour.`);
    }
    /**
     * Hourly limit already reached.
     */
    if (!rate.allowed) {
        const nextHour = getNextHourTimestamp();
        const delay = Math.max(nextHour - Date.now(), 1000);
        const replacementJobId = `email-${emailId}-window-${nextHour}`;
        console.log(`Hourly limit reached for ${email.sender.email}. Rescheduling ${emailId}.`);
        await email_queue_1.emailQueue.add("send-email", {
            emailId,
        }, {
            jobId: replacementJobId,
            delay,
        });
        await prisma_1.prisma.email.update({
            where: {
                id: emailId,
            },
            data: {
                bullJobId: replacementJobId,
            },
        });
        return;
    }
    /**
     * Atomically claim the email.
     */
    const claimed = await prisma_1.prisma.email.updateMany({
        where: {
            id: emailId,
            status: "SCHEDULED",
        },
        data: {
            status: "PROCESSING",
        },
    });
    if (claimed.count === 0) {
        console.log(`Email ${emailId} was already claimed.`);
        return;
    }
    try {
        console.log(`Sending ${email.recipient} from ${email.sender.email}`);
        await (0, email_service_1.sendEmail)(email.sender.email, email.recipient, email.subject, email.body);
        const sentAt = new Date();
        await prisma_1.prisma.email.update({
            where: {
                id: emailId,
            },
            data: {
                status: "SENT",
                sentAt,
            },
        });
        await (0, search_service_1.indexEmail)({
            id: email.id,
            recipient: email.recipient,
            subject: email.subject,
            body: email.body,
            status: "SENT",
            scheduledAt: email.scheduledAt,
            sentAt,
        });
        console.log(`Email ${emailId} sent successfully.`);
    }
    catch (error) {
        const errorMessage = error instanceof Error
            ? error.message
            : "Unknown email error";
        await prisma_1.prisma.email.update({
            where: {
                id: emailId,
            },
            data: {
                status: "FAILED",
                failureReason: errorMessage,
            },
        });
        throw error;
    }
}, {
    connection: redis_1.redis,
    /**
     * Configurable worker concurrency.
     */
    concurrency,
    /**
     * Global minimum delay between email sends.
     * BullMQ handles this across workers.
     */
    limiter: {
        max: 1,
        duration: minSendDelay,
    },
});
worker.on("ready", () => {
    console.log(`Email worker started with concurrency ${concurrency}`);
    console.log(`Minimum send delay: ${minSendDelay}ms`);
    console.log(`Default hourly email limit: ${defaultHourlyLimit}`);
});
worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed.`);
});
worker.on("failed", (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
});
