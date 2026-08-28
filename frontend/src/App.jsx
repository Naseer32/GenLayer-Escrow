import { useState } from "react";
import {
  connectWallet,
  createJob,
  submitWork,
  approveJob,
  disputeJob,
  getJob,
  getJobCount,
} from "./genlayer.js";

export default function App() {
  const [address, setAddress] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [freelancer, setFreelancer] = useState("");
  const [requirements, setRequirements] = useState("");
  const [amount, setAmount] = useState("1");

  const [jobId, setJobId] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [isUrl, setIsUrl] = useState(true);
  const [disputeReason, setDisputeReason] = useState("");
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
    if (!freelancer.trim() || !requirements.trim()) {
      setStatus("Enter a freelancer address and job requirements.");
      return;
    }

    try {
      setBusy(true);
      setStatus("Creating job...");
      await createJob(
        freelancer.trim(),
        requirements.trim(),
        parseFloat(amount || "0")
      );

      const count = await getJobCount();
      setStatus(`Job created successfully. Total jobs: ${count}`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitWork() {
    if (!jobId.trim() || !deliverable.trim()) {
      setStatus("Enter a job ID and deliverable.");
      return;
    }

    try {
      setBusy(true);
      setStatus("Submitting work...");
      await submitWork(jobId, deliverable.trim(), isUrl);
      setStatus(`Work submitted successfully for job ${jobId}.`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!jobId.trim()) {
      setStatus("Enter a job ID first.");
      return;
    }

    try {
      setBusy(true);
      setStatus("Approving job...");
      await approveJob(jobId);
      setStatus(`Job ${jobId} approved. Funds released to freelancer.`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute() {
    if (!jobId.trim()) {
      setStatus("Enter a job ID first.");
      return;
    }

    if (!disputeReason.trim()) {
      setStatus("Enter a reason for the dispute.");
      return;
    }

    try {
      setBusy(true);
      setStatus(
        "Submitting dispute. GenLayer validators are adjudicating..."
      );

      await disputeJob(jobId, disputeReason.trim());

      setStatus(
        `Job ${jobId} disputed and resolved by the GenLayer adjudication process.`
      );
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLookup() {
    if (!jobId.trim()) {
      setStatus("Enter a job ID first.");
      return;
    }

    try {
      setBusy(true);
      setStatus("Loading job...");
      const details = await getJob(jobId);
      setJobDetails(details);
      setStatus(`Loaded job ${jobId}.`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={pageStyle}>
      <main style={containerStyle}>
        <header style={headerStyle}>
          <div style={logoStyle}>G</div>

          <div>
            <h1 style={titleStyle}>GenLayer Escrow</h1>
            <p style={subtitleStyle}>
              Freelance escrow with GenLayer-powered dispute resolution.
            </p>
          </div>
        </header>

        <div style={introStyle}>
          <strong>How it works</strong>
          <p style={{ margin: "6px 0 0" }}>
            A client locks GEN for a job. The freelancer submits the work.
            The client can approve it directly, or open a dispute for
            GenLayer validators to evaluate the submitted work against the
            requirements.
          </p>
        </div>

        <section style={walletCardStyle}>
          {!address ? (
            <>
              <div>
                <strong>Wallet not connected</strong>
                <p style={mutedStyle}>
                  Connect your wallet to create jobs and interact with escrow.
                </p>
              </div>

              <button
                onClick={handleConnect}
                disabled={busy}
                style={primaryButtonStyle}
              >
                {busy ? "Connecting..." : "Connect Wallet"}
              </button>
            </>
          ) : (
            <div>
              <strong>Wallet connected</strong>
              <div style={addressStyle}>{address}</div>
            </div>
          )}
        </section>

        {status && (
          <div style={statusStyle}>
            {status}
          </div>
        )}

        <section style={cardStyle}>
          <div style={stepStyle}>1</div>

          <div style={cardContentStyle}>
            <h2 style={sectionTitleStyle}>Post a Job</h2>
            <p style={mutedStyle}>
              Create a job and lock GEN in escrow for the assigned freelancer.
            </p>

            <label style={labelStyle}>Freelancer wallet</label>
            <input
              style={inputStyle}
              placeholder="0x..."
              value={freelancer}
              onChange={(e) => setFreelancer(e.target.value)}
            />

            <label style={labelStyle}>Requirements</label>
            <textarea
              style={textareaStyle}
              placeholder="Describe what the freelancer needs to deliver..."
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
            />

            <label style={labelStyle}>Escrow amount</label>
            <div style={amountRowStyle}>
              <input
                style={{ ...inputStyle, marginBottom: 0 }}
                type="number"
                min="0"
                step="0.01"
                placeholder="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span style={genLabelStyle}>GEN</span>
            </div>

            <button
              onClick={handleCreateJob}
              disabled={busy || !address}
              style={primaryButtonStyle}
            >
              {busy ? "Processing..." : "Create Job"}
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <div style={stepStyle}>2</div>

          <div style={cardContentStyle}>
            <h2 style={sectionTitleStyle}>Submit Work</h2>
            <p style={mutedStyle}>
              The assigned freelancer submits a text deliverable or webpage.
            </p>

            <label style={labelStyle}>Job ID</label>
            <input
              style={inputStyle}
              inputMode="numeric"
              placeholder="0"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            />

            <label style={labelStyle}>Deliverable</label>
            <textarea
              style={textareaStyle}
              placeholder="Paste your work or webpage URL..."
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
            />

            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={isUrl}
                onChange={(e) => setIsUrl(e.target.checked)}
              />
              <span>This deliverable is a URL</span>
            </label>

            <button
              onClick={handleSubmitWork}
              disabled={busy || !address}
              style={primaryButtonStyle}
            >
              {busy ? "Processing..." : "Submit Work"}
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <div style={stepStyle}>3</div>

          <div style={cardContentStyle}>
            <h2 style={sectionTitleStyle}>Resolve the Job</h2>
            <p style={mutedStyle}>
              The client can approve the work or submit a dispute.
            </p>

            <label style={labelStyle}>Dispute reason</label>
            <textarea
              style={textareaStyle}
              placeholder="Explain why the submitted work does not satisfy the requirements..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              maxLength={2000}
            />

            <div style={buttonRowStyle}>
              <button
                onClick={handleApprove}
                disabled={busy || !address}
                style={primaryButtonStyle}
              >
                {busy ? "Processing..." : "Approve"}
              </button>

              <button
                onClick={handleDispute}
                disabled={busy || !address}
                style={dangerButtonStyle}
              >
                {busy ? "Processing..." : "Dispute"}
              </button>
            </div>

            <div style={infoBoxStyle}>
              <strong>Dispute resolution</strong>
              <p style={{ margin: "5px 0 0" }}>
                GenLayer validators evaluate the job requirements, submitted
                work, and dispute reason before determining whether the
                freelancer or client should receive the escrowed GEN.
              </p>
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <div style={stepStyle}>4</div>

          <div style={cardContentStyle}>
            <h2 style={sectionTitleStyle}>Check Job Status</h2>
            <p style={mutedStyle}>
              View the current state and resolution of a job.
            </p>

            <button
              onClick={handleLookup}
              disabled={busy || !address}
              style={secondaryButtonStyle}
            >
              Look Up Job {jobId || "?"}
            </button>

            {jobDetails && (
              <div style={detailsStyle}>
                <div style={detailRowStyle}>
                  <span>Status</span>
                  <strong>{jobDetails.status}</strong>
                </div>

                <div style={detailRowStyle}>
                  <span>Resolution</span>
                  <strong>
                    {jobDetails.resolution || "Pending"}
                  </strong>
                </div>

                <div style={detailRowStyle}>
                  <span>Amount</span>
                  <strong>
                    {jobDetails.amount} wei
                  </strong>
                </div>

                <div style={detailRowStyle}>
                  <span>Deliverable</span>
                  <span style={{ wordBreak: "break-word" }}>
                    {jobDetails.deliverable || "Not submitted"}
                  </span>
                </div>

                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13 }}>
                    View full job data
                  </summary>

                  <pre style={preStyle}>
                    {JSON.stringify(jobDetails, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </section>

        <footer style={footerStyle}>
          <strong>GenLayer Escrow</strong>
          <span>Intelligent contract powered by GenLayer</span>
        </footer>
      </main>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#ffffff",
  color: "#171717",
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  boxSizing: "border-box",
};

const containerStyle = {
  width: "100%",
  maxWidth: 720,
  margin: "0 auto",
  padding: "24px 16px 40px",
  boxSizing: "border-box",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 20,
};

const logoStyle = {
  width: 42,
  height: 42,
  borderRadius: 10,
  background: "#2563eb",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: 20,
  flexShrink: 0,
};

const titleStyle = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.2,
};

const subtitleStyle = {
  margin: "4px 0 0",
  color: "#666",
  fontSize: 14,
  lineHeight: 1.5,
};

const introStyle = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
  fontSize: 13,
  lineHeight: 1.5,
};

const walletCardStyle = {
  border: "1px solid #dbe3ef",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: "#ffffff",
};

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  marginBottom: 16,
  background: "#ffffff",
  display: "flex",
  gap: 14,
  boxSizing: "border-box",
};

const cardContentStyle = {
  flex: 1,
  minWidth: 0,
};

const stepStyle = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  background: "#eff6ff",
  color: "#2563eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  flexShrink: 0,
};

const sectionTitleStyle = {
  margin: "2px 0 4px",
  fontSize: 18,
};

const mutedStyle = {
  color: "#666",
  fontSize: 13,
  lineHeight: 1.5,
  margin: "0 0 12px",
};

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  margin: "10px 0 5px",
};

const inputStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  background: "#ffffff",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 82,
  resize: "vertical",
  fontFamily: "inherit",
};

const amountRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const genLabelStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#555",
};

const checkboxLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  margin: "10px 0 2px",
};

const buttonRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const primaryButtonStyle = {
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "11px 15px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 10,
  minHeight: 42,
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "#f3f4f6",
  color: "#111827",
  border: "1px solid #d1d5db",
};

const dangerButtonStyle = {
  ...primaryButtonStyle,
  background: "#b3261e",
};

const statusStyle = {
  background: "#f4f4f4",
  border: "1px solid #e5e7eb",
  padding: 10,
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.4,
  marginBottom: 16,
  wordBreak: "break-word",
};

const addressStyle = {
  fontSize: 12,
  color: "#555",
  wordBreak: "break-all",
  marginTop: 5,
};

const infoBoxStyle = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 10,
  marginTop: 14,
  fontSize: 12,
  lineHeight: 1.5,
};

const detailsStyle = {
  background: "#f8fafc",
  borderRadius: 10,
  padding: 12,
  marginTop: 12,
  fontSize: 13,
};

const detailRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "7px 0",
  borderBottom: "1px solid #e5e7eb",
};

const preStyle = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  padding: 10,
  borderRadius: 8,
  fontSize: 11,
  overflowX: "auto",
  marginTop: 10,
};

const footerStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  textAlign: "center",
  color: "#777",
  fontSize: 12,
  paddingTop: 10,
};
