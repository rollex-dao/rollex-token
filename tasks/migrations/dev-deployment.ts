import {task} from 'hardhat/config';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

import {eContractid} from '../../helpers/types';
import {getEthersSigners} from '../../helpers/contracts-helpers';
import {checkVerification} from '../../helpers/etherscan-verification';

task('dev-deployment', 'Deployment in hardhat')
  .addOptionalParam(
    'admin',
    `The address to be added as an Admin role in Rex Token and PsysToRexMigrator Transparent Proxies.`
  )
  .addOptionalParam('psysTokenAddress', 'The address of the PSYS token smart contract.')
  .addFlag(
    'verify',
    'Verify RexToken, PsysToRexMigrator, and InitializableAdminUpgradeabilityProxy contract.'
  )
  .setAction(async ({admin, psysTokenAddress, verify}, localBRE) => {
    const DRE: HardhatRuntimeEnvironment = await localBRE.run('set-dre');

    // If admin parameter is NOT set, the Rex Admin will be the
    // second account provided via buidler config.
    const [, secondaryWallet] = await getEthersSigners();
    const rexAdmin = admin || (await secondaryWallet.getAddress());

    console.log('REX ADMIN', rexAdmin);

    // If Etherscan verification is enabled, check needed enviroments to prevent loss of gas in failed deployments.
    if (verify) {
      checkVerification();
    }

    await DRE.run(`deploy-${eContractid.RexToken}`, {verify});

    await DRE.run(`deploy-${eContractid.PsysToRexMigrator}`, {
      psysTokenAddress,
      verify,
    });

    await DRE.run(`initialize-${eContractid.RexToken}`, {
      admin: rexAdmin,
    });

    await DRE.run(`initialize-${eContractid.PsysToRexMigrator}`, {
      admin: rexAdmin,
    });

    await DRE.run(`Psys-Migration`, {});

    console.log('\n👷 Finished the deployment of the Rex Token Development Enviroment. 👷');
  });
