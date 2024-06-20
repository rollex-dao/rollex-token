import rawBRE from 'hardhat';

import {
  getEthersSigners,
  deployPsysToRexMigrator,
  deployRexToken,
  deployInitializableAdminUpgradeabilityProxy,
  deployMintableErc20,
  insertContractAddressInDb,
  registerContractInJsonDb,
  deployMockTransferHook,
} from '../helpers/contracts-helpers';

import path from 'path';
import fs from 'fs';

import {Signer} from 'ethers';

import {initializeMakeSuite} from './helpers/make-suite';
import {waitForTx, DRE} from '../helpers/misc-utils';
import {eContractid} from '../helpers/types';

['misc', 'deployments', 'migrations'].forEach((folder) => {
  const tasksPath = path.join(__dirname, '../tasks', folder);
  fs.readdirSync(tasksPath).forEach((task) => require(`${tasksPath}/${task}`));
});

const buildTestEnv = async (deployer: Signer, secondaryWallet: Signer) => {
  console.time('setup');

  const rexAdmin = await secondaryWallet.getAddress();

  const rexTokenImpl = await deployRexToken();

  const rexTokenProxy = await deployInitializableAdminUpgradeabilityProxy();

  const mockPsysToken = await deployMintableErc20(['PSYS token', 'PSYS', 18]);
  await registerContractInJsonDb('PSYS', mockPsysToken);

  const psysToRexMigratorImpl = await deployPsysToRexMigrator([
    rexTokenProxy.address,
    mockPsysToken.address,
    '1000',
  ]);

  const psysToRexMigratorProxy = await deployInitializableAdminUpgradeabilityProxy();

  const mockTransferHook = await deployMockTransferHook();

  const rexTokenEncodedInitialize = rexTokenImpl.interface.encodeFunctionData('initialize', [
    psysToRexMigratorProxy.address,
    rexAdmin,
    mockTransferHook.address,
  ]);

  await waitForTx(
    await rexTokenProxy['initialize(address,address,bytes)'](
      rexTokenImpl.address,
      rexAdmin,
      rexTokenEncodedInitialize
    )
  );

  //we will not run the initialize on the migrator - will be executed by the governance to bootstrap the migration
  await waitForTx(
    await psysToRexMigratorProxy['initialize(address,address,bytes)'](
      psysToRexMigratorImpl.address,
      rexAdmin,
      '0x'
    )
  );

  await insertContractAddressInDb(eContractid.RexToken, rexTokenProxy.address);

  await insertContractAddressInDb(eContractid.PsysToRexMigrator, psysToRexMigratorProxy.address);

  await insertContractAddressInDb(eContractid.MintableErc20, mockPsysToken.address);

  await insertContractAddressInDb(eContractid.MockTransferHook, mockTransferHook.address);

  await insertContractAddressInDb(
    eContractid.PsysToRexMigratorImpl,
    psysToRexMigratorImpl.address
  );

  console.timeEnd('setup');
};

before(async () => {
  await rawBRE.run('set-dre');
  const [deployer, secondaryWallet] = await getEthersSigners();
  console.log('-> Deploying test environment...');
  await buildTestEnv(deployer, secondaryWallet);
  await initializeMakeSuite();
  console.log('\n***************');
  console.log('Setup and snapshot finished');
  console.log('***************\n');
});
