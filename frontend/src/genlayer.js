import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// Deployed Freelance Escrow contract
export const CONTRACT_ADDRESS =
  "0x6705628B24F9B2d99363a59FD7603dE716C6F332";

let client = null;
let connectedAddress = null;

export function getConnectedAddress() {
  return connectedAddress;
}

// Connect wallet
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error(
      "No injected wallet found. Install MetaMask or open this page in a wallet browser."
    );
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  if (!accounts || accounts.length === 0) {
    throw new Error("No account returned by wallet.");
  }

  connectedAddress = accounts[0];

  client = createClient({
    chain: studionet,
    account: connectedAddress,
  });

  return connectedAddress;
}

export async function restoreWallet() {
  if (!window.ethereum) {
    return null;
  }

  const accounts = await window.ethereum.request({
    method: "eth_accounts",
  });

  if (!accounts || accounts.length === 0) {
    return null;
  }

  connectedAddress = accounts[0];

  client = createClient({
    chain: studionet,
    account: connectedAddress,
  });

  return connectedAddress;
}

export async function rebuildClient() {
  if (!window.ethereum) return null;

  const accounts = await window.ethereum.request({
    method: "eth_accounts",
  });

  if (!accounts || accounts.length === 0) return null;

  connectedAddress = accounts[0];

  client = createClient({
    chain: studionet,
    account: connectedAddress,
  });

  return connectedAddress;
}

export function getClient() {
  if (!client) {
    throw new Error(
      "Wallet not connected yet. Call connectWallet() first."
    );
  }

  return client;
}

// --------------------------------------------------
// Transaction helper
// --------------------------------------------------

async function sendTransaction({
  address,
  functionName,
  args = [],
  value,
}) {
  const c = getClient();

  const txHash = await c.writeContract({
    address,
    functionName,
    args,
    ...(value !== undefined ? { value } : {}),
  });

  // Return immediately after the transaction is accepted by
  // the wallet/client instead of waiting for FINALIZED.
  return {
    hash: txHash,
  };
}

// --------------------------------------------------
// Contract calls
// --------------------------------------------------

export async function createJob(
  freelancerAddress,
  requirements,
  amountInGen
) {
  const c = getClient();

  if (!freelancerAddress || !freelancerAddress.trim()) {
    throw new Error("Freelancer address is required.");
  }

  if (!requirements || !requirements.trim()) {
    throw new Error("Job requirements are required.");
  }

  const amount = Number(amountInGen);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Escrow amount must be greater than 0 GEN.");
  }

  // Get the current job count before creating the job.
  const previousCount = Number(await getJobCount());

  const txHash = await c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "create_job",
    args: [
      freelancerAddress.trim(),
      requirements.trim(),
    ],
    value: BigInt(Math.floor(amount * 1e18)),
  });

  return {
    hash: txHash,
    previousCount,
  };
}

export async function submitWork(
  jobId,
  deliverable,
  isUrl
) {
  if (!String(jobId).trim()) {
    throw new Error("Job ID is required.");
  }

  if (!deliverable || !deliverable.trim()) {
    throw new Error("Deliverable is required.");
  }

  return sendTransaction({
    address: CONTRACT_ADDRESS,
    functionName: "submit_work",
    args: [
      jobId,
      deliverable.trim(),
      Boolean(isUrl),
    ],
  });
}

export async function approveJob(jobId) {
  if (!String(jobId).trim()) {
    throw new Error("Job ID is required.");
  }

  return sendTransaction({
    address: CONTRACT_ADDRESS,
    functionName: "approve",
    args: [jobId],
  });
}

export async function disputeJob(
  jobId,
  reason
) {
  if (!String(jobId).trim()) {
    throw new Error("Job ID is required.");
  }

  if (!reason || !reason.trim()) {
    throw new Error("Dispute reason is required.");
  }

  if (reason.trim().length > 2000) {
    throw new Error(
      "Dispute reason must be 2000 characters or less."
    );
  }

  return sendTransaction({
    address: CONTRACT_ADDRESS,
    functionName: "dispute",
    args: [
      jobId,
      reason.trim(),
    ],
  });
}

export async function recoverUnavailableJob(
  jobId,
  reason
) {
  if (!String(jobId).trim()) {
    throw new Error("Job ID is required.");
  }

  if (!reason || !reason.trim()) {
    throw new Error("Recovery reason is required.");
  }

  if (reason.trim().length > 2000) {
    throw new Error(
      "Recovery reason must be 2000 characters or less."
    );
  }

  return sendTransaction({
    address: CONTRACT_ADDRESS,
    functionName: "recover_unavailable_job",
    args: [
      jobId,
      reason.trim(),
    ],
  });
}

export async function abandonJob(
  jobId,
  reason
) {
  if (!String(jobId).trim()) {
    throw new Error("Job ID is required.");
  }

  if (!reason || !reason.trim()) {
    throw new Error("Abandonment reason is required.");
  }

  if (reason.trim().length > 2000) {
    throw new Error(
      "Abandonment reason is required."
    );
  }

  if (reason.trim().length > 2000) {
    throw new Error(
      "Abandonment reason must be 2000 characters or less."
    );
  }

  return sendTransaction({
    address: CONTRACT_ADDRESS,
    functionName: "abandon_job",
    args: [
      jobId,
      reason.trim(),
    ],
  });
}

export async function getContractBalance() {
  const c = getClient();

  return c.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_contract_balance",
    args: [],
  });
}

// --------------------------------------------------
// Read-only calls
// --------------------------------------------------

export async function getJob(jobId) {
  const c = getClient();

  if (!String(jobId).trim()) {
    throw new Error("Job ID is required.");
  }

  return c.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_job",
    args: [jobId],
  });
}

export async function getJobCount() {
  const c = getClient();

  return c.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "job_count",
    args: [],
  });
}
