// Minimal mail sender. Sends via SMTP when SMTP_URL is configured; otherwise
// logs the message to the server console — so a self-hoster without a mail
// server can still complete a password reset by copying the link from the logs.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  const url = process.env.SMTP_URL;
  const from = process.env.SMTP_FROM ?? "TripTrace <no-reply@triptrace.local>";

  if (!url) {
    console.log(
      `[mailer] SMTP_URL not set — not sending. Message for ${mail.to}:\n` +
        `  Subject: ${mail.subject}\n  ${mail.text.replace(/\n/g, "\n  ")}`
    );
    return;
  }

  // Imported lazily so the dependency only loads when email is actually used.
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(url);
  await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
}
