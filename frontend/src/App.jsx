import { useEffect, useState } from "react";
import { useEffect, useState, useMemo } from "react";

import {
  connectWallet,
  restoreWallet,
  rebuildClient,
  getConnectedAddress,
  createJob,
  submitWork,
  approveJob,
  disputeJob,
  recoverUnavailableJob,
  abandonJob,
  getJob,
  getJobCount,
} from "./genlayer.js";


const TX_STORAGE_KEY = "genlayer_escrow_transactions";

/* --------------------------------------------------
   Icons
-------------------------------------------------- */

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  switch (name) {
    case "lock":
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );

    case "zap":
      return (
        <svg {...common}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
      );

    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );

    case "file":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="m8 14 2 2 5-5" />
        </svg>
      );

    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );

    case "alert":
      return (
        <svg {...common}>
          <path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );

    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 0 0-14.9-4" />
          <path d="M4 4v5h5" />
          <path d="M4 13a8 8 0 0 0 14.9 4" />
          <path d="M20 20v-5h-5" />
        </svg>
      );

    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" />
          <path d="m8.5 12 2.2 2.2 4.8-4.8" />
        </svg>
      );

    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case "wallet":
      return (
        <svg {...common}>
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v3H6.5A2.5 2.5 0 0 0 4 10.5v-4Z" />
          <path d="M4 10.5A2.5 2.5 0 0 1 6.5 8H20v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5v-7Z" />
          <path d="M16 13h4" />
        </svg>
      );

    case "loader":
      return (
        <svg {...common} className="spin">
          <circle cx="12" cy="12" r="9" opacity=".25" />
          <path d="M21 12a9 9 0 0 1-9 9" />
        </svg>
      );

    default:
      return null;
  }
}

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */

