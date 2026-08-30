import { useEffect, useState } from "react";

import {
  connectWallet,
  restoreWallet,
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

  // Resolve / dispute / recovery
  const [resolveJobId, setResolveJobId] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  // Abandon job
  const [abandonJobId, setAbandonJobId] = useState("");

  // Lookup
  const [lookupJobId, setLookupJobId] = useState("");
  const [jobDetails, setJobDetails] = useState(null);

  // Persistent transaction history
  const [transactions, setTransactions] = useState(() => {
    try {
      const saved = localStorage.getItem(TX_STORAGE_KEY);

      if (!saved) {
        return [];
      }

      const parsed = JSON.parse(saved);

      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Save transaction history whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        TX_STORAGE_KEY,
        JSON.stringify(transactions)
      );
    } catch (err) {
      console.error("Could not save transaction history:", err);
    }
  }, [transactions]);

  // Restore wallet after page refresh.
  // restoreWallet uses eth_accounts, so it does not open
  // the MetaMask permission popup.
  useEffect(() => {
    async function restore() {
      try {
        const addr = await restoreWallet();

        if (addr) {
          setAddress(addr);
          setStatus("Wallet connected.");
        }
      } catch (err) {
        console.error("Wallet restore failed:", err);
      }
    }

    restore();
  }, []);

  // Keep the UI synchronized when the wallet account changes.
  useEffect(() => {
    if (!window.ethereum) {
      return;
    }

    function handleAccountsChanged(accounts) {
      if (!accounts || accounts.length === 0) {
        setAddress(null);
        setStatus("Wallet disconnected.");
        return;
      }

      restoreWallet()
        .then((addr) => {
          if (addr) {
            setAddress(addr);
            setStatus("Wallet connected.");
          }
        })
        .catch((err) => {
          console.error("Account restore failed:", err);
        });
    }

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

  // --------------------------------------------------
  // Transaction history
  // --------------------------------------------------

  function saveTransaction({
    hash,
    method,
    jobId = null,
  }) {
    if (!hash) {
      return;
    }

    setTransactions((previous) => {
      if (
        previous.some(
          (transaction) => transaction.hash === hash
        )
      ) {
        return previous;
      }

      return [
        {
          hash,
          method,
          jobId,
          timestamp: Date.now(),
        },
        ...previous,
      ];
    });
  }

  function clearTransactionHistory() {
    setTransactions([]);
  }

  // --------------------------------------------------
  // Wallet
  // --------------------------------------------------

  async function handleConnect() {
    try {
      setBusy(true);
      setStatus("Connecting wallet...");

      const addr = await connectWallet();

      setAddress(addr);
      setStatus("Wallet connected.");
    } catch (err) {
      setStatus(
        "Connect failed: " +
          (err?.message || String(err))
      );
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // Create job
  // --------------------------------------------------

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

    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setStatus("Enter a valid escrow amount.");
      return;
    }

    try {
      setBusy(true);
      setStatus("Creating job...");

      const result = await createJob(
        freelancer.trim(),
        requirements.trim(),
        parsedAmount
      );

      const expectedJobId = result.previousCount;

      saveTransaction({
        hash: result.hash,
        method: "create_job",
        jobId: expectedJobId,
      });

      setStatus(
        `Transaction submitted. Waiting for Job ${expectedJobId} to appear...`
      );

      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const count = Number(
            await getJobCount()
          );

          if (count > expectedJobId) {
            setStatus(
              `Job ${expectedJobId} created successfully.`
            );

            setBusy(false);
            return;
          }
        } catch (readError) {
          console.log(
            "Job count check:",
            readError
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 1000)
        );
      }

      setStatus(
        `Job ${expectedJobId} transaction submitted successfully. The job is still being confirmed.`
      );
    } catch (err) {
      setStatus(
        "Error: " +
          (err?.message || String(err))
      );
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // Submit work
  // --------------------------------------------------

  async function handleSubmitWork() {
    if (!submitJobId.trim()) {
      setStatus(
        "Enter a Job ID for submitting work."
      );
      return;
    }

    if (!deliverable.trim()) {
      setStatus(
        "Enter the deliverable or webpage URL."
      );
      return;
    }

    try {
      setBusy(true);

      setStatus(
        `Submitting work for Job ${submitJobId}...`
      );

      const jobId = submitJobId.trim();

      const result = await submitWork(
        jobId,
        deliverable.trim(),
        isUrl
      );

      saveTransaction({
        hash: result.hash,
        method: "submit_work",
        jobId,
      });

      setStatus(
        `Work transaction submitted successfully for Job ${jobId}.`
      );
    } catch (err) {
      setStatus(
        "Error: " +
          (err?.message || String(err))
      );
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // Approve
  // --------------------------------------------------

  async function handleApprove() {
    if (!resolveJobId.trim()) {
      setStatus(
        "Enter a Job ID for approval."
      );
      return;
    }

    const jobId = resolveJobId.trim();

    try {
      setBusy(true);

      setStatus(
        `Approving Job ${jobId}...`
      );

      const result = await approveJob(jobId);

      saveTransaction({
        hash: result.hash,
        method: "approve",
        jobId,
      });

      setStatus(
        `Approval submitted. Waiting for Job ${jobId} to update...`
      );

      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const details = await getJob(jobId);

          const data =
            typeof details === "string"
              ? details
              : JSON.stringify(details);

          const normalized =
            data.toLowerCase();

          if (
            normalized.includes("approved") ||
            normalized.includes("resolved") ||
            normalized.includes("freelancer")
          ) {
            setJobDetails(details);

            setStatus(
              `Job ${jobId} approved successfully.`
            );

            setBusy(false);
            return;
          }
        } catch (readError) {
          console.log(
            "Approval status check:",
            readError
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 1000)
        );
      }

      setStatus(
        `Job ${jobId} approval transaction submitted successfully. The contract is still updating.`
      );
    } catch (err) {
      setStatus(
        "Error: " +
          (err?.message || String(err))
      );
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // Dispute
  // --------------------------------------------------

  async function handleDispute() {
    if (!resolveJobId.trim()) {
      setStatus(
        "Enter a Job ID for the dispute."
      );
      return;
    }

    if (!disputeReason.trim()) {
      setStatus(
        "Please enter a reason for the dispute."
      );
      return;
    }

    if (
      disputeReason.trim().length > 2000
    ) {
      setStatus(
        "Dispute reason must be 2000 characters or less."
      );
      return;
    }

    const jobId = resolveJobId.trim();

    try {
      setBusy(true);

      setStatus(
        "Submitting dispute transaction. GenLayer validators will evaluate it..."
      );

      const result = await disputeJob(
        jobId,
        disputeReason.trim()
      );

      saveTransaction({
        hash: result.hash,
        method: "dispute",
        jobId,
      });

      setStatus(
        `Dispute transaction submitted for Job ${jobId}.`
      );
    } catch (err) {
      setStatus(
        "Error: " +
          (err?.message || String(err))
      );
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // Recovery
  // --------------------------------------------------

  async function handleRecovery() {
    if (!resolveJobId.trim()) {
      setStatus(
        "Enter a Job ID for recovery."
      );
      return;
    }

    if (!disputeReason.trim()) {
      setStatus(
        "Please enter a recovery reason."
      );
      return;
    }

    if (
      disputeReason.trim().length > 2000
    ) {
      setStatus(
        "Recovery reason must be 2000 characters or less."
      );
      return;
    }

    const jobId = resolveJobId.trim();

    try {
      setBusy(true);

      setStatus(
        "Submitting recovery transaction. GenLayer validators will evaluate the available evidence..."
      );

      const result =
        await recoverUnavailableJob(
          jobId,
          disputeReason.trim()
        );

      saveTransaction({
        hash: result.hash,
        method: "recover_unavailable_job",
        jobId,
      });

      setStatus(
        `Recovery transaction submitted for Job ${jobId}.`
      );
    } catch (err) {
      setStatus(
        "Error: " +
          (err?.message || String(err))
      );
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // Abandon
  // --------------------------------------------------

  async function handleAbandon() {
    if (!abandonJobId.trim()) {
      setStatus(
        "Enter a Job ID to abandon."
      );
      return;
    }

    const jobId = abandonJobId.trim();

    try {
      setBusy(true);

      setStatus(
        `Submitting abandoned-job recovery for Job ${jobId}...`
      );

      const result =
        await abandonJob(jobId);

      saveTransaction({
        hash: result.hash,
        method: "abandon_job",
        jobId,
      });

      setStatus(
        `Abandoned-job transaction submitted for Job ${jobId}.`
      );
    } catch (err) {
      setStatus(
        "Error: " +
          (err?.message || String(err))
      );
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------
  // Lookup
  // --------------------------------------------------

  async function handleLookup() {
    if (!lookupJobId.trim()) {
      setStatus(
        "Enter a Job ID to look up."
      );
      return;
    }

    const jobId = lookupJobId.trim();

    try {
      setBusy(true);

      setStatus(
        `Loading Job ${jobId}...`
      );

      const details = await getJob(jobId);

      setJobDetails(details);

      setStatus(
        `Loaded Job ${jobId}.`
      );
    } catch (err) {
      setStatus(
        "Error: " +
          (err?.message || String(err))
      );
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
              <h1 style={titleStyle}>
                GenLayer Escrow
              </h1>

              <p style={subtitleStyle}>
                Freelance escrow with GenLayer-powered dispute resolution.
              </p>
            </div>
          </div>
        </header>

        <section style={infoBox}>
          <h2 style={infoTitle}>
            How it works
          </h2>

          <p style={infoText}>
            A client locks GEN for a job.
            The freelancer submits the work.
            The client can approve it directly,
            or open a dispute for GenLayer
            validators to evaluate the submitted
            work against the requirements.
            If the evidence cannot be retrieved,
            either party can request recovery.
            Abandoned jobs can also be recovered
            after the applicable deadline.
          </p>
        </section>

        {/* Wallet */}

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

        {/* Step 1 */}

        <section style={card}>
          <div style={stepNumber}>
            1
          </div>

          <h2 style={sectionTitle}>
            Post a Job
          </h2>

          <p style={description}>
            Create a job and lock GEN in escrow
            for the assigned freelancer.
          </p>

          <label style={label}>
            Freelancer wallet
          </label>

          <input
            style={inputStyle}
            placeholder="0x..."
            value={freelancer}
            onChange={(e) =>
              setFreelancer(e.target.value)
            }
          />

          <label style={label}>
            Requirements
          </label>

          <textarea
            style={textareaStyle}
            placeholder="Describe what the freelancer needs to deliver..."
            value={requirements}
            onChange={(e) =>
              setRequirements(e.target.value)
            }
          />

          <label style={label}>
            Escrow amount
          </label>

          <div style={amountRow}>
            <input
              style={amountInput}
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value)
              }
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

        {/* Step 2 */}

        <section style={card}>
          <div style={stepNumber}>
            2
          </div>

          <h2 style={sectionTitle}>
            Submit Work
          </h2>

          <p style={description}>
            The assigned freelancer submits a
            text deliverable or webpage.
          </p>

          <label style={label}>
            Job ID
          </label>

          <input
            style={inputStyle}
            placeholder="Enter job ID"
            value={submitJobId}
            onChange={(e) =>
              setSubmitJobId(e.target.value)
            }
            inputMode="numeric"
          />

          <label style={label}>
            Deliverable
          </label>

          <input
            style={inputStyle}
            placeholder="Paste your work or webpage URL..."
            value={deliverable}
            onChange={(e) =>
              setDeliverable(e.target.value)
            }
          />

          <label style={checkboxLabel}>
            <input
              type="checkbox"
              checked={isUrl}
              onChange={(e) =>
                setIsUrl(e.target.checked)
              }
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

        {/* Step 3 */}

        <section style={card}>
          <div style={stepNumber}>
            3
          </div>

          <h2 style={sectionTitle}>
            Resolve the Job
          </h2>

          <p style={description}>
            The client can approve the work or
            submit a dispute. If the submitted
            evidence cannot be retrieved,
            recovery can be requested.
          </p>

          <label style={label}>
            Job ID
          </label>

          <input
            style={inputStyle}
            placeholder="Enter job ID"
            value={resolveJobId}
            onChange={(e) =>
              setResolveJobId(e.target.value)
            }
            inputMode="numeric"
          />

          <label style={label}>
            Dispute or recovery reason
          </label>

          <textarea
            style={textareaStyle}
            placeholder="Explain the dispute or recovery request..."
            value={disputeReason}
            onChange={(e) =>
              setDisputeReason(e.target.value)
            }
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
              GenLayer validators evaluate the
              job requirements, submitted work,
              and dispute reason before determining
              whether the freelancer or client
              should receive the escrowed GEN.
            </p>

            <strong>
              Evidence recovery
            </strong>

            <p>
              If a submitted URL cannot be
              retrieved and the job enters
              evidence_unavailable, either the
              client or freelancer can request
              recovery.
            </p>
          </div>
        </section>

        {/* Step 4 */}

        <section style={card}>
          <div style={stepNumber}>
            4
          </div>

          <h2 style={sectionTitle}>
            Abandoned Job
          </h2>

          <p style={description}>
            Recover escrow when a job has passed
            its applicable deadline without the
            required action.
          </p>

          <label style={label}>
            Job ID
          </label>

          <input
            style={inputStyle}
            placeholder="Enter job ID"
            value={abandonJobId}
            onChange={(e) =>
              setAbandonJobId(e.target.value)
            }
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
              If the freelancer never submits
              work before the submission deadline,
              the client can recover the escrow.
            </p>

            <p>
              If the freelancer submits work but
              the client does not approve or
              dispute it before the approval
              deadline, the freelancer can recover
              the escrow.
            </p>
          </div>
        </section>

        {/* Step 5 */}

        <section style={card}>
          <div style={stepNumber}>
            5
          </div>

          <h2 style={sectionTitle}>
            Check Job Status
          </h2>

          <p style={description}>
            View the current state and resolution
            of a job.
          </p>

          <label style={label}>
            Job ID
          </label>

          <input
            style={inputStyle}
            placeholder="Enter job ID"
            value={lookupJobId}
            onChange={(e) =>
              setLookupJobId(e.target.value)
            }
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
              {JSON.stringify(
                jobDetails,
                null,
                2
              )}
            </pre>
          )}
        </section>

        {/* Step 6 */}

        <section style={card}>
          <div style={stepNumber}>
            6
          </div>

          <h2 style={sectionTitle}>
            Transaction History
          </h2>

          <p style={description}>
            Your transactions remain available
            after refreshing the page.
          </p>

          {transactions.length === 0 ? (
            <div style={emptyHistory}>
              No transactions yet.
            </div>
          ) : (
            <>
              <div style={transactionList}>
                {transactions.map(
                  (transaction) => (
                    <a
                      key={transaction.hash}
                      href={
                        "https://explorer-studio.genlayer.com/tx/" +
                        transaction.hash
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={transactionItem}
                    >
                      <div
                        style={
                          transactionTop
                        }
                      >
                        <strong>
                          {formatMethod(
                            transaction.method
                          )}
                        </strong>

                        {transaction.jobId !==
                          null &&
                          transaction.jobId !==
                            undefined && (
                            <span
                              style={
                                transactionJob
                              }
                            >
                              Job{" "}
                              {
                                transaction.jobId
                              }
                            </span>
                          )}
                      </div>

                      <div
                        style={
                          transactionHash
                        }
                      >
                        {shortHash(
                          transaction.hash
                        )}
                      </div>

                      <div
                        style={
                          transactionTime
                        }
                      >
                        {new Date(
                          transaction.timestamp
                        ).toLocaleString()}
                      </div>

                      <div
                        style={
                          viewTransaction
                        }
                      >
                        View transaction →
                      </div>
                    </a>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={
                  clearTransactionHistory
                }
                style={clearHistoryButton}
              >
                Clear local history
              </button>
            </>
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

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function shortHash(hash) {
  if (!hash) {
    return "";
  }

  if (hash.length <= 20) {
    return hash;
  }

  return (
    hash.slice(0, 10) +
    "..." +
    hash.slice(-8)
  );
}

function formatMethod(method) {
  if (!method) {
    return "Transaction";
  }

  return method
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

// --------------------------------------------------
// Styles
// --------------------------------------------------

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
  whiteSpace: "pre-wrap",
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

// --------------------------------------------------
// Transaction history styles
// --------------------------------------------------

const transactionList = {
  display: "grid",
  gap: 10,
};

const transactionItem = {
  display: "block",
  textDecoration: "none",
  color: "#111827",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 14,
  background: "#f9fafb",
};

const transactionTop = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  fontSize: 13,
};

const transactionJob = {
  color: "#6b7280",
  fontSize: 12,
};

const transactionHash = {
  color: "#2563eb",
  fontSize: 13,
  fontWeight: 600,
  wordBreak: "break-all",
};

const transactionTime = {
  marginTop: 7,
  color: "#9ca3af",
  fontSize: 11,
};

const viewTransaction = {
  marginTop: 9,
  color: "#2563eb",
  fontSize: 12,
  fontWeight: 600,
};

const emptyHistory = {
  padding: 16,
  borderRadius: 10,
  background: "#f9fafb",
  color: "#6b7280",
  textAlign: "center",
  fontSize: 13,
};

const clearHistoryButton = {
  marginTop: 12,
  background: "#ffffff",
  color: "#6b7280",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 12,
  cursor: "pointer",
  width: "100%",
};

const footer = {
  textAlign: "center",
  color: "#9ca3af",
  fontSize: 12,
  lineHeight: 1.6,
  paddingTop: 12,
};
