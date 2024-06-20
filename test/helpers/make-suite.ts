import {evmRevert, evmSnapshot, DRE} from '../../helpers/misc-utils';
import {Signer} from 'ethers';
import {
  getEthersSigners,
  getRexToken,
  getPsysToken,
  getPsysToRexMigrator,
  getPsysToRexMigratorImpl,
  getMockTransferHook,
} from '../../helpers/contracts-helpers';
import {tEthereumAddress} from '../../helpers/types';

import chai from 'chai';
// @ts-ignore
import bignumberChai from 'chai-bignumber';
import {RexToken} from '../../types/RexToken';
import {PsysToRexMigrator} from '../../types/PsysToRexMigrator';
import {MintableErc20} from '../../types/MintableErc20';
import {MockTransferHook} from '../../types/MockTransferHook';

chai.use(bignumberChai());

export interface SignerWithAddress {
  signer: Signer;
  address: tEthereumAddress;
}
export interface TestEnv {
  deployer: SignerWithAddress;
  users: SignerWithAddress[];
  rexToken: RexToken;
  psysToken: MintableErc20;
  psysToRexMigrator: PsysToRexMigrator;
  psysToRexMigratorImpl: PsysToRexMigrator;
  mockTransferHook: MockTransferHook;
}

let buidlerevmSnapshotId: string = '0x1';
const setBuidlerevmSnapshotId = (id: string) => {
  if (DRE.network.name === 'hardhat') {
    buidlerevmSnapshotId = id;
  }
};

const testEnv: TestEnv = {
  deployer: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  rexToken: {} as RexToken,
  psysToken: {} as MintableErc20,
  psysToRexMigrator: {} as PsysToRexMigrator,
  psysToRexMigratorImpl: {} as PsysToRexMigrator,
  mockTransferHook: {} as MockTransferHook,
} as TestEnv;

export async function initializeMakeSuite() {
  const [_deployer, ...restSigners] = await getEthersSigners();
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  testEnv.deployer = deployer;
  testEnv.rexToken = await getRexToken();
  testEnv.psysToRexMigrator = await getPsysToRexMigrator();
  testEnv.psysToken = await getPsysToken();
  testEnv.psysToRexMigratorImpl = await getPsysToRexMigratorImpl();
  testEnv.mockTransferHook = await getMockTransferHook();
}

export function makeSuite(name: string, tests: (testEnv: TestEnv) => void) {
  describe(name, () => {
    before(async () => {
      setBuidlerevmSnapshotId(await evmSnapshot());
    });
    tests(testEnv);
    after(async () => {
      await evmRevert(buidlerevmSnapshotId);
    });
  });
}
