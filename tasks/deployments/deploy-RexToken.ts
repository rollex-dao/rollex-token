import {task} from 'hardhat/config';
import {eContractid} from '../../helpers/types';
import {
  registerContractInJsonDb,
  deployRexToken,
  deployInitializableAdminUpgradeabilityProxy,
} from '../../helpers/contracts-helpers';

const {RexToken, RexTokenImpl} = eContractid;

task(`deploy-${RexToken}`, `Deploys the ${RexToken} contract`)
  .addFlag('verify', 'Proceed with the Etherscan verification')
  .setAction(async ({verify}, localBRE) => {
    await localBRE.run('set-dre');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    console.log(`\n- ${RexToken} deployment`);

    console.log(`\tDeploying ${RexToken} implementation ...`);
    const rexTokenImpl = await deployRexToken(verify);
    await registerContractInJsonDb(RexTokenImpl, rexTokenImpl);

    console.log(`\tDeploying ${RexToken} Transparent Proxy ...`);
    const rexTokenProxy = await deployInitializableAdminUpgradeabilityProxy(verify);
    await registerContractInJsonDb(RexToken, rexTokenProxy);

    console.log(`\tFinished ${RexToken} proxy and implementation deployment`);
  });
