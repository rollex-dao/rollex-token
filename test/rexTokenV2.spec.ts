import {fail} from 'assert';
import {ethers} from 'ethers';
import BigNumber from 'bignumber.js';
import {TestEnv, makeSuite} from './helpers/make-suite';
import {eContractid, ProtocolErrors} from '../helpers/types';
import {eEthereumNetwork} from '../helpers/types-common';
import {waitForTx, DRE} from '../helpers/misc-utils';
import {
  getInitializableAdminUpgradeabilityProxy,
  buildPermitParams,
  getSignatureFromTypedData,
  deployDoubleTransferHelper,
  deployRexTokenV2,
  getContract,
} from '../helpers/contracts-helpers';
import {
  ZERO_ADDRESS,
  MAX_UINT_AMOUNT,
  getRexTokenDomainSeparatorPerNetwork,
} from '../helpers/constants';
import {RexTokenV2} from '../types/RexTokenV2';
import {parseEther} from 'ethers/lib/utils';

const {expect} = require('chai');

makeSuite('REX token V2', (testEnv: TestEnv) => {
  let rexTokenV2: RexTokenV2;

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

    rexTokenV2 = await getContract(eContractid.RexTokenV2, rexTokenProxy.address);
  });

  it('Checks initial configuration', async () => {
    expect(await rexTokenV2.name()).to.be.equal('Rex Token', 'Invalid token name');

    expect(await rexTokenV2.symbol()).to.be.equal('REX', 'Invalid token symbol');

    expect((await rexTokenV2.decimals()).toString()).to.be.equal('18', 'Invalid token decimals');
  });

  it('Checks the domain separator', async () => {
    const network = DRE.network.name;
    const DOMAIN_SEPARATOR_ENCODED = getRexTokenDomainSeparatorPerNetwork(
      network as eEthereumNetwork
    );

    const separator = await rexTokenV2.DOMAIN_SEPARATOR();
    expect(separator).to.be.equal(DOMAIN_SEPARATOR_ENCODED, 'Invalid domain separator');
  });

  it('Checks the revision', async () => {
    const revision = await rexTokenV2.REVISION();

    expect(revision.toString()).to.be.equal('2', 'Invalid revision');
  });

  it('Checks the allocation of the initial REX supply', async () => {
    const expectedMigratorBalance = new BigNumber(13000000).times(new BigNumber(10).pow(18));
    const expectedlDistributorBalance = new BigNumber(3000000).times(new BigNumber(10).pow(18));
    const {psysToRexMigrator} = testEnv;
    const migratorBalance = await rexTokenV2.balanceOf(psysToRexMigrator.address);
    const distributorBalance = await rexTokenV2.balanceOf(testEnv.users[0].address);

    expect(migratorBalance.toString()).to.be.equal(
      expectedMigratorBalance.toFixed(0),
      'Invalid migrator balance'
    );
    expect(distributorBalance.toString()).to.be.equal(
      expectedlDistributorBalance.toFixed(0),
      'Invalid migrator balance'
    );
  });

  it('Starts the migration', async () => {
    const {psysToRexMigrator, psysToRexMigratorImpl, users} = testEnv;

    const psysToRexMigratorInitializeEncoded = psysToRexMigratorImpl.interface.encodeFunctionData(
      'initialize'
    );

    const migratorAsProxy = await getInitializableAdminUpgradeabilityProxy(
      psysToRexMigrator.address
    );

    await migratorAsProxy
      .connect(users[0].signer)
      .upgradeToAndCall(psysToRexMigratorImpl.address, psysToRexMigratorInitializeEncoded);
  });

  it('Reverts submitting a permit with 0 expiration', async () => {
    const {deployer, users} = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const expiration = 0;
    const nonce = (await rexTokenV2._nonces(owner)).toNumber();
    const permitAmount = ethers.utils.parseEther('2').toString();
    const msgParams = buildPermitParams(
      chainId,
      rexTokenV2.address,
      owner,
      spender,
      nonce,
      permitAmount,
      expiration.toFixed()
    );

    const ownerPrivateKey = require('../test-wallets.js').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    expect((await rexTokenV2.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_BEFORE_PERMIT'
    );

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      rexTokenV2.connect(users[1].signer).permit(owner, spender, permitAmount, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');

    expect((await rexTokenV2.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_AFTER_PERMIT'
    );
  });

  it('Submits a permit with maximum expiration length', async () => {
    const {deployer, users} = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const {chainId} = await DRE.ethers.provider.getNetwork();
    const configChainId = DRE.network.config.chainId;
    expect(configChainId).to.be.equal(chainId);
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await rexTokenV2._nonces(owner)).toNumber();
    const permitAmount = ethers.utils.parseEther('2').toString();
    const msgParams = buildPermitParams(
      chainId,
      rexTokenV2.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = require('../test-wallets.js').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    expect((await rexTokenV2.allowance(owner, spender)).toString()).to.be.equal(
      '0',
      'INVALID_ALLOWANCE_BEFORE_PERMIT'
    );

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await waitForTx(
      await rexTokenV2
        .connect(users[1].signer)
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );

    expect((await rexTokenV2._nonces(owner)).toNumber()).to.be.equal(1);
  });

  it('Cancels the previous permit', async () => {
    const {deployer, users} = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await rexTokenV2._nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      rexTokenV2.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = require('../test-wallets.js').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    expect((await rexTokenV2.allowance(owner, spender)).toString()).to.be.equal(
      ethers.utils.parseEther('2'),
      'INVALID_ALLOWANCE_BEFORE_PERMIT'
    );

    await waitForTx(
      await rexTokenV2
        .connect(users[1].signer)
        .permit(owner, spender, permitAmount, deadline, v, r, s)
    );
    expect((await rexTokenV2.allowance(owner, spender)).toString()).to.be.equal(
      permitAmount,
      'INVALID_ALLOWANCE_AFTER_PERMIT'
    );

    expect((await rexTokenV2._nonces(owner)).toNumber()).to.be.equal(2);
  });

  it('Tries to submit a permit with invalid nonce', async () => {
    const {deployer, users} = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const deadline = MAX_UINT_AMOUNT;
    const nonce = 1000;
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      rexTokenV2.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = require('../test-wallets.js').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      rexTokenV2.connect(users[1].signer).permit(owner, spender, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('Tries to submit a permit with invalid expiration (previous to the current block)', async () => {
    const {deployer, users} = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const expiration = '1';
    const nonce = (await rexTokenV2._nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      rexTokenV2.address,
      owner,
      spender,
      nonce,
      expiration,
      permitAmount
    );

    const ownerPrivateKey = require('../test-wallets.js').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      rexTokenV2.connect(users[1].signer).permit(owner, spender, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');
  });

  it('Tries to submit a permit with invalid signature', async () => {
    const {deployer, users} = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await rexTokenV2._nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      rexTokenV2.address,
      owner,
      spender,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = require('../test-wallets.js').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      rexTokenV2
        .connect(users[1].signer)
        .permit(owner, ZERO_ADDRESS, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('Tries to submit a permit with invalid owner', async () => {
    const {deployer, users} = testEnv;
    const owner = deployer.address;
    const spender = users[1].address;

    const {chainId} = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await rexTokenV2._nonces(owner)).toNumber();
    const permitAmount = '0';
    const msgParams = buildPermitParams(
      chainId,
      rexTokenV2.address,
      owner,
      spender,
      nonce,
      expiration,
      permitAmount
    );

    const ownerPrivateKey = require('../test-wallets.js').accounts[0].secretKey;
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      rexTokenV2
        .connect(users[1].signer)
        .permit(ZERO_ADDRESS, spender, expiration, permitAmount, v, r, s)
    ).to.be.revertedWith('INVALID_OWNER');
  });

  it('Checks the total supply', async () => {
    const totalSupply = await rexTokenV2.totalSupplyAt('0'); // Supply remains constant due no more mints
    expect(totalSupply).equal(parseEther('16000000'));
  });
});
