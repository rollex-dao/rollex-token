import {task} from 'hardhat/config';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

import {eEthereumNetwork} from '../../helpers/types-common';
import {eContractid} from '../../helpers/types';
import {checkVerification} from '../../helpers/etherscan-verification';
import {getRexAdminPerNetwork, getPsysTokenPerNetwork} from '../../helpers/constants';

task('main-deployment', 'Deployment in mainnet network')
  .addFlag(
    'verify',
    'Verify RexToken, PsysToRexMigrator, and InitializableAdminUpgradeabilityProxy contract.'
  )
  .setAction(async ({verify}, localBRE) => {
    const DRE: HardhatRuntimeEnvironment = await localBRE.run('set-dre');
    const network = DRE.network.name as eEthereumNetwork;
    const rexAdmin = getRexAdminPerNetwork(network);
    const psysTokenAddress = getPsysTokenPerNetwork(network);

    if (!rexAdmin) {
      throw Error(
        'The --admin parameter must be set for mainnet network. Set an Ethereum address as --admin parameter input.'
      );
    }

    // If Etherscan verification is enabled, check needed enviroments to prevent loss of gas in failed deployments.
    if (verify) {
      checkVerification();
    }

    console.log('REX ADMIN', rexAdmin);
    await DRE.run(`deploy-${eContractid.RexToken}`, {verify});

    await DRE.run(`deploy-${eContractid.PsysToRexMigrator}`, {
      psysTokenAddress,
      verify,
    });

    // The task will only initialize the proxy contract, not implementation
    await DRE.run(`initialize-${eContractid.RexToken}`, {
      admin: rexAdmin,
      onlyProxy: true,
    });

    // The task will only initialize the proxy contract, not implementation
    await DRE.run(`initialize-${eContractid.PsysToRexMigrator}`, {
      admin: rexAdmin,
      onlyProxy: true,
    });

    console.log('\n✔️ Finished the deployment of the Rex Token Mainnet Enviroment. ✔️');
  });
