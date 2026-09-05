"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const sync_1 = require("csv-parse/sync");
const prisma_1 = require("../config/prisma");
const email_queue_1 = require("../queues/email.queue");
const search_service_1 = require("../services/search.service");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
});
router.post("/csv", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "CSV or TXT file is required",
            });
        }
        const { subject, body, startTime, delayMs, hourlyLimit, senderEmail, senderName, } = req.body;
        if (!subject || !body || !startTime) {
            return res.status(400).json({
                success: false,
                message: "subject, body and startTime are required",
            });
        }
        const firstSendTime = new Date(startTime);
        if (Number.isNaN(firstSendTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid startTime",
            });
        }
        const fileText = req.file.buffer.toString("utf-8");
        let recipients = [];
        const fileName = req.file.originalname.toLowerCase();
        /**
         * TXT:
         * one email address per line.
         */
        if (fileName.endsWith(".txt")) {
            recipients = fileText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
        }
        else {
            /**
             * CSV:
             * expects an email column.
             */
            const records = (0, sync_1.parse)(fileText, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
            });
            recipients = records
                .map((row) => {
                return (row.email ||
                    row.Email ||
                    row.EMAIL);
            })
                .filter((email) => Boolean(email));
        }
        if (recipients.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No email addresses found in the uploaded file",
            });
        }
        /**
         * Temporary demo user.
         * Google OAuth will replace this
         * for the final authenticated flow.
         */
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
        const fromEmail = senderEmail ||
            "sender@ethereal.email";
        const limit = Number(hourlyLimit) || 200;
        const sender = await prisma_1.prisma.sender.upsert({
            where: {
                userId_email: {
                    userId: user.id,
                    email: fromEmail,
                },
            },
            update: {
                name: senderName,
                hourlyLimit: limit,
            },
            create: {
                email: fromEmail,
                name: senderName ||
                    "Demo Sender",
                hourlyLimit: limit,
                userId: user.id,
            },
        });
        const delayBetweenEmails = Number(delayMs) || 2000;
        const createdEmails = [];
        /**
         * Create PostgreSQL records,
         * BullMQ delayed jobs and
         * Elasticsearch documents.
         */
        for (let i = 0; i < recipients.length; i++) {
            const scheduledAt = new Date(firstSendTime.getTime() +
                i *
                    delayBetweenEmails);
            const email = await prisma_1.prisma.email.create({
                data: {
                    recipient: recipients[i],
                    subject,
                    body,
                    scheduledAt,
                    status: "SCHEDULED",
                    userId: user.id,
                    senderId: sender.id,
                },
            });
            const delay = Math.max(scheduledAt.getTime() -
                Date.now(), 0);
            const job = await email_queue_1.emailQueue.add("send-email", {
                emailId: email.id,
            }, {
                jobId: `email-${email.id}`,
                delay,
            });
            await prisma_1.prisma.email.update({
                where: {
                    id: email.id,
                },
                data: {
                    bullJobId: job.id,
                },
            });
            await (0, search_service_1.indexEmail)({
                id: email.id,
                recipient: email.recipient,
                subject: email.subject,
                body: email.body,
                status: email.status,
                scheduledAt: email.scheduledAt,
            });
            createdEmails.push(email.id);
        }
        return res.status(201).json({
            success: true,
            message: "Emails scheduled successfully",
            count: createdEmails.length,
            emailIds: createdEmails,
        });
    }
    catch (error) {
        console.error("File upload error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to process uploaded file",
        });
    }
});
exports.default = router;
