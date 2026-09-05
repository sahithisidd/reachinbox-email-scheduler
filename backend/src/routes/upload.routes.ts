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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email.trim()
  );
}

router.post(
  "/csv",
  upload.single("file"),
  async (req, res) => {
    try {
      // -----------------------------------------
      // Check uploaded file
      // -----------------------------------------

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

      // -----------------------------------------
      // Validate required fields
      // -----------------------------------------

      if (!subject || !body || !startTime) {
        return res.status(400).json({
          success: false,
          message:
            "subject, body and startTime are required",
        });
      }

      // -----------------------------------------
      // Validate start time
      // -----------------------------------------

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

      if (
        firstSendTime.getTime() <=
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "startTime must be in the future",
        });
      }

      // -----------------------------------------
      // Read uploaded file
      // -----------------------------------------

      const fileText =
        req.file.buffer
          .toString("utf-8")
          .replace(/^\uFEFF/, "")
          .trim();

      if (!fileText) {
        return res.status(400).json({
          success: false,
          message:
            "Uploaded file is empty",
        });
      }

      let recipients: string[] = [];

      const fileName =
        req.file.originalname.toLowerCase();

      // -----------------------------------------
      // TXT FILE
      // One email per line
      // -----------------------------------------

      if (fileName.endsWith(".txt")) {
        recipients = fileText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .filter(isValidEmail);
      }

      // -----------------------------------------
      // CSV FILE
      // -----------------------------------------

      else if (
        fileName.endsWith(".csv")
      ) {
        try {
          const records =
            parse(fileText, {
              columns: true,
              skip_empty_lines: true,
              trim: true,
              bom: true,
            }) as Record<
              string,
              string
            >[];

          recipients = records
            .map((row) => {
              // Normalize column names
              const normalizedRow:
                Record<string, string> = {};

              Object.entries(row).forEach(
                ([key, value]) => {
                  const normalizedKey =
                    key
                      .replace(
                        /^\uFEFF/,
                        ""
                      )
                      .trim()
                      .toLowerCase()
                      .replace(
                        /[_-]/g,
                        " "
                      );

                  normalizedRow[
                    normalizedKey
                  ] = String(
                    value || ""
                  ).trim();
                }
              );

              return (
                normalizedRow["email"] ||
                normalizedRow[
                  "email address"
                ] ||
                normalizedRow[
                  "emailaddress"
                ] ||
                ""
              );
            })
            .map((email) =>
              email
                .replace(
                  /^["']|["']$/g,
                  ""
                )
                .trim()
            )
            .filter(isValidEmail);
        } catch (csvError) {
          console.error(
            "CSV parsing error:",
            csvError
          );

          return res.status(400).json({
            success: false,
            message:
              "Invalid CSV file. Make sure it contains an email column.",
          });
        }
      }

      // -----------------------------------------
      // Unsupported file
      // -----------------------------------------

      else {
        return res.status(400).json({
          success: false,
          message:
            "Only CSV and TXT files are supported",
        });
      }

      // -----------------------------------------
      // Remove duplicate emails
      // -----------------------------------------

      recipients = [
        ...new Set(
          recipients.map((email) =>
            email.toLowerCase()
          )
        ),
      ];

      // -----------------------------------------
      // Make sure emails exist
      // -----------------------------------------

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No valid email addresses found in the uploaded file. CSV must contain an 'email' column.",
        });
      }

      console.log(
        `Found ${recipients.length} valid email addresses.`
      );

      // -----------------------------------------
      // Temporary demo user
      // -----------------------------------------

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

      // -----------------------------------------
      // Sender
      // -----------------------------------------

      const fromEmail =
        senderEmail ||
        "sender@ethereal.email";

      const limit =
        Number(hourlyLimit) || 200;

      if (limit < 1) {
        return res.status(400).json({
          success: false,
          message:
            "Hourly limit must be at least 1",
        });
      }

      // -----------------------------------------
      // Delay
      // -----------------------------------------

      const delayBetweenEmails =
        Number(delayMs) || 2000;

      if (
        delayBetweenEmails < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Delay cannot be negative",
        });
      }

      // -----------------------------------------
      // Create / update sender
      // -----------------------------------------

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

      // -----------------------------------------
      // Create emails + BullMQ jobs
      // + Elasticsearch documents
      // -----------------------------------------

      const createdEmails: string[] = [];

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

        // Create PostgreSQL record
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

        // Calculate BullMQ delay
        const delay =
          Math.max(
            scheduledAt.getTime() -
              Date.now(),
            0
          );

        // Add delayed BullMQ job
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

        // Store BullMQ job ID
        await prisma.email.update({
          where: {
            id: email.id,
          },
          data: {
            bullJobId: job.id,
          },
        });

        // Index in Elasticsearch
        await indexEmail({
          id: email.id,
          recipient:
            email.recipient,
          subject:
            email.subject,
          body: email.body,
          status:
            email.status,
          scheduledAt:
            email.scheduledAt,
        });

        createdEmails.push(
          email.id
        );
      }

      // -----------------------------------------
      // Success
      // -----------------------------------------

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