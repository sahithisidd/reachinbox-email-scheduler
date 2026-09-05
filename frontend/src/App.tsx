import { useEffect, useState } from "react";

type Email = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: string;
};

const API =
  "https://reachinbox-email-scheduler-erzy.onrender.com";

function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [leadCount, setLeadCount] = useState(0);

  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(200);

  const [slackConnected, setSlackConnected] = useState(false);
  const [slackChannel, setSlackChannel] = useState("");

  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function loadEmails() {
    try {
      setLoading(true);

      const response = await fetch(`${API}/api/emails`);
      const data = await response.json();

      if (data.success) {
        setEmails(data.emails);
      }
    } catch (error) {
      console.error("Load emails error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSlackStatus() {
    try {
      const response = await fetch(
        `${API}/api/slack/status`
      );

      const data = await response.json();

      if (data.success) {
        setSlackConnected(data.connected);
        setSlackChannel(data.channelName || "");
      }
    } catch (error) {
      console.error("Slack status error:", error);
    }
  }

  useEffect(() => {
    loadEmails();
    loadSlackStatus();

    const params = new URLSearchParams(
      window.location.search
    );

    if (params.get("slack") === "connected") {
      setMessage("Slack connected successfully!");

      window.history.replaceState(
        {},
        "",
        "/"
      );
    }

    if (params.get("login") === "success") {
      setMessage("Google login successful!");

      window.history.replaceState(
        {},
        "",
        "/"
      );
    }
  }, []);

  async function scheduleEmail() {
    if (
      !recipient ||
      !subject ||
      !body ||
      !scheduledAt
    ) {
      setMessage(
        "Please fill all email fields."
      );
      return;
    }

    try {
      setSending(true);
      setMessage("");

      const response = await fetch(
        `${API}/api/emails/schedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recipient,
            subject,
            body,
            scheduledAt:
              new Date(
                scheduledAt
              ).toISOString(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(
          data.message ||
            "Failed to schedule email."
        );
        return;
      }

      setMessage(
        "Email scheduled successfully."
      );

      setRecipient("");
      setSubject("");
      setBody("");
      setScheduledAt("");

      await loadEmails();
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to connect to backend."
      );
    } finally {
      setSending(false);
    }
  }

  async function uploadCSV() {
    if (!csvFile) {
      setMessage(
        "Please select a CSV file."
      );
      return;
    }

    if (!subject || !body || !scheduledAt) {
      setMessage(
        "Enter subject, body and start time first."
      );
      return;
    }

    try {
      setSending(true);
      setMessage("");

      const formData = new FormData();

      formData.append(
        "file",
        csvFile
      );

      formData.append(
        "subject",
        subject
      );

      formData.append(
        "body",
        body
      );

      formData.append(
        "startTime",
        new Date(
          scheduledAt
        ).toISOString()
      );

      formData.append(
        "delayMs",
        String(delayMs)
      );

      formData.append(
        "hourlyLimit",
        String(hourlyLimit)
      );

      const response = await fetch(
        `${API}/api/upload/csv`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(
          data.message ||
            "CSV upload failed."
        );
        return;
      }

      setMessage(
        `${data.count} emails scheduled successfully.`
      );

      setCsvFile(null);
      setLeadCount(0);

      await loadEmails();
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to upload CSV."
      );
    } finally {
      setSending(false);
    }
  }

  async function disconnectSlack() {
    try {
      const response = await fetch(
        `${API}/api/slack/disconnect`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Disconnect failed"
        );
      }

      setSlackConnected(false);
      setSlackChannel("");

      setMessage(
        "Slack disconnected."
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to disconnect Slack."
      );
    }
  }

  const scheduled = emails.filter(
    (email) =>
      email.status === "SCHEDULED" ||
      email.status === "PROCESSING"
  );

  const sent = emails.filter(
    (email) =>
      email.status === "SENT"
  );

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-gray-900">

      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-4">

          <div>
            <h1 className="text-2xl font-bold">
              ReachInbox
            </h1>

            <p className="text-sm text-gray-500">
              Email Job Scheduler
            </p>
          </div>

          <div className="flex items-center gap-3">

            {slackConnected ? (
              <>
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                  Slack connected
                  {slackChannel &&
                    ` • #${slackChannel}`}
                </span>

                <button
                  onClick={
                    disconnectSlack
                  }
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <a
                href={`${API}/api/slack/connect`}
                className="rounded-lg bg-[#611f69] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Connect Slack
              </a>
            )}

            <button
              onClick={() => {
                window.location.href =
                  `${API}/api/auth/google`;
              }}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Login with Google
            </button>

          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-8">

        {/* Message */}
        {message && (
          <div className="mb-6 rounded-lg border bg-white px-4 py-3 text-sm">
            {message}
          </div>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">

          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Total Emails
            </p>

            <p className="mt-2 text-3xl font-bold">
              {emails.length}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Scheduled
            </p>

            <p className="mt-2 text-3xl font-bold">
              {scheduled.length}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Sent
            </p>

            <p className="mt-2 text-3xl font-bold">
              {sent.length}
            </p>
          </div>

        </div>

        {/* Compose + Bulk */}
        <div className="grid gap-8 lg:grid-cols-2">

          {/* Compose */}
          <section className="rounded-xl border bg-white p-6">

            <h2 className="mb-1 text-xl font-semibold">
              Compose Email
            </h2>

            <p className="mb-6 text-sm text-gray-500">
              Schedule an individual email.
            </p>

            <div className="space-y-4">

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Recipient
                </label>

                <input
                  value={recipient}
                  onChange={(e) =>
                    setRecipient(
                      e.target.value
                    )
                  }
                  placeholder="recipient@example.com"
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Subject
                </label>

                <input
                  value={subject}
                  onChange={(e) =>
                    setSubject(
                      e.target.value
                    )
                  }
                  placeholder="Email subject"
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Body
                </label>

                <textarea
                  value={body}
                  onChange={(e) =>
                    setBody(
                      e.target.value
                    )
                  }
                  placeholder="Write your email..."
                  rows={7}
                  className="w-full resize-none rounded-lg border px-3 py-2 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Start Time
                </label>

                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) =>
                    setScheduledAt(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <button
                disabled={sending}
                onClick={
                  scheduleEmail
                }
                className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending
                  ? "Scheduling..."
                  : "Schedule Email"}
              </button>

            </div>
          </section>

          {/* Bulk */}
          <section className="rounded-xl border bg-white p-6">

            <h2 className="mb-1 text-xl font-semibold">
              Bulk Leads
            </h2>

            <p className="mb-6 text-sm text-gray-500">
              Upload a CSV containing an email column.
            </p>

            <div className="space-y-5">

              <div className="rounded-lg border-2 border-dashed p-8 text-center">

                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0] ||
                      null;

                    setCsvFile(file);

                    if (file) {
                      const reader =
                        new FileReader();

                      reader.onload = () => {
                        const text =
                          String(
                            reader.result ||
                              ""
                          );

                        const lines =
                          text
                            .split(
                              /\r?\n/
                            )
                            .filter(
                              Boolean
                            );

                        setLeadCount(
                          Math.max(
                            lines.length -
                              1,
                            0
                          )
                        );
                      };

                      reader.readAsText(
                        file
                      );
                    }
                  }}
                />

                {csvFile && (
                  <p className="mt-3 text-sm">
                    {csvFile.name} •{" "}
                    {leadCount} leads
                  </p>
                )}

              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Delay between emails (ms)
                </label>

                <input
                  type="number"
                  min="0"
                  value={delayMs}
                  onChange={(e) =>
                    setDelayMs(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Hourly limit
                </label>

                <input
                  type="number"
                  min="1"
                  value={hourlyLimit}
                  onChange={(e) =>
                    setHourlyLimit(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              <button
                disabled={sending}
                onClick={
                  uploadCSV
                }
                className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {sending
                  ? "Uploading..."
                  : "Upload & Schedule Leads"}
              </button>

            </div>
          </section>

        </div>

        {/* Scheduled Emails */}
        <section className="mt-8 rounded-xl border bg-white">

          <div className="border-b px-6 py-5">
            <h2 className="text-xl font-semibold">
              Scheduled Emails
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              Loading emails...
            </div>
          ) : scheduled.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No scheduled emails.
            </div>
          ) : (
            <div className="divide-y">

              {scheduled.map(
                (email) => (
                  <div
                    key={email.id}
                    className="flex items-center justify-between px-6 py-4"
                  >

                    <div>
                      <p className="font-medium">
                        {email.subject}
                      </p>

                      <p className="text-sm text-gray-500">
                        {email.recipient}
                      </p>
                    </div>

                    <div className="text-right">

                      <p className="text-sm">
                        {new Date(
                          email.scheduledAt
                        ).toLocaleString()}
                      </p>

                      <span className="text-xs text-orange-600">
                        {email.status}
                      </span>

                    </div>

                  </div>
                )
              )}

            </div>
          )}

        </section>

        {/* Sent Emails */}
        <section className="mt-8 rounded-xl border bg-white">

          <div className="border-b px-6 py-5">
            <h2 className="text-xl font-semibold">
              Sent Emails
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              Loading emails...
            </div>
          ) : sent.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No sent emails yet.
            </div>
          ) : (
            <div className="divide-y">

              {sent.map(
                (email) => (
                  <div
                    key={email.id}
                    className="flex items-center justify-between px-6 py-4"
                  >

                    <div>
                      <p className="font-medium">
                        {email.subject}
                      </p>

                      <p className="text-sm text-gray-500">
                        {email.recipient}
                      </p>
                    </div>

                    <div className="text-right">

                      <p className="text-sm">
                        {email.sentAt
                          ? new Date(
                              email.sentAt
                            ).toLocaleString()
                          : "-"}
                      </p>

                      <span className="text-xs text-green-600">
                        SENT
                      </span>

                    </div>

                  </div>
                )
              )}

            </div>
          )}

        </section>

      </main>
    </div>
  );
}

export default App;