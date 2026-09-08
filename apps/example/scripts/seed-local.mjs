// Optional local-only automation. The dapp itself always signs with MetaMask.
// Pass the absolute path of a private env file OUTSIDE the repository.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { privateKeyToAccount } from "viem/accounts";
import { http } from "viem";
import { build } from "esbuild";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const envPath = resolve(process.argv[2] ?? "");
const rel = relative(repo, envPath);
if (!process.argv[2] || !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))) throw new Error("Provide an env file outside the repository.");
const expectedOwner = "0xa618a2736431f24c26f1c8dac9ca00ecc845a1c6";
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL("../src/lib/social-sample.ts", import.meta.url))], bundle: true, write: false, platform: "node", format: "esm" });
const { socialSample } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const raw = readFileSync(envPath, "utf8");
const secret = raw.match(/^TESTNET_SEED_PRIVATE_KEY\s*=\s*["']?(0x[0-9a-fA-F]{64})["']?\s*$/m)?.[1];
if (!secret) { console.log("SEED_KEY_PENDING: private env file is empty or invalid. No transaction sent."); process.exit(2); }
const account = privateKeyToAccount(secret);
if (account.address.toLowerCase() !== expectedOwner) throw new Error("The key does not belong to the requested sample owner. No transaction sent.");
const pub = createPublicClient({ chain: tiramisu, transport: http(undefined, { timeout: 20000, retryCount: 1 }) });
if (await pub.getChainId() !== 7738577) throw new Error("Wrong chain. No transaction sent.");
const batch = socialSample();
if (batch.length >= 100) throw new Error("The sample exceeds this script's verified query bound.");
const project = batch[0].attributes.project;
const query = () => pub.select({ key: true, owner: true, attributes: true, expiresAt: true }).ownedBy(account.address).where(eq("project", project)).limit(100).fetch();
const existing = await query();
if (existing.entities.length) {
  console.log(JSON.stringify({ status: "already-created", count: existing.entities.length, owner: account.address, project }));
  process.exit(existing.entities.length === batch.length ? 0 : 3);
}
const pendingPath = `${envPath}.pending.json`;
if (existsSync(pendingPath)) {
  console.log("A previous seed attempt exists. Inspect the public receipt file before retrying. No transaction sent.");
  process.exit(4);
}
if (await pub.getBalance({ address: account.address }) === 0n) throw new Error("The testnet wallet needs funds.");
writeFileSync(pendingPath, JSON.stringify({ owner: account.address, project, chainId: tiramisu.id, startedAt: new Date().toISOString(), status: "started" }), { flag: "wx" });
try {
  const wallet = createWalletClient({ account, chain: tiramisu, transport: http(undefined, { timeout: 20000, retryCount: 0 }) });
  const result = await wallet.executeBatch({ creates: batch });
  // Preserve confirmed transaction evidence BEFORE any additional network reads.
  writeFileSync(pendingPath, JSON.stringify({ status: "confirmed-awaiting-verification", chainId: tiramisu.id,
    owner: account.address, project, txHash: result.txHash, keys: result.createdEntities }, null, 2));
  const receipt = await pub.getTransactionReceipt({ hash: result.txHash });
  const loaded = await query();
  const evidence = { status: receipt.status, chainId: tiramisu.id, owner: account.address, project, txHash: result.txHash,
    created: result.createdEntities.length, queried: loaded.entities.length, keys: result.createdEntities,
    block: String(receipt.blockNumber), gasUsed: String(receipt.gasUsed), verifiedAt: new Date().toISOString() };
  writeFileSync(pendingPath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  if (receipt.status !== "success" || loaded.entities.length !== batch.length || loaded.entities.some(e => e.owner.toLowerCase() !== expectedOwner)) process.exit(5);
} catch {
  // SDK errors can include request context. Never print them in a signing script.
  console.error("Seed did not finish cleanly. Do not retry automatically; inspect the wallet transaction and query the namespace first.");
  process.exit(1);
}
