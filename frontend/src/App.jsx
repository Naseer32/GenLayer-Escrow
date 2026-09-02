import { useEffect, useState } from "react";

import {
  AlertTriangle,
  Check,
  CircleCheck,
  Clock3,
  FileCheck2,
  LockKeyhole,
  RotateCcw,
  Search,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";

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

const ACTION_LABELS = {
  connect: "Connect wallet",
  create: "Create & fund job",
  submit: "Submit work",
  approve: "Approve",
  dispute: "Dispute",
  recover: "Recover funds",
  abandon: "Recover abandoned job",
  lookup: "Check status",
};

const ACTION_LOADING = {
  connect: "Connecting",
  create: "Creating",
  submit: "Submitting",
  approve: "Approving",
  dispute: "Opening dispute",
  recover: "Recovering",
  abandon: "Processing",
  lookup: "Checking",
};

export default function App() {
  const [address, setAddress] = useState(null);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [successAction, setSuccessAction] = useState(null);

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
  const [abandonReason, setAbandonReason] = useState("");

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

  // Restore wallet on page load
  useEffect(() => {
    async function restore() {
      try {
        const addr = await restoreWallet();

        if (addr) {
          setAddress(addr);
          setStatus("Wallet connected.");
          setStatusType("success");
        }
      } catch (err) {
        console.error("Wallet restore failed:", err);
      }
    }

    restore();
  }, []);

  // Keep UI synchronized when wallet account changes
  useEffect(() => {
    if (!window.ethereum) {
      return;
    }

    function handleAccountsChanged(accounts) {
      if (!accounts || accounts.length === 0) {
        setAddress(null);
        setStatus("Wallet disconnected.");
        setStatusType("warning");
        return;
      }

      restoreWallet()
        .then((addr) => {
          if (addr) {
            setAddress(addr);
            setStatus("Wallet connected.");
            setStatusType("success");
          }
        })
        .catch((err) => {
          console.error("Account restore failed:", err);
          setStatus("Wallet account could not be restored.");
          setStatusType("error");
        });
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );
    };
  }, []);

  // Save transaction history
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

  // --------------------------------------------------
  // UI helpers
  // --------------------------------------------------

  function setUiStatus(message, type = "info") {
    setStatus(message);
    setStatusType(type);
  }

  function beginAction(action, message) {
    setBusy(true);
    setActiveAction(action);
    setSuccessAction(null);
    setUiStatus(message, "pending");
  }

  function finishAction(action, message) {
    setBusy(false);
    setActiveAction(null);
    setSuccessAction(action);
    setUiStatus(message, "success");

    window.setTimeout(() => {
      setSuccessAction((current) =>
        current === action ? null : current
      );
    }, 1800);
  }

  function failAction(message) {
    setBusy(false);
    setActiveAction(null);
    setSuccessAction(null);
    setUiStatus(message, "error");
  }

  function saveTransaction({ hash, method, jobId = null }) {
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
    setUiStatus("Local transaction history cleared.", "info");
  }

  // --------------------------------------------------
  // Wallet
  // --------------------------------------------------

  async function handleConnect() {
    try {
      beginAction("connect", "Connecting to wallet...");

      const addr = await connectWallet();

      setAddress(addr);

      finishAction("connect", "Wallet connected successfully.");
    } catch (err) {
      failAction(
        "Connect failed: " +
          (err?.message || String(err))
      );
    }
  }

  // --------------------------------------------------
  // Create job
  // --------------------------------------------------

  async function handleCreateJob() {
    if (!freelancer.trim()) {
      setUiStatus(
        "Enter the freelancer wallet address.",
        "error"
      );
      return;
    }

    if (!requirements.trim()) {
      setUiStatus(
        "Enter the job requirements.",
        "error"
      );
      return;
    }

    const parsedAmount = parseFloat(amount || "0");

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setUiStatus(
        "Enter a valid escrow amount.",
        "error"
      );
      return;
    }

    try {
      beginAction("create", "Preparing job creation...");

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

      setUiStatus(
        `Transaction submitted. Waiting for Job ${expectedJobId} to appear...`,
        "pending"
      );

      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const count = Number(await getJobCount());

          if (count > expectedJobId) {
            finishAction(
              "create",
              `Job ${expectedJobId} created successfully.`
            );
            return;
          }
        } catch (readError) {
          console.log("Job count check:", readError);
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 1000)
        );
      }

      finishAction(
        "create",
        `Job ${expectedJobId} transaction submitted successfully. The job is still being confirmed.`
      );
    } catch (err) {
      failAction(
        "Error: " +
          (err?.message || String(err))
      );
    }
  }

  // --------------------------------------------------
  // Submit work
  // --------------------------------------------------

  async function handleSubmitWork() {
    if (!submitJobId.trim()) {
      setUiStatus(
        "Enter a Job ID for submitting work.",
        "error"
      );
      return;
    }

    if (!deliverable.trim()) {
      setUiStatus(
        "Enter the deliverable or webpage URL.",
        "error"
      );
      return;
    }

    try {
      const jobId = submitJobId.trim();

      beginAction(
        "submit",
        `Submitting work for Job ${jobId}...`
      );

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

      finishAction(
        "submit",
        `Work transaction submitted successfully for Job ${jobId}.`
      );
    } catch (err) {
      failAction(
        "Error: " +
          (err?.message || String(err))
      );
    }
  }

  // --------------------------------------------------
  // Approve
  // --------------------------------------------------

  async function handleApprove() {
    if (!resolveJobId.trim()) {
      setUiStatus(
        "Enter a Job ID for approval.",
        "error"
      );
      return;
    }

    const jobId = resolveJobId.trim();

    try {
      beginAction(
        "approve",
        `Approving Job ${jobId}...`
      );

      const result = await approveJob(jobId);

      saveTransaction({
        hash: result.hash,
        method: "approve",
        jobId,
      });

      setUiStatus(
        `Approval submitted. Waiting for Job ${jobId} to update...`,
        "pending"
      );

      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const details = await getJob(jobId);

          const data =
            typeof details === "string"
              ? details
              : JSON.stringify(details);

          const normalized = data.toLowerCase();

          if (
            normalized.includes("approved") ||
            normalized.includes("resolved") ||
            normalized.includes("freelancer")
          ) {
            setJobDetails(details);

            finishAction(
              "approve",
              `Job ${jobId} approved successfully.`
            );
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

      finishAction(
        "approve",
        `Job ${jobId} approval transaction submitted successfully. The contract is still updating.`
      );
    } catch (err) {
      failAction(
        "Error: " +
          (err?.message || String(err))
      );
    }
  }

  // --------------------------------------------------
  // Dispute
  // --------------------------------------------------

  async function handleDispute() {
    if (!resolveJobId.trim()) {
      setUiStatus(
        "Enter a Job ID for the dispute.",
        "error"
      );
      return;
    }

    if (!disputeReason.trim()) {
      setUiStatus(
        "Please enter a reason for the dispute.",
        "error"
      );
      return;
    }

    if (disputeReason.trim().length > 2000) {
      setUiStatus(
        "Dispute reason must be 2000 characters or less.",
        "error"
      );
      return;
    }

    const jobId = resolveJobId.trim();

    try {
      beginAction(
        "dispute",
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

      finishAction(
        "dispute",
        `Dispute transaction submitted for Job ${jobId}.`
      );
    } catch (err) {
      failAction(
        "Error: " +
          (err?.message || String(err))
      );
    }
  }

  // --------------------------------------------------
  // Recovery
  // --------------------------------------------------

  async function handleRecovery() {
    if (!resolveJobId.trim()) {
      setUiStatus(
        "Enter a Job ID for recovery.",
        "error"
      );
      return;
    }

    if (!disputeReason.trim()) {
      setUiStatus(
        "Please enter a recovery reason.",
        "error"
      );
      return;
    }

    if (disputeReason.trim().length > 2000) {
      setUiStatus(
        "Recovery reason must be 2000 characters or less.",
        "error"
      );
      return;
    }

    const jobId = resolveJobId.trim();

    try {
      beginAction(
        "recover",
        "Submitting recovery transaction. GenLayer validators will evaluate the available evidence..."
      );

      const result = await recoverUnavailableJob(
        jobId,
        disputeReason.trim()
      );

      saveTransaction({
        hash: result.hash,
        method: "recover_unavailable_job",
        jobId,
      });

      finishAction(
        "recover",
        `Recovery transaction submitted for Job ${jobId}.`
      );
    } catch (err) {
      failAction(
        "Error: " +
          (err?.message || String(err))
      );
    }
  }

  // --------------------------------------------------
  // Abandon
  // --------------------------------------------------

  async function handleAbandon() {
    if (!abandonJobId.trim()) {
      setUiStatus(
        "Enter a Job ID to abandon.",
        "error"
      );
      return;
    }

    if (!abandonReason.trim()) {
      setUiStatus(
        "Please enter a reason for the abandonment claim.",
        "error"
      );
      return;
    }

    if (abandonReason.trim().length > 2000) {
      setUiStatus(
        "Abandonment reason must be 2000 characters or less.",
        "error"
      );
      return;
    }

    const jobId = abandonJobId.trim();

    try {
      beginAction(
        "abandon",
        `Submitting abandoned-job recovery for Job ${jobId}...`
      );

      const result = await abandonJob(
        jobId,
        abandonReason.trim()
      );

      saveTransaction({
        hash: result.hash,
        method: "abandon_job",
        jobId,
      });

      finishAction(
        "abandon",
        `Abandoned-job transaction submitted for Job ${jobId}.`
      );
    } catch (err) {
      failAction(
        "Error: " +
          (err?.message || String(err))
      );
    }
  }

  // --------------------------------------------------
  // Lookup
  // --------------------------------------------------

  async function handleLookup() {
    if (!lookupJobId.trim()) {
      setUiStatus(
        "Enter a Job ID to look up.",
        "error"
      );
      return;
    }

    const jobId = lookupJobId.trim();

    try {
      beginAction(
        "lookup",
        `Loading Job ${jobId}...`
      );

      const details = await getJob(jobId);

      setJobDetails(details);

      finishAction(
        "lookup",
        `Loaded Job ${jobId}.`
      );
    } catch (err) {
      failAction(
        "Error: " +
          (err?.message || String(err))
      );
    }
  }

  const walletConnected = Boolean(address);

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.brandRow}>
            <div style={styles.logo}>
              <LockKeyhole size={22} />
            </div>

            <div>
              <p style={styles.eyebrow}>
                GENLAYER PROTOCOL
              </p>

              <h1 style={styles.title}>
                GenLayer Escrow
              </h1>

              <p style={styles.subtitle}>
                Fund work, verify delivery, and resolve agreements with
                independent on-chain arbitration.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleConnect}
            disabled={busy || walletConnected}
            style={{
              ...styles.walletButton,
              ...(walletConnected
                ? styles.walletButtonConnected
                : {}),
            }}
          >
            {activeAction === "connect" ? (
              <RotateCcw
                size={16}
                style={styles.spin}
              />
            ) : walletConnected ? (
              <Check size={16} />
            ) : (
              <Wallet size={16} />
            )}

            {activeAction === "connect"
              ? "Connecting..."
              : walletConnected
                ? "Wallet Connected"
                : "Connect Wallet"}
          </button>
        </header>

        {/* Connected wallet */}
        {address && (
          <div style={styles.connectedBar}>
            <div style={styles.connectedDot} />

            <span style={styles.connectedLabel}>
              Connected
            </span>

            <span style={styles.connectedAddress}>
              {shortAddress(address)}
            </span>
          </div>
        )}

        {/* Workflow */}
        <nav style={styles.workflow}>
          <WorkflowStep
            number="01"
            title="Create"
            description="Fund escrow"
            active={activeAction === "create"}
            complete={Boolean(successAction === "create")}
            color="#2563eb"
          />

          <WorkflowLine />

          <WorkflowStep
            number="02"
            title="Deliver"
            description="Submit work"
            active={activeAction === "submit"}
            complete={Boolean(successAction === "submit")}
            color="#9333ea"
          />

          <WorkflowLine />

          <WorkflowStep
            number="03"
            title="Resolve"
            description="Approve or dispute"
            active={
              activeAction === "approve" ||
              activeAction === "dispute"
            }
            complete={
              successAction === "approve" ||
              successAction === "dispute"
            }
            color="#059669"
          />

          <WorkflowLine />

          <WorkflowStep
            number="04"
            title="Recover"
            description="Handle exceptions"
            active={
              activeAction === "recover" ||
              activeAction === "abandon"
            }
            complete={
              successAction === "recover" ||
              successAction === "abandon"
            }
            color="#0891b2"
          />

          <WorkflowLine />

          <WorkflowStep
            number="05"
            title="Status"
            description="Check result"
            active={activeAction === "lookup"}
            complete={Boolean(successAction === "lookup")}
            color="#475569"
          />
        </nav>

        {/* Status */}
        {status && (
          <StatusBanner
            status={status}
            type={statusType}
            busy={busy}
          />
        )}

        {/* Main grid */}
        <div style={styles.mainGrid}>
          {/* Create Job */}
          <Section
            number="01 / CREATE JOB"
            title="Post a new job"
            description="Lock GEN in escrow until the agreed work is accepted."
            tone="blue"
            icon={<Zap size={19} />}
          >
            <Field
              label="Freelancer wallet"
              placeholder="0x..."
              value={freelancer}
              onChange={setFreelancer}
            />

            <Field
              label="Requirements"
              placeholder="Describe exactly what the freelancer needs to deliver..."
              value={requirements}
              onChange={setRequirements}
              area
            />

            <label style={styles.label}>
              Escrow amount
            </label>

            <div style={styles.amountBox}>
              <input
                style={styles.amountInput}
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value)
                }
                inputMode="decimal"
                placeholder="0.00"
              />

              <span style={styles.currency}>
                GEN
              </span>
            </div>

            <div style={styles.actionSpacing}>
              <ActionButton
                action="create"
                busy={activeAction === "create"}
                success={successAction === "create"}
                onClick={handleCreateJob}
                disabled={!walletConnected}
                color="blue"
              />
            </div>

            {!walletConnected && (
              <InfoBox>
                Connect your wallet before creating an escrow job.
              </InfoBox>
            )}
          </Section>

          {/* Job Status */}
          <Section
            number="05 / JOB STATUS"
            title="Job status & consensus"
            description="Look up the current escrow state and validator result."
            tone="neutral"
            icon={<Search size={19} />}
          >
            <Field
              label="Job identifier"
              placeholder="Enter job ID"
              value={lookupJobId}
              onChange={setLookupJobId}
              inputMode="numeric"
            />

            <div style={styles.actionSpacing}>
              <ActionButton
                action="lookup"
                busy={activeAction === "lookup"}
                success={successAction === "lookup"}
                onClick={handleLookup}
                disabled={!walletConnected}
                color="dark"
              />
            </div>

            {jobDetails ? (
              <JobResult
                jobId={lookupJobId}
                details={jobDetails}
              />
            ) : (
              <div style={styles.emptyResult}>
                <Clock3 size={17} />
                <span>
                  No job selected yet.
                </span>
              </div>
            )}
          </Section>
        </div>

        {/* Submit + Resolve */}
        <div style={styles.twoColumn}>
          {/* Submit */}
          <Section
            number="02 / SUBMIT WORK"
            title="Submit deliverable"
            description="Give the client a delivery reference to review."
            tone="purple"
            icon={<FileCheck2 size={19} />}
          >
            <Field
              label="Job ID"
              placeholder="Enter job ID"
              value={submitJobId}
              onChange={setSubmitJobId}
              inputMode="numeric"
            />

            <Field
              label="Deliverable"
              placeholder={
                isUrl
                  ? "https://..."
                  : "Paste your work or delivery note..."
              }
              value={deliverable}
              onChange={setDeliverable}
              area
            />

            <label style={styles.checkboxLabel}>
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

            <div style={styles.actionSpacing}>
              <ActionButton
                action="submit"
                busy={activeAction === "submit"}
                success={successAction === "submit"}
                onClick={handleSubmitWork}
                disabled={!walletConnected}
                color="purple"
              />
            </div>
          </Section>

          {/* Resolve */}
          <Section
            number="03 / RESOLVE JOB"
            title="Approve or dispute"
            description="Choose an outcome after reviewing the submitted work."
            tone="green"
            icon={<CircleCheck size={19} />}
          >
            <Field
              label="Job ID"
              placeholder="Enter job ID"
              value={resolveJobId}
              onChange={setResolveJobId}
              inputMode="numeric"
            />

            <Field
              label="Dispute or recovery reason"
              placeholder="Explain the dispute or recovery request..."
              value={disputeReason}
              onChange={setDisputeReason}
              area
              maxLength={2000}
            />

            <div style={styles.resolveGrid}>
              <ActionButton
                action="approve"
                busy={activeAction === "approve"}
                success={successAction === "approve"}
                onClick={handleApprove}
                disabled={!walletConnected}
                color="green"
              />

              <ActionButton
                action="dispute"
                busy={activeAction === "dispute"}
                success={successAction === "dispute"}
                onClick={handleDispute}
                disabled={!walletConnected}
                color="orange"
              />
            </div>

            <div style={styles.recoveryArea}>
              <div style={styles.recoveryHeader}>
                <RotateCcw
                  size={16}
                  style={{ color: "#0891b2" }}
                />

                <strong>
                  Evidence recovery
                </strong>
              </div>

              <p style={styles.smallText}>
                If submitted evidence cannot be retrieved and the job enters
                an unavailable-evidence state, recovery can be requested.
              </p>

              <ActionButton
                action="recover"
                busy={activeAction === "recover"}
                success={successAction === "recover"}
                onClick={handleRecovery}
                disabled={!walletConnected}
                color="cyan"
              />
            </div>

            <div style={styles.explanationBox}>
              <strong>
                Intelligent dispute resolution
              </strong>

              <p>
                GenLayer validators evaluate the job requirements,
                submitted work, and dispute reason before determining
                whether the freelancer or client should receive the
                escrowed GEN.
              </p>
            </div>
          </Section>
        </div>

        {/* Abandoned Job */}
        <div style={styles.singleColumn}>
          <Section
            number="04 / ABANDONED JOB"
            title="Abandoned job recovery"
            description="Recover escrow when a job has passed its applicable deadline without the required action."
            tone="amber"
            icon={<AlertTriangle size={19} />}
          >
            <div style={styles.abandonGrid}>
              <div>
                <Field
                  label="Job ID"
                  placeholder="Enter job ID"
                  value={abandonJobId}
                  onChange={setAbandonJobId}
                  inputMode="numeric"
                />
              </div>

              <div>
                <Field
                  label="Reason"
                  placeholder="Explain why this job should be treated as abandoned..."
                  value={abandonReason}
                  onChange={setAbandonReason}
                  area
                  maxLength={2000}
                />
              </div>
            </div>

            <div style={styles.actionSpacing}>
              <ActionButton
                action="abandon"
                busy={activeAction === "abandon"}
                success={successAction === "abandon"}
                onClick={handleAbandon}
                disabled={!walletConnected}
                color="amber"
              />
            </div>

            <div style={styles.abandonInfo}>
              <strong>
                How abandonment works
              </strong>

              <p>
                If the freelancer never submits work before the submission
                deadline, the client can recover the escrow.
              </p>

              <p>
                If the freelancer submits work but the client does not
                approve or dispute it before the approval deadline, the
                freelancer can recover the escrow.
              </p>
            </div>
          </Section>
        </div>

        {/* Transactions */}
        <section style={styles.transactionSection}>
          <div style={styles.transactionHeader}>
            <div>
              <p style={styles.sectionEyebrow}>
                ACTIVITY
              </p>

              <h2 style={styles.transactionTitle}>
                Transaction history
              </h2>

              <p style={styles.transactionDescription}>
                Your submitted transactions remain available after refreshing
                the page.
              </p>
            </div>

            <div style={styles.transactionIcon}>
              <ShieldCheck size={19} />
            </div>
          </div>

          {transactions.length === 0 ? (
            <div style={styles.emptyHistory}>
              <Clock3 size={18} />
              <span>
                No transactions yet.
              </span>
            </div>
          ) : (
            <>
              <div style={styles.transactionList}>
                {transactions.map((transaction) => (
                  <a
                    key={transaction.hash}
                    href={
                      "https://explorer-studio.genlayer.com/tx/" +
                      transaction.hash
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.transactionItem}
                    title={transaction.hash}
                  >
                    <div style={styles.transactionMain}>
                      <div>
                        <div style={styles.transactionName}>
                          {formatMethod(transaction.method)}
                        </div>

                        {transaction.jobId !== null &&
                          transaction.jobId !== undefined && (
                            <span style={styles.jobBadge}>
                              Job {transaction.jobId}
                            </span>
                          )}
                      </div>

                      <span style={styles.confirmedBadge}>
                        <Check size={11} />
                        Submitted
                      </span>
                    </div>

                    <div style={styles.hash}>
                      {shortHash(transaction.hash)}
                    </div>

                    <div style={styles.transactionBottom}>
                      <span>
                        {new Date(
                          transaction.timestamp
                        ).toLocaleString()}
                      </span>

                      <span style={styles.viewLink}>
                        View transaction →
                      </span>
                    </div>
                  </a>
                ))}
              </div>

              <button
                type="button"
                onClick={clearTransactionHistory}
                style={styles.clearButton}
              >
                Clear local history
              </button>
            </>
          )}
        </section>

        <footer style={styles.footer}>
          <span>
            Escrow state is recorded on GenLayer.
          </span>

          <span style={styles.footerSecure}>
            <ShieldCheck size={14} />
            Non-custodial by design
          </span>
        </footer>
      </div>
    </main>
  );
}

