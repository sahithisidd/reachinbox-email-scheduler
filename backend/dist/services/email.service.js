"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransporter = getTransporter;
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
let transporter = null;
async function getTransporter() {
    if (transporter) {
        return transporter;
    }
    if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASSWORD) {
        transporter = nodemailer_1.default.createTransport({
            host: process.env.ETHEREAL_HOST || "smtp.ethereal.email",
            port: Number(process.env.ETHEREAL_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.ETHEREAL_USER,
                pass: process.env.ETHEREAL_PASSWORD,
            },
        });
        return transporter;
    }
    const testAccount = await nodemailer_1.default.createTestAccount();
    transporter = nodemailer_1.default.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass,
        },
    });
    console.log("Ethereal test account created:", testAccount.user);
    return transporter;
}
async function sendEmail(from, to, subject, body) {
    const mailer = await getTransporter();
    const info = await mailer.sendMail({
        from,
        to,
        subject,
        text: body,
        html: `<div>${body.replace(/\n/g, "<br />")}</div>`,
    });
    const previewUrl = nodemailer_1.default.getTestMessageUrl(info);
    if (previewUrl) {
        console.log("Ethereal preview:", previewUrl);
    }
    return info;
}
