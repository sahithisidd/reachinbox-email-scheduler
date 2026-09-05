import dotenv from "dotenv";

dotenv.config();

import express from "express";
import cors from "cors";
import "./config/redis";
import "./queues/email.queue";
import emailRoutes from "./routes/email.routes";
import uploadRoutes from "./routes/upload.routes";
import slackRoutes from "./routes/slack.routes";
import { serverAdapter } from "./config/bull-board";
import passport from "./config/passport";
import authRoutes from "./routes/auth.routes";
import "./workers/email.worker";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(passport.initialize());
app.use("/api/auth", authRoutes);
app.use("/admin/queues", serverAdapter.getRouter());

app.use("/api/emails", emailRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/slack", slackRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "ReachInbox Email Scheduler API is running",
  });
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});