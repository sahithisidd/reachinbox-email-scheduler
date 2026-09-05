"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
require("./config/redis");
require("./queues/email.queue");
const email_routes_1 = __importDefault(require("./routes/email.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const slack_routes_1 = __importDefault(require("./routes/slack.routes"));
const bull_board_1 = require("./config/bull-board");
const passport_1 = __importDefault(require("./config/passport"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
require("./workers/email.worker");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
}));
app.use(express_1.default.json());
app.use(passport_1.default.initialize());
app.use("/api/auth", auth_routes_1.default);
app.use("/admin/queues", bull_board_1.serverAdapter.getRouter());
app.use("/api/emails", email_routes_1.default);
app.use("/api/upload", upload_routes_1.default);
app.use("/api/slack", slack_routes_1.default);
app.get("/api/health", (_req, res) => {
    res.json({
        success: true,
        message: "ReachInbox Email Scheduler API is running",
    });
});
const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
