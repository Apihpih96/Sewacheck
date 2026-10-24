// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgreementRegistry
/// @notice Minimal, permissionless registry that anchors the SHA-256 fingerprint of a
///         document (e.g. a Malaysian residential tenancy agreement) so that anyone can
///         later prove *which exact version* existed at a given time, and who anchored it.
/// @dev    Only the 32-byte hash and a short, optional label are stored. The document
///         itself never touches the chain. Do NOT put personal data (names, IC numbers,
///         addresses) in the label: everything on a public chain is public forever.
contract AgreementRegistry {
    /// @dev Max label length in bytes. Keeps gas low and discourages storing personal data.
    uint256 public constant MAX_LABEL_LENGTH = 64;

    struct Anchor {
        address anchorer; // first address that anchored this hash
        uint64 timestamp; // block timestamp of the first anchor
        uint64 blockNumber; // block number of the first anchor
        string label; // short, non-personal label, e.g. "TA unit B-12-3 v2"
    }

    /// @dev hash => first anchor record
    mapping(bytes32 => Anchor) private _anchors;

    /// @dev hash => party => has acknowledged
    mapping(bytes32 => mapping(address => bool)) private _acknowledged;

    /// @dev hash => number of distinct acknowledging addresses (anchorer included)
    mapping(bytes32 => uint256) private _ackCount;

    /// @notice Emitted once, when a hash is anchored for the first time.
    event Anchored(bytes32 indexed hash, address indexed sender, uint256 timestamp, string label);

    /// @notice Emitted when an address (e.g. the other party to the agreement) confirms
    ///         that it agrees to the exact version identified by `hash`.
    event Acknowledged(bytes32 indexed hash, address indexed party, uint256 timestamp);

    error ZeroHash();
    error LabelTooLong(uint256 length, uint256 max);
    error AlreadyAnchored(bytes32 hash, address anchorer, uint256 timestamp);
    error NotAnchored(bytes32 hash);
    error AlreadyAcknowledged(bytes32 hash, address party);

    /// @notice Anchor a document fingerprint. The first anchor wins and is immutable.
    /// @param hash  SHA-256 of the normalised agreement text (computed off-chain).
    /// @param label Short, non-personal label (max 64 bytes, may be empty).
    function anchor(bytes32 hash, string calldata label) external {
        if (hash == bytes32(0)) revert ZeroHash();
        uint256 len = bytes(label).length;
        if (len > MAX_LABEL_LENGTH) revert LabelTooLong(len, MAX_LABEL_LENGTH);

        Anchor storage a = _anchors[hash];
        if (a.timestamp != 0) revert AlreadyAnchored(hash, a.anchorer, a.timestamp);

        a.anchorer = msg.sender;
        a.timestamp = uint64(block.timestamp);
        a.blockNumber = uint64(block.number);
        a.label = label;

        _acknowledged[hash][msg.sender] = true;
        _ackCount[hash] = 1;

        emit Anchored(hash, msg.sender, block.timestamp, label);
        emit Acknowledged(hash, msg.sender, block.timestamp);
    }

    /// @notice Let a counter-party (tenant / landlord) confirm the same anchored version.
    function acknowledge(bytes32 hash) external {
        if (_anchors[hash].timestamp == 0) revert NotAnchored(hash);
        if (_acknowledged[hash][msg.sender]) revert AlreadyAcknowledged(hash, msg.sender);
        _acknowledged[hash][msg.sender] = true;
        unchecked {
            _ackCount[hash] += 1;
        }
        emit Acknowledged(hash, msg.sender, block.timestamp);
    }

    /// @notice Check whether a fingerprint was anchored, and by whom / when.
    function verify(bytes32 hash)
        external
        view
        returns (bool exists, address anchorer, uint256 timestamp, uint256 blockNumber, string memory label)
    {
        Anchor storage a = _anchors[hash];
        exists = a.timestamp != 0;
        return (exists, a.anchorer, a.timestamp, a.blockNumber, a.label);
    }

    /// @notice Has `party` acknowledged the version identified by `hash`?
    function hasAcknowledged(bytes32 hash, address party) external view returns (bool) {
        return _acknowledged[hash][party];
    }

    /// @notice Number of distinct addresses that acknowledged `hash` (anchorer included).
    function acknowledgementCount(bytes32 hash) external view returns (uint256) {
        return _ackCount[hash];
    }
}
