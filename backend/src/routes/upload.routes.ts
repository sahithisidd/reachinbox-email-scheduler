import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../config/prisma";
import { emailQueue } from "../queues/email.queue";
import { indexEmail } from "../services/search.service";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

router.post(
  "/csv",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "CSV or TXT file is required",
        });
      }

      const {
        subject,
        body,
        startTime,
        delayMs,
        hourlyLimit,
        senderEmail,
        senderName,
      } = req.body;

      if (!subject || !body || !startTime) {
        return res.status(400).json({
          success: false,
          message:
            "subject, body and startTime are required",
        });
      }

      const firstSendTime =
        new Date(startTime);

      if (
        Number.isNaN(
          firstSendTime.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid startTime",
        });
      }

      const fileText =
        req.file.buffer.toString(
          "utf-8"
        );

      let recipients: string[] = [];

      const fileName =
        req.file.originalname.toLowerCase();

      /**
       * TXT:
       * one email address per line.
       */
      if (fileName.endsWith(".txt")) {
        recipients = fileText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(
            (line) =>
              line.length > 0
          );
      } else {
        /**
         * CSV:
         * expects an email column.
         */
        const records = parse(
          fileText,
          {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          }
        ) as Record<
          string,
          string
        >[];

        recipients = records
          .map((row) => {
            return (
              row.email ||
              row.Email ||
              row.EMAIL
            );
          })
          .filter(
            (email): email is string =>
              Boolean(email)
          );
      }

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No email addresses found in the uploaded file",
        });
      }

      /**
       * Temporary demo user.
       * Google OAuth will replace this
       * for the final authenticated flow.
       */
      const user =
        await prisma.user.upsert({
          where: {
            email:
              "demo@reachinbox.local",
          },
          update: {},
          create: {
            name: "Demo User",
            email:
              "demo@reachinbox.local",
          },
        });

      const fromEmail =
        senderEmail ||
        "sender@ethereal.email";

      const limit =
        Number(hourlyLimit) || 200;

      const sender =
        await prisma.sender.upsert({
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
            name:
              senderName ||
              "Demo Sender",
            hourlyLimit: limit,
            userId: user.id,
          },
        });

      const delayBetweenEmails =
        Number(delayMs) || 2000;

      const createdEmails: string[] = [];

      /**
       * Create PostgreSQL records,
       * BullMQ delayed jobs and
       * Elasticsearch documents.
       */
      for (
        let i = 0;
        i < recipients.length;
        i++
      ) {
        const scheduledAt =
          new Date(
            firstSendTime.getTime() +
              i *
                delayBetweenEmails
          );

        const email =
          await prisma.email.create({
            data: {
              recipient:
                recipients[i],
              subject,
              body,
              scheduledAt,
              status: "SCHEDULED",
              userId: user.id,
              senderId: sender.id,
            },
          });

        const delay = Math.max(
          scheduledAt.getTime() -
            Date.now(),
          0
        );

        const job =
          await emailQueue.add(
            "send-email",
            {
              emailId: email.id,
            },
            {
              jobId:
                `email-${email.id}`,
              delay,
            }
          );

        await prisma.email.update({
          where: {
            id: email.id,
          },
          data: {
            bullJobId: job.id,
          },
        });

        await indexEmail({
          id: email.id,
          recipient:
            email.recipient,
          subject: email.subject,
          body: email.body,
          status: email.status,
          scheduledAt:
            email.scheduledAt,
        });

        createdEmails.push(
          email.id
        );
      }

      return res.status(201).json({
        success: true,
        message:
          "Emails scheduled successfully",
        count:
          createdEmails.length,
        emailIds:
          createdEmails,
      });
    } catch (error) {
      console.error(
        "File upload error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to process uploaded file",
      });
    }
  }
);

export default router;