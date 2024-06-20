import {task} from 'hardhat/config';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

import {eEthereumNetwork} from '../../helpers/types-common';
import {eContractid} from '../../helpers/types';
import {checkVerification} from '../../helpers/etherscan-verification';
import {getRexAdminPerNetwork, getPsysTokenPerNetwork} from '../../helpers/constants';

task('deploy-v2', 'Deployment of the Rex token V2')
  .addFlag(
    'verify',
    'Verify RexTokenV2 contract.'
  )
  .setAction(async ({verify}, localBRE) => {
    const DRE: HardhatRuntimeEnvironment = await localBRE.run('set-dre');
    const network = DRE.network.name as eEthereumNetwork;
    const rexAdmin = getRexAdminPerNetwork(network);

    if (!rexAdmin) {
      throw Error(
        'The --admin parameter must be set for mainnet network. Set an Ethereum address as --admin parameter input.'
      );
    }

    // If Etherscan verification is enabled, check needed environments to prevent loss of gas in failed deployments.
    if (verify) {
      checkVerification();
    }

    await DRE.run(`deploy-${eContractid.RexTokenV2}`, {verify});

    console.log('\n✔️ Finished the deployment of the Rex Token V2 Mainnet Environment. ✔️');
  });
