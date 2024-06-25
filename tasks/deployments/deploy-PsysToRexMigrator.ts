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
    'psysTokenAddress',
    'The address of the PSYS token. If not set, a mocked Mintable token will be deployed.'
  )
  .addFlag('verify', 'Proceed with the Etherscan verification')
  .setAction(async ({psysTokenAddress, verify}, localBRE) => {
    await localBRE.run('set-dre');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    console.log(`\n- ${PsysToRexMigrator} deployment`);

    if (!psysTokenAddress) {
      console.log(`\tDeploying ${MintableErc20} to mock PSYS token...`);
      const mockedPsys = await deployMintableErc20(['PSYS token', 'PSYS', 18]);
      await mockedPsys.deployTransaction.wait();
    }

    const rexTokenProxy = await getRexToken();
    const psysToken = psysTokenAddress || (await getPsysToken()).address;

    console.log(`\tUsing ${psysToken} address for Psys Token input parameter`);

    console.log(`\tDeploying ${PsysToRexMigrator} Implementation...`);

    const constructorParameters: [string, string, string] = [
      rexTokenProxy.address,
      psysToken,
      '100',
    ];
    const PsysToRexMigratorImplementation = await deployPsysToRexMigrator(constructorParameters, verify);
    await registerContractInJsonDb(PsysToRexMigratorImpl, PsysToRexMigratorImplementation);

    console.log(`\tDeploying ${PsysToRexMigrator} Transparent Proxy...`);

    const PsysToRexMigratorProxy = await deployInitializableAdminUpgradeabilityProxy(verify);
    await registerContractInJsonDb(PsysToRexMigrator, PsysToRexMigratorProxy);

    console.log(`\tFinished ${PsysToRexMigrator} proxy and implementation deployment`);
  });
