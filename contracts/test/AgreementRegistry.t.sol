// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgreementRegistry} from "../src/AgreementRegistry.sol";

contract AgreementRegistryTest is Test {
    AgreementRegistry internal reg;

    address internal landlord = address(0xA11CE);
    address internal tenant = address(0xB0B);

    // sha256("hello") as a literal. (A `sha256(...)` constant would be re-evaluated through the
    // precompile on every use, which would consume vm.prank / vm.expectRevert.)
    bytes32 internal constant H = 0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824;

    event Anchored(bytes32 indexed hash, address indexed sender, uint256 timestamp, string label);
    event Acknowledged(bytes32 indexed hash, address indexed party, uint256 timestamp);

    function setUp() public {
        reg = new AgreementRegistry();
        vm.warp(1_790_000_000);
        vm.roll(123);
    }

    function test_LiteralMatchesSha256() public pure {
        assertEq(H, sha256("hello"));
    }

    function test_VerifyUnknownHashReturnsFalse() public view {
        (bool exists, address who, uint256 ts, uint256 bn, string memory label) = reg.verify(H);
        assertFalse(exists);
        assertEq(who, address(0));
        assertEq(ts, 0);
        assertEq(bn, 0);
        assertEq(bytes(label).length, 0);
    }

    function test_AnchorStoresRecordAndEmits() public {
        vm.expectEmit(true, true, false, true, address(reg));
        emit Anchored(H, landlord, 1_790_000_000, "TA unit B-12-3 v2");
        vm.prank(landlord);
        reg.anchor(H, "TA unit B-12-3 v2");

        (bool exists, address who, uint256 ts, uint256 bn, string memory label) = reg.verify(H);
        assertTrue(exists);
        assertEq(who, landlord);
        assertEq(ts, 1_790_000_000);
        assertEq(bn, 123);
        assertEq(label, "TA unit B-12-3 v2");
        assertTrue(reg.hasAcknowledged(H, landlord));
        assertEq(reg.acknowledgementCount(H), 1);
    }

    function test_AnchorWithEmptyLabel() public {
        reg.anchor(H, "");
        (bool exists,,,,) = reg.verify(H);
        assertTrue(exists);
    }

    function test_RevertOnZeroHash() public {
        vm.expectRevert(AgreementRegistry.ZeroHash.selector);
        reg.anchor(bytes32(0), "x");
    }

    function test_RevertOnLongLabel() public {
        string memory long = "0123456789012345678901234567890123456789012345678901234567890123456789"; // 70 bytes
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.LabelTooLong.selector, 70, 64));
        reg.anchor(H, long);
    }

    function test_FirstAnchorWinsAndIsImmutable() public {
        vm.prank(landlord);
        reg.anchor(H, "first");

        vm.warp(1_790_000_999);
        vm.prank(tenant);
        vm.expectRevert(
            abi.encodeWithSelector(AgreementRegistry.AlreadyAnchored.selector, H, landlord, uint256(1_790_000_000))
        );
        reg.anchor(H, "second");

        (, address who, uint256 ts,, string memory label) = reg.verify(H);
        assertEq(who, landlord);
        assertEq(ts, 1_790_000_000);
        assertEq(label, "first");
    }

    function test_CounterpartyAcknowledges() public {
        vm.prank(landlord);
        reg.anchor(H, "v1");

        vm.warp(1_790_000_500);
        vm.expectEmit(true, true, false, true, address(reg));
        emit Acknowledged(H, tenant, 1_790_000_500);
        vm.prank(tenant);
        reg.acknowledge(H);

        assertTrue(reg.hasAcknowledged(H, tenant));
        assertEq(reg.acknowledgementCount(H), 2);
    }

    function test_AcknowledgeRequiresAnchor() public {
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.NotAnchored.selector, H));
        vm.prank(tenant);
        reg.acknowledge(H);
    }

    function test_CannotAcknowledgeTwice() public {
        vm.prank(landlord);
        reg.anchor(H, "v1");
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.AlreadyAcknowledged.selector, H, landlord));
        vm.prank(landlord);
        reg.acknowledge(H);
    }

    function test_DifferentVersionsAreIndependent() public {
        bytes32 h2 = sha256("hello!"); // one character changed => totally different fingerprint
        reg.anchor(H, "v1");
        (bool e2,,,,) = reg.verify(h2);
        assertFalse(e2);
        reg.anchor(h2, "v2");
        (bool e2b,,,,) = reg.verify(h2);
        assertTrue(e2b);
    }

    function testFuzz_AnchorAnyNonZeroHash(bytes32 h, address who) public {
        vm.assume(h != bytes32(0));
        vm.prank(who);
        reg.anchor(h, "fuzz");
        (bool exists, address anchorer,,,) = reg.verify(h);
        assertTrue(exists);
        assertEq(anchorer, who);
    }
}
