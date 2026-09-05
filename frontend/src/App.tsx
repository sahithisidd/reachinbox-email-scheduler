import { useEffect, useState } from "react";

type User = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
};

type Email = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: string;
};

const API = "http://localhost:5000";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

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

  // -----------------------------
  // Load logged-in Google user
  // -----------------------------
  async function loadUser() {
    try {
      const response = await fetch(`${API}/api/auth/me`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success) {
          setUser(data.user);
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
    } finally {
      setAuthLoading(false);
    }
  }

  // -----------------------------
  // Load emails
  // -----------------------------
  async function loadEmails() {
    try {
      setLoading(true);

      const response = await fetch(`${API}/api/emails`, {
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setEmails(data.emails);
      }
    } catch (error) {
      console.error("Email loading error:", error);
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // Load Slack status
  // -----------------------------
  async function loadSlackStatus() {
    try {
      const response = await fetch(`${API}/api/slack/status`, {
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setSlackConnected(data.connected);
        setSlackChannel(data.channelName || "");
      }
    } catch (error) {
      console.error("Slack status error:", error);
    }
  }

  // -----------------------------
  // Initial loading
  // -----------------------------
  useEffect(() => {
    loadUser();
    loadEmails();
    loadSlackStatus();

    const params = new URLSearchParams(window.location.search);

    if (params.get("login") === "success") {
      setMessage("Logged in successfully!");
      window.history.replaceState({}, "", "/");
    }

    if (params.get("slack") === "connected") {
      setMessage("Slack connected successfully!");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // -----------------------------
  // Schedule single email
  // -----------------------------
  async function scheduleEmail() {
    if (!recipient || !subject || !body || !scheduledAt) {
      setMessage("Please fill all email fields.");
      return;
    }

    try {
      setSending(true);
      setMessage("");

      const response = await fetch(`${API}/api/emails/schedule`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient,
          subject,
          body,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(
          data.message || "Failed to schedule email."
        );
        return;
      }

      setMessage("Email scheduled successfully.");

      setRecipient("");
      setSubject("");
      setBody("");
      setScheduledAt("");

      await loadEmails();
    } catch (error) {
      console.error(error);
      setMessage("Unable to connect to backend.");
    } finally {
      setSending(false);
    }
  }

  // -----------------------------
  // Upload CSV
  // -----------------------------
  async function uploadCSV() {
    if (!csvFile) {
      setMessage("Please select a CSV file.");
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

      formData.append("file", csvFile);
      formData.append("subject", subject);
      formData.append("body", body);

      formData.append(
        "startTime",
        new Date(scheduledAt).toISOString()
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
          credentials: "include",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(
          data.message || "CSV upload failed."
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
      setMessage("Unable to upload CSV.");
    } finally {
      setSending(false);
    }
  }

  // -----------------------------
  // Disconnect Slack
  // -----------------------------
  async function disconnectSlack() {
    try {
      await fetch(
        `${API}/api/slack/disconnect`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      setSlackConnected(false);
      setSlackChannel("");
      setMessage("Slack disconnected.");
    } catch (error) {
      console.error("Slack disconnect error:", error);
      setMessage("Failed to disconnect Slack.");
    }
  }

  // -----------------------------
  // Logout
  // -----------------------------
  async function logout() {
    try {
      await fetch(
        `${API}/api/auth/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      setUser(null);
      setMessage("Logged out successfully.");
    } catch (error) {
      console.error("Logout error:", error);
      setMessage("Logout failed.");
    }
  }

  // -----------------------------
  // Email groups
  // -----------------------------
  const scheduled = emails.filter(
    (email) =>
      email.status === "SCHEDULED" ||
      email.status === "PROCESSING"
  );

  const sent = emails.filter(
    (email) => email.status === "SENT"
  );

  // -----------------------------
  // Loading screen
  // -----------------------------
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fb]">
        <div className="rounded-xl border bg-white px-8 py-6 text-gray-500 shadow-sm">
          Loading ReachInbox...
        </div>
      </div>
    );
  }

  // -----------------------------
  // Main dashboard
  // -----------------------------
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

            {/* Slack */}
            {slackConnected ? (
              <>
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                  Slack connected
                  {slackChannel &&
                    ` • #${slackChannel}`}
                </span>

                <button
                  onClick={disconnectSlack}
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

            {/* Google User */}
            {user ? (
              <div className="flex items-center gap-3">

                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-9 w-9 rounded-full"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 font-semibold text-purple-700">
                    {user.name
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium">
                    {user.name}
                  </p>

                  <p className="text-xs text-gray-500">
                    {user.email}
                  </p>
                </div>

                <button
                  onClick={logout}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Logout
                </button>
              </div>
            ) : (
              <a
                href={`${API}/api/auth/google`}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Sign in with Google
              </a>
            )}

          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-8">

        {/* Message */}
        {message && (
          <div className="mb-6 rounded-lg border bg-white px-4 py-3 text-sm shadow-sm">
            {message}
          </div>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Total Emails
            </p>

            <p className="mt-2 text-3xl font-bold">
              {emails.length}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">
              Scheduled
            </p>

            <p className="mt-2 text-3xl font-bold">
              {scheduled.length}
            </p>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
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

          {/* Compose Email */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">

            <h2 className="mb-1 text-xl font-semibold">
              Compose Email
            </h2>

            <p className="mb-6 text-sm text-gray-500">
              Schedule an individual email.
            </p>

            <div className="space-y-4">

              {/* Recipient */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Recipient
                </label>

                <input
                  value={recipient}
                  onChange={(e) =>
                    setRecipient(e.target.value)
                  }
                  placeholder="recipient@example.com"
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:border-purple-500"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Subject
                </label>

                <input
                  value={subject}
                  onChange={(e) =>
                    setSubject(e.target.value)
                  }
                  placeholder="Email subject"
                  className="w-full rounded-lg border px-3 py-2 outline-none focus:border-purple-500"
                />
              </div>

              {/* Body */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Body
                </label>

                <textarea
                  value={body}
                  onChange={(e) =>
                    setBody(e.target.value)
                  }
                  placeholder="Write your email..."
                  rows={7}
                  className="w-full resize-none rounded-lg border px-3 py-2 outline-none focus:border-purple-500"
                />
              </div>

              {/* Start Time */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Start Time
                </label>

                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) =>
                    setScheduledAt(e.target.value)
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              {/* Schedule */}
              <button
                disabled={sending}
                onClick={scheduleEmail}
                className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending
                  ? "Scheduling..."
                  : "Schedule Email"}
              </button>

            </div>
          </section>

          {/* Bulk Leads */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">

            <h2 className="mb-1 text-xl font-semibold">
              Bulk Leads
            </h2>

            <p className="mb-6 text-sm text-gray-500">
              Upload a CSV containing an email column.
            </p>

            <div className="space-y-5">

              {/* File */}
              <div className="rounded-lg border-2 border-dashed p-8 text-center">

                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    const file =
                      e.target.files?.[0] || null;

                    setCsvFile(file);

                    if (file) {
                      const reader =
                        new FileReader();

                      reader.onload = () => {
                        const text =
                          String(
                            reader.result || ""
                          );

                        const lines =
                          text
                            .split(/\r?\n/)
                            .filter(Boolean);

                        setLeadCount(
                          Math.max(
                            lines.length - 1,
                            0
                          )
                        );
                      };

                      reader.readAsText(file);
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

              {/* Delay */}
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
                      Number(e.target.value)
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              {/* Hourly limit */}
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
                      Number(e.target.value)
                    )
                  }
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>

              {/* Upload */}
              <button
                disabled={sending}
                onClick={uploadCSV}
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
        <section className="mt-8 rounded-xl border bg-white shadow-sm">

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

              {scheduled.map((email) => (
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
              ))}

            </div>
          )}

        </section>

        {/* Sent Emails */}
        <section className="mt-8 rounded-xl border bg-white shadow-sm">

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

              {sent.map((email) => (
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
              ))}

            </div>
          )}

        </section>

      </main>
    </div>
  );
}

export default App;