import {task} from 'hardhat/config';
import {eContractid} from '../../helpers/types';
import {
  getRexToken,
  getPsysToRexMigrator,
  getRexTokenImpl,
  getContract,
} from '../../helpers/contracts-helpers';
import {waitForTx} from '../../helpers/misc-utils';
import {ZERO_ADDRESS} from '../../helpers/constants';
import {InitializableAdminUpgradeabilityProxy} from '../../types/InitializableAdminUpgradeabilityProxy';

const {RexToken} = eContractid;

task(`initialize-${RexToken}`, `Initialize the ${RexToken} proxy contract`)
  .addParam('admin', `The address to be added as an Admin role in ${RexToken} Transparent Proxy.`)
  .addFlag('onlyProxy', 'Initialize only the proxy contract, not the implementation contract')
  .setAction(async ({admin: rexAdmin, onlyProxy}, localBRE) => {
    await localBRE.run('set-dre');

    if (!rexAdmin) {
      throw new Error(
        `Missing --admin parameter to add the Admin Role to ${RexToken} Transparent Proxy`
      );
    }

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    console.log(`\n- ${RexToken} initialization`);

    const rexTokenImpl = await getRexTokenImpl();
    const rexToken = await getRexToken();
    const psysToRexMigratorProxy = await getPsysToRexMigrator();

    const rexTokenProxy = await getContract<InitializableAdminUpgradeabilityProxy>(
      eContractid.InitializableAdminUpgradeabilityProxy,
      rexToken.address
    );

    if (onlyProxy) {
      console.log(
        `\tWARNING: Not initializing the ${RexToken} implementation, only set REX_ADMIN to Transparent Proxy contract.`
      );
      await waitForTx(await rexTokenProxy.initialize(rexTokenImpl.address, rexAdmin, '0x'));
      console.log(
        `\tFinished ${RexToken} Proxy initialization, but not ${RexToken} implementation.`
      );
      return;
    }

    console.log('\tInitializing Rex Token and Transparent Proxy');
    // If any other testnet, initialize for development purposes
    const rexTokenEncodedInitialize = rexTokenImpl.interface.encodeFunctionData('initialize', [
      psysToRexMigratorProxy.address,
      rexAdmin,
      ZERO_ADDRESS,
    ]);

    await waitForTx(
      await rexTokenProxy.initialize(rexTokenImpl.address, rexAdmin, rexTokenEncodedInitialize)
    );

    console.log('\tFinished Rex Token and Transparent Proxy initialization');
  });
