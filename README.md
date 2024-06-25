# Rex Token design

REX is an ERC-20 compatible token. It implements governance-inspired features, and will allow Rex to bootstrap the rewards program for safety and ecosystem growth.
The following document explains the main features of REX, it’s monetary policy, and the redemption process from PSYS.

## Roles

The initial REX token implementation does not have any admin roles configured. The contract will be proxied using the Openzeppelin implementation of the EIP-1967 Transparent Proxy pattern. The proxy has an Admin role, and the Admin of the proxy contract will be set upon deployment to the Rex governance contracts.

## ERC-20

The REX token implements the standard methods of the ERC-20 interface. A balance snapshot feature has been added to keep track of the balances of the users at specific block heights. This will help with the Rex governance integration of REX.
REX also integrates the EIP 2612 `permit` function, that will allow gasless transaction and one tx approval/transfer.

# PsysToRexMigrator

Smart contract for PSYS token holders to execute the migration to the REX token, using part of the initial emission of REX for it.

The contract is covered by a proxy, whose owner will be the REX governance. Once the governance passes the corresponding proposal, the proxy will be connected to the implementation and PSYS holders will be able to call the `migrateFromPsys()` function, which, after PSYS approval, will pull PSYS from the holder wallet and transfer back an equivalent REX amount defined by the `PSYS_REX_RATIO` constant.

One tradeOff of `migrateFromPsys()` is that, as the REX total supply will be lower than PSYS, the `PSYS_REX_RATIO` will be always > 1, causing a loss of precision for amounts of PSYS that are not multiple of `PSYS_REX_RATIO`. E.g. a person sending 1.000000000000000022 PSYS, with a `PSYS_REX_RATIO` == 100, will receive 0.01 REX, losing the value of the last 22 small units of PSYS.
Taking into account the current value of PSYS and the future value of REX, a lack of precision for less than PSYS_REX_RATIO small units represents a value several orders of magnitude smaller than 0.01\$. We evaluated some potential solutions for this, specifically:

1. Rounding half up the amount of REX returned from the migration. This opens up to potential attacks where users might purposely migrate less than PSYS_REX_RATIO to obtain more REX as a result of the round up.
2. Returning back the excess PSYS: this would leave PSYS in circulation forever, which is not the expected end result of the migration.
3. Require the users to migrate only amounts that are multiple of PSYS_REX_RATIO: This presents considerable UX friction.

None of those present a better outcome than the implemented solution.

## The Redemption process

The first step to bootstrap the REX emission is to deploy the REX token contract and the  PsysToRexMigrator contract. This task will be performed by the Rex team. Upon deployment, the ownership of the Proxy of the REX contract and the PsysToRexMigrator will be set to the Rex Governance. To start the PSYS redemption process at that point, the Rex team will create an AIP (Rex Improvement Proposal) and submit a proposal to the Rex governance. The proposal will, once approved, activate the PSYS/REX redemption process and the ecosystem incentives, which will mark the initial emission of REX on the market.
The result of the migration procedure will see the supply of PSYS being progressively locked within the new REX smart contract, while at the same time an equivalent amount of REX is being issued.  
The amount of REX equivalent to the PSYS tokens burned in the initial phase of the REX protocol will remain locked in the PsysToRexMigrator contract.

## Technical implementation

### Changes to the Openzeppelin original contracts

In the context of this implementation, we needed apply the following changes to the OpenZepplin implementation:

- In `/contracts/open-zeppelin/ERC20.sol`, line 44 and 45, `_name` and `_symbol` have been changed from `private` to `internal`
- We extended the original `Initializable` class from the Openzeppelin contracts and created a `VersionedInitializable` contract. The main differences compared to the `Initializable` are:

1. The boolean `initialized` has been replaced with a `uint256 latestInitializedRevision`.
2. The `initializer()` modifier fetch the revision of the implementation using a `getRevision()` function defined in the implementation contract. The `initializer` modifier forces that an implementation
3. with a bigger revision number than the current one is being initialized

The change allows us to call `initialize()` on multiple implementations, that was not possible with the original `Initializable` implementation from OZ.

### \_beforeTokenTransfer hook

We override the \_beforeTokenTransfer function on the OZ base ERC20 implementation in order to include the following features:

1. Snapshotting of balances every time an action involved a transfer happens (mint, burn, transfer or transferFrom). If the account does a transfer to itself, no new snapshot is done.
2. Call to the Rex governance contract forwarding the same input parameters of the `_beforeTokenTransfer` hook. Its an assumption that the Rex governance contract is a trustable party, being its responsibility to control all potential reentrancies if calling back the RexToken. If the account does a transfer to itself, no interaction with the Rex governance contract should happen.

## Development deployment

For development purposes, you can deploy RexToken and PsysToRexMigrator to a local network via the following command:

```
npm run dev:deployment
```

For any other network, you can run the deployment in the following way

```
npm run ropsten:deployment
```

You can also set an optional `$REX_ADMIN` enviroment variable to set an ETH address as the admin of the RexToken and PsysToRexMigrator proxies. If not set, the deployment will set the second account of the `accounts` network configuration at `buidler.config.ts`.

## Mainnet deployment

You can deploy RexToken and PsysToRexMigrator to the mainnet network via the following command:

```
REX_ADMIN=governance_or_ETH_address
PSYS_TOKEN=psys_token_address
npm run main:deployment
```

The `$REX_ADMIN` enviroment variable is required to run, set an ETH address as the admin of the RexToken and PsysToRexMigrator proxies. Check `buidler.config.ts` for more required enviroment variables for Mainnet deployment.

The proxies will be initialized during the deployment with the `$REX_ADMIN` address, but the smart contracts implementations will not be initialized.

## Enviroment Variables

| Variable                | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| \$REX_ADMIN             | ETH Address of the admin of Proxy contracts. Optional for development.              |
| \$PSYS_TOKEN            | ETH Address of the PSYS token. Optional for development.                            |
| \$INFURA_KEY            | Infura key, only required when using a network different than local network.        |
| \$MNEMONIC\_\<NETWORK\> | Mnemonic phrase, only required when using a network different than local network.   |
| \$ETHERESCAN_KEY        | Etherscan key, not currently used, but will be required for contracts verification. |

## Audits v1

The Solidity code in this repository has undergone 2 traditional smart contracts' audits by Consensys Diligence and Certik, and properties' verification process by Certora. The reports are:
- [Consensys Diligence](https://diligence.consensys.net/audits/2020/07/rex-token/)
- [Certik](audits/RexTokenReport_CertiK.pdf)
- [Certora](audits/RexTokenVerification_by_Certora.pdf)

## Audits v2

The new StakedRexV2 implementation has been audited by Peckshield and property checked by Certora.

## Credits

For the proxy-related contracts, we have used the implementation of our friend from [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-sdk/).

## License

The contents of this repository are under the AGPLv3 license.
