import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// Change this to your deployed contract address once you deploy
// outside of Studio (e.g. to a real testnet).
export const CONTRACT_ADDRESS = "PASTE_YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE";

let client = null;
let connectedAddress = null;

export function getConnectedAddress() {
  return connectedAddress;
}

// Connects to MetaMask (or any injected EVM wallet) and builds a
// genlayer-js client that uses that wallet for signing writes.
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Install MetaMask (or open this page in a wallet browser).");
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) {
    throw new Error("No account returned by wallet.");
  }

  connectedAddress = accounts[0];

  // Passing just the address string (not a private-key account) tells
  // genlayer-js to route signing through the injected wallet (MetaMask).
  client = createClient({
    chain: studionet,
    account: connectedAddress,
  });

  return connectedAddress;
}

export function getClient() {
  if (!client) {
    throw new Error("Wallet not connected yet — call connectWallet() first.");
  }
  return client;
}

// ---- Contract calls ----

export async function createJob(freelancerAddress, requirements, amountInGen) {
  const c = getClient();
  const txHash = await c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "create_job",
    args: [freelancerAddress, requirements],
    value: BigInt(Math.floor(amountInGen * 1e18)), // GEN uses 18 decimals
  });
  return c.waitForTransactionReceipt({ hash: txHash, status: "FINALIZED" });
}

export async function submitWork(jobId, deliverable, isUrl) {
  const c = getClient();
  const txHash = await c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "submit_work",
    args: [jobId, deliverable, isUrl],
  });
  return c.waitForTransactionReceipt({ hash: txHash, status: "FINALIZED" });
}

export async function approveJob(jobId) {
  const c = getClient();
  const txHash = await c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "approve",
    args: [jobId],
  });
  return c.waitForTransactionReceipt({ hash: txHash, status: "FINALIZED" });
}

export async function disputeJob(jobId, reason) {
  const c = getClient();
  const txHash = await c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "dispute",
    args: [jobId, reason],
  });
  return c.waitForTransactionReceipt({ hash: txHash, status: "FINALIZED" });
}

export async function getJob(jobId) {
  const c = getClient();
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
