/*
 * SewaCheck runtime configuration. No secrets live here — ever.
 *
 * After deploying contracts/src/AgreementRegistry.sol to Sepolia
 * (see README → "Deploy the contract"), paste the address below.
 * While CONTRACT_ADDRESS is empty the app still works: it anchors the
 * fingerprint inside a 0-ETH transaction to your own address and lets
 * anyone verify it later by transaction hash.
 */
window.SEWA_CONFIG = {
  CONTRACT_ADDRESS: '', // e.g. '0x1234...abcd' (Sepolia). Empty = contract not yet deployed.
  CHAIN_ID: 11155111, // Ethereum Sepolia testnet
  CHAIN_NAME: 'Sepolia',
  // Public read-only RPCs (used for verification without a wallet). First that answers wins.
  RPC_URLS: [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org'
  ],
  EXPLORER: 'https://sepolia.etherscan.io',
  // Prefix put in front of the hash when anchoring via a plain self-transaction.
  TX_DATA_PREFIX: 'SEWACHECK:v1:'
};
