// Maintainer-only SDK adapter. No keys or signing code enter the library/browser bundle.
import { createWalletClient } from '@arkiv-network/sdk';
import { custom } from 'viem';
import { getGasPrice } from 'viem/actions';

export class GasBudgetError extends Error {}
export function graphWriter({ chain, account, pub, transport, onSubmitting, onSent, gasOverride }) {
  const local = createWalletClient({ chain, account, transport: transport() });
  const base = transport()({ chain });
  let last;
  const observed = custom({ request: async request => {
    if (request.method !== 'eth_sendTransaction') return base.request(request);
    const tx = request.params[0];
    if (tx.from.toLowerCase() !== account.address.toLowerCase() || tx.to.toLowerCase() !== '0x4400000000000000000000000000000000000044' || BigInt(tx.value ?? 0) !== 0n) throw new Error('Unexpected GRAPH operation.');
    const [estimated, head, nonce, pending, gasPrice, balance] = await Promise.all([
      pub.request({ method: 'eth_estimateGas', params: [{ from: account.address, to: tx.to, data: tx.data, value: '0x0' }, 'latest'] }),
      pub.getBlock({ blockTag: 'latest' }),
      pub.getTransactionCount({ address: account.address, blockTag: 'latest' }),
      pub.getTransactionCount({ address: account.address, blockTag: 'pending' }),
      getGasPrice(pub), pub.getBalance({ address: account.address, blockTag: 'latest' }),
    ]);
    const estimate = BigInt(estimated);
    if (estimate <= 0n || pending !== nonce || (tx.nonce !== undefined && BigInt(tx.nonce) !== BigInt(nonce))) throw new Error('Invalid estimate or pending/stale GRAPH nonce.');
    const minimum = estimate * 2n > 1_000_000n ? estimate * 2n : 1_000_000n;
    const gas = gasOverride ?? minimum;
    if (gas < minimum) throw new Error('A caller gas override cannot remove measured headroom.');
    if (gas > head.gasLimit / 2n) throw new GasBudgetError('Split the batch: twice the estimate must fit within half the head gas limit.');
    if (balance < gas * gasPrice) throw new Error('Insufficient GRAPH test funds.');
    last = { nonce, estimate: String(estimate), gas: String(gas), gasPrice: String(gasPrice), headGasLimit: String(head.gasLimit) };
    await onSubmitting?.(last);
    const hash = await local.sendTransaction({ account, chain, to: tx.to, data: tx.data, value: 0n, nonce, gas, gasPrice });
    await onSent?.(hash, last);
    return hash;
  } }, { retryCount: 0 });
  // JSON-RPC account lets us estimate the SDK's exact unsigned calldata before local signing.
  return { wallet: createWalletClient({ chain, account: account.address, transport: observed }), last: () => last };
}
