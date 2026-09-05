import nodemailer from "nodemailer";

let transporter: import("nodemailer").Transporter | null = null;
export async function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASSWORD) {
    transporter = nodemailer.createTransport({
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

  const testAccount = await nodemailer.createTestAccount();

  transporter = nodemailer.createTransport({
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

export async function sendEmail(
  from: string,
  to: string,
  subject: string,
  body: string
) {
  const mailer = await getTransporter();

  const info = await mailer.sendMail({
    from,
    to,
    subject,
    text: body,
    html: `<div>${body.replace(/\n/g, "<br />")}</div>`,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  if (previewUrl) {
    console.log("Ethereal preview:", previewUrl);
  }

  return info;
}