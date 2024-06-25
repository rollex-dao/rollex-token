import {task} from 'hardhat/config';
import {eContractid} from '../../helpers/types';
import {
  getPsysToRexMigratorImpl,
  getContract,
  getPsysToRexMigrator,
} from '../../helpers/contracts-helpers';
import {getDb,DRE, waitForTx} from '../../helpers/misc-utils';

const {PsysToRexMigrator} = eContractid;

task(`initialize-${PsysToRexMigrator}`, `Initialize the ${PsysToRexMigrator} proxy contract`)
  .addParam('admin', 'The address to be added as an Admin role in Rex Token Transparent Proxy.')
  .addFlag('onlyProxy', 'Initialize only the proxy contract, not the implementation contract')
  .setAction(async ({admin: rexAdmin, onlyProxy}, localBRE) => {
    await localBRE.run('set-dre');

    if (!rexAdmin) {
      throw new Error(
        `Missing --admin parameter to add the Admin Role to ${PsysToRexMigrator} Transparent Proxy`
      );
    }

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    console.log(`\n- ${PsysToRexMigrator} initialization`);
    
    const psysToRexMigratorImpl = await getPsysToRexMigratorImpl();
    const psysToRexMigrator = await getPsysToRexMigrator();

    const psysToRexMigratorProxy = await getContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      psysToRexMigrator.address
    );

    const psysToRexMigratorInitializeEncoded = psysToRexMigratorImpl.interface.encodeFunctionData(
      'initialize'
    );

    if (onlyProxy) {
      console.log(
        `\tWARNING: Not initializing the ${PsysToRexMigrator} implementation, only set REX_ADMIN to Transparent Proxy contract.`
      );
      await waitForTx(
        await psysToRexMigratorProxy['initialize(address,address,bytes)'](psysToRexMigratorImpl.address, rexAdmin, '0x')
      );
      console.log(
        `\tFinished ${PsysToRexMigrator} Proxy initialization, but not ${PsysToRexMigrator} implementation.`
      );
      return;
    }

    console.log('\tInitializing PsysToRexMigrator Proxy and Implementation ');

    await waitForTx(
      await psysToRexMigratorProxy['initialize(address,address,bytes)'](
        psysToRexMigratorImpl.address,
        rexAdmin,
        psysToRexMigratorInitializeEncoded
      )
    );

    console.log('\tFinished PsysToRexMigrator Proxy and Implementation initialization.');
  });
