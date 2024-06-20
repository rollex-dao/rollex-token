import chai, {expect} from 'chai';
import {fail} from 'assert';
import {solidity} from 'ethereum-waffle';
import {TestEnv, makeSuite} from './helpers/make-suite';
import {ProtocolErrors, eContractid} from '../helpers/types';
import {DRE, advanceBlock, timeLatest, waitForTx} from '../helpers/misc-utils';
import {
  buildDelegateParams,
  buildDelegateByTypeParams,
  deployRexTokenV2,
  deployDoubleTransferHelper,
  getContract,
  getCurrentBlock,
  getSignatureFromTypedData,
} from '../helpers/contracts-helpers';
import {RexTokenV2} from '../types/RexTokenV2';
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from '../helpers/constants';
import {parseEther} from 'ethers/lib/utils';

chai.use(solidity);

makeSuite('Delegation', (testEnv: TestEnv) => {
  const {} = ProtocolErrors;
  let rexInstance = {} as RexTokenV2;
  let firstActionBlockNumber = 0;
  let secondActionBlockNumber = 0;

  it('Updates the implementation of the REX token to V2', async () => {
    const {rexToken, users} = testEnv;

    //getting the proxy contract from the rex token address
    const rexTokenProxy = await getContract(
      eContractid.InitializableAdminUpgradeabilityProxy,
      rexToken.address
    );

    const REXv2 = await deployRexTokenV2();

    const encodedIntialize = REXv2.interface.encodeFunctionData('initialize');

    await rexTokenProxy
      .connect(users[0].signer)
      .upgradeToAndCall(REXv2.address, encodedIntialize);

    rexInstance = await getContract(eContractid.RexTokenV2, rexTokenProxy.address);
  });

  // Blocked by https://github.com/nomiclabs/hardhat/issues/1081
  xit('ZERO_ADDRESS tries to delegate voting power to user1 but delegatee should still be ZERO_ADDRESS', async () => {
    const {
      users: [, user1],
    } = testEnv;
    await DRE.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x0000000000000000000000000000000000000000'],
    });
    const zeroUser = await DRE.ethers.provider.getSigner(
      '0x0000000000000000000000000000000000000000'
    );
    await user1.signer.sendTransaction({to: ZERO_ADDRESS, value: parseEther('1')});

    await rexInstance.connect(zeroUser).delegateByType(user1.address, '0');

    const delegatee = await rexInstance.getDelegateeByType(ZERO_ADDRESS, '0');

    expect(delegatee.toString()).to.be.equal(ZERO_ADDRESS);
  });

  it('User 1 tries to delegate voting power to user 2', async () => {
    const {users} = testEnv;

    await rexInstance.connect(users[1].signer).delegateByType(users[2].address, '0');

    const delegatee = await rexInstance.getDelegateeByType(users[1].address, '0');

    expect(delegatee.toString()).to.be.equal(users[2].address);
  });

  it('User 1 tries to delegate proposition power to user 3', async () => {
    const {users} = testEnv;

    await rexInstance.connect(users[1].signer).delegateByType(users[3].address, '1');

    const delegatee = await rexInstance.getDelegateeByType(users[1].address, '1');

    expect(delegatee.toString()).to.be.equal(users[3].address);
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
  });

  it('User1 tries to delegate voting power to ZERO_ADDRESS', async () => {
    const {
      users: [, , , , , user],
      psysToken,
      psysToRexMigrator,
    } = testEnv;
    const psysBalance = parseEther('1000');
    const rexBalance = parseEther('1');

    // Mint PSYS and migrate
    await psysToken.connect(user.signer).mint(psysBalance);
    await psysToken.connect(user.signer).approve(psysToRexMigrator.address, psysBalance);
    await psysToRexMigrator.connect(user.signer).migrateFromLEND(psysBalance);

    // Track current power
    const priorPowerUser = await rexInstance.getPowerCurrent(user.address, '0');
    const priorPowerUserZeroAddress = await rexInstance.getPowerCurrent(ZERO_ADDRESS, '0');

    await expect(
      rexInstance.connect(user.signer).delegateByType(ZERO_ADDRESS, '0')
    ).to.be.revertedWith('INVALID_DELEGATEE');
  });

  it('User 1 migrates 1000 PSYS; checks voting and proposition power of user 2 and 3', async () => {
    const {psysToRexMigrator, psysToken, users} = testEnv;
    const user1 = users[1];
    const user2 = users[2];
    const user3 = users[3];

    const psysBalance = parseEther('1000');
    const expectedRexBalanceAfterMigration = parseEther('1');

    await psysToken.connect(user1.signer).mint(psysBalance);

    await psysToken.connect(user1.signer).approve(psysToRexMigrator.address, psysBalance);

    await psysToRexMigrator.connect(user1.signer).migrateFromLEND(psysBalance);

    const psysBalanceAfterMigration = await psysToken.balanceOf(user1.address);
    const rexBalanceAfterMigration = await rexInstance.balanceOf(user1.address);

    firstActionBlockNumber = await getCurrentBlock();

    const user1PropPower = await rexInstance.getPowerCurrent(user1.address, '0');
    const user1VotingPower = await rexInstance.getPowerCurrent(user1.address, '1');

    const user2VotingPower = await rexInstance.getPowerCurrent(user2.address, '0');
    const user2PropPower = await rexInstance.getPowerCurrent(user2.address, '1');

    const user3VotingPower = await rexInstance.getPowerCurrent(user3.address, '0');
    const user3PropPower = await rexInstance.getPowerCurrent(user3.address, '1');

    expect(user1PropPower.toString()).to.be.equal('0', 'Invalid prop power for user 1');
    expect(user1VotingPower.toString()).to.be.equal('0', 'Invalid voting power for user 1');

    expect(user2PropPower.toString()).to.be.equal('0', 'Invalid prop power for user 2');
    expect(user2VotingPower.toString()).to.be.equal(
      expectedRexBalanceAfterMigration.toString(),
      'Invalid voting power for user 2'
    );

    expect(user3PropPower.toString()).to.be.equal(
      expectedRexBalanceAfterMigration.toString(),
      'Invalid prop power for user 3'
    );
    expect(user3VotingPower.toString()).to.be.equal('0', 'Invalid voting power for user 3');

    expect(psysBalanceAfterMigration.toString()).to.be.equal('0');
    expect(rexBalanceAfterMigration.toString()).to.be.equal(expectedRexBalanceAfterMigration);
  });

  it('User 2 migrates 1000 PSYS; checks voting and proposition power of user 2', async () => {
    const {psysToRexMigrator, psysToken, users} = testEnv;
    const user2 = users[2];

    const psysBalance = parseEther('1000');
    const expectedRexBalanceAfterMigration = parseEther('1');

    await psysToken.connect(user2.signer).mint(psysBalance);

    await psysToken.connect(user2.signer).approve(psysToRexMigrator.address, psysBalance);

    await psysToRexMigrator.connect(user2.signer).migrateFromLEND(psysBalance);

    const user2VotingPower = await rexInstance.getPowerCurrent(user2.address, '0');
    const user2PropPower = await rexInstance.getPowerCurrent(user2.address, '1');

    expect(user2PropPower.toString()).to.be.equal(
      expectedRexBalanceAfterMigration.toString(),
      'Invalid prop power for user 3'
    );
    expect(user2VotingPower.toString()).to.be.equal(
      expectedRexBalanceAfterMigration.mul('2').toString(),
      'Invalid voting power for user 3'
    );
  });

  it('User 3 migrates 1000 PSYS; checks voting and proposition power of user 3', async () => {
    const {psysToRexMigrator, psysToken, users} = testEnv;
    const user3 = users[3];

    const psysBalance = parseEther('1000');
    const expectedRexBalanceAfterMigration = parseEther('1');

    await psysToken.connect(user3.signer).mint(psysBalance);

    await psysToken.connect(user3.signer).approve(psysToRexMigrator.address, psysBalance);

    await psysToRexMigrator.connect(user3.signer).migrateFromLEND(psysBalance);

    const user3VotingPower = await rexInstance.getPowerCurrent(user3.address, '0');
    const user3PropPower = await rexInstance.getPowerCurrent(user3.address, '1');

    expect(user3PropPower.toString()).to.be.equal(
      expectedRexBalanceAfterMigration.mul('2').toString(),
      'Invalid prop power for user 3'
    );
    expect(user3VotingPower.toString()).to.be.equal(
      expectedRexBalanceAfterMigration.toString(),
      'Invalid voting power for user 3'
    );
  });

  it('User 2 delegates voting and prop power to user 3', async () => {
    const {users} = testEnv;
    const user2 = users[2];
    const user3 = users[3];

    const expectedDelegatedVotingPower = parseEther('2');
    const expectedDelegatedPropPower = parseEther('3');

    await rexInstance.connect(user2.signer).delegate(user3.address);

    const user3VotingPower = await rexInstance.getPowerCurrent(user3.address, '0');
    const user3PropPower = await rexInstance.getPowerCurrent(user3.address, '1');

    expect(user3VotingPower.toString()).to.be.equal(
      expectedDelegatedVotingPower.toString(),
      'Invalid voting power for user 3'
    );
    expect(user3PropPower.toString()).to.be.equal(
      expectedDelegatedPropPower.toString(),
      'Invalid prop power for user 3'
    );
  });

  it('User 1 removes voting and prop power to user 2 and 3', async () => {
    const {users} = testEnv;
    const user1 = users[1];
    const user2 = users[2];
    const user3 = users[3];

    await rexInstance.connect(user1.signer).delegate(user1.address);

    const user2VotingPower = await rexInstance.getPowerCurrent(user2.address, '0');
    const user2PropPower = await rexInstance.getPowerCurrent(user2.address, '1');

    const user3VotingPower = await rexInstance.getPowerCurrent(user3.address, '0');
    const user3PropPower = await rexInstance.getPowerCurrent(user3.address, '1');

    const expectedUser2DelegatedVotingPower = '0';
    const expectedUser2DelegatedPropPower = '0';

    const expectedUser3DelegatedVotingPower = parseEther('2');
    const expectedUser3DelegatedPropPower = parseEther('2');

    expect(user2VotingPower.toString()).to.be.equal(
      expectedUser2DelegatedVotingPower.toString(),
      'Invalid voting power for user 3'
    );
    expect(user2PropPower.toString()).to.be.equal(
      expectedUser2DelegatedPropPower.toString(),
      'Invalid prop power for user 3'
    );

    expect(user3VotingPower.toString()).to.be.equal(
      expectedUser3DelegatedVotingPower.toString(),
      'Invalid voting power for user 3'
    );
    expect(user3PropPower.toString()).to.be.equal(
      expectedUser3DelegatedPropPower.toString(),
      'Invalid prop power for user 3'
    );
  });

  it('Checks the delegation at the block of the first action', async () => {
    const {users} = testEnv;

    const user1 = users[1];
    const user2 = users[2];
    const user3 = users[3];

    const user1VotingPower = await rexInstance.getPowerAtBlock(
      user1.address,
      firstActionBlockNumber,
      '0'
    );
    const user1PropPower = await rexInstance.getPowerAtBlock(
      user1.address,
      firstActionBlockNumber,
      '1'
    );

    const user2VotingPower = await rexInstance.getPowerAtBlock(
      user2.address,
      firstActionBlockNumber,
      '0'
    );
    const user2PropPower = await rexInstance.getPowerAtBlock(
      user2.address,
      firstActionBlockNumber,
      '1'
    );

    const user3VotingPower = await rexInstance.getPowerAtBlock(
      user3.address,
      firstActionBlockNumber,
      '0'
    );
    const user3PropPower = await rexInstance.getPowerAtBlock(
      user3.address,
      firstActionBlockNumber,
      '1'
    );

    const expectedUser1DelegatedVotingPower = '0';
    const expectedUser1DelegatedPropPower = '0';

    const expectedUser2DelegatedVotingPower = parseEther('1');
    const expectedUser2DelegatedPropPower = '0';

    const expectedUser3DelegatedVotingPower = '0';
    const expectedUser3DelegatedPropPower = parseEther('1');

    expect(user1VotingPower.toString()).to.be.equal(
      expectedUser1DelegatedPropPower,
      'Invalid voting power for user 1'
    );
    expect(user1PropPower.toString()).to.be.equal(
      expectedUser1DelegatedVotingPower,
      'Invalid prop power for user 1'
    );

    expect(user2VotingPower.toString()).to.be.equal(
      expectedUser2DelegatedVotingPower,
      'Invalid voting power for user 2'
    );
    expect(user2PropPower.toString()).to.be.equal(
      expectedUser2DelegatedPropPower,
      'Invalid prop power for user 2'
    );

    expect(user3VotingPower.toString()).to.be.equal(
      expectedUser3DelegatedVotingPower,
      'Invalid voting power for user 3'
    );
    expect(user3PropPower.toString()).to.be.equal(
      expectedUser3DelegatedPropPower,
      'Invalid prop power for user 3'
    );
  });

  it('Ensure that getting the power at the current block is the same as using getPowerCurrent', async () => {
    const {users} = testEnv;

    const user1 = users[1];

    const currTime = await timeLatest();

    await advanceBlock(currTime.toNumber() + 1);

    const currentBlock = await getCurrentBlock();

    const votingPowerAtPreviousBlock = await rexInstance.getPowerAtBlock(
      user1.address,
      currentBlock - 1,
      '0'
    );
    const votingPowerCurrent = await rexInstance.getPowerCurrent(user1.address, '0');

    const propPowerAtPreviousBlock = await rexInstance.getPowerAtBlock(
      user1.address,
      currentBlock - 1,
      '1'
    );
    const propPowerCurrent = await rexInstance.getPowerCurrent(user1.address, '1');

    expect(votingPowerAtPreviousBlock.toString()).to.be.equal(
      votingPowerCurrent.toString(),
      'Invalid voting power for user 1'
    );
    expect(propPowerAtPreviousBlock.toString()).to.be.equal(
      propPowerCurrent.toString(),
      'Invalid voting power for user 1'
    );
  });

  it("Checks you can't fetch power at a block in the future", async () => {
    const {users} = testEnv;

    const user1 = users[1];

    const currentBlock = await getCurrentBlock();

    await expect(
      rexInstance.getPowerAtBlock(user1.address, currentBlock + 1, '0')
    ).to.be.revertedWith('INVALID_BLOCK_NUMBER');
    await expect(
      rexInstance.getPowerAtBlock(user1.address, currentBlock + 1, '1')
    ).to.be.revertedWith('INVALID_BLOCK_NUMBER');
  });

  it('User 1 transfers value to himself. Ensures nothing changes in the delegated power', async () => {
    const {users} = testEnv;

    const user1 = users[1];

    const user1VotingPowerBefore = await rexInstance.getPowerCurrent(user1.address, '0');
    const user1PropPowerBefore = await rexInstance.getPowerCurrent(user1.address, '1');

    const balance = await rexInstance.balanceOf(user1.address);

    await rexInstance.connect(user1.signer).transfer(user1.address, balance);

    const user1VotingPowerAfter = await rexInstance.getPowerCurrent(user1.address, '0');
    const user1PropPowerAfter = await rexInstance.getPowerCurrent(user1.address, '1');

    expect(user1VotingPowerBefore.toString()).to.be.equal(
      user1VotingPowerAfter,
      'Invalid voting power for user 1'
    );
    expect(user1PropPowerBefore.toString()).to.be.equal(
      user1PropPowerAfter,
      'Invalid prop power for user 1'
    );
  });
  it('User 1 delegates voting power to User 2 via signature', async () => {
    const {
      users: [, user1, user2],
    } = testEnv;

    // Calculate expected voting power
    const user2VotPower = await rexInstance.getPowerCurrent(user2.address, '1');
    const expectedVotingPower = (await rexInstance.getPowerCurrent(user1.address, '1')).add(
      user2VotPower
    );

    // Check prior delegatee is still user1
    const priorDelegatee = await rexInstance.getDelegateeByType(user1.address, '0');
    expect(priorDelegatee.toString()).to.be.equal(user1.address);

    // Prepare params to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await rexInstance._nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      rexInstance.address,
      user2.address,
      '0',
      nonce,
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[2].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    const tx = await rexInstance
      .connect(user1.signer)
      .delegateByTypeBySig(user2.address, '0', nonce, expiration, v, r, s);

    // Check tx success and DelegateChanged
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegateChanged')
      .withArgs(user1.address, user2.address, 0);

    // Check DelegatedPowerChanged event: users[1] power should drop to zero
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegatedPowerChanged')
      .withArgs(user1.address, 0, 0);

    // Check DelegatedPowerChanged event: users[2] power should increase to expectedVotingPower
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegatedPowerChanged')
      .withArgs(user2.address, expectedVotingPower, 0);

    // Check internal state
    const delegatee = await rexInstance.getDelegateeByType(user1.address, '0');
    expect(delegatee.toString()).to.be.equal(user2.address, 'Delegatee should be user 2');

    const user2VotingPower = await rexInstance.getPowerCurrent(user2.address, '0');
    expect(user2VotingPower).to.be.equal(
      expectedVotingPower,
      'Delegatee should have voting power from user 1'
    );
  });

  it('User 1 delegates proposition to User 3 via signature', async () => {
    const {
      users: [, user1, , user3],
    } = testEnv;

    // Calculate expected proposition power
    const user3PropPower = await rexInstance.getPowerCurrent(user3.address, '1');
    const expectedPropPower = (await rexInstance.getPowerCurrent(user1.address, '1')).add(
      user3PropPower
    );

    // Check prior proposition delegatee is still user1
    const priorDelegatee = await rexInstance.getDelegateeByType(user1.address, '1');
    expect(priorDelegatee.toString()).to.be.equal(
      user1.address,
      'expected proposition delegatee to be user1'
    );

    // Prepare parameters to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await rexInstance._nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      rexInstance.address,
      user3.address,
      '1',
      nonce,
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[2].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    const tx = await rexInstance
      .connect(user1.signer)
      .delegateByTypeBySig(user3.address, '1', nonce, expiration, v, r, s);

    // Check tx success and DelegateChanged
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegateChanged')
      .withArgs(user1.address, user3.address, 1);

    // Check DelegatedPowerChanged event: users[1] power should drop to zero
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegatedPowerChanged')
      .withArgs(user1.address, 0, 1);

    // Check DelegatedPowerChanged event: users[2] power should increase to expectedVotingPower
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegatedPowerChanged')
      .withArgs(user3.address, expectedPropPower, 1);

    // Check internal state matches events
    const delegatee = await rexInstance.getDelegateeByType(user1.address, '1');
    expect(delegatee.toString()).to.be.equal(user3.address, 'Delegatee should be user 3');

    const user3PropositionPower = await rexInstance.getPowerCurrent(user3.address, '1');
    expect(user3PropositionPower).to.be.equal(
      expectedPropPower,
      'Delegatee should have propostion power from user 1'
    );

    // Save current block
    secondActionBlockNumber = await getCurrentBlock();
  });

  it('User 2 delegates all to User 4 via signature', async () => {
    const {
      users: [, user1, user2, , user4],
    } = testEnv;

    await rexInstance.connect(user2.signer).delegate(user2.address);

    // Calculate expected powers
    const user4PropPower = await rexInstance.getPowerCurrent(user4.address, '1');
    const expectedPropPower = (await rexInstance.getPowerCurrent(user2.address, '1')).add(
      user4PropPower
    );

    const user1VotingPower = await rexInstance.balanceOf(user1.address);
    const user4VotPower = await rexInstance.getPowerCurrent(user4.address, '0');
    const user2ExpectedVotPower = user1VotingPower;
    const user4ExpectedVotPower = (await rexInstance.getPowerCurrent(user2.address, '0'))
      .add(user4VotPower)
      .sub(user1VotingPower); // Delegation does not delegate votes others from other delegations

    // Check prior proposition delegatee is still user1
    const priorPropDelegatee = await rexInstance.getDelegateeByType(user2.address, '1');
    expect(priorPropDelegatee.toString()).to.be.equal(
      user2.address,
      'expected proposition delegatee to be user1'
    );

    const priorVotDelegatee = await rexInstance.getDelegateeByType(user2.address, '0');
    expect(priorVotDelegatee.toString()).to.be.equal(
      user2.address,
      'expected proposition delegatee to be user1'
    );

    // Prepare parameters to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await rexInstance._nonces(user2.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      rexInstance.address,
      user4.address,
      nonce,
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[3].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    const tx = await rexInstance
      .connect(user2.signer)
      .delegateBySig(user4.address, nonce, expiration, v, r, s);

    // Check tx success and DelegateChanged for voting
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegateChanged')
      .withArgs(user2.address, user4.address, 1);
    // Check tx success and DelegateChanged for proposition
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegateChanged')
      .withArgs(user2.address, user4.address, 0);

    // Check DelegatedPowerChanged event: users[2] power should drop to zero
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegatedPowerChanged')
      .withArgs(user2.address, 0, 1);

    // Check DelegatedPowerChanged event: users[4] power should increase to expectedVotingPower
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegatedPowerChanged')
      .withArgs(user4.address, expectedPropPower, 1);

    // Check DelegatedPowerChanged event: users[2] power should drop to zero
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegatedPowerChanged')
      .withArgs(user2.address, user2ExpectedVotPower, 0);

    // Check DelegatedPowerChanged event: users[4] power should increase to expectedVotingPower
    await expect(Promise.resolve(tx))
      .to.emit(rexInstance, 'DelegatedPowerChanged')
      .withArgs(user4.address, user4ExpectedVotPower, 0);

    // Check internal state matches events
    const propDelegatee = await rexInstance.getDelegateeByType(user2.address, '1');
    expect(propDelegatee.toString()).to.be.equal(
      user4.address,
      'Proposition delegatee should be user 4'
    );

    const votDelegatee = await rexInstance.getDelegateeByType(user2.address, '0');
    expect(votDelegatee.toString()).to.be.equal(user4.address, 'Voting delegatee should be user 4');

    const user4PropositionPower = await rexInstance.getPowerCurrent(user4.address, '1');
    expect(user4PropositionPower).to.be.equal(
      expectedPropPower,
      'Delegatee should have propostion power from user 2'
    );
    const user4VotingPower = await rexInstance.getPowerCurrent(user4.address, '0');
    expect(user4VotingPower).to.be.equal(
      user4ExpectedVotPower,
      'Delegatee should have votinh power from user 2'
    );

    const user2PropositionPower = await rexInstance.getPowerCurrent(user2.address, '1');
    expect(user2PropositionPower).to.be.equal('0', 'User 2 should have zero prop power');
    const user2VotingPower = await rexInstance.getPowerCurrent(user2.address, '0');
    expect(user2VotingPower).to.be.equal(
      user2ExpectedVotPower,
      'User 2 should still have voting power from user 1 delegation'
    );
  });

  it('User 1 should not be able to delegate with bad signature', async () => {
    const {
      users: [, user1, user2],
    } = testEnv;

    // Prepare params to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await rexInstance._nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      rexInstance.address,
      user2.address,
      '0',
      nonce,
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      rexInstance
        .connect(user1.signer)
        .delegateByTypeBySig(user2.address, '0', nonce, expiration, 0, r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('User 1 should not be able to delegate with bad nonce', async () => {
    const {
      users: [, user1, user2],
    } = testEnv;

    // Prepare params to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      rexInstance.address,
      user2.address,
      '0',
      MAX_UINT_AMOUNT, // bad nonce
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[1].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      rexInstance
        .connect(user1.signer)
        .delegateByTypeBySig(user2.address, '0', MAX_UINT_AMOUNT, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_NONCE');
  });

  it('User 1 should not be able to delegate if signature expired', async () => {
    const {
      users: [, user1, user2],
    } = testEnv;

    // Prepare params to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await rexInstance._nonces(user1.address)).toString();
    const expiration = '0';
    const msgParams = buildDelegateByTypeParams(
      chainId,
      rexInstance.address,
      user2.address,
      '0',
      nonce,
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[2].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      rexInstance
        .connect(user1.signer)
        .delegateByTypeBySig(user2.address, '0', nonce, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');
  });

  it('User 2 should not be able to delegate all with bad signature', async () => {
    const {
      users: [, , user2, , user4],
    } = testEnv;
    // Prepare parameters to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await rexInstance._nonces(user2.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      rexInstance.address,
      user4.address,
      nonce,
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[3].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateBySig
    await expect(
      rexInstance.connect(user2.signer).delegateBySig(user4.address, nonce, expiration, '0', r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('User 2 should not be able to delegate all with bad nonce', async () => {
    const {
      users: [, , user2, , user4],
    } = testEnv;
    // Prepare parameters to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = MAX_UINT_AMOUNT;
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      rexInstance.address,
      user4.address,
      nonce,
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[3].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    await expect(
      rexInstance.connect(user2.signer).delegateBySig(user4.address, nonce, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_NONCE');
  });

  it('User 2 should not be able to delegate all if signature expired', async () => {
    const {
      users: [, , user2, , user4],
    } = testEnv;
    // Prepare parameters to sign message
    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await rexInstance._nonces(user2.address)).toString();
    const expiration = '0';
    const msgParams = buildDelegateParams(
      chainId,
      rexInstance.address,
      user4.address,
      nonce,
      expiration
    );
    const ownerPrivateKey = require('../test-wallets.js').accounts[3].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    await expect(
      rexInstance.connect(user2.signer).delegateBySig(user4.address, nonce, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');
  });

  it('Checks the delegation at the block of the second saved action', async () => {
    const {users} = testEnv;

    const user1 = users[1];
    const user2 = users[2];
    const user3 = users[3];

    const user1VotingPower = await rexInstance.getPowerAtBlock(
      user1.address,
      secondActionBlockNumber,
      '0'
    );
    const user1PropPower = await rexInstance.getPowerAtBlock(
      user1.address,
      secondActionBlockNumber,
      '1'
    );

    const user2VotingPower = await rexInstance.getPowerAtBlock(
      user2.address,
      secondActionBlockNumber,
      '0'
    );
    const user2PropPower = await rexInstance.getPowerAtBlock(
      user2.address,
      secondActionBlockNumber,
      '1'
    );

    const user3VotingPower = await rexInstance.getPowerAtBlock(
      user3.address,
      secondActionBlockNumber,
      '0'
    );
    const user3PropPower = await rexInstance.getPowerAtBlock(
      user3.address,
      secondActionBlockNumber,
      '1'
    );

    const expectedUser1DelegatedVotingPower = '0';
    const expectedUser1DelegatedPropPower = '0';

    const expectedUser2DelegatedVotingPower = parseEther('1');
    const expectedUser2DelegatedPropPower = '0';

    const expectedUser3DelegatedVotingPower = parseEther('2');
    const expectedUser3DelegatedPropPower = parseEther('3');

    expect(user1VotingPower.toString()).to.be.equal(
      expectedUser1DelegatedPropPower,
      'Invalid voting power for user 1'
    );
    expect(user1PropPower.toString()).to.be.equal(
      expectedUser1DelegatedVotingPower,
      'Invalid prop power for user 1'
    );

    expect(user2VotingPower.toString()).to.be.equal(
      expectedUser2DelegatedVotingPower,
      'Invalid voting power for user 2'
    );
    expect(user2PropPower.toString()).to.be.equal(
      expectedUser2DelegatedPropPower,
      'Invalid prop power for user 2'
    );

    expect(user3VotingPower.toString()).to.be.equal(
      expectedUser3DelegatedVotingPower,
      'Invalid voting power for user 3'
    );
    expect(user3PropPower.toString()).to.be.equal(
      expectedUser3DelegatedPropPower,
      'Invalid prop power for user 3'
    );
  });

  it('Correct proposal and voting snapshotting on double action in the same block', async () => {
    const {
      users: [, user1, receiver],
    } = testEnv;

    // Reset delegations
    await rexInstance.connect(user1.signer).delegate(user1.address);
    await rexInstance.connect(receiver.signer).delegate(receiver.address);

    const user1PriorBalance = await rexInstance.balanceOf(user1.address);
    const receiverPriorPower = await rexInstance.getPowerCurrent(receiver.address, '0');
    const user1PriorPower = await rexInstance.getPowerCurrent(user1.address, '0');

    // Deploy double transfer helper
    const doubleTransferHelper = await deployDoubleTransferHelper(rexInstance.address);

    await waitForTx(
      await rexInstance
        .connect(user1.signer)
        .transfer(doubleTransferHelper.address, user1PriorBalance)
    );

    // Do double transfer
    await waitForTx(
      await doubleTransferHelper
        .connect(user1.signer)
        .doubleSend(receiver.address, user1PriorBalance.sub(parseEther('1')), parseEther('1'))
    );

    const receiverCurrentPower = await rexInstance.getPowerCurrent(receiver.address, '0');
    const user1CurrentPower = await rexInstance.getPowerCurrent(user1.address, '0');

    expect(receiverCurrentPower).to.be.equal(
      user1PriorPower.add(receiverPriorPower),
      'Receiver should have added the user1 power after double transfer'
    );
    expect(user1CurrentPower).to.be.equal(
      '0',
      'User1 power should be zero due transfered all the funds'
    );
  });
});
