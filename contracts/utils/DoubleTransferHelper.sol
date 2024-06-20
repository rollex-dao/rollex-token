// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

import '../interfaces/IERC20.sol';

contract DoubleTransferHelper {
  IERC20 public immutable REX;

  constructor(IERC20 rex) public {
    REX = rex;
  }

  function doubleSend(address to, uint256 amount1, uint256 amount2) external {
    REX.transfer(to, amount1);
    REX.transfer(to, amount2);
  }
}