// --------------------------------------------------
// Components
// --------------------------------------------------

function Field({
  label,
  placeholder,
  value,
  onChange,
  area = false,
  maxLength,
  inputMode,
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>
        {label}
      </span>

      {area ? (
        <textarea
          style={styles.textarea}
          placeholder={placeholder}
          value={value}
          onChange={(e) =>
            onChange?.(e.target.value)
          }
          maxLength={maxLength}
        />
      ) : (
        <input
          style={styles.input}
          placeholder={placeholder}
          value={value}
          onChange={(e) =>
            onChange?.(e.target.value)
          }
          inputMode={inputMode}
          maxLength={maxLength}
        />
      )}
    </label>
  );
}

function ActionButton({
  action,
  busy,
  success,
  onClick,
  disabled,
  color = "blue",
}) {
  const loadingText =
    ACTION_LOADING[action] || "Processing";

  let text = ACTION_LABELS[action];

  if (busy) {
    text = `${loadingText}...`;
  } else if (success) {
    text = "Confirmed";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      style={{
        ...styles.actionButton,
        ...buttonColors[color],
        ...(success ? styles.successButton : {}),
      }}
      className="genlayer-action-button"
    >
      {success ? (
        <Check size={16} />
      ) : busy ? (
        <RotateCcw
          size={16}
          style={styles.spin}
        />
      ) : null}

      {text}
    </button>
  );
}

