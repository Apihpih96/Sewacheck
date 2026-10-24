/*
 * SewaCheck on-chain proof (ethers v6, loaded from CDN as window.ethers).
 *
 * Two anchoring modes:
 *  A) Registry mode — CONTRACT_ADDRESS set: calls AgreementRegistry.anchor(hash,label)
 *     and verifies with AgreementRegistry.verify(hash) (read-only, no wallet needed).
 *  B) Self-transaction mode — no contract deployed: sends a 0-ETH transaction
 *     from the user to themself with data = utf8("SEWACHECK:v1:") ++ hash.
 *     Anyone can verify by transaction hash; block timestamp proves "when".
 *
 * No private keys are ever handled here: signing happens in the user's wallet
 * (MetaMask mobile in-app browser, or any injected EIP-1193 wallet).
 */
(function (root) {
  'use strict';

  var ABI = [
    'function anchor(bytes32 hash, string label)',
    'function acknowledge(bytes32 hash)',
    'function verify(bytes32 hash) view returns (bool exists, address anchorer, uint256 timestamp, uint256 blockNumber, string label)',
    'function hasAcknowledged(bytes32 hash, address party) view returns (bool)',
    'function acknowledgementCount(bytes32 hash) view returns (uint256)',
    'event Anchored(bytes32 indexed hash, address indexed sender, uint256 timestamp, string label)',
    'event Acknowledged(bytes32 indexed hash, address indexed party, uint256 timestamp)',
    'error ZeroHash()',
    'error LabelTooLong(uint256 length, uint256 max)',
    'error AlreadyAnchored(bytes32 hash, address anchorer, uint256 timestamp)',
    'error NotAnchored(bytes32 hash)',
    'error AlreadyAcknowledged(bytes32 hash, address party)'
  ];

  function cfg() { return root.SEWA_CONFIG || {}; }
  function E() {
    if (!root.ethers) throw new Error('ethers.js failed to load (check your internet connection).');
    return root.ethers;
  }
  function hasContract() {
    var a = cfg().CONTRACT_ADDRESS;
    return !!(a && /^0x[0-9a-fA-F]{40}$/.test(a));
  }
  function hasWallet() { return typeof root.ethereum !== 'undefined'; }
  function explorerTx(h) { return cfg().EXPLORER + '/tx/' + h; }
  function explorerAddr(a) { return cfg().EXPLORER + '/address/' + a; }

  /** Deep link that opens this page inside the MetaMask mobile in-app browser. */
  function metamaskDeepLink() {
    var loc = root.location;
    return 'https://metamask.app.link/dapp/' + loc.host + loc.pathname + loc.search;
  }

  var _readProvider = null;
  async function readProvider() {
    if (_readProvider) return _readProvider;
    var ethers = E();
    var urls = cfg().RPC_URLS || [];
    for (var i = 0; i < urls.length; i++) {
      try {
        var p = new ethers.JsonRpcProvider(urls[i], cfg().CHAIN_ID, { staticNetwork: true });
        await p.getBlockNumber();
        _readProvider = p;
        return p;
      } catch (e) { /* try next */ }
    }
    if (hasWallet()) {
      var bp = new ethers.BrowserProvider(root.ethereum);
      var net = await bp.getNetwork();
      if (Number(net.chainId) === cfg().CHAIN_ID) { _readProvider = bp; return bp; }
    }
    throw new Error('Could not reach a Sepolia RPC endpoint.');
  }

  async function ensureSepolia() {
    var hexId = '0x' + cfg().CHAIN_ID.toString(16);
    try {
      await root.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
    } catch (err) {
      if (err && (err.code === 4902 || (err.data && err.data.originalError && err.data.originalError.code === 4902))) {
        await root.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hexId, chainName: 'Sepolia',
            nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: cfg().RPC_URLS, blockExplorerUrls: [cfg().EXPLORER]
          }]
        });
      } else { throw err; }
    }
  }

  async function connect() {
    if (!hasWallet()) {
      var e = new Error('No wallet found. Open this page inside the MetaMask app browser.');
      e.code = 'NO_WALLET';
      throw e;
    }
    var ethers = E();
    await root.ethereum.request({ method: 'eth_requestAccounts' });
    await ensureSepolia();
    var provider = new ethers.BrowserProvider(root.ethereum);
    var signer = await provider.getSigner();
    return { provider: provider, signer: signer, address: await signer.getAddress() };
  }

  function txDataFor(hash) {
    var ethers = E();
    var prefix = ethers.hexlify(ethers.toUtf8Bytes(cfg().TX_DATA_PREFIX));
    return ethers.concat([prefix, hash]);
  }

  function labelBytes(label) { return new TextEncoder().encode(label || '').length; }

  /** Anchor the fingerprint. Returns { mode, txHash, blockNumber, timestamp, from }. */
  async function anchor(hash, label, onStatus) {
    var ethers = E();
    onStatus = onStatus || function () {};
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Invalid fingerprint.');
    if (labelBytes(label) > 64) throw new Error('Label too long (max 64 bytes).');
    onStatus('Connecting wallet…');
    var w = await connect();
    var tx;
    if (hasContract()) {
      var c = new ethers.Contract(cfg().CONTRACT_ADDRESS, ABI, w.signer);
      onStatus('Checking registry…');
      var existing = await c.verify(hash);
      if (existing[0]) {
        return { mode: 'registry', already: true, from: existing[1], timestamp: Number(existing[2]), blockNumber: Number(existing[3]), label: existing[4] };
      }
      onStatus('Confirm the transaction in your wallet…');
      tx = await c.anchor(hash, label || '');
    } else {
      onStatus('Confirm the 0-ETH self-transaction in your wallet…');
      tx = await w.signer.sendTransaction({ to: w.address, value: 0n, data: txDataFor(hash) });
    }
    onStatus('Waiting for confirmation… (Sepolia ≈ 12 s)');
    var rcpt = await tx.wait();
    var block = await w.provider.getBlock(rcpt.blockNumber);
    return {
      mode: hasContract() ? 'registry' : 'self-tx',
      txHash: tx.hash, blockNumber: rcpt.blockNumber, timestamp: block ? block.timestamp : null, from: w.address
    };
  }

  /** Counter-party confirms the same version (registry mode only). */
  async function acknowledge(hash, onStatus) {
    var ethers = E();
    if (!hasContract()) throw new Error('Acknowledgement needs the registry contract (not yet deployed).');
    onStatus = onStatus || function () {};
    var w = await connect();
    var c = new ethers.Contract(cfg().CONTRACT_ADDRESS, ABI, w.signer);
    onStatus('Confirm the acknowledgement in your wallet…');
    var tx = await c.acknowledge(hash);
    onStatus('Waiting for confirmation…');
    var rcpt = await tx.wait();
    return { txHash: tx.hash, blockNumber: rcpt.blockNumber, from: w.address };
  }

  /** Read-only lookup in the registry contract. */
  async function verifyRegistry(hash) {
    var ethers = E();
    if (!hasContract()) throw new Error('Registry contract not yet deployed.');
    var p = await readProvider();
    var c = new ethers.Contract(cfg().CONTRACT_ADDRESS, ABI, p);
    var r = await c.verify(hash);
    var count = r[0] ? Number(await c.acknowledgementCount(hash)) : 0;
    return { exists: r[0], anchorer: r[1], timestamp: Number(r[2]), blockNumber: Number(r[3]), label: r[4], acknowledgements: count };
  }

  /** Verify a fingerprint against a transaction (works for both modes). */
  async function verifyTx(txHash, expectedHash) {
    var ethers = E();
    if (!/^0x[0-9a-f]{64}$/i.test(txHash)) throw new Error('That does not look like a transaction hash (0x + 64 hex characters).');
    var p = await readProvider();
    var tx = await p.getTransaction(txHash);
    if (!tx) return { found: false };
    var rcpt = await p.getTransactionReceipt(txHash);
    var block = rcpt ? await p.getBlock(rcpt.blockNumber) : null;
    var data = (tx.data || '0x').toLowerCase();
    var want = expectedHash.toLowerCase().replace(/^0x/, '');
    var anchoredHash = null, mode = null, label = null;

    // Mode B: self-tx with prefix
    var prefixHex = ethers.hexlify(ethers.toUtf8Bytes(cfg().TX_DATA_PREFIX)).slice(2).toLowerCase();
    if (data.indexOf('0x' + prefixHex) === 0 && data.length >= 2 + prefixHex.length + 64) {
      anchoredHash = '0x' + data.slice(2 + prefixHex.length, 2 + prefixHex.length + 64);
      mode = 'self-tx';
    } else {
      // Mode A: registry anchor() call
      try {
        var iface = new ethers.Interface(ABI);
        var parsed = iface.parseTransaction({ data: tx.data });
        if (parsed && (parsed.name === 'anchor' || parsed.name === 'acknowledge')) {
          anchoredHash = parsed.args[0];
          label = parsed.name === 'anchor' ? parsed.args[1] : null;
          mode = 'registry:' + parsed.name;
        }
      } catch (e) { /* not ours */ }
    }
    return {
      found: true,
      success: rcpt ? rcpt.status === 1 : null,
      from: tx.from, to: tx.to, mode: mode, label: label,
      anchoredHash: anchoredHash,
      matches: !!anchoredHash && anchoredHash.toLowerCase().replace(/^0x/, '') === want,
      blockNumber: rcpt ? rcpt.blockNumber : null,
      timestamp: block ? block.timestamp : null
    };
  }

  root.SewaChain = {
    ABI: ABI,
    hasContract: hasContract,
    hasWallet: hasWallet,
    metamaskDeepLink: metamaskDeepLink,
    explorerTx: explorerTx,
    explorerAddr: explorerAddr,
    connect: connect,
    anchor: anchor,
    acknowledge: acknowledge,
    verifyRegistry: verifyRegistry,
    verifyTx: verifyTx,
    labelBytes: labelBytes
  };
})(typeof self !== 'undefined' ? self : this);
