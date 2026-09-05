import dotenv from "dotenv";

dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import "./config/redis";
import "./queues/email.queue";

import emailRoutes from "./routes/email.routes";
import uploadRoutes from "./routes/upload.routes";
import slackRoutes from "./routes/slack.routes";
import authRoutes from "./routes/auth.routes";

import { serverAdapter } from "./config/bull-board";
import passport from "./config/passport";

const app = express();

const PORT = Number(process.env.PORT) || 5000;

// --------------------------------------------------
// CORS
// --------------------------------------------------

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://reachinbox-scheduler-frontend-8lmi.onrender.com",
    ],
    credentials: true,
  })
);

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// --------------------------------------------------
// BullMQ Dashboard
// --------------------------------------------------

app.use(
  "/admin/queues",
  serverAdapter.getRouter()
);

// --------------------------------------------------
// Routes
// --------------------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/slack", slackRoutes);

// --------------------------------------------------
// Backend Landing Page
// --------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    success: true,
    application: "ReachInbox Email Job Scheduler",
    message: "Backend is running successfully",
    health: "/api/health",
    queueDashboard: "/admin/queues",
  });
});

// --------------------------------------------------
// Health Check
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Backend is healthy",
  });
});

// --------------------------------------------------
// Start Server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});