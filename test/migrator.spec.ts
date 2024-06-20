import rawBRE from 'hardhat';
import {expect} from 'chai';
import {TestEnv, makeSuite} from './helpers/make-suite';
import {ProtocolErrors, eContractid} from '../helpers/types';
import {getContract} from '../helpers/contracts-helpers';
import BigNumber from 'bignumber.js';

makeSuite('PSYS migrator', (testEnv: TestEnv) => {
  const {} = ProtocolErrors;

  it('Check the constructor is executed properly', async () => {
    const {psysToRexMigrator, rexToken, psysToken} = testEnv;

    expect(await psysToRexMigrator.REX()).to.be.equal(rexToken.address, 'Invalid REX Address');

    expect(await psysToRexMigrator.PSYS()).to.be.equal(psysToken.address, 'Invalid PSYS address');

    expect(await psysToRexMigrator.LEND_REX_RATIO()).to.be.equal('1000', 'Invalid ratio');
  });

  it("Check migration isn't started", async () => {
    const {psysToRexMigrator, psysToRexMigratorImpl} = testEnv;

    const migrationStarted = await psysToRexMigrator.migrationStarted();

    expect(migrationStarted.toString()).to.be.eq('false');
    await expect(psysToRexMigrator.migrateFromLEND('1000')).to.be.revertedWith(
      'MIGRATION_NOT_STARTED'
    );
  });

  it('Starts the migration', async () => {
    const {psysToRexMigrator, psysToRexMigratorImpl} = testEnv;

    const psysToRexMigratorInitializeEncoded = psysToRexMigratorImpl.interface.encodeFunctionData(
      'initialize'
    );

    const migratorAsProxy = await getContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      psysToRexMigrator.address
    );

    await migratorAsProxy
      .connect(testEnv.users[0].signer)
      .upgradeToAndCall(psysToRexMigratorImpl.address, psysToRexMigratorInitializeEncoded);

    const migrationStarted = await psysToRexMigrator.migrationStarted();

    expect(migrationStarted.toString()).to.be.eq('true');
  });

  it('Migrates 1000 PSYS', async () => {
    const {psysToRexMigrator, psysToken, rexToken} = testEnv;
    const user = testEnv.users[2];

    const psysBalance = new BigNumber(1000).times(new BigNumber(10).pow(18)).toFixed(0);
    const expectedRexBalanceAfterMigration = new BigNumber(10).pow(18);

    await psysToken.connect(user.signer).mint(psysBalance);

    await psysToken.connect(user.signer).approve(psysToRexMigrator.address, psysBalance);

    await psysToRexMigrator.connect(user.signer).migrateFromLEND(psysBalance);

    const psysBalanceAfterMigration = await psysToken.balanceOf(user.address);
    const rexBalanceAfterMigration = await rexToken.balanceOf(user.address);

    expect(psysBalanceAfterMigration.toString()).to.be.eq('0');
    expect(rexBalanceAfterMigration.toString()).to.be.eq(
      expectedRexBalanceAfterMigration.toFixed(0)
    );
  });
});
