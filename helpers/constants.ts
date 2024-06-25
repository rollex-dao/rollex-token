import {tEthereumAddress} from './types';
import {getParamPerNetwork} from './misc-utils';
import {eEthereumNetwork} from './types-common';

export const BUIDLEREVM_CHAINID = 31337;
export const COVERAGE_CHAINID = 1337;

export const ZERO_ADDRESS: tEthereumAddress = '0x0000000000000000000000000000000000000000';
export const ONE_ADDRESS = '0x0000000000000000000000000000000000000001';
export const MAX_UINT_AMOUNT =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';
export const MOCK_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const WAD = Math.pow(10, 18).toString();

export const SUPPORTED_ETHERSCAN_NETWORKS = ['main', 'ropsten', 'kovan'];

export const getRexTokenDomainSeparatorPerNetwork = (
  network: eEthereumNetwork
): tEthereumAddress =>
  getParamPerNetwork<tEthereumAddress>(
    {
      [eEthereumNetwork.coverage]:
        '0x5be1fe66564e5cf4f59957603cfe6ec6c58930672f001126ae98399f444467db',
      [eEthereumNetwork.hardhat]:
        '0x5be1fe66564e5cf4f59957603cfe6ec6c58930672f001126ae98399f444467db',
      [eEthereumNetwork.main]: '',
    },
    network
  );

// RexProtoGovernance address as admin of RexToken and Migrator
export const getRexAdminPerNetwork = (network: eEthereumNetwork): tEthereumAddress =>
  getParamPerNetwork<tEthereumAddress>(
    {
      [eEthereumNetwork.coverage]: ZERO_ADDRESS,
      [eEthereumNetwork.hardhat]: ZERO_ADDRESS,
      [eEthereumNetwork.main]: '0x4a0e707EbFE106599670ce53cE62E9edA98E4729',
    },
    network
  );

export const getPsysTokenPerNetwork = (network: eEthereumNetwork): tEthereumAddress =>
  getParamPerNetwork<tEthereumAddress>(
    {
      [eEthereumNetwork.coverage]: ZERO_ADDRESS,
      [eEthereumNetwork.hardhat]: ZERO_ADDRESS,
      [eEthereumNetwork.main]: '0x48023b16c3e81AA7F6eFFbdEB35Bb83f4f31a8fd',
    },
    network
  );
