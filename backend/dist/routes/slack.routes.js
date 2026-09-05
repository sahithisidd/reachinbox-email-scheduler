"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const web_api_1 = require("@slack/web-api");
const prisma_1 = require("../config/prisma");
const redis_1 = require("../config/redis");
const router = (0, express_1.Router)();
const FRONTEND_URL = "http://localhost:5173";
/**
 * Start Slack OAuth
 */
router.get("/connect", async (_req, res) => {
    try {
        // Temporary demo user.
        // Google OAuth will replace this later.
        const user = await prisma_1.prisma.user.upsert({
            where: {
                email: "demo@reachinbox.local",
            },
            update: {},
            create: {
                name: "Demo User",
                email: "demo@reachinbox.local",
            },
        });
        const state = crypto_1.default.randomBytes(24).toString("hex");
        // Store which user started the OAuth flow.
        await redis_1.redis.set(`slack-oauth-state-${state}`, user.id, "EX", 600);
        const params = new URLSearchParams({
            client_id: process.env.SLACK_CLIENT_ID || "",
            redirect_uri: process.env.SLACK_REDIRECT_URI ||
                "http://localhost:5000/api/slack/callback",
            state,
            scope: "chat:write,channels:read,chat:write.public",
        });
        const slackUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
        return res.redirect(slackUrl);
    }
    catch (error) {
        console.error("Slack connect error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to start Slack connection",
        });
    }
});
/**
 * Slack OAuth callback
 */
router.get("/callback", async (req, res) => {
    try {
        const code = String(req.query.code || "");
        const state = String(req.query.state || "");
        if (!code || !state) {
            return res.status(400).send("Missing Slack OAuth code or state.");
        }
        const stateKey = `slack-oauth-state-${state}`;
        const userId = await redis_1.redis.get(stateKey);
        if (!userId) {
            return res.status(400).send("Invalid or expired Slack OAuth state.");
        }
        // Delete state so it cannot be reused.
        await redis_1.redis.del(stateKey);
        const slack = new web_api_1.WebClient();
        const clientId = process.env.SLACK_CLIENT_ID;
        const clientSecret = process.env.SLACK_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            return res.status(500).send("Slack OAuth credentials are not configured.");
        }
        const tokenResponse = await slack.oauth.v2.access({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: process.env.SLACK_REDIRECT_URI ||
                "http://localhost:5000/api/slack/callback",
        });
        if (!tokenResponse.ok || !tokenResponse.access_token) {
            console.error("Slack OAuth failed:", tokenResponse);
            return res.status(400).send("Slack authorization failed.");
        }
        const accessToken = tokenResponse.access_token;
        const authenticatedSlack = new web_api_1.WebClient(accessToken);
        /**
         * Get public channels from the workspace.
         */
        const channelsResponse = await authenticatedSlack.conversations.list({
            types: "public_channel",
            limit: 100,
        });
        const channels = channelsResponse.channels || [];
        /**
         * Prefer #general.
         * Otherwise use the first available public channel.
         */
        const selectedChannel = channels.find((channel) => channel.name === "general") || channels[0];
        if (!selectedChannel?.id) {
            return res.status(400).send("No Slack public channel was found.");
        }
        await prisma_1.prisma.slackConnection.upsert({
            where: {
                userId,
            },
            update: {
                accessToken,
                teamName: tokenResponse.team?.name || null,
                channelId: selectedChannel.id,
                channelName: selectedChannel.name || null,
            },
            create: {
                accessToken,
                teamName: tokenResponse.team?.name || null,
                channelId: selectedChannel.id,
                channelName: selectedChannel.name || null,
                userId,
            },
        });
        console.log(`Slack connected: #${selectedChannel.name}`);
        return res.redirect(`${FRONTEND_URL}?slack=connected`);
    }
    catch (error) {
        console.error("Slack OAuth callback error:", error);
        return res.status(500).send("Failed to connect Slack.");
    }
});
/**
 * Slack connection status
 */
router.get("/status", async (_req, res) => {
    try {
        const connection = await prisma_1.prisma.slackConnection.findUnique({
            where: {
                userId: (await prisma_1.prisma.user.findUnique({
                    where: {
                        email: "demo@reachinbox.local",
                    },
                }))?.id || "",
            },
        });
        return res.json({
            success: true,
            connected: Boolean(connection),
            teamName: connection?.teamName || null,
            channelName: connection?.channelName || null,
        });
    }
    catch (error) {
        console.error("Slack status error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get Slack status",
        });
    }
});
/**
 * Disconnect Slack
 */
router.delete("/disconnect", async (_req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: {
                email: "demo@reachinbox.local",
            },
        });
        if (user) {
            await prisma_1.prisma.slackConnection.deleteMany({
                where: {
                    userId: user.id,
                },
            });
        }
        return res.json({
            success: true,
            message: "Slack disconnected",
        });
    }
    catch (error) {
        console.error("Slack disconnect error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to disconnect Slack",
        });
    }
});
exports.default = router;
