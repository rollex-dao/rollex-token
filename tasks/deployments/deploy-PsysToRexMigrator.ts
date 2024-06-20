import {task} from 'hardhat/config';
import {eContractid} from '../../helpers/types';
import {
  registerContractInJsonDb,
  deployPsysToRexMigrator,
  deployInitializableAdminUpgradeabilityProxy,
  getRexToken,
  getPsysToken,
  deployMintableErc20,
} from '../../helpers/contracts-helpers';
import {verify} from 'crypto';

const {PsysToRexMigrator, PsysToRexMigratorImpl, MintableErc20} = eContractid;

task(`deploy-${PsysToRexMigrator}`, `Deploys ${PsysToRexMigrator} contract`)
  .addOptionalParam(
    'lendTokenAddress',
    'The address of the LEND token. If not set, a mocked Mintable token will be deployed.'
  )
  .addFlag('verify', 'Proceed with the Etherscan verification')
  .setAction(async ({lendTokenAddress, verify}, localBRE) => {
    await localBRE.run('set-dre');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    console.log(`\n- ${PsysToRexMigrator} deployment`);

    if (!lendTokenAddress) {
      console.log(`\tDeploying ${MintableErc20} to mock LEND token...`);
      const mockedLend = await deployMintableErc20(['LEND token', 'LEND', 18]);
      await mockedLend.deployTransaction.wait();
    }

    const rexTokenProxy = await getRexToken();
    const lendToken = lendTokenAddress || (await getPsysToken()).address;

    console.log(`\tUsing ${lendToken} address for Lend Token input parameter`);

    console.log(`\tDeploying ${PsysToRexMigrator} Implementation...`);

    const constructorParameters: [string, string, string] = [
      rexTokenProxy.address,
      lendToken,
      '100',
    ];
    const PsysToRexMigratorImpl = await deployPsysToRexMigrator(constructorParameters, verify);
    await registerContractInJsonDb(PsysToRexMigratorImpl, PsysToRexMigratorImpl);

    console.log(`\tDeploying ${PsysToRexMigrator} Transparent Proxy...`);

    const PsysToRexMigratorProxy = await deployInitializableAdminUpgradeabilityProxy(verify);
    await registerContractInJsonDb(PsysToRexMigrator, PsysToRexMigratorProxy);

    console.log(`\tFinished ${PsysToRexMigrator} proxy and implementation deployment`);
  });
