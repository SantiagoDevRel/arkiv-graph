import { describe, expect, it, vi } from 'vitest';
import { graphWriter } from './graph-writer.mjs';

// Exercise the actual SDK unsigned transaction boundary; no network or signing.
describe('maintainer unsigned gas guard', () => {
  it('stops oversized calldata and estimation errors before submission', async () => {
    const address = `0x${'a'.repeat(40)}`;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_blockNumber') return '0x100';
      if (method === 'eth_chainId') return '0x76edaf';
      throw new Error(`Unexpected RPC ${method}`);
    });
    const pub = {
      request: vi.fn().mockResolvedValue('0x7a1200'), // 8m estimate -> 16m exceeds 15m cap
      getBlock: vi.fn().mockResolvedValue({ gasLimit: 30_000_000n }),
      getTransactionCount: vi.fn().mockResolvedValue(0),
      getBalance: vi.fn().mockResolvedValue(10n ** 18n),
    };
    // viem's getGasPrice uses request directly on this client.
    pub.request.mockImplementation(async ({ method }) => method === 'eth_gasPrice' ? '0x1' : '0x7a1200');
    const { defineSchema, str } = await import('@arkiv-network/sdk/schema');
    const { ExpirationTime } = await import('@arkiv-network/sdk');
    const { rabdi } = await import('@arkiv-network/sdk/chains');
    const { custom } = await import('viem');
    const onSubmitting = vi.fn(), onSent = vi.fn();
    const writer = graphWriter({ chain: rabdi({ accessKey: 'test-only' }), account: { address, type: 'json-rpc' }, pub, transport: () => custom({ request }), onSubmitting, onSent });
    const Schema = defineSchema('gas-guard', { name: str() });
    const write = () => writer.wallet.createEntity(Schema, { name: 'large' }, { expiration: ExpirationTime.fromBlocks(10) }, { nonce: 0, gas: 1_000_000n, gasPrice: 1n });
    await expect(write()).rejects.toThrow();
    expect(onSubmitting).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([q]) => q.method.includes('send'))).toBe(false);
    expect(pub.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'eth_estimateGas', params: [expect.anything(), 'latest'] }));
    pub.request.mockRejectedValue(new Error('estimate unavailable'));
    await expect(write()).rejects.toThrow();
    expect(onSubmitting).not.toHaveBeenCalled();
  });
});
