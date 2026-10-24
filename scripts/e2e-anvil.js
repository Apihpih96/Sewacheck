#!/usr/bin/env node
// End-to-end test of the REAL web-app chain code (js/chain.js) against a local
// Anvil node: deploy AgreementRegistry, anchor a sample's fingerprint through the
// contract AND through the self-transaction fallback, then verify both the way the
// web app does. Uses Anvil's unlocked dev accounts — no private key anywhere.
//
//   anvil &                                   # Foundry local chain on :8545
//   (cd contracts && forge build)
//   npm i --no-save ethers@6.13.4
//   node scripts/e2e-anvil.js
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ethers = require(process.env.ETHERS_PATH || 'ethers');
const FP = require(path.join(root, 'js', 'fingerprint.js'));

const RPC = process.env.RPC || 'http://127.0.0.1:8545';

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  const [landlord, tenant] = await Promise.all([provider.getSigner(0), provider.getSigner(1)]);

  // Deploy from Foundry artifact
  const art = JSON.parse(fs.readFileSync(path.join(root, 'contracts', 'out', 'AgreementRegistry.sol', 'AgreementRegistry.json'), 'utf8'));
  const factory = new ethers.ContractFactory(art.abi, art.bytecode.object, landlord);
  const reg = await factory.deploy();
  await reg.waitForDeployment();
  const addr = await reg.getAddress();
  console.log('deployed AgreementRegistry at', addr, 'on chainId', Number(net.chainId));

  // Load the browser module with a fake window
  global.self = global;
  global.ethers = ethers;
  global.SEWA_CONFIG = { CONTRACT_ADDRESS: addr, CHAIN_ID: Number(net.chainId), CHAIN_NAME: 'anvil', RPC_URLS: [RPC], EXPLORER: 'http://localhost', TX_DATA_PREFIX: 'SEWACHECK:v1:' };
  require(path.join(root, 'js', 'chain.js'));
  const C = global.SewaChain;

  const text = fs.readFileSync(path.join(root, 'samples', 'sample-2-balanced-apartment-pj.txt'), 'utf8');
  const { hash } = await FP.fingerprint(text);
  const tampered = (await FP.fingerprint(text.replace('RM2,000.00', 'RM2,500.00'))).hash;
  console.log('fingerprint', hash);

  // A) registry mode
  const c = new ethers.Contract(addr, C.ABI, landlord);
  const tx1 = await c.anchor(hash, 'TA unit A-5-2 v1');
  await tx1.wait();
  const ack = await new ethers.Contract(addr, C.ABI, tenant).acknowledge(hash);
  await ack.wait();
  const v = await C.verifyRegistry(hash);
  const vBad = await C.verifyRegistry(tampered);
  const t1 = await C.verifyTx(tx1.hash, hash);
  const t1Bad = await C.verifyTx(tx1.hash, tampered);
  console.log('registry verify   →', v.exists, 'acks', v.acknowledgements, '| tampered →', vBad.exists);
  console.log('registry tx check →', t1.mode, 'match', t1.matches, '| tampered match', t1Bad.matches);

  // B) self-transaction fallback
  const me = await tenant.getAddress();
  const prefix = ethers.hexlify(ethers.toUtf8Bytes('SEWACHECK:v1:'));
  const tx2 = await tenant.sendTransaction({ to: me, value: 0n, data: ethers.concat([prefix, hash]) });
  await tx2.wait();
  const t2 = await C.verifyTx(tx2.hash, hash);
  const t2Bad = await C.verifyTx(tx2.hash, tampered);
  console.log('self-tx check     →', t2.mode, 'match', t2.matches, '| tampered match', t2Bad.matches);

  const ok = v.exists && v.acknowledgements === 2 && !vBad.exists && t1.matches && !t1Bad.matches && t2.matches && !t2Bad.matches;
  if (!ok) { console.error('E2E FAILED'); process.exit(1); }
  console.log('E2E OK');
  process.exit(0);
})().catch((e) => { console.error('E2E FAILED:', e); process.exit(1); });
