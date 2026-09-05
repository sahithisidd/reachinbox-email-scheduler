import { WebClient } from "@slack/web-api";
import { prisma } from "../config/prisma";

export async function sendSlackRateLimitNotification(
  userId: string,
  message: string
) {
  try {
    const connection =
      await prisma.slackConnection.findUnique({
        where: {
          userId,
        },
      });

    if (!connection) {
      console.log(
        "Slack is not connected. Skipping notification."
      );
      return;
    }

    if (!connection.channelId) {
      console.log(
        "No Slack channel is configured. Skipping notification."
      );
      return;
    }

    const slack = new WebClient(
      connection.accessToken
    );

    const result = await slack.chat.postMessage({
      channel: connection.channelId,
      text: message,
    });

    console.log(
      `Slack rate-limit notification sent to #${connection.channelName || "channel"}:`,
      result.ts
    );
  } catch (error) {
    console.error(
      "Slack notification error:",
      error
    );
  }
}