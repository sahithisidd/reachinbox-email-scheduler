"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSlackRateLimitNotification = sendSlackRateLimitNotification;
const web_api_1 = require("@slack/web-api");
const prisma_1 = require("../config/prisma");
async function sendSlackRateLimitNotification(userId, message) {
    try {
        const connection = await prisma_1.prisma.slackConnection.findUnique({
            where: {
                userId,
            },
        });
        if (!connection) {
            console.log("Slack is not connected. Skipping notification.");
            return;
        }
        if (!connection.channelId) {
            console.log("No Slack channel is configured. Skipping notification.");
            return;
        }
        const slack = new web_api_1.WebClient(connection.accessToken);
        const result = await slack.chat.postMessage({
            channel: connection.channelId,
            text: message,
        });
        console.log(`Slack rate-limit notification sent to #${connection.channelName || "channel"}:`, result.ts);
    }
    catch (error) {
        console.error("Slack notification error:", error);
    }
}
