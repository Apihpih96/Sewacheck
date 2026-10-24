// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgreementRegistry} from "../src/AgreementRegistry.sol";

/// @notice Deploy AgreementRegistry to Sepolia.
/// No private key lives in this repo. Use a Foundry keystore account, e.g.:
///   cast wallet import deployer --interactive
///   forge script script/Deploy.s.sol --rpc-url sepolia --account deployer --broadcast
/// Then paste the printed address into js/config.js (CONTRACT_ADDRESS).
contract Deploy is Script {
    function run() external returns (AgreementRegistry reg) {
        vm.startBroadcast();
        reg = new AgreementRegistry();
        vm.stopBroadcast();
        console2.log("AgreementRegistry deployed at:", address(reg));
    }
}
