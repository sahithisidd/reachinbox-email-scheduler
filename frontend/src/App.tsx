import { useEffect, useRef, useState } from "react";
type User = {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
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

const API =
  "https://reachinbox-email-scheduler-erzy.onrender.com";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  // Individual email
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  // Bulk email
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [leadCount, setLeadCount] = useState(0);
  const [parsingFile, setParsingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Scheduler settings
  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(200);

  // Slack
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackChannel, setSlackChannel] = useState("");

  // UI
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  // --------------------------------------------------
  // Load emails
  // --------------------------------------------------

  async function loadEmails() {
    try {
      setLoading(true);

      const response = await fetch(`${API}/api/emails`);

      if (!response.ok) {
        throw new Error("Failed to load emails");
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.emails)) {
        setEmails(data.emails);
      } else {
        setEmails([]);
      }
    } catch (error) {
      console.error("Load emails error:", error);
      setMessage("Unable to load emails from backend.");
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Load Slack status
  // --------------------------------------------------

  async function loadSlackStatus() {
    try {
      const response = await fetch(
        `${API}/api/slack/status`
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      if (data.success) {
        setSlackConnected(Boolean(data.connected));
        setSlackChannel(data.channelName || "");
      }
    } catch (error) {
      console.error("Slack status error:", error);
    }
  }

  // --------------------------------------------------
  // Initial load
  // --------------------------------------------------

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
        window.location.pathname
      );

      loadSlackStatus();
    }

    if (params.get("login") === "success") {
      setMessage("Google login successful!");

      window.history.replaceState(
        {},
        "",
        window.location.pathname
      );
    }
  }, []);
  useEffect(() => {
  async function loadUser() {
    try {
      const response = await fetch(`${API}/api/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setUser(data.user);
      }
    } catch (error) {
      console.error("Failed to load user:", error);
    }
  }

  loadUser();
}, []);

  // --------------------------------------------------
  // Utility
  // --------------------------------------------------

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email.trim()
    );
  }

  function showMessage(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 5000);
  }

  // --------------------------------------------------
  // Parse leads file
  // --------------------------------------------------

  async function parseLeadsFile(file: File) {
  setParsingFile(true);
  setLeadCount(0);

  try {
    const text = await file.text();

    // Remove UTF-8 BOM and extra whitespace
    const cleanedText = text
      .replace(/^\uFEFF/, "")
      .trim();

    if (!cleanedText) {
      setCsvFile(null);
      setLeadCount(0);
      showMessage("The selected file is empty.");
      return;
    }

    let count = 0;

    // -----------------------------------------
    // TXT FILE
    // One email address per line
    // -----------------------------------------

    if (file.name.toLowerCase().endsWith(".txt")) {
      const emails = cleanedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((email) => isValidEmail(email));

      count = emails.length;
    }

    // -----------------------------------------
    // CSV FILE
    // -----------------------------------------

    else {
      const lines = cleanedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        setCsvFile(null);
        setLeadCount(0);
        showMessage("No data found in CSV.");
        return;
      }

      // Get header row
      const headerLine = lines[0];

      // Support comma or semicolon separated CSV
      const delimiter =
        headerLine.includes(";") &&
        !headerLine.includes(",")
          ? ";"
          : ",";

      const headers = headerLine
        .split(delimiter)
        .map((header) =>
          header
            .replace(/^["']|["']$/g, "")
            .replace(/^\uFEFF/, "")
            .trim()
            .toLowerCase()
        );

      // Accept several common email column names
      const emailColumn = headers.findIndex(
        (header) =>
          header === "email" ||
          header === "email address" ||
          header === "email_address" ||
          header === "emailaddress"
      );

      if (emailColumn === -1) {
        setCsvFile(null);
        setLeadCount(0);

        showMessage(
          "Could not find an email column. Use a column named Email."
        );

        return;
      }

      // Read each data row
      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i]
          .split(delimiter)
          .map((value) =>
            value
              .replace(/^["']|["']$/g, "")
              .trim()
          );

        const email =
          columns[emailColumn] || "";

        if (isValidEmail(email)) {
          count++;
        }
      }
    }

    // -----------------------------------------
    // No valid emails
    // -----------------------------------------

    if (count === 0) {
      setCsvFile(null);
      setLeadCount(0);

      showMessage(
        "No valid email addresses were found in the file."
      );

      return;
    }

    // -----------------------------------------
    // SUCCESS
    // -----------------------------------------

    setCsvFile(file);
    setLeadCount(count);

    showMessage(
      `${count} lead${count === 1 ? "" : "s"} detected successfully.`
    );
  } catch (error) {
    console.error(
      "File parsing error:",
      error
    );

    setCsvFile(null);
    setLeadCount(0);

    showMessage(
      "Unable to read the selected file."
    );
  } finally {
    setParsingFile(false);
  }
}

  // --------------------------------------------------
  // File selected
  // --------------------------------------------------

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0] || null;

    if (!file) {
      setCsvFile(null);
      setLeadCount(0);
      return;
    }

    const fileName =
      file.name.toLowerCase();

    if (
      !fileName.endsWith(".csv") &&
      !fileName.endsWith(".txt")
    ) {
      setCsvFile(null);
      setLeadCount(0);

      showMessage(
        "Please select a CSV or TXT file."
      );

      event.target.value = "";
      return;
    }

    parseLeadsFile(file);
  }

  // --------------------------------------------------
  // Schedule individual email
  // --------------------------------------------------

  async function scheduleEmail() {
    if (!recipient.trim()) {
      showMessage("Please enter a recipient email.");
      return;
    }

    if (!isValidEmail(recipient)) {
      showMessage(
        "Please enter a valid recipient email."
      );
      return;
    }

    if (!subject.trim()) {
      showMessage("Please enter a subject.");
      return;
    }

    if (!body.trim()) {
      showMessage("Please enter the email body.");
      return;
    }

    if (!scheduledAt) {
      showMessage("Please select a start time.");
      return;
    }

    const scheduleDate =
      new Date(scheduledAt);

    if (
      Number.isNaN(scheduleDate.getTime())
    ) {
      showMessage("Invalid start time.");
      return;
    }

    if (
      scheduleDate.getTime() <= Date.now()
    ) {
      showMessage(
        "Start time must be in the future."
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
            recipient: recipient.trim(),
            subject: subject.trim(),
            body: body.trim(),
            scheduledAt:
              scheduleDate.toISOString(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        showMessage(
          data.message ||
            "Failed to schedule email."
        );

        return;
      }

      showMessage(
        "Email scheduled successfully."
      );

      setRecipient("");
      setSubject("");
      setBody("");
      setScheduledAt("");

      await loadEmails();
    } catch (error) {
      console.error(
        "Schedule email error:",
        error
      );

      showMessage(
        "Unable to connect to backend."
      );
    } finally {
      setSending(false);
    }
  }

  // --------------------------------------------------
  // Create backend-compatible CSV
  // --------------------------------------------------

  async function createBackendFile(
    file: File
  ): Promise<File> {
    const text = await file.text();

    if (
      file.name
        .toLowerCase()
        .endsWith(".csv")
    ) {
      return file;
    }

    // TXT format:
    // email1@example.com
    // email2@example.com
    //
    // Backend expects CSV with an email column.

    const emailsFromText = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          isValidEmail(line)
      );

    const csvContent =
      "email\n" +
      emailsFromText.join("\n");

    return new File(
      [csvContent],
      "leads.csv",
      {
        type: "text/csv",
      }
    );
  }

  // --------------------------------------------------
  // Upload and schedule bulk leads
  // --------------------------------------------------

  async function uploadCSV() {
    // IMPORTANT:
    // This checks the same state that the file input sets.
    if (!csvFile) {
      showMessage(
        "Upload a CSV/text file of leads first."
      );

      return;
    }

    if (parsingFile) {
      showMessage(
        "Please wait until the file finishes parsing."
      );

      return;
    }

    if (leadCount <= 0) {
      showMessage(
        "No valid leads were found in the selected file."
      );

      return;
    }

    if (!subject.trim()) {
      showMessage("Please enter a subject.");
      return;
    }

    if (!body.trim()) {
      showMessage("Please enter the email body.");
      return;
    }

    if (!scheduledAt) {
      showMessage(
        "Please select a start time."
      );

      return;
    }

    const startDate =
      new Date(scheduledAt);

    if (
      Number.isNaN(startDate.getTime())
    ) {
      showMessage("Invalid start time.");
      return;
    }

    if (
      startDate.getTime() <= Date.now()
    ) {
      showMessage(
        "Start time must be in the future."
      );

      return;
    }

    if (
      !Number.isFinite(delayMs) ||
      delayMs < 0
    ) {
      showMessage(
        "Delay must be 0 or greater."
      );

      return;
    }

    if (
      !Number.isFinite(hourlyLimit) ||
      hourlyLimit < 1
    ) {
      showMessage(
        "Hourly limit must be at least 1."
      );

      return;
    }

    try {
      setSending(true);
      setMessage("");

      const backendFile =
        await createBackendFile(csvFile);

      const formData = new FormData();

      formData.append(
        "file",
        backendFile
      );

      formData.append(
        "subject",
        subject.trim()
      );

      formData.append(
        "body",
        body.trim()
      );

      formData.append(
        "startTime",
        startDate.toISOString()
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

      const data =
        await response.json();

      if (!response.ok) {
        showMessage(
          data.message ||
            "CSV upload failed."
        );

        return;
      }

      showMessage(
        `${data.count || leadCount} emails scheduled successfully.`
      );

      setCsvFile(null);
      setLeadCount(0);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setSubject("");
      setBody("");
      setScheduledAt("");

      await loadEmails();
    } catch (error) {
      console.error(
        "CSV upload error:",
        error
      );

      showMessage(
        "Unable to upload leads to backend."
      );
    } finally {
      setSending(false);
    }
  }

  // --------------------------------------------------
  // Disconnect Slack
  // --------------------------------------------------

  async function disconnectSlack() {
    try {
      const response = await fetch(
        `${API}/api/slack/disconnect`,
        {
          method: "DELETE",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Disconnect failed"
        );
      }

      setSlackConnected(false);
      setSlackChannel("");

      showMessage(
        "Slack disconnected."
      );
    } catch (error) {
      console.error(
        "Disconnect Slack error:",
        error
      );

      showMessage(
        "Unable to disconnect Slack."
      );
    }
  }

  // --------------------------------------------------
  // Lists
  // --------------------------------------------------

  const scheduled = emails.filter(
    (email) =>
      email.status === "SCHEDULED" ||
      email.status === "PROCESSING"
  );

  const sent = emails.filter(
    (email) =>
      email.status === "SENT"
  );

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

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
                  type="button"
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

            {/* Google User */}
{user ? (
  <div className="flex items-center gap-3">
    {user.avatar ? (
      <img
        src={user.avatar}
        alt={user.name}
        className="h-9 w-9 rounded-full border object-cover"
      />
    ) : (
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 font-semibold text-purple-700">
        {user.name?.charAt(0).toUpperCase()}
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
      type="button"
      onClick={async () => {
        try {
          await fetch(`${API}/api/auth/logout`, {
            method: "POST",
            credentials: "include",
          });

          setUser(null);
          showMessage("Logged out successfully.");
        } catch (error) {
          console.error("Logout error:", error);
          showMessage("Unable to logout.");
        }
      }}
      className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
    >
      Logout
    </button>
  </div>
) : (
  <button
    type="button"
    onClick={() => {
      window.location.href = `${API}/api/auth/google`;
    }}
    className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
  >
    Login with Google
  </button>
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

          {/* Individual Email */}
          <section className="rounded-xl border bg-white p-6">

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
                  type="email"
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

              {/* Subject */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Subject
                </label>

                <input
                  type="text"
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

              {/* Body */}
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

              {/* Start Time */}
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
                type="button"
                disabled={sending}
                onClick={scheduleEmail}
                className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending
                  ? "Scheduling..."
                  : "Schedule Email"}
              </button>

            </div>
          </section>

          {/* Bulk Leads */}
<section className="rounded-xl border bg-white p-6">

  <h2 className="mb-1 text-xl font-semibold">
    Bulk Leads
  </h2>

  <p className="mb-6 text-sm text-gray-500">
    Upload a CSV with an email column or a TXT file with one email per line.
  </p>

  <div className="space-y-5">

    {/* File */}
    <div className="rounded-lg border-2 border-dashed p-8 text-center">

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        onChange={handleFileChange}
        className="block w-full cursor-pointer text-sm"
      />

      {parsingFile && (
        <p className="mt-3 text-sm text-purple-600">
          Parsing file...
        </p>
      )}

      {!parsingFile && csvFile && (
        <p className="mt-3 text-sm font-medium text-gray-700">
          {csvFile.name} • {leadCount}{" "}
          {leadCount === 1 ? "lead" : "leads"}
        </p>
      )}

      {!csvFile && !parsingFile && (
        <p className="mt-3 text-sm text-gray-400">
          No leads file selected.
        </p>
      )}

    </div>

    {/* Subject */}
    <div>
      <label className="mb-1 block text-sm font-medium">
        Subject
      </label>

      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Email subject"
        className="w-full rounded-lg border px-3 py-2 outline-none focus:border-purple-500"
      />
    </div>

    {/* Body */}
    <div>
      <label className="mb-1 block text-sm font-medium">
        Email Body
      </label>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your email..."
        rows={5}
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
        onChange={(e) => setScheduledAt(e.target.value)}
        className="w-full rounded-lg border px-3 py-2"
      />
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
          setDelayMs(Number(e.target.value))
        }
        className="w-full rounded-lg border px-3 py-2"
      />

      <p className="mt-1 text-xs text-gray-400">
        Minimum spacing between sends.
      </p>
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
          setHourlyLimit(Number(e.target.value))
        }
        className="w-full rounded-lg border px-3 py-2"
      />

      <p className="mt-1 text-xs text-gray-400">
        Maximum emails per sender per hour.
      </p>
    </div>

    {/* Upload */}
    <button
      type="button"
      disabled={
        sending ||
        parsingFile ||
        !csvFile ||
        leadCount <= 0
      }
      onClick={uploadCSV}
      className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {parsingFile
        ? "Parsing..."
        : sending
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