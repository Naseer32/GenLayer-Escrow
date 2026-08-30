import { useState } from "react";
import {
  connectWallet,
  createJob,
  submitWork,
  approveJob,
  disputeJob,
  recoverUnavailableJob,
  abandonJob,
  getJob,
  getJobCount,
} from "./genlayer.js";

export default function App() {
  const [address, setAddress] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // Create job
  const [freelancer, setFreelancer] = useState("");
  const [requirements, setRequirements] = useState("");
  const [amount, setAmount] = useState("1");

  // Submit work
  const [submitJobId, setSubmitJobId] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [isUrl, setIsUrl] = useState(true);

  // Resolve / dispute / recovery / abandonment
  const [resolveJobId, setResolveJobId] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  // Abandon job
  const [abandonJobId, setAbandonJobId] = useState("");

  // Lookup
  const [lookupJobId, setLookupJobId] = useState("");
  const [jobDetails, setJobDetails] = useState(null);

  async function handleConnect() {
    try {
      setBusy(true);
      setStatus("Connecting wallet...");

      const addr = await connectWallet();

      setAddress(addr);
      setStatus("Wallet connected.");
    } catch (err) {
      setStatus("Connect failed: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateJob() {
    if (!freelancer.trim()) {
      setStatus("Enter the freelancer wallet address.");
      return;
    }

    if (!requirements.trim()) {
      setStatus("Enter the job requirements.");
      return;
    }

    const parsedAmount = parseFloat(amount || "0");

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatus("Enter a valid escrow amount.");
      return;
    }

    try {
      setBusy(true);
      setStatus("Creating job...");

      const receipt = await createJob(
        freelancer.trim(),
        requirements.trim(),
        parsedAmount
      );

      const count = await getJobCount();

      setStatus(
        `Job created successfully. Total jobs: ${count}.`
      );

      console.log("Create job receipt:", receipt);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitWork() {
    if (!submitJobId.trim()) {
      setStatus("Enter a Job ID for submitting work.");
      return;
    }

    if (!deliverable.trim()) {
      setStatus("Enter the deliverable or webpage URL.");
      return;
    }

    try {
      setBusy(true);
      setStatus(`Submitting work for Job ${submitJobId}...`);

      await submitWork(
        submitJobId.trim(),
        deliverable.trim(),
        isUrl
      );

      setStatus(
        `Work submitted successfully for Job ${submitJobId}.`
      );
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!resolveJobId.trim()) {
      setStatus("Enter a Job ID for approval.");
      return;
    }

    try {
      setBusy(true);
      setStatus(`Approving Job ${resolveJobId}...`);

      await approveJob(resolveJobId.trim());

      setStatus(
        `Job ${resolveJobId} approved. Funds released to freelancer.`
      );
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute() {
    if (!resolveJobId.trim()) {
      setStatus("Enter a Job ID for the dispute.");
      return;
    }

    if (!disputeReason.trim()) {
      setStatus("Please enter a reason for the dispute.");
      return;
    }

    if (disputeReason.trim().length > 2000) {
      setStatus("Dispute reason must be 2000 characters or less.");
      return;
    }

    try {
      setBusy(true);
      setStatus(
        "Submitting dispute. GenLayer validators are adjudicating the job..."
      );

      await disputeJob(
        resolveJobId.trim(),
        disputeReason.trim()
      );

      setStatus(
        `Job ${resolveJobId} dispute completed. Check the job status below.`
      );
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRecovery() {
    if (!resolveJobId.trim()) {
      setStatus("Enter a Job ID for recovery.");
      return;
    }

    if (!disputeReason.trim()) {
      setStatus("Please enter a recovery reason.");
      return;
    }

    if (disputeReason.trim().length > 2000) {
      setStatus("Recovery reason must be 2000 characters or less.");
      return;
    }

    try {
      setBusy(true);
      setStatus(
        "Requesting recovery. GenLayer validators are evaluating the available information..."
      );

      await recoverUnavailableJob(
        resolveJobId.trim(),
        disputeReason.trim()
      );

      setStatus(
        `Recovery completed for Job ${resolveJobId}. Check the job status below.`
      );
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAbandon() {
    if (!abandonJobId.trim()) {
      setStatus("Enter a Job ID to abandon.");
      return;
    }

    try {
      setBusy(true);
      setStatus(
        `Checking abandoned-job recovery for Job ${abandonJobId}...`
      );

      await abandonJob(abandonJobId.trim());

      setStatus(
        `Job ${abandonJobId} abandoned successfully. Escrow recovered according to the job state.`
      );
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLookup() {
    if (!lookupJobId.trim()) {
      setStatus("Enter a Job ID to look up.");
      return;
    }

    try {
      setBusy(true);
      setStatus(`Loading Job ${lookupJobId}...`);

      const details = await getJob(lookupJobId.trim());

      setJobDetails(details);
      setStatus(`Loaded Job ${lookupJobId}.`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <header>
          <div style={logoRow}>
            <div style={logo}>G</div>

            <div>
              <h1 style={titleStyle}>GenLayer Escrow</h1>

              <p style={subtitleStyle}>
                Freelance escrow with GenLayer-powered dispute resolution.
              </p>
            </div>
          </div>
        </header>

        <section style={infoBox}>
          <h2 style={infoTitle}>How it works</h2>

          <p style={infoText}>
            A client locks GEN for a job. The freelancer submits the work.
            The client can approve it directly, or open a dispute for
            GenLayer validators to evaluate the submitted work against the
            requirements. If the evidence cannot be retrieved, either party
            can request recovery. Abandoned jobs can also be recovered after
            the applicable deadline.
          </p>
        </section>

        <section style={walletBox}>
          {!address ? (
            <>
              <div style={walletStatus}>
                Wallet not connected
              </div>

              <button
                onClick={handleConnect}
                disabled={busy}
                style={primaryButton}
              >
                Connect Wallet
              </button>
            </>
          ) : (
            <>
              <div style={walletStatus}>
                Wallet connected
              </div>

              <div style={addressStyle}>
                {address}
              </div>
            </>
          )}
        </section>

        {status && (
          <div style={statusBox}>
            {status}
          </div>
        )}

        <section style={card}>
          <div style={stepNumber}>1</div>

          <h2 style={sectionTitle}>Post a Job</h2>

          <p style={description}>
            Create a job and lock GEN in escrow for the assigned freelancer.
          </p>

          <label style={label}>
            Freelancer wallet
          </label>

          <input
            style={inputStyle}
            placeholder="0x..."
            value={freelancer}
            onChange={(e) => setFreelancer(e.target.value)}
          />

          <label style={label}>
            Requirements
          </label>

          <textarea
            style={textareaStyle}
            placeholder="Describe what the freelancer needs to deliver..."
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />

          <label style={label}>
            Escrow amount
          </label>

          <div style={amountRow}>
            <input
              style={amountInput}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />

            <span style={currency}>
              GEN
            </span>
          </div>

          <button
            onClick={handleCreateJob}
            disabled={busy || !address}
            style={primaryButton}
          >
            Create Job
          </button>
        </section>

        <section style={card}>
          <div style={stepNumber}>2</div>

          <h2 style={sectionTitle}>Submit Work</h2>

          <p style={description}>
            The assigned freelancer submits a text deliverable or webpage.
          </p>

          <label style={label}>
            Job ID
          </label>

          <input
            style={inputStyle}
            placeholder="Enter job ID"
            value={submitJobId}
            onChange={(e) => setSubmitJobId(e.target.value)}
            inputMode="numeric"
          />

          <label style={label}>
            Deliverable
          </label>

          <input
            style={inputStyle}
            placeholder="Paste your work or webpage URL..."
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
          />

          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={isUrl}
              onChange={(e) => setIsUrl(e.target.checked)}
            />

            <span>
              This deliverable is a URL
            </span>
          </label>

          <button
            onClick={handleSubmitWork}
            disabled={busy || !address}
            style={primaryButton}
          >
            Submit Work
          </button>
        </section>

        <section style={card}>
          <div style={stepNumber}>3</div>

          <h2 style={sectionTitle}>
            Resolve the Job
          </h2>

          <p style={description}>
            The client can approve the work or submit a dispute. If the
            submitted evidence cannot be retrieved, recovery can be requested.
          </p>

          <label style={label}>
            Job ID
          </label>

          <input
            style={inputStyle}
            placeholder="Enter job ID"
            value={resolveJobId}
            onChange={(e) => setResolveJobId(e.target.value)}
            inputMode="numeric"
          />

          <label style={label}>
            Dispute or recovery reason
          </label>

          <textarea
            style={textareaStyle}
            placeholder="Explain the dispute or recovery request..."
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            maxLength={2000}
          />

          <div style={buttonRow}>
            <button
              onClick={handleApprove}
              disabled={busy || !address}
              style={primaryButton}
            >
              Approve
            </button>

            <button
              onClick={handleDispute}
              disabled={busy || !address}
              style={dangerButton}
            >
              Dispute
            </button>

            <button
              onClick={handleRecovery}
              disabled={busy || !address}
              style={secondaryButton}
            >
              Recover
            </button>
          </div>

          <div style={disputeInfo}>
            <strong>
              Dispute resolution
            </strong>

            <p>
              GenLayer validators evaluate the job requirements, submitted
              work, and dispute reason before determining whether the
              freelancer or client should receive the escrowed GEN.
            </p>

            <strong>
              Evidence recovery
            </strong>

            <p>
              If a submitted URL cannot be retrieved and the job enters
              evidence_unavailable, either the client or freelancer can
              request recovery. GenLayer validators then determine which
              party has the stronger claim based on the available information.
            </p>
          </div>
        </section>

        <section style={card}>
          <div style={stepNumber}>4</div>

          <h2 style={sectionTitle}>
            Abandoned Job
          </h2>

          <p style={description}>
            Recover escrow when a job has passed its applicable deadline
            without the required action.
          </p>

          <label style={label}>
            Job ID
          </label>

          <input
            style={inputStyle}
            placeholder="Enter job ID"
            value={abandonJobId}
            onChange={(e) => setAbandonJobId(e.target.value)}
            inputMode="numeric"
          />

          <button
            onClick={handleAbandon}
            disabled={busy || !address}
            style={secondaryButtonFull}
          >
            Recover Abandoned Job
          </button>

          <div style={disputeInfo}>
            <strong>
              How abandonment works
            </strong>

            <p>
              If the freelancer never submits work before the submission
              deadline, the client can recover the escrow.
            </p>

            <p>
              If the freelancer submits work but the client does not approve
              or dispute it before the approval deadline, the freelancer can
              recover the escrow.
            </p>
          </div>
        </section>

        <section style={card}>
          <div style={stepNumber}>5</div>

          <h2 style={sectionTitle}>
            Check Job Status
          </h2>

          <p style={description}>
            View the current state and resolution of a job.
          </p>

          <label style={label}>
            Job ID
          </label>

          <input
            style={inputStyle}
            placeholder="Enter job ID"
            value={lookupJobId}
            onChange={(e) => setLookupJobId(e.target.value)}
            inputMode="numeric"
          />

          <button
            onClick={handleLookup}
            disabled={busy || !address}
            style={primaryButton}
          >
            Look Up Job
          </button>

          {jobDetails && (
            <pre style={resultBox}>
              {JSON.stringify(jobDetails, null, 2)}
            </pre>
          )}
        </section>

        <footer style={footer}>
          GenLayer Escrow
          <br />
          Intelligent contract powered by GenLayer
        </footer>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#ffffff",
  color: "#111827",
  fontFamily:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const containerStyle = {
  width: "100%",
  maxWidth: 560,
  margin: "0 auto",
  padding: "24px 16px 40px",
  boxSizing: "border-box",
};

const logoRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 24,
};

const logo = {
  width: 42,
  height: 42,
  borderRadius: 10,
  background: "#2563eb",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  fontWeight: 700,
};

const titleStyle = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.2,
};

const subtitleStyle = {
  margin: "5px 0 0",
  color: "#6b7280",
  fontSize: 14,
  lineHeight: 1.5,
};

const infoBox = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  background: "#f9fafb",
};

const infoTitle = {
  fontSize: 16,
  margin: "0 0 6px",
};

const infoText = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "#4b5563",
  margin: 0,
};

const walletBox = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const walletStatus = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 6,
};

const addressStyle = {
  fontSize: 12,
  color: "#4b5563",
  wordBreak: "break-all",
  marginBottom: 10,
};

const statusBox = {
  background: "#f3f4f6",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
  marginBottom: 16,
  wordBreak: "break-word",
};

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 18,
  marginBottom: 16,
  background: "#ffffff",
};

const stepNumber = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "#eff6ff",
  color: "#2563eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 13,
  marginBottom: 10,
};

const sectionTitle = {
  fontSize: 18,
  margin: "0 0 5px",
};

const description = {
  color: "#6b7280",
  fontSize: 13,
  lineHeight: 1.5,
  margin: "0 0 16px",
};

const label = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
};

const inputStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  marginBottom: 14,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  background: "#ffffff",
  color: "#111827",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 90,
  resize: "vertical",
  fontFamily: "inherit",
};

const amountRow = {
  display: "flex",
  alignItems: "center",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  marginBottom: 14,
  overflow: "hidden",
};

const amountInput = {
  flex: 1,
  border: "none",
  outline: "none",
  padding: "11px 12px",
  fontSize: 14,
  minWidth: 0,
};

const currency = {
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 700,
  color: "#6b7280",
};

const checkboxLabel = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  marginBottom: 14,
  color: "#374151",
};

const buttonRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const primaryButton = {
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  width: "100%",
};

const dangerButton = {
  background: "#b42318",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  flex: 1,
  minWidth: 120,
};

const secondaryButton = {
  background: "#ffffff",
  color: "#374151",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  flex: 1,
  minWidth: 120,
};

const secondaryButtonFull = {
  background: "#f59e0b",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  width: "100%",
};

const disputeInfo = {
  marginTop: 16,
  padding: 12,
  borderRadius: 8,
  background: "#f9fafb",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#4b5563",
};

const resultBox = {
  background: "#f3f4f6",
  borderRadius: 8,
  padding: 12,
  marginTop: 14,
  fontSize: 12,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const footer = {
  textAlign: "center",
  color: "#9ca3af",
  fontSize: 12,
  lineHeight: 1.6,
  paddingTop: 12,
};