function Section({
  number,
  title,
  description,
  tone,
  icon,
  children,
}) {
  return (
    <article
      style={{
        ...styles.section,
        ...sectionTones[tone],
      }}
    >
      <div style={styles.sectionHeader}>
        <div style={styles.sectionHeading}>
          <p style={styles.sectionEyebrow}>
            {number}
          </p>

          <h2 style={styles.sectionTitle}>
            {title}
          </h2>

          <p style={styles.description}>
            {description}
          </p>
        </div>

        <div
          style={{
            ...styles.sectionIcon,
            ...iconTones[tone],
          }}
        >
          {icon}
        </div>
      </div>

      {children}
    </article>
  );
}

function WorkflowStep({
  number,
  title,
  description,
  active,
  complete,
  color,
}) {
  return (
    <div style={styles.workflowStep}>
      <div
        style={{
          ...styles.workflowNumber,
          background:
            active || complete
              ? color
              : "#f1f5f9",
          color:
            active || complete
              ? "#ffffff"
              : "#64748b",
        }}
      >
        {complete ? (
          <Check size={14} />
        ) : (
          number
        )}
      </div>

      <div>
        <div style={styles.workflowTitle}>
          {title}
        </div>

        <div style={styles.workflowDescription}>
          {description}
        </div>
      </div>
    </div>
  );
}

