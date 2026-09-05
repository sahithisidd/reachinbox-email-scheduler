"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const email_queue_1 = require("../queues/email.queue");
const search_service_1 = require("../services/search.service");
const router = (0, express_1.Router)();
// Schedule a single email
router.post("/schedule", async (req, res) => {
    try {
        const { recipient, subject, body, scheduledAt, senderEmail, senderName, } = req.body;
        if (!recipient || !subject || !body || !scheduledAt) {
            return res.status(400).json({
                success: false,
                message: "recipient, subject, body and scheduledAt are required",
            });
        }
        const scheduleTime = new Date(scheduledAt);
        if (Number.isNaN(scheduleTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid scheduledAt date",
            });
        }
        if (scheduleTime.getTime() < Date.now()) {
            return res.status(400).json({
                success: false,
                message: "scheduledAt must be in the future",
            });
        }
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
        const fromEmail = senderEmail || "sender@ethereal.email";
        const sender = await prisma_1.prisma.sender.upsert({
            where: {
                userId_email: {
                    userId: user.id,
                    email: fromEmail,
                },
            },
            update: {
                name: senderName,
            },
            create: {
                email: fromEmail,
                name: senderName || "Demo Sender",
                userId: user.id,
            },
        });
        // Save email in PostgreSQL
        const email = await prisma_1.prisma.email.create({
            data: {
                recipient,
                subject,
                body,
                scheduledAt: scheduleTime,
                status: "SCHEDULED",
                userId: user.id,
                senderId: sender.id,
            },
        });
        // Add delayed job to BullMQ
        const delay = Math.max(scheduleTime.getTime() - Date.now(), 0);
        const job = await email_queue_1.emailQueue.add("send-email", {
            emailId: email.id,
        }, {
            jobId: `email-${email.id}`,
            delay,
        });
        // Store BullMQ job ID
        await prisma_1.prisma.email.update({
            where: {
                id: email.id,
            },
            data: {
                bullJobId: job.id,
            },
        });
        // Index in Elasticsearch
        await (0, search_service_1.indexEmail)({
            id: email.id,
            recipient: email.recipient,
            subject: email.subject,
            body: email.body,
            status: email.status,
            scheduledAt: email.scheduledAt,
        });
        return res.status(201).json({
            success: true,
            message: "Email scheduled successfully",
            email: {
                id: email.id,
                recipient: email.recipient,
                subject: email.subject,
                scheduledAt: email.scheduledAt,
                status: email.status,
                bullJobId: job.id,
            },
        });
    }
    catch (error) {
        console.error("Schedule email error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to schedule email",
        });
    }
});
// Get all emails
router.get("/", async (_req, res) => {
    try {
        const emails = await prisma_1.prisma.email.findMany({
            orderBy: {
                scheduledAt: "desc",
            },
            include: {
                sender: true,
            },
        });
        return res.json({
            success: true,
            emails,
        });
    }
    catch (error) {
        console.error("Get emails error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch emails",
        });
    }
});
// Search emails using Elasticsearch
router.get("/search", async (req, res) => {
    try {
        const query = String(req.query.q || "").trim();
        if (!query) {
            return res.status(400).json({
                success: false,
                message: "Search query is required",
            });
        }
        const results = await (0, search_service_1.searchEmails)(query);
        return res.json({
            success: true,
            results,
        });
    }
    catch (error) {
        console.error("Search error:", error);
        return res.status(500).json({
            success: false,
            message: "Search failed",
        });
    }
});
exports.default = router;
