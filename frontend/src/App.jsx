import { useState } from "react";
import {
  connectWallet,
  getConnectedAddress,
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

  // create_job form state
  const [freelancer, setFreelancer] = useState("");
  const [requirements, setRequirements] = useState("");
  const [amount, setAmount] = useState("1");

  // submit_work / approve / dispute / lookup form state
  const [jobId, setJobId] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [isUrl, setIsUrl] = useState(true);
  const [disputeReason, setDisputeReason] = useState("");
  const [jobDetails, setJobDetails] = useState(null);

  async function handleConnect() {
    try {
      setBusy(true);
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
    try {
      setBusy(true);
      setStatus("Creating job...");
      await createJob(freelancer, requirements, parseFloat(amount || "0"));
      const count = await getJobCount();
      setStatus(`Job created. Total jobs: ${count}`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitWork() {
    try {
      setBusy(true);
      setStatus("Submitting work...");
      await submitWork(jobId, deliverable, isUrl);
      setStatus(`Work submitted for job ${jobId}.`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    try {
      setBusy(true);
      setStatus("Approving...");
      await approveJob(jobId);
      setStatus(`Job ${jobId} approved — funds released to freelancer.`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute() {
    if (!disputeReason.trim()) {
      setStatus("Please enter a reason for the dispute.");
      return;
    }
    try {
      setBusy(true);
      setStatus("Disputing — validators are adjudicating, this can take a bit...");
      await disputeJob(jobId, disputeReason);
      setStatus(`Job ${jobId} disputed and resolved. Check details below.`);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLookup() {
    try {
      setBusy(true);
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
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>GenLayer Escrow</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        AI-adjudicated freelance escrow. Post a job as a client, submit work as
        a freelancer, and let validators resolve disputes.
      </p>

      {!address ? (
        <button onClick={handleConnect} disabled={busy} style={btnStyle}>
          Connect Wallet
        </button>
      ) : (
        <p style={{ fontSize: 13, wordBreak: "break-all" }}>
          Connected: <strong>{address}</strong>
        </p>
      )}

      {status && (
        <div style={{ background: "#f4f4f4", padding: 8, borderRadius: 6, fontSize: 13, margin: "12px 0" }}>
          {status}
        </div>
      )}

      <hr style={{ margin: "20px 0" }} />

      <section>
        <h2 style={sectionHeader}>1. Post a job (as client)</h2>
        <input
          style={inputStyle}
          placeholder="Freelancer wallet address (0x...)"
          value={freelancer}
          onChange={(e) => setFreelancer(e.target.value)}
        />
        <textarea
          style={{ ...inputStyle, height: 70 }}
          placeholder="Job requirements"
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Escrow amount (GEN)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button onClick={handleCreateJob} disabled={busy || !address} style={btnStyle}>
          Create Job
        </button>
      </section>

      <hr style={{ margin: "20px 0" }} />

      <section>
        <h2 style={sectionHeader}>2. Submit work (as freelancer)</h2>
        <input
          style={inputStyle}
          placeholder="Job ID"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="Deliverable (text or URL)"
          value={deliverable}
          onChange={(e) => setDeliverable(e.target.value)}
        />
        <label style={{ fontSize: 13, display: "block", margin: "6px 0" }}>
          <input type="checkbox" checked={isUrl} onChange={(e) => setIsUrl(e.target.checked)} />
          {" "}This is a URL
        </label>
        <button onClick={handleSubmitWork} disabled={busy || !address} style={btnStyle}>
          Submit Work
        </button>
      </section>

      <hr style={{ margin: "20px 0" }} />

      <section>
        <h2 style={sectionHeader}>3. Resolve (as client)</h2>
        <p style={{ fontSize: 13, color: "#666" }}>Uses the Job ID entered above.</p>
        <textarea
          style={{ ...inputStyle, height: 60 }}
          placeholder="Reason for dispute (required if disputing)"
          value={disputeReason}
          onChange={(e) => setDisputeReason(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleApprove} disabled={busy || !address} style={btnStyle}>
            Approve
          </button>
          <button onClick={handleDispute} disabled={busy || !address} style={{ ...btnStyle, background: "#b3261e" }}>
            Dispute
          </button>
        </div>
      </section>

      <hr style={{ margin: "20px 0" }} />

      <section>
        <h2 style={sectionHeader}>Check job status</h2>
        <button onClick={handleLookup} disabled={busy || !address} style={btnStyle}>
          Look up Job {jobId || "?"}
        </button>
        {jobDetails && (
          <pre style={{ background: "#f4f4f4", padding: 10, borderRadius: 6, fontSize: 12, overflowX: "auto" }}>
            {JSON.stringify(jobDetails, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

const btnStyle = {
  background: "#2b6cb0",
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 14,
  cursor: "pointer",
  marginTop: 6,
};

const inputStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 8,
  marginBottom: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
  fontSize: 14,
};

const sectionHeader = { fontSize: 16, marginBottom: 8 };
