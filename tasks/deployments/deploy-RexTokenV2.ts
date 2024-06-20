import {task} from 'hardhat/config';
import {eContractid} from '../../helpers/types';
import {
  registerContractInJsonDb,
  deployRexToken,
  deployInitializableAdminUpgradeabilityProxy,
  deployRexTokenV2,
} from '../../helpers/contracts-helpers';

const {RexTokenV2, RexTokenImpl} = eContractid;

task(`deploy-${RexTokenV2}`, `Deploys the ${RexTokenV2} contract`)
  .addFlag('verify', 'Proceed with the Etherscan verification')
  .setAction(async ({verify}, localBRE) => {
    await localBRE.run('set-dre');

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    console.log(`\n- ${RexTokenV2} deployment`);

    console.log(`\tDeploying ${RexTokenV2} implementation ...`);
    const rexTokenImpl = await deployRexTokenV2(verify);
    await registerContractInJsonDb(RexTokenImpl, rexTokenImpl);

    console.log(`\tFinished ${RexTokenV2} proxy and implementation deployment`);
  });