function WorkflowLine() {
  return (
    <div style={styles.workflowLine} />
  );
}

function StatusBanner({
  status,
  type,
  busy,
}) {
  const colors = {
    info: {
      border: "#e2e8f0",
      background: "#f8fafc",
      icon: "#64748b",
    },
    pending: {
      border: "#bfdbfe",
      background: "#eff6ff",
      icon: "#2563eb",
    },
    success: {
      border: "#bbf7d0",
      background: "#f0fdf4",
      icon: "#16a34a",
    },
    error: {
      border: "#fecaca",
      background: "#fef2f2",
      icon: "#dc2626",
    },
    warning: {
      border: "#fde68a",
      background: "#fffbeb",
      icon: "#d97706",
    },
  };

  const theme = colors[type] || colors.info;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        ...styles.statusBanner,
        borderColor: theme.border,
        background: theme.background,
      }}
    >
      {busy ? (
        <RotateCcw
          size={17}
          style={{
            ...styles.spin,
            color: theme.icon,
          }}
        />
      ) : type === "error" ? (
        <AlertTriangle
          size={17}
          style={{ color: theme.icon }}
        />
      ) : type === "success" ? (
        <Check
          size={17}
          style={{ color: theme.icon }}
        />
      ) : (
        <ShieldCheck
          size={17}
          style={{ color: theme.icon }}
        />
      )}

      <span>{status}</span>
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div style={styles.infoBox}>
      <ShieldCheck size={15} />
      <span>{children}</span>
    </div>
  );
}

