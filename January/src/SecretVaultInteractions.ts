import {
  PrivateKey,
  Nullifier,
  Field,
  MerkleMap,
  Mina,
  AccountUpdate,
  PublicKey,
  MerkleTree,
  ProvablePure,
  UInt32,
  Poseidon,
} from 'o1js';
import {
  createSecretVaultMerkleTree,
  MessageEvent,
  NullifierMessage,
  SecretVault,
  SecretVaultMerkleWitness,
  setInitialState,
} from './SecretVault.js';
import { Logger, ILogObj } from 'tslog';

const log = new Logger<ILogObj>({ name: 'SecretVaultInteractions' });

export type CountedMerkleTree = {
  tree: MerkleTree;
  keys: Map<string, number>;
  count: number;
};

type Event = {
  type: string;
  event: {
    data: ProvablePure<any>;
    transactionInfo: {
      transactionHash: string;
      transactionStatus: string;
      transactionMemo: string;
    };
  };
  blockHeight: UInt32;
  blockHash: string;
  parentBlockHash: string;
  globalSlot: UInt32;
  chainStatus: string;
};

export const createMessage = (bits: string) => {
  const createField = (bits: boolean[]): Field => {
    let n = 0n;
    const rbits = bits.slice().reverse();
    for (let i = 0; i < rbits.length; i++) {
      if (rbits[i]) {
        n += 2n ** BigInt(i);
      }
    }
    return new Field(n);
  };
  function stringToBoolArray(str: string): boolean[] {
    return Array.from(str).map((s) => s === '1');
  }
  return createField(stringToBoolArray(bits));
};

export const buildMerkleTrees = async (zkapp: SecretVault) => {
  const events = await zkapp.fetchEvents();

  // todo get from events
  const addressesHashesLeaves: Array<Field> = events
    .filter((e: Event) => e.type === 'store-address')
    .map((e: Event) => e.event.data as unknown as Field);

  const messages = events
    .filter((e: Event) => e.type === 'store-message')
    .map((e: Event) => e.event.data as unknown as MessageEvent);
  const messagesMap = new Map<string,Field>(
    messages.map((m: MessageEvent) => [m.nullifier.toString(), m.message])
  );

  log.info('messagesMap', messagesMap);

  const nullifierKeys: Array<Field> = messages.map(
    (m: MessageEvent) => m.nullifier
  );

  const addressesTree: CountedMerkleTree = {
    tree: createSecretVaultMerkleTree(addressesHashesLeaves),
    keys: new Map(addressesHashesLeaves.map((k, i) => [k.toString(), i])),
    count: addressesHashesLeaves.length,
  };
  const nullifierMap = new MerkleMap();
  nullifierKeys.forEach((k) => nullifierMap.set(k, new Field(1)));

  return { addressesTree, nullifierMap, messagesMap };
};

const InitialAccountFund = 10_000_000;

export const getDeploySecretVaultTx = async (keys: {
  zkappKey: PrivateKey;
  sender: PublicKey;
}) => {
  log.info('Compiling SecretVault');
  await SecretVault.compile();
  const { zkappKey, sender } = keys;
  const zkappAddress = zkappKey.toPublicKey();
  const zkapp = new SecretVault(zkappAddress);
  const tx = await Mina.transaction(sender, () => {
    AccountUpdate.fundNewAccount(sender);
    zkapp.deploy();
    setInitialState(zkapp, sender);
  });
  log.info('Proving the deploy tx');
  await tx.prove();
  return { zkapp, tx };
};

export const setupEnv = async (opts: { proofsEnabled: boolean }) => {
  let Local = Mina.LocalBlockchain({ proofsEnabled: opts.proofsEnabled });
  Mina.setActiveInstance(Local);
  const { privateKey: ownerKey, publicKey: owner } = Local.testAccounts[0];

  // generate a random key for the zkapp
  const zkappKey = PrivateKey.random();
  // --------------------------------

  const { tx: deployZkAppTx, zkapp } = await getDeploySecretVaultTx({
    zkappKey,
    sender: owner,
  });
  log.info('Signing by deployer and sending the deployment tx');
  await deployZkAppTx.sign([ownerKey, zkappKey]).send();

  return {
    zkapp,
    owner,
    ownerKey,
    local: Local,
  };
};

export const prepareTestNullifier = async (privateKey: PrivateKey) => {
  let jsonNullifier = Nullifier.createTestNullifier(
    NullifierMessage,
    privateKey
  );
  return Nullifier.fromJSON(jsonNullifier);
};

export const mkStoreAddressTx = async (args: {
  zkapp: SecretVault;
  adminNullifier: Nullifier;
  sender: PublicKey;
  address: PublicKey;
}) => {
  const { zkapp, adminNullifier, sender, address } = args;

  const { addressesTree } = await buildMerkleTrees(zkapp);
  const newAddressIndex = addressesTree.count;
  const addressWitness = new SecretVaultMerkleWitness(
    addressesTree.tree.getWitness(BigInt(newAddressIndex))
  );

  const tx = await Mina.transaction(sender, () => {
    zkapp.storeAddress(address, addressWitness, adminNullifier);
  });
  log.info('proving store address tx', tx.toPretty());
  await tx.prove();
  return tx;
};

export const mkStoreMessageTx = async (args: {
  zkapp: SecretVault;
  message: Field;
  nullifier: Nullifier;
  address: PublicKey;
  force: boolean;
}) => {
  const { zkapp, message, nullifier, address } = args;

  const { addressesTree, nullifierMap } = await buildMerkleTrees(zkapp);
  const nullifierWitness = nullifierMap.getWitness(nullifier.key());

  const hash = Poseidon.hash(address.toFields());
  let addressIndex = addressesTree.keys.get(hash.toString());
  if (addressIndex === undefined) {
    if (args.force) {
      log.warn('address is not authorized, trying anyway (force)');
      addressIndex = addressesTree.count;
    } else {
      throw new Error('address is not authorized not found');
    }
  }

  const addressWitness = new SecretVaultMerkleWitness(
    addressesTree.tree.getWitness(BigInt(addressIndex))
  );

  const tx = await Mina.transaction(address, () => {
    zkapp.storeMessage(nullifier, nullifierWitness, addressWitness, message);
  });
  log.info('proving store message tx', tx.toPretty());
  await tx.prove();
  return tx;
};

// export const prog1 = async () => {
//   // contract owner account
//   const {zkapp, owner} = await setupEnv({proofsEnabled: true});

//   const root = zkapp.addressesRoot.get();
//   log.info("root", root.toString());

//   // const { privateKey: addressKey, publicKey: address } = Mina.LocalBlockchain().testAccounts[0];
//   // log.info("Storing address: ", address);
//   // const tx = await mkStoreAddressTx({zkapp, owner, address});
//   // await tx.sign([addressKey]).send();

//   // store addresses of local accounts #1 #2 #3
//   // for (let i = 1; i < 4; i++) {
//   //   const { privateKey: addressKey, publicKey: address } = Mina.LocalBlockchain().testAccounts[i];
//   //   log.info("Storing address: ", address);
//   //   const tx = await mkStoreAddressTx({zkapp, owner, address});
//   //   await tx.sign([addressKey]).send();
//   // }
// }
