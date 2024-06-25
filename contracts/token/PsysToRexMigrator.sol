// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.7.5;

import {IERC20} from '../interfaces/IERC20.sol';
import {SafeMath} from '../open-zeppelin/SafeMath.sol';
import {VersionedInitializable} from '../utils/VersionedInitializable.sol';

/**
 * @title PsysToRexMigrator
 * @notice This contract implements the migration from PSYS to REX token
 * @author Rex
 */
contract PsysToRexMigrator is VersionedInitializable {
  using SafeMath for uint256;

  IERC20 public immutable REX;
  IERC20 public immutable PSYS;
  uint256 public immutable PSYS_REX_RATIO;
  uint256 public constant REVISION = 1;

  uint256 public _totalPsysMigrated;

  /**
   * @dev emitted on migration
   * @param sender the caller of the migration
   * @param amount the amount being migrated
   */
  event PsysMigrated(address indexed sender, uint256 indexed amount);

  /**
   * @param rex the address of the REX token
   * @param psys the address of the PSYS token
   * @param psysRexRatio the exchange rate between PSYS and REX
   */
  constructor(IERC20 rex, IERC20 psys, uint256 psysRexRatio) public {
    REX = rex;
    PSYS = psys;
    PSYS_REX_RATIO = psysRexRatio;
  }

  /**
   * @dev initializes the implementation
   */
  function initialize() public initializer {}

  /**
   * @dev returns true if the migration started
   */
  function migrationStarted() external view returns (bool) {
    return lastInitializedRevision != 0;
  }

  /**
   * @dev executes the migration from PSYS to REX. Users need to give allowance to this contract to transfer PSYS before executing
   * this transaction.
   * @param amount the amount of PSYS to be migrated
   */
  function migrateFromPSYS(uint256 amount) external {
    require(lastInitializedRevision != 0, 'MIGRATION_NOT_STARTED');

    _totalPsysMigrated = _totalPsysMigrated.add(amount);
    PSYS.transferFrom(msg.sender, address(this), amount);
    REX.transfer(msg.sender, amount.div(PSYS_REX_RATIO));
    emit PsysMigrated(msg.sender, amount);
  }

  /**
   * @dev returns the implementation revision
   * @return the implementation revision
   */
  function getRevision() internal pure override returns (uint256) {
    return REVISION;
  }
}