function JobResult({ jobId, details }) {
  const resultEntries = getResultEntries(details);
  const statusValue = findResultValue(details, [
    "status",
    "state",
  ]);
  const resolutionValue = findResultValue(details, [
    "resolution",
    "result",
    "outcome",
    "winner",
    "consensus",
  ]);

  return (
    <div style={styles.jobResult}>
      <div style={styles.jobResultHeader}>
        <div>
          <span style={styles.resultLabel}>
            JOB ID
          </span>

          <strong style={styles.resultJobId}>
            {jobId}
          </strong>
        </div>

        <div style={styles.badgeRow}>
          {statusValue && (
            <ResultBadge value={statusValue} />
          )}

          {resolutionValue &&
            String(resolutionValue) !==
              String(statusValue) && (
              <ResultBadge
                value={resolutionValue}
              />
            )}
        </div>
      </div>

      {resultEntries.length > 0 ? (
        <div style={styles.resultEntries}>
          {resultEntries.map(([key, value]) => (
            <div
              key={key}
              style={styles.resultEntry}
            >
              <span style={styles.resultKey}>
                {formatResultKey(key)}
              </span>

              <span style={styles.resultValue}>
                {formatResultValue(value)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <pre style={styles.rawResult}>
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ResultBadge({ value }) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[_-]/g, " ");

  let background = "#f1f5f9";
  let color = "#475569";

  if (
    normalized.includes("pending") ||
    normalized.includes("submitted")
  ) {
    background = "#eff6ff";
    color = "#1d4ed8";
  } else if (
    normalized.includes("resolved") ||
    normalized.includes("approved")
  ) {
    background = "#ecfdf5";
    color = "#047857";
  } else if (
    normalized.includes("freelancer")
  ) {
    background = "#f3e8ff";
    color = "#7e22ce";
  } else if (
    normalized.includes("client")
  ) {
    background = "#fff7ed";
    color = "#c2410c";
  } else if (
    normalized.includes("unavailable") ||
    normalized.includes("evidence")
  ) {
    background = "#ecfeff";
    color = "#0e7490";
  } else if (
    normalized.includes("failed") ||
    normalized.includes("error")
  ) {
    background = "#fef2f2";
    color = "#b91c1c";
  }

  return (
    <span
      style={{
        ...styles.resultBadge,
        background,
        color,
      }}
    >
      {formatResultValue(value)}
    </span>
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

function shortAddress(address) {
  if (!address) {
    return "";
  }

  if (address.length <= 16) {
    return address;
  }

  return (
    address.slice(0, 7) +
    "..." +
    address.slice(-5)
  );
}

function formatMethod(method) {
  if (!method) {
    return "Transaction";
  }

  return method
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatResultKey(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatResultValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "Unavailable";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function getResultEntries(details) {
  if (
    !details ||
    typeof details !== "object" ||
    Array.isArray(details)
  ) {
    return [];
  }

  return Object.entries(details).filter(
    ([, value]) =>
      value !== undefined &&
      value !== null &&
      typeof value !== "object"
  );
}

function findResultValue(details, keys) {
  if (
    !details ||
    typeof details !== "object" ||
    Array.isArray(details)
  ) {
    return null;
  }

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(
        details,
        key
      )
    ) {
      return details[key];
    }
  }

  return null;
}

// --------------------------------------------------
// Colors
// --------------------------------------------------

const buttonColors = {
  blue: {
    background: "#2563eb",
  },
  purple: {
    background: "#7e22ce",
  },
  green: {
    background: "#059669",
  },
  orange: {
    background: "#ea580c",
  },
  cyan: {
    background: "#0e7490",
  },
  amber: {
    background: "#d97706",
  },
  dark: {
    background: "#334155",
  },
};

const sectionTones = {
  blue: {
    borderColor: "#bfdbfe",
  },
  purple: {
    borderColor: "#d8b4fe",
  },
  green: {
    borderColor: "#a7f3d0",
  },
  amber: {
    borderColor: "#fcd34d",
    background: "#fffdf7",
  },
  neutral: {
    borderColor: "#e2e8f0",
  },
};

const iconTones = {
  blue: {
    background: "#eff6ff",
    color: "#2563eb",
  },
  purple: {
    background: "#faf5ff",
    color: "#9333ea",
  },
  green: {
    background: "#ecfdf5",
    color: "#059669",
  },
  amber: {
    background: "#fffbeb",
    color: "#d97706",
  },
  neutral: {
    background: "#f8fafc",
    color: "#475569",
  },
};

// --------------------------------------------------
// Styles
// --------------------------------------------------

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #f8fafc 0%, #ffffff 420px)",
    color: "#0f172a",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxSizing: "border-box",
  },

  container: {
    width: "100%",
    maxWidth: 1120,
    margin: "0 auto",
    padding: "28px 18px 48px",
    boxSizing: "border-box",
  },

  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 24,
    paddingBottom: 28,
    borderBottom: "1px solid #e2e8f0",
  },

  brandRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 15,
    minWidth: 0,
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 15,
    background: "#2563eb",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 8px 24px rgba(37, 99, 235, .18)",
  },

  eyebrow: {
    margin: "1px 0 5px",
    color: "#64748b",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: ".18em",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  title: {
    margin: 0,
    fontSize: 31,
    lineHeight: 1.12,
    letterSpacing: "-.035em",
    fontWeight: 700,
  },

  subtitle: {
    margin: "9px 0 0",
    maxWidth: 620,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.6,
  },

  walletButton: {
    height: 44,
    minWidth: 178,
    padding: "0 16px",
    border: "none",
    borderRadius: 12,
    background: "#0f172a",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexShrink: 0,
    transition: "transform .15s ease, opacity .15s ease",
  },

  walletButtonConnected: {
    background: "#059669",
  },

  connectedBar: {
    marginTop: 14,
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    padding: "0 12px",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
    background: "#f0fdf4",
    fontSize: 12,
  },

  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#16a34a",
  },

  connectedLabel: {
    color: "#15803d",
    fontWeight: 700,
  },

  connectedAddress: {
    color: "#475569",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  workflow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "26px 0",
    overflowX: "auto",
  },

  workflowStep: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 118,
  },

  workflowNumber: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 800,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  workflowTitle: {
    fontSize: 12,
    fontWeight: 700,
  },

  workflowDescription: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 10,
    whiteSpace: "nowrap",
  },

  workflowLine: {
    height: 1,
    minWidth: 18,
    flex: 1,
    background: "#e2e8f0",
  },

  statusBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 46,
    padding: "10px 14px",
    border: "1px solid",
    borderRadius: 12,
    marginBottom: 20,
    fontSize: 13,
    lineHeight: 1.45,
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0, 1.25fr) minmax(320px, .75fr)",
    gap: 18,
  },

  twoColumn: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: 18,
    marginTop: 18,
  },

  singleColumn: {
    marginTop: 18,
  },

  section: {
    border: "1px solid",
    borderRadius: 18,
    background: "#ffffff",
    padding: 22,
    boxShadow:
      "0 4px 18px rgba(15, 23, 42, .035)",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 22,
  },

  sectionHeading: {
    minWidth: 0,
  },

  sectionEyebrow: {
    margin: "0 0 7px",
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: ".15em",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  sectionTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.2,
    letterSpacing: "-.025em",
  },

  description: {
    margin: "8px 0 0",
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.55,
    maxWidth: 620,
  },

  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  field: {
    display: "grid",
    gap: 7,
    marginBottom: 15,
  },

  label: {
    display: "block",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
  },

  input: {
    width: "100%",
    height: 44,
    boxSizing: "border-box",
    border: "1px solid #dbe2ea",
    borderRadius: 11,
    background: "#ffffff",
    color: "#0f172a",
    padding: "0 13px",
    fontSize: 13,
    outline: "none",
    transition:
      "border-color .15s ease, box-shadow .15s ease",
  },

  textarea: {
    width: "100%",
    minHeight: 98,
    boxSizing: "border-box",
    border: "1px solid #dbe2ea",
    borderRadius: 11,
    background: "#ffffff",
    color: "#0f172a",
    padding: "12px 13px",
    fontSize: 13,
    lineHeight: 1.5,
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
  },

  amountBox: {
    height: 44,
    display: "flex",
    alignItems: "stretch",
    border: "1px solid #dbe2ea",
    borderRadius: 11,
    overflow: "hidden",
    marginTop: 7,
    marginBottom: 15,
  },

  amountInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    padding: "0 13px",
    fontSize: 13,
    background: "#ffffff",
  },

  currency: {
    width: 62,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderLeft: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 800,
  },

  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    color: "#475569",
    fontSize: 12,
    fontWeight: 600,
  },

  actionSpacing: {
    marginTop: 5,
  },

  actionButton: {
    width: "100%",
    minHeight: 44,
    border: "none",
    borderRadius: 11,
    color: "#ffffff",
    padding: "0 15px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow:
      "0 4px 12px rgba(15, 23, 42, .08)",
    transition:
      "transform .15s ease, opacity .15s ease, box-shadow .15s ease",
  },

  successButton: {
    background: "#059669",
  },

  resolveGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginTop: 5,
  },

  recoveryArea: {
    marginTop: 15,
    padding: 14,
    border: "1px solid #a5f3fc",
    borderRadius: 13,
    background: "#ecfeff",
  },

  recoveryHeader: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: "#155e75",
    marginBottom: 7,
  },

  smallText: {
    margin: "0 0 12px",
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.55,
  },

  explanationBox: {
    marginTop: 14,
    padding: 13,
    borderRadius: 12,
    background: "#f8fafc",
    color: "#475569",
    fontSize: 11,
    lineHeight: 1.55,
  },

  explanationBoxStrong: {
    fontWeight: 700,
  },

  infoBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 11,
    borderRadius: 10,
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.5,
  },

  abandonGrid: {
    display: "grid",
    gridTemplateColumns:
      "minmax(180px, .65fr) minmax(0, 1.35fr)",
    gap: 16,
  },

  abandonInfo: {
    marginTop: 14,
    padding: 13,
    borderRadius: 12,
    background: "#fffbeb",
    color: "#78716c",
    fontSize: 11,
    lineHeight: 1.55,
  },

  emptyResult: {
    marginTop: 15,
    minHeight: 70,
    borderRadius: 12,
    background: "#f8fafc",
    color: "#94a3b8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 12,
  },

  jobResult: {
    marginTop: 15,
    border: "1px solid #e2e8f0",
    borderRadius: 13,
    overflow: "hidden",
  },

  jobResultHeader: {
    padding: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  },

  resultLabel: {
    display: "block",
    marginBottom: 3,
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: ".12em",
  },

  resultJobId: {
    fontSize: 13,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  badgeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    flexWrap: "wrap",
  },

  resultBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 9,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".04em",
  },

  resultEntries: {
    padding: 13,
  },

  resultEntry: {
    display: "grid",
    gridTemplateColumns:
      "minmax(90px, .45fr) minmax(0, 1fr)",
    gap: 12,
    padding: "9px 0",
    borderBottom: "1px solid #f1f5f9",
  },

  resultKey: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: 600,
  },

  resultValue: {
    color: "#0f172a",
    fontSize: 11,
    lineHeight: 1.45,
    wordBreak: "break-word",
    textAlign: "right",
  },

  rawResult: {
    margin: 0,
    padding: 13,
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "#334155",
    fontSize: 10,
    lineHeight: 1.5,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  transactionSection: {
    marginTop: 18,
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    background: "#ffffff",
    padding: 22,
    boxShadow:
      "0 4px 18px rgba(15, 23, 42, .035)",
  },

  transactionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },

  transactionTitle: {
    margin: 0,
    fontSize: 20,
    letterSpacing: "-.025em",
  },

  transactionDescription: {
    margin: "7px 0 0",
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.5,
  },

  transactionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    background: "#f8fafc",
    color: "#475569",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyHistory: {
    minHeight: 70,
    borderRadius: 12,
    background: "#f8fafc",
    color: "#94a3b8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 12,
  },

  transactionList: {
    display: "grid",
    gap: 9,
  },

  transactionItem: {
    display: "block",
    textDecoration: "none",
    color: "#0f172a",
    padding: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#ffffff",
    transition:
      "border-color .15s ease, box-shadow .15s ease",
  },

  transactionMain: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  transactionName: {
    fontSize: 12,
    fontWeight: 750,
  },

  jobBadge: {
    display: "inline-flex",
    marginTop: 5,
    padding: "3px 7px",
    borderRadius: 999,
    background: "#f1f5f9",
    color: "#64748b",
    fontSize: 9,
    fontWeight: 700,
  },

  confirmedBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    padding: "4px 8px",
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 9,
    fontWeight: 800,
    flexShrink: 0,
  },

  hash: {
    marginTop: 9,
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 700,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, monospace",
    wordBreak: "break-all",
  },

  transactionBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
    color: "#94a3b8",
    fontSize: 10,
  },

  viewLink: {
    color: "#2563eb",
    fontWeight: 700,
  },

  clearButton: {
    width: "100%",
    height: 38,
    marginTop: 12,
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#ffffff",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },

  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 22,
    marginTop: 22,
    borderTop: "1px solid #e2e8f0",
    color: "#94a3b8",
    fontSize: 10,
  },

  footerSecure: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  },

  spin: {
    animation: "genlayerSpin 1s linear infinite",
  },
};

// Add small interaction styles without changing the application logic.
if (
  typeof document !== "undefined" &&
  !document.getElementById("genlayer-escrow-styles")
) {
  const style = document.createElement("style");
  style.id = "genlayer-escrow-styles";

  style.textContent = `
    @keyframes genlayerSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .genlayer-action-button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(15, 23, 42, .12);
    }

    .genlayer-action-button:active:not(:disabled) {
      transform: scale(.97);
    }

    button:focus-visible,
    input:focus-visible,
    textarea:focus-visible {
      outline: 3px solid rgba(37, 99, 235, .16);
      outline-offset: 1px;
    }

    input::placeholder,
    textarea::placeholder {
      color: #94a3b8;
    }

    @media (max-width: 850px) {
      .genlayer-escrow-placeholder {}
    }

    @media (max-width: 760px) {
      body {
        overflow-x: hidden;
      }
    }
  `;

  document.head.appendChild(style);
}