function shortAddress(value) {
  if (!value) return "";
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortHash(value) {
  if (!value) return "";
  if (value.length < 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatMethod(method) {
  return String(method || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function resultToText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function findField(value, keys) {
  if (!value || typeof value !== "object") return null;

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      value[key] !== null &&
      value[key] !== undefined
    ) {
      return value[key];
    }
  }

  for (const key of Object.keys(value)) {
    const nested = value[key];

    if (nested && typeof nested === "object") {
      const found = findField(nested, keys);

      if (found !== null && found !== undefined) {
        return found;
      }
    }
  }

  return null;
}

function normalizeStatus(value) {
  if (!value) return "";

  return String(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
}

function statusLabel(value) {
  if (!value) return "Retrieved";

  const normalized = normalizeStatus(value);

  if (normalized.includes("evidence unavailable")) {
    return "Evidence Unavailable";
  }

  if (normalized.includes("approved")) {
    return "Approved";
  }

  if (normalized.includes("resolved")) {
    return "Resolved";
  }

  if (normalized.includes("disputed")) {
    return "Disputed";
  }

  if (normalized.includes("submitted")) {
    return "Submitted";
  }

  if (normalized.includes("pending")) {
    return "Pending";
  }

  if (normalized.includes("failed")) {
    return "Failed";
  }

  return String(value);
}

function statusClass(value) {
  const normalized = normalizeStatus(value);

  if (
    normalized.includes("approved") ||
    normalized.includes("resolved") ||
    normalized.includes("completed")
  ) {
    return "badge-success";
  }

  if (
    normalized.includes("disputed") ||
    normalized.includes("failed") ||
    normalized.includes("unavailable")
  ) {
    return "badge-warning";
  }

  if (
    normalized.includes("pending") ||
    normalized.includes("submitted")
  ) {
    return "badge-info";
  }

  return "badge-neutral";
}

/* --------------------------------------------------
   Job result
-------------------------------------------------- */

function JobResult({ jobId, details }) {
  const status = findField(details, [
    "status",
    "state",
    "job_status",
  ]);

  const resolution = findField(details, [
    "resolution",
    "outcome",
    "result",
  ]);

  const consensus = findField(details, [
    "consensus",
    "verdict",
    "decision",
  ]);

  const winner = findField(details, [
    "winner",
    "recipient",
    "resolved_to",
  ]);

  return (
    <div className="result-box">
      <div className="result-header">
        <div>
          <div className="result-kicker">JOB RESULT</div>
          <strong>Job #{jobId}</strong>
        </div>

        <span className={`badge ${statusClass(status)}`}>
          {statusLabel(status)}
        </span>
      </div>

      {(resolution || consensus || winner) && (
        <div className="result-grid">
          {resolution !== null && resolution !== undefined && (
            <div className="result-item">
              <span>Resolution</span>
              <strong>{String(resolution)}</strong>
            </div>
          )}

          {consensus !== null && consensus !== undefined && (
            <div className="result-item">
              <span>Consensus</span>
              <strong>{String(consensus)}</strong>
            </div>
          )}

          {winner !== null && winner !== undefined && (
            <div className="result-item">
              <span>Recipient</span>
              <strong>{String(winner)}</strong>
            </div>
          )}
        </div>
      )}

      <details className="raw-result">
        <summary>View contract response</summary>
        <pre>{resultToText(details)}</pre>
      </details>
    </div>
  );
}

/* --------------------------------------------------
   Main App
-------------------------------------------------- */

export default function App() {
  const [address, setAddress] = useState(
    getConnectedAddress() || ""
  );

  const [status, setStatus] = useState(
    "Connect your wallet to start using GenLayer Escrow."
  );

  const [statusTone, setStatusTone] = useState("info");

  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [successAction, setSuccessAction] = useState(null);

  const [freelancer, setFreelancer] = useState("");
  const [requirements, setRequirements] = useState("");
  const [amount, setAmount] = useState("");

  const [submitJobId, setSubmitJobId] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [isUrl, setIsUrl] = useState(false);

  const [resolveJobId, setResolveJobId] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  const [abandonJobId, setAbandonJobId] = useState("");
  const [abandonReason, setAbandonReason] = useState("");

  const [lookupJobId, setLookupJobId] = useState("");
  const [jobDetails, setJobDetails] = useState(null);

  const [transactions, setTransactions] = useState(() => {
    try {
      const stored = localStorage.getItem(TX_STORAGE_KEY);

      if (!stored) return [];

      const parsed = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  /* --------------------------------------------------
     Status helpers
  -------------------------------------------------- */

  function showStatus(message, tone = "info") {
    setStatus(message);
    setStatusTone(tone);
  }

  function completeAction(action, message) {
    setStatus(message);
    setStatusTone("success");
    setSuccessAction(action);

    window.setTimeout(() => {
      setSuccessAction((current) =>
        current === action ? null : current
      );
    }, 1800);
  }

  function startAction(action, message) {
    setBusy(true);
    setActiveAction(action);
    setSuccessAction(null);
    showStatus(message, "pending");
  }

  function finishAction() {
    setBusy(false);
    setActiveAction(null);
  }

  /* --------------------------------------------------
     Wallet
  -------------------------------------------------- */

  useEffect(() => {
    let mounted = true;

    async function restore() {
      try {
        const restored = await restoreWallet();

        if (mounted && restored) {
          setAddress(restored);

          showStatus(
            "Wallet restored. You can continue using the escrow.",
            "success"
          );
        }
      } catch {
        // Silent restore failure is intentional.
      }
    }

    restore();

    return () => {
      mounted = false;
    };
  }, []);

    useEffect(() => {
if (!window.ethereum) return;

const handleAccountsChanged = async (accounts) => {
  if (!accounts || accounts.length === 0) {
    setAddress("");
    showStatus(
      "Wallet disconnected. Connect a wallet to continue.",
      "info"
    );
    return;
  }

  try {
    showStatus(
      "Wallet changed. Rebuilding transaction client...",
      "pending"
    );

    const rebuilt = await rebuildClient();

    if (!rebuilt) {
      throw new Error(
        "Failed to rebuild the transaction client for the new wallet."
      );
    }

    setAddress(rebuilt);

    showStatus(
      `Wallet changed to ${shortAddress(rebuilt)}. Transaction client updated.`,
      "success"
    );
  } catch (error) {
    setAddress("");

    showStatus(
      error?.message ||
        "Wallet changed, but the transaction client could not be rebuilt.",
      "error"
    );
  }
};

window.ethereum.on(
  "accountsChanged",
  handleAccountsChanged
);

return () => {
  window.ethereum.removeListener(
    "accountsChanged",
    handleAccountsChanged
  );
};

}, []);

  async function handleConnect() {
    if (busy) return;

    try {
      startAction(
        "connect",
        "Waiting for wallet connection..."
      );

      const connected = await connectWallet();

      setAddress(connected);

      completeAction(
        "connect",
        "Wallet connected successfully."
      );
    } catch (error) {
      showStatus(
        error?.message || "Failed to connect wallet.",
        "error"
      );
    } finally {
      finishAction();
    }
  }

  /* --------------------------------------------------
     Transaction history
  -------------------------------------------------- */

  function saveTransaction({ hash, method, jobId }) {
  if (!hash || !address) return; // Don't save if no wallet is connected

  setTransactions((current) => {
    const exists = current.some(
      (transaction) => transaction.hash === hash
    );

    if (exists) {
      return current;
    }

    const next = [
      {
        hash,
        method,
        jobId:
          jobId !== undefined && jobId !== null
            ? String(jobId)
            : "",
        address, // <-- tag with current wallet
        timestamp: new Date().toISOString(),
      },
      ...current,
    ];

    try {
      localStorage.setItem(
        TX_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Local storage failure should not break the app.
    }

    return next;
  });
        }

  /* --------------------------------------------------
     Create Job
  -------------------------------------------------- */

  async function handleCreateJob() {
    if (busy) return;

    if (!freelancer.trim()) {
      showStatus(
        "Enter the freelancer wallet address.",
        "error"
      );
      return;
    }

    if (!requirements.trim()) {
      showStatus(
        "Enter the job requirements.",
        "error"
      );
      return;
    }

    if (!amount || Number(amount) <= 0) {
      showStatus(
        "Enter an escrow amount greater than 0 GEN.",
        "error"
      );
      return;
    }

    try {
      startAction(
        "create",
        "Creating and funding the job..."
      );

      const result = await createJob(
        freelancer,
        requirements,
        amount
      );

      saveTransaction({
        hash: result.hash,
        method: "create_job",
        jobId: Number(result.previousCount) + 1,
      });

      const expectedJobId =
        Number(result.previousCount) + 1;

      showStatus(
        `Transaction submitted. Waiting for Job #${expectedJobId} to appear...`,
        "pending"
      );

      let found = false;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 1000)
        );

        try {
          const count = Number(await getJobCount());

          if (count > Number(result.previousCount)) {
            found = true;
            break;
          }
        } catch {
          // Continue polling.
        }
      }

      if (found) {
        completeAction(
          "create",
          `Job #${expectedJobId} created and funded successfully.`
        );

        setFreelancer("");
        setRequirements("");
        setAmount("");
      } else {
        showStatus(
          `Transaction submitted for Job #${expectedJobId}. It is still confirming on-chain.`,
          "pending"
        );
      }
    } catch (error) {
      showStatus(
        error?.message || "Failed to create the job.",
        "error"
      );
    } finally {
      finishAction();
    }
  }

  /* --------------------------------------------------
     Submit Work
  -------------------------------------------------- */

  async function handleSubmitWork() {
    if (busy) return;

    if (!String(submitJobId).trim()) {
      showStatus("Enter the Job ID.", "error");
      return;
    }

    if (!deliverable.trim()) {
      showStatus(
        "Enter the work or deliverable.",
        "error"
      );
      return;
    }

    try {
      startAction(
        "submit",
        "Submitting your work..."
      );

      const result = await submitWork(
        submitJobId,
        deliverable,
        isUrl
      );

      saveTransaction({
        hash: result.hash,
        method: "submit_work",
        jobId: submitJobId,
      });

      completeAction(
        "submit",
        `Work submitted successfully for Job #${submitJobId}.`
      );
    } catch (error) {
      showStatus(
        error?.message || "Failed to submit work.",
        "error"
      );
    } finally {
      finishAction();
    }
  }

  /* --------------------------------------------------
     Approve
  -------------------------------------------------- */

  async function handleApprove() {
    if (busy) return;

    if (!String(resolveJobId).trim()) {
      showStatus("Enter the Job ID.", "error");
      return;
    }

    try {
      startAction(
        "approve",
        "Submitting approval..."
      );

      const result = await approveJob(resolveJobId);

      saveTransaction({
        hash: result.hash,
        method: "approve",
        jobId: resolveJobId,
      });

      showStatus(
        "Approval transaction submitted. Waiting for the job result...",
        "pending"
      );

      let resolved = false;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 1000)
        );

        try {
          const details = await getJob(resolveJobId);
          const normalized = resultToText(details).toLowerCase();

          if (
            normalized.includes("approved") ||
            normalized.includes("resolved") ||
            normalized.includes("freelancer")
          ) {
            setJobDetails(details);
            resolved = true;
            break;
          }
        } catch {
          // Continue polling.
        }
      }

      if (resolved) {
        completeAction(
          "approve",
          `Job #${resolveJobId} approved successfully.`
        );
      } else {
        showStatus(
          "Approval transaction submitted. The final job state is still confirming.",
          "pending"
        );
      }
    } catch (error) {
      showStatus(
        error?.message || "Failed to approve the job.",
        "error"
      );
    } finally {
      finishAction();
    }
  }

  /* --------------------------------------------------
     Dispute
  -------------------------------------------------- */

  async function handleDispute() {
    if (busy) return;

    if (!String(resolveJobId).trim()) {
      showStatus("Enter the Job ID.", "error");
      return;
    }

    if (!disputeReason.trim()) {
      showStatus(
        "Enter a reason for the dispute.",
        "error"
      );
      return;
    }

    if (disputeReason.trim().length > 2000) {
      showStatus(
        "Dispute reason must be 2000 characters or less.",
        "error"
      );
      return;
    }

    try {
      startAction(
        "dispute",
        "Submitting dispute for GenLayer adjudication..."
      );

      const result = await disputeJob(
        resolveJobId,
        disputeReason
      );

      saveTransaction({
        hash: result.hash,
        method: "dispute",
        jobId: resolveJobId,
      });

      completeAction(
        "dispute",
        `Dispute submitted for Job #${resolveJobId}.`
      );
    } catch (error) {
      showStatus(
        error?.message || "Failed to submit the dispute.",
        "error"
      );
    } finally {
      finishAction();
    }
  }

  /* --------------------------------------------------
     Recovery
  -------------------------------------------------- */

  async function handleRecovery() {
    if (busy) return;

    if (!String(resolveJobId).trim()) {
      showStatus("Enter the Job ID.", "error");
      return;
    }

    if (!disputeReason.trim()) {
      showStatus(
        "Enter a recovery reason.",
        "error"
      );
      return;
    }

    if (disputeReason.trim().length > 2000) {
      showStatus(
        "Recovery reason must be 2000 characters or less.",
        "error"
      );
      return;
    }

    try {
      startAction(
        "recover",
        "Submitting recovery request..."
      );

      const result = await recoverUnavailableJob(
        resolveJobId,
        disputeReason
      );

      saveTransaction({
        hash: result.hash,
        method: "recover_unavailable_job",
        jobId: resolveJobId,
      });

      completeAction(
        "recover",
        `Recovery request submitted for Job #${resolveJobId}.`
      );
    } catch (error) {
      showStatus(
        error?.message || "Failed to recover the job.",
        "error"
      );
    } finally {
      finishAction();
    }
  }

  /* --------------------------------------------------
     Abandon
  -------------------------------------------------- */

  async function handleAbandon() {
    if (busy) return;

    if (!String(abandonJobId).trim()) {
      showStatus("Enter the Job ID.", "error");
      return;
    }

    if (!abandonReason.trim()) {
      showStatus(
        "Enter an abandonment reason.",
        "error"
      );
      return;
    }

    if (abandonReason.trim().length > 2000) {
      showStatus(
        "Abandonment reason must be 2000 characters or less.",
        "error"
      );
      return;
    }

    try {
      startAction(
        "abandon",
        "Submitting abandoned-job request..."
      );

      const result = await abandonJob(
        abandonJobId,
        abandonReason
      );

      saveTransaction({
        hash: result.hash,
        method: "abandon_job",
        jobId: abandonJobId,
      });

      completeAction(
        "abandon",
        `Abandoned-job request submitted for Job #${abandonJobId}.`
      );
    } catch (error) {
      showStatus(
        error?.message || "Failed to abandon the job.",
        "error"
      );
    } finally {
      finishAction();
    }
  }

  /* --------------------------------------------------
     Lookup
  -------------------------------------------------- */

  async function handleLookup() {
    if (busy) return;

    if (!String(lookupJobId).trim()) {
      showStatus("Enter the Job ID.", "error");
      return;
    }

    try {
      startAction(
        "lookup",
        `Checking Job #${lookupJobId}...`
      );

      const details = await getJob(lookupJobId);

      setJobDetails(details);

      completeAction(
        "lookup",
        `Job #${lookupJobId} status retrieved successfully.`
      );
    } catch (error) {
      showStatus(
        error?.message || "Failed to retrieve job status.",
        "error"
      );
    } finally {
      finishAction();
    }
  }

  /* --------------------------------------------------
     UI helpers
  -------------------------------------------------- */

  function buttonContent(action, label, icon) {
    if (activeAction === action) {
      return (
        <>
          <Icon name="loader" size={17} />
          Processing...
        </>
      );
    }

    if (successAction === action) {
      return (
        <>
          <Icon name="check" size={17} />
          Done
        </>
      );
    }

    return (
      <>
        <Icon name={icon} size={17} />
        {label}
      </>
    );
  }

  const statusIcon =
    statusTone === "success"
      ? "check"
      : statusTone === "error"
        ? "alert"
        : statusTone === "pending"
          ? "clock"
          : "shield";

  return (
    <div className="app-shell">
      <style>{`
        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          background: #f6f8fb;
          color: #152033;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        button,
        input,
        textarea {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: .58;
        }

        .app-shell {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 80% 0%,
              rgba(71, 105, 255, .07),
              transparent 30%
            ),
            #f6f8fb;
        }

        .container {
          width: min(1160px, calc(100% - 32px));
          margin: 0 auto;
        }

        .topbar {
          border-bottom: 1px solid #e6eaf0;
          background: rgba(255,255,255,.9);
          backdrop-filter: blur(14px);
          position: sticky;
          top: 0;
          z-index: 20;
        }

        .topbar-inner {
          min-height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand-mark {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          color: #fff;
          background: #172033;
          box-shadow: 0 8px 20px rgba(23,32,51,.16);
        }

        .brand-title {
          font-weight: 800;
          letter-spacing: -.02em;
          font-size: 16px;
        }

        .brand-subtitle {
          color: #7a8494;
          font-size: 12px;
          margin-top: 2px;
        }

        .wallet-button {
          border: 0;
          border-radius: 11px;
          min-height: 42px;
          padding: 0 15px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #172033;
          color: white;
          font-weight: 700;
          transition: transform .15s ease, box-shadow .15s ease;
        }

        .wallet-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(23,32,51,.15);
        }

        .wallet-connected {
          background: #eefaf2;
          color: #18723a;
          border: 1px solid #ccebd6;
        }

        .hero {
          padding: 54px 0 28px;
        }

        .eyebrow {
          color: #4e64d8;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        .hero h1 {
          margin: 0;
          max-width: 760px;
          font-size: clamp(32px, 5vw, 54px);
          line-height: 1.02;
          letter-spacing: -.045em;
        }

        .hero p {
          max-width: 700px;
          color: #697487;
          font-size: 16px;
          line-height: 1.7;
          margin: 18px 0 0;
        }

        .workflow {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin: 20px 0 30px;
        }

        .workflow-step {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 10px;
          border: 1px solid #e4e8ee;
          border-radius: 12px;
          background: #fff;
          color: #697487;
          font-size: 12px;
          font-weight: 700;
        }

        .workflow-number {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #f0f3f8;
          color: #445064;
          flex: 0 0 auto;
        }

        .status-banner {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          padding: 14px 16px;
          border-radius: 13px;
          margin-bottom: 24px;
          border: 1px solid #dce3ed;
          background: #fff;
          color: #526074;
        }

        .status-banner.success {
          border-color: #c9ead5;
          background: #f4fcf7;
          color: #24723e;
        }

        .status-banner.error {
          border-color: #f0caca;
          background: #fff6f6;
          color: #9b3333;
        }

        .status-banner.pending {
          border-color: #d5ddf7;
          background: #f5f7ff;
          color: #455cc1;
        }

        .status-text {
          font-size: 13px;
          line-height: 1.5;
          flex: 1;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(340px, .75fr);
          gap: 18px;
          align-items: start;
        }

        .stack {
          display: grid;
          gap: 18px;
        }

        .card {
          background: #fff;
          border: 1px solid #e4e8ee;
          border-radius: 17px;
          padding: 22px;
          box-shadow: 0 5px 18px rgba(22,31,48,.035);
        }

        .card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 19px;
        }

        .card-title-wrap {
          display: flex;
          gap: 12px;
        }

        .icon-box {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          flex: 0 0 auto;
        }

        .icon-blue {
          background: #edf2ff;
          color: #4964dc;
        }

        .icon-purple {
          background: #f2edff;
          color: #7650c8;
        }

        .icon-green {
          background: #eaf8ef;
          color: #238148;
        }

        .icon-orange {
          background: #fff3e8;
          color: #c66a18;
        }

        .icon-cyan {
          background: #e8f8fa;
          color: #197b89;
        }

        .icon-dark {
          background: #edf0f4;
          color: #344054;
        }

        .card h2 {
          margin: 0;
          font-size: 17px;
          letter-spacing: -.02em;
        }

        .card-description {
          margin: 5px 0 0;
          color: #7a8494;
          font-size: 12px;
          line-height: 1.5;
        }

        .section-label {
          display: block;
          color: #687386;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
          margin: 0 0 7px;
        }

        .field {
          margin-bottom: 14px;
        }

        .field:last-child {
          margin-bottom: 0;
        }

        .input,
        .textarea {
          width: 100%;
          border: 1px solid #dfe4eb;
          background: #fbfcfe;
          color: #182234;
          border-radius: 11px;
          outline: none;
          transition: border-color .15s ease, box-shadow .15s ease;
        }

        .input {
          min-height: 45px;
          padding: 0 13px;
        }

        .textarea {
          min-height: 105px;
          padding: 12px 13px;
          resize: vertical;
          line-height: 1.5;
        }

        .input:focus,
        .textarea:focus {
          border-color: #7588e4;
          box-shadow: 0 0 0 3px rgba(117,136,228,.12);
          background: #fff;
        }

        .two-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .action-row {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .action-button {
          min-height: 43px;
          border: 0;
          border-radius: 10px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 800;
          transition: transform .15s ease, box-shadow .15s ease;
        }

        .action-button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .btn-create {
          background: #4d64d9;
          color: #fff;
          box-shadow: 0 7px 17px rgba(77,100,217,.16);
        }

        .btn-submit {
          background: #7650c8;
          color: #fff;
          box-shadow: 0 7px 17px rgba(118,80,200,.14);
        }

        .btn-approve {
          background: #27844c;
          color: #fff;
        }

        .btn-dispute {
          background: #c8661b;
          color: #fff;
        }

        .btn-recover {
          background: #197d8b;
          color: #fff;
        }

        .btn-abandon {
          background: #9b6319;
          color: #fff;
        }

        .btn-lookup {
          background: #253047;
          color: #fff;
        }

        .btn-secondary {
          background: #f0f2f6;
          color: #384458;
          border: 1px solid #e0e4ea;
        }

        .wallet-note {
          margin-top: 12px;
          font-size: 11px;
          color: #8992a1;
          word-break: break-all;
        }

        .toggle {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 11px;
          color: #657083;
          font-size: 12px;
          cursor: pointer;
        }

        .toggle input {
          accent-color: #4d64d9;
        }

        .mini-note {
          color: #8992a1;
          font-size: 11px;
          line-height: 1.5;
          margin-top: 7px;
        }

        .divider {
          height: 1px;
          background: #edf0f4;
          margin: 20px 0;
        }

        .result-box {
          margin-top: 16px;
          border: 1px solid #dfe5ed;
          border-radius: 13px;
          padding: 15px;
          background: #fafbfd;
        }

        .result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .result-kicker {
          color: #8a93a2;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .1em;
          margin-bottom: 3px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 25px;
          padding: 0 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .badge-success {
          color: #237442;
          background: #e8f7ed;
        }

        .badge-warning {
          color: #9b5815;
          background: #fff0df;
        }

        .badge-info {
          color: #4b61bf;
          background: #edf1ff;
        }

        .badge-neutral {
          color: #596577;
          background: #edf0f4;
        }

        .result-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-top: 14px;
        }

        .result-item {
          padding: 10px;
          background: #fff;
          border: 1px solid #e7eaf0;
          border-radius: 10px;
          min-width: 0;
        }

        .result-item span {
          display: block;
          color: #8a93a2;
          font-size: 10px;
          margin-bottom: 4px;
        }

        .result-item strong {
          display: block;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .raw-result {
          margin-top: 13px;
          color: #647084;
          font-size: 11px;
        }

        .raw-result summary {
          cursor: pointer;
          font-weight: 700;
        }

        .raw-result pre {
          overflow: auto;
          padding: 11px;
          background: #172033;
          color: #dce3ef;
          border-radius: 9px;
          margin: 9px 0 0;
          font-size: 10px;
          line-height: 1.5;
          max-height: 280px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .tx-list {
          display: grid;
          gap: 9px;
        }

        .tx-item {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          padding: 13px;
          border: 1px solid #e7eaf0;
          border-radius: 11px;
          background: #fbfcfe;
        }

        .tx-main {
          min-width: 0;
        }

        .tx-method {
          font-size: 12px;
          font-weight: 800;
        }

        .tx-meta {
          color: #8992a1;
          font-size: 10px;
          margin-top: 4px;
        }

        .tx-hash {
          color: #4e64d8;
          font-size: 11px;
          font-weight: 700;
          text-decoration: none;
          word-break: break-all;
        }

        .tx-hash:hover {
          text-decoration: underline;
        }

        .empty {
          padding: 24px 10px;
          text-align: center;
          color: #8a93a2;
          font-size: 12px;
        }

        .footer {
          padding: 42px 0;
          color: #8a93a2;
          font-size: 11px;
          text-align: center;
        }

        .footer strong {
          color: #5b6677;
        }

        .spin {
          animation: spin .8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
          }

          .workflow {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 620px) {
          .container {
            width: min(100% - 22px, 1160px);
          }

          .topbar-inner {
            min-height: 68px;
          }

          .brand-subtitle {
            display: none;
          }

          .wallet-button {
            padding: 0 11px;
          }

          .hero {
            padding-top: 35px;
          }

          .hero h1 {
            font-size: 34px;
          }

          .workflow {
            grid-template-columns: 1fr;
          }

          .two-fields,
          .result-grid {
            grid-template-columns: 1fr;
          }

          .card {
            padding: 17px;
            border-radius: 14px;
          }

          .tx-item {
            grid-template-columns: 1fr;
          }

          .action-button {
            width: 100%;
          }

          .action-row {
            display: grid;
          }
        }
      `}</style>

      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark">
              <Icon name="lock" size={21} />
            </div>

            <div>
              <div className="brand-title">
                GenLayer Escrow
              </div>
              <div className="brand-subtitle">
                Freelance payment protection
              </div>
            </div>
          </div>

          <button
            className={`wallet-button ${
              address ? "wallet-connected" : ""
            }`}
            onClick={handleConnect}
            disabled={busy}
          >
            <Icon
              name={
                activeAction === "connect"
                  ? "loader"
                  : "wallet"
              }
              size={17}
            />

            {address
              ? shortAddress(address)
              : "Connect wallet"}
          </button>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="eyebrow">
            Intelligent contract escrow
          </div>

          <h1>
            Fund work, verify delivery, and resolve agreements.
          </h1>

          <p>
            GenLayer Escrow lets clients lock GEN for freelance
            work, lets freelancers submit deliverables, and
            provides on-chain actions for approval, disputes,
            recovery, and abandoned jobs.
          </p>
        </section>

        <nav className="workflow">
          <div className="workflow-step">
            <span className="workflow-number">1</span>
            Create & fund
          </div>

          <div className="workflow-step">
            <span className="workflow-number">2</span>
            Submit work
          </div>

          <div className="workflow-step">
            <span className="workflow-number">3</span>
            Approve or dispute
          </div>

          <div className="workflow-step">
            <span className="workflow-number">4</span>
            Recover if needed
          </div>

          <div className="workflow-step">
            <span className="workflow-number">5</span>
            Check status
          </div>
        </nav>

        <div
          className={`status-banner ${statusTone}`}
          aria-live="polite"
        >
          <Icon name={statusIcon} size={18} />
          <div className="status-text">{status}</div>
        </div>

        <div className="layout">
          <div className="stack">
            {/* Create Job */}

            <section className="card">
              <div className="card-head">
                <div className="card-title-wrap">
                  <div className="icon-box icon-blue">
                    <Icon name="lock" size={19} />
                  </div>

                  <div>
                    <h2>Create Job</h2>
                    <p className="card-description">
                      Assign a freelancer and lock GEN in escrow.
                    </p>
                  </div>
                </div>

                <span className="badge badge-info">
                  STEP 1
                </span>
              </div>

              <div className="field">
                <label className="section-label">
                  Freelancer wallet
                </label>

                <input
                  className="input"
                  value={freelancer}
                  onChange={(event) =>
                    setFreelancer(event.target.value)
                  }
                  placeholder="0x..."
                  disabled={busy}
                />
              </div>

              <div className="field">
                <label className="section-label">
                  Job requirements
                </label>

                <textarea
                  className="textarea"
                  value={requirements}
                  onChange={(event) =>
                    setRequirements(event.target.value)
                  }
                  placeholder="Describe exactly what the freelancer must deliver..."
                  disabled={busy}
                />
              </div>

              <div className="two-fields">
                <div className="field">
                  <label className="section-label">
                    Escrow amount
                  </label>

                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(event) =>
                      setAmount(event.target.value)
                    }
                    placeholder="10"
                    disabled={busy}
                  />
                </div>

                <div className="field">
                  <label className="section-label">
                    Currency
                  </label>

                  <input
                    className="input"
                    value="GEN"
                    readOnly
                  />
                </div>
              </div>

              <div className="action-row">
                <button
                  className="action-button btn-create"
                  onClick={handleCreateJob}
                  disabled={busy || !address}
                >
                  {buttonContent(
                    "create",
                    "Create & fund job",
                    "zap"
                  )}
                </button>
              </div>

              {!address && (
                <div className="wallet-note">
                  Connect your wallet before creating a job.
                </div>
              )}
            </section>

            {/* Submit Work */}

            <section className="card">
              <div className="card-head">
                <div className="card-title-wrap">
                  <div className="icon-box icon-purple">
                    <Icon name="file" size={19} />
                  </div>

                  <div>
                    <h2>Submit Work</h2>
                    <p className="card-description">
                      The assigned freelancer submits the
                      deliverable for review.
                    </p>
                  </div>
                </div>

                <span className="badge badge-info">
                  STEP 2
                </span>
              </div>

              <div className="two-fields">
                <div className="field">
                  <label className="section-label">
                    Job ID
                  </label>

                  <input
                    className="input"
                    value={submitJobId}
                    onChange={(event) =>
                      setSubmitJobId(event.target.value)
                    }
                    placeholder="1"
                    disabled={busy}
                  />
                </div>

                <div className="field">
                  <label className="section-label">
                    Deliverable type
                  </label>

                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={isUrl}
                      onChange={(event) =>
                        setIsUrl(event.target.checked)
                      }
                      disabled={busy}
                    />
                    This deliverable is a webpage URL
                  </label>
                </div>
              </div>

              <div className="field">
                <label className="section-label">
                  Work or URL
                </label>

                <textarea
                  className="textarea"
                  value={deliverable}
                  onChange={(event) =>
                    setDeliverable(event.target.value)
                  }
                  placeholder={
                    isUrl
                      ? "https://example.com/your-deliverable"
                      : "Paste the completed work here..."
                  }
                  disabled={busy}
                />
              </div>

              <div className="action-row">
                <button
                  className="action-button btn-submit"
                  onClick={handleSubmitWork}
                  disabled={busy || !address}
                >
                  {buttonContent(
                    "submit",
                    "Submit work",
                    "file"
                  )}
                </button>
              </div>
            </section>

            {/* Resolve */}

            <section className="card">
              <div className="card-head">
                <div className="card-title-wrap">
                  <div className="icon-box icon-green">
                    <Icon name="shield" size={19} />
                  </div>

                  <div>
                    <h2>Resolve Job</h2>
                    <p className="card-description">
                      Approve completed work or open a dispute.
                    </p>
                  </div>
                </div>

                <span className="badge badge-success">
                  STEP 3
                </span>
              </div>

              <div className="field">
                <label className="section-label">
                  Job ID
                </label>

                <input
                  className="input"
                  value={resolveJobId}
                  onChange={(event) =>
                    setResolveJobId(event.target.value)
                  }
                  placeholder="1"
                  disabled={busy}
                />
              </div>

              <div className="field">
                <label className="section-label">
                  Dispute / recovery reason
                </label>

                <textarea
                  className="textarea"
                  value={disputeReason}
                  onChange={(event) =>
                    setDisputeReason(event.target.value)
                  }
                  placeholder="Explain why the submitted work does not satisfy the requirements, or why recovery is needed..."
                  maxLength={2000}
                  disabled={busy}
                />

                <div className="mini-note">
                  {disputeReason.length}/2000 characters
                </div>
              </div>

              <div className="action-row">
                <button
                  className="action-button btn-approve"
                  onClick={handleApprove}
                  disabled={busy || !address}
                >
                  {buttonContent(
                    "approve",
                    "Approve",
                    "check"
                  )}
                </button>

                <button
                  className="action-button btn-dispute"
                  onClick={handleDispute}
                  disabled={busy || !address}
                >
                  {buttonContent(
                    "dispute",
                    "Dispute",
                    "alert"
                  )}
                </button>
              </div>
            </section>

            {/* Recovery */}

            <section className="card">
              <div className="card-head">
                <div className="card-title-wrap">
                  <div className="icon-box icon-cyan">
                    <Icon name="refresh" size={19} />
                  </div>

                  <div>
                    <h2>Recovery</h2>
                    <p className="card-description">
                      Request recovery when the job cannot be
                      completed normally.
                    </p>
                  </div>
                </div>

                <span className="badge badge-neutral">
                  STEP 4
                </span>
              </div>

              <div className="mini-note">
                Recovery uses the same Job ID and reason fields
                from the Resolve section above.
              </div>

              <div className="action-row">
                <button
                  className="action-button btn-recover"
                  onClick={handleRecovery}
                  disabled={busy || !address}
                >
                  {buttonContent(
                    "recover",
                    "Recover funds",
                    "refresh"
                  )}
                </button>
              </div>
            </section>

            {/* Abandoned Job */}

            <section className="card">
              <div className="card-head">
                <div className="card-title-wrap">
                  <div className="icon-box icon-orange">
                    <Icon name="alert" size={19} />
                  </div>

                  <div>
                    <h2>Abandoned Job</h2>
                    <p className="card-description">
                      Handle jobs that have been abandoned.
                    </p>
                  </div>
                </div>
              </div>

              <div className="field">
                <label className="section-label">
                  Job ID
                </label>

                <input
                  className="input"
                  value={abandonJobId}
                  onChange={(event) =>
                    setAbandonJobId(event.target.value)
                  }
                  placeholder="1"
                  disabled={busy}
                />
              </div>

              <div className="field">
                <label className="section-label">
                  Abandonment reason
                </label>

                <textarea
                  className="textarea"
                  value={abandonReason}
                  onChange={(event) =>
                    setAbandonReason(event.target.value)
                  }
                  placeholder="Explain why the job is being abandoned..."
                  maxLength={2000}
                  disabled={busy}
                />

                <div className="mini-note">
                  {abandonReason.length}/2000 characters
                </div>
              </div>

              <div className="action-row">
                <button
                  className="action-button btn-abandon"
                  onClick={handleAbandon}
                  disabled={busy || !address}
                >
                  {buttonContent(
                    "abandon",
                    "Abandon job",
                    "alert"
                  )}
                </button>
              </div>
            </section>
          </div>

          <div className="stack">
            {/* Job Status */}

            <section className="card">
              <div className="card-head">
                <div className="card-title-wrap">
                  <div className="icon-box icon-dark">
                    <Icon name="search" size={19} />
                  </div>

                  <div>
                    <h2>Job Status</h2>
                    <p className="card-description">
                      Read the current state directly from the
                      escrow contract.
                    </p>
                  </div>
                </div>
              </div>

              <div className="field">
                <label className="section-label">
                  Job ID
                </label>

                <input
                  className="input"
                  value={lookupJobId}
                  onChange={(event) =>
                    setLookupJobId(event.target.value)
                  }
                  placeholder="1"
                  disabled={busy}
                />
              </div>

              <div className="action-row">
                <button
                  className="action-button btn-lookup"
                  onClick={handleLookup}
                  disabled={busy || !address}
                >
                  {buttonContent(
                    "lookup",
                    "Check status",
                    "search"
                  )}
                </button>
              </div>

              {jobDetails !== null && (
                <JobResult
                  jobId={lookupJobId}
                  details={jobDetails}
                />
              )}
            </section>

            {/* Wallet */}

            <section className="card">
              <div className="card-head">
                <div className="card-title-wrap">
                  <div className="icon-box icon-blue">
                    <Icon name="wallet" size={19} />
                  </div>

                  <div>
                    <h2>Wallet</h2>
                    <p className="card-description">
                      Current wallet used for contract actions.
                    </p>
                  </div>
                </div>
              </div>

              {address ? (
                <>
                  <div className="section-label">
                    Connected address
                  </div>

                  <div
                    className="input"
                    title={address}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      fontWeight: 700,
                    }}
                  >
                    {shortAddress(address)}
                  </div>

                  <div className="wallet-note">
                    {address}
                  </div>
                </>
              ) : (
                <div className="empty">
                  No wallet connected.
                </div>
              )}
            </section>

            {/* Transactions */}

            <section className="card">
              <div className="card-head">
                <div className="card-title-wrap">
                  <div className="icon-box icon-dark">
                    <Icon name="clock" size={19} />
                  </div>

                  <div>
                    <h2>Transactions</h2>
                    <p className="card-description">
                      Transactions submitted from this browser.
                    </p>
                  </div>
                </div>

                {transactions.length > 0 && (
                  <button
                    className="action-button btn-secondary"
                    onClick={clearTransactionHistory}
                    disabled={busy}
                  >
                    Clear
                  </button>
                )}
              </div>

              {transactions.length === 0 ? (
                <div className="empty">
                  No transactions recorded yet.
                </div>
              ) : (
                <div className="tx-list">
                  {transactions.map((transaction) => (
                    <div
                      className="tx-item"
                      key={transaction.hash}
                    >
                      <div className="tx-main">
                        <div className="tx-method">
                          {formatMethod(transaction.method)}
                          {transaction.jobId
                            ? ` · Job #${transaction.jobId}`
                            : ""}
                        </div>

                        <div className="tx-meta">
                          {formatDate(
                            transaction.timestamp
                          )}
                        </div>
                      </div>

                      <a
                        className="tx-hash"
                        href={
                          "https://explorer-studio.genlayer.com/tx/" +
                          transaction.hash
                        }
                        target="_blank"
                        rel="noreferrer"
                        title={transaction.hash}
                      >
                        {shortHash(transaction.hash)}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="footer">
          <strong>GenLayer Escrow</strong> · Freelance
          payments with intelligent contract arbitration.
        </footer>
      </main>
    </div>
  );
}
