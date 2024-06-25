import {task} from 'hardhat/config';
import BigNumber from 'bignumber.js';
import {
  getPsysToRexMigrator,
  getPsysToken,
  getEthersSigners,
} from '../../helpers/contracts-helpers';

task(`Psys-Migration`, `Create migration to test the contracts`).setAction(async (_, localBRE) => {
  console.log(`\n- Psys Migration started`);
  await localBRE.run('set-dre');

  if (!localBRE.network.config.chainId) {
    throw new Error('INVALID_CHAIN_ID');
  }

  const [, , user1, user2] = await getEthersSigners();

  const mockPsys = await getPsysToken();
  const psysToRexMigrator = await getPsysToRexMigrator();

  const psysAmount = 1000;
  const psysTokenAmount = new BigNumber(psysAmount).times(new BigNumber(10).pow(18)).toFixed(0);
  const halfPsysTokenAmount = new BigNumber(psysAmount / 2)
    .times(new BigNumber(10).pow(18))
    .toFixed(0);

  await mockPsys.connect(user1).mint(psysTokenAmount);
  await mockPsys.connect(user2).mint(psysTokenAmount);

  await mockPsys.connect(user1).approve(psysToRexMigrator.address, psysTokenAmount);
  await mockPsys.connect(user2).approve(psysToRexMigrator.address, psysTokenAmount);

  await psysToRexMigrator.connect(user1).migrateFromPSYS(halfPsysTokenAmount);
  await psysToRexMigrator.connect(user1).migrateFromPSYS(halfPsysTokenAmount);
  await psysToRexMigrator.connect(user2).migrateFromPSYS(psysTokenAmount);

  console.log(`\n- Finished migrating psys balances`);
});
