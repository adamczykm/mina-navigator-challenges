import { Bool, Field, Nullifier, Poseidon, PrivateKey, PublicKey } from 'o1js';
import {
  buildMerkleTrees,
  CountedMerkleTree,
  createMessage,
  mkStoreAddressTx,
  mkStoreMessageTx,
  setupEnv,
} from './SecretVaultInteractions.js';
import {
  SecretVault,
  createSecretVaultMerkleTree,
  NullifierMessage,
} from './SecretVault';
import { Logger, ILogObj } from 'tslog';
import { Transaction, TransactionId } from 'o1js/dist/node/lib/mina.js';

const log = new Logger<ILogObj>({ name: 'SecretVault.test' });

type Account = {
  publicKey: PublicKey;
  signAndSend: (
    tx: Transaction
  ) => Promise<{ tx: Transaction; id: TransactionId }>;
  mkNullifier: (message: Field[]) => Nullifier;
};

const mkSignAndSend = (key: PrivateKey) => {
  const signAndSendTx = async (tx: Transaction) => {
    const txret = tx.sign([key]);
    const id = await txret.send();
    return { tx: txret, id };
  };
  return signAndSendTx;
};

const mkmkNullifier = (privateKey: PrivateKey) => {
  const mkNullifier = (message: Field[]) => {
    let nullifier = Nullifier.fromJSON(
      Nullifier.createTestNullifier(message, privateKey)
    );
    return nullifier;
  };
  return mkNullifier;
};

describe('Testing SecretVault related code', () => {
  describe('Testing SecretVault checkMessage logic', () => {

  let checkMessage: (message: Field) => Bool;

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

  beforeAll(() => {
    const app = new SecretVault(PrivateKey.random().toPublicKey());
    checkMessage = (msg) => app.checkMessage(msg);
  });


  it('should return true if flag 1 is true and all other flags are false', () => {
    const field = createField([true, false, false, false, false, false]);
    expect(checkMessage(field).toBoolean()).toBe(true);
  });

  it('should return false if flag 1 is true and any other flag is also true', () => {
    let fields = [true, false, false, false, false, false];
    for (let i = 1; i < 6; i++) {
      fields[i] = true;
      const field = createField(fields);
      expect(checkMessage(field).toBoolean()).toBe(false);
    }
  });

  it('should return true if flag 2 is true and flag 3 is also true', () => {
    const field = createField([false, true, true, false, false, false]);
    expect(checkMessage(field).toBoolean()).toBe(true);
  });

  it('should return false if flag 2 is true but flag 3 is false', () => {
    const field = createField([false, true, false, false, false, false]);
    expect(checkMessage(field).toBoolean()).toBe(false);
  });

  it('should return true if flag 4 is true and flags 5 and 6 are false', () => {
    const field = createField([false, false, false, true, false, false]);
    expect(checkMessage(field).toBoolean()).toBe(true);
  });

  it('should return false if flag 4 is true but either flag 5 or 6 is true', () => {
    let field = createField([false, false, false, true, true, false]);
    expect(checkMessage(field).toBoolean()).toBe(false);
    field = createField([false, false, false, true, true, true]);
    expect(checkMessage(field).toBoolean()).toBe(false);
    field = createField([false, false, false, true, false, true]);
    expect(checkMessage(field).toBoolean()).toBe(false);
  });

  it('should return true when all flags are false', () => {
    const field = createField([false, false, false, false, false, false]);
    expect(checkMessage(field).toBoolean()).toBe(true);
  });
});

  describe('Testing SecretVault contract interactions & logic', () => {
    const proofsEnabled = true;
    const validMessage = createMessage('100000');
    const invalidMessage = createMessage('100001');
    let Local;
    let zkapp: SecretVault;
    let owner: Account;
    let user1: Account;
    let user2: Account;
    let currentMessagesMap: Map<string, Field>;

    let currentAddressTree: CountedMerkleTree;

    // setup the local chain
    beforeAll(async () => {
      await SecretVault.compile();
      const {
        zkapp: app,
        owner: o,
        ownerKey,
        local,
      } = await setupEnv({ proofsEnabled });
      zkapp = app;
      owner = {
        publicKey: o,
        signAndSend: mkSignAndSend(ownerKey),
        mkNullifier: mkmkNullifier(ownerKey),
      };

      const { privateKey: k1, publicKey: a1 } = local.testAccounts[1];
      const { privateKey: k2, publicKey: a2 } = local.testAccounts[2];

      user1 = {
        publicKey: a1,
        signAndSend: mkSignAndSend(k1),
        mkNullifier: mkmkNullifier(k1),
      };

      user2 = {
        publicKey: a2,
        signAndSend: mkSignAndSend(k2),
        mkNullifier: mkmkNullifier(k2),
      };

      Local = local;
    });

    test('Initial root should be equal to the root of an empty tree', async () => {
      currentAddressTree = {
        tree: createSecretVaultMerkleTree(),
        keys: new Map(),
        count: 0,
      };
      const expected = currentAddressTree.tree.getRoot().toString();
      log.info('Expected root', expected);
      const currentRoot = zkapp.addressesRoot.get();
      const actual = currentRoot.toString();
      log.info('Actual root', actual);
      expect(actual).toEqual(expected);
    });

    test('The admin can store an address and it gets stored', async () => {
      const { addressesTree: t1 } = await buildMerkleTrees(zkapp);
      expect(t1.count).toEqual(0);

      const storeAddressTx = await mkStoreAddressTx({
        zkapp,
        sender: owner.publicKey,
        address: user1.publicKey,
        adminNullifier: owner.mkNullifier([t1.tree.getRoot()]),
      });
      await owner.signAndSend(storeAddressTx);
      const { addressesTree: t2 } = await buildMerkleTrees(zkapp);
      expect(t2.count).toEqual(1);

      expect(zkapp.addressesRoot.get()).toEqual(t2.tree.getRoot());
      currentAddressTree = t2;
    });

    test('A non-owner can not store an address', async () => {
      // preliminary checks
      const root = zkapp.addressesRoot.get();
      expect(root).toEqual(currentAddressTree.tree.getRoot());

      const { addressesTree: t1 } = await buildMerkleTrees(zkapp);
      expect(t1).toEqual(currentAddressTree);

      // non-owner tries to store an address
      const nullifier = user2.mkNullifier([t1.tree.getRoot()]);

      await expect(
        mkStoreAddressTx({
          zkapp,
          sender: user2.publicKey,
          address: user2.publicKey,
          adminNullifier: nullifier,
        })
      ).rejects.toThrow();

      // no address store event emited
      const { addressesTree: t2 } = await buildMerkleTrees(zkapp);
      expect(t2).toEqual(currentAddressTree);

      // the root has not change
      expect(zkapp.addressesRoot.get()).toEqual(
        currentAddressTree.tree.getRoot()
      );
    });

    test('Registered use can not store an invalid message', async () => {
      // preliminary checks
      const root = zkapp.addressesRoot.get();
      expect(root).toEqual(currentAddressTree.tree.getRoot());

      const { addressesTree: t1 } = await buildMerkleTrees(zkapp);
      expect(t1).toEqual(currentAddressTree);

      // assert that user1 is registered
      expect(
        t1.keys.has(Poseidon.hash(user1.publicKey.toFields()).toString())
      ).toBeTruthy();

      await expect(
        mkStoreMessageTx({
          zkapp,
          message: invalidMessage,
          nullifier: user2.mkNullifier(NullifierMessage),
          address: user1.publicKey,
          force: false,
        })
      ).rejects.toThrow();

      // no address store event emited
      const { addressesTree: t2 } = await buildMerkleTrees(zkapp);
      expect(t2).toEqual(currentAddressTree);

      // the root has not change
      expect(zkapp.addressesRoot.get()).toEqual(
        currentAddressTree.tree.getRoot()
      );
    });

    test('Non-registered user can not store an invalid message', async () => {
      // preliminary checks
      const root = zkapp.addressesRoot.get();
      expect(root).toEqual(currentAddressTree.tree.getRoot());

      const { addressesTree: t1 } = await buildMerkleTrees(zkapp);
      expect(t1).toEqual(currentAddressTree);

      // assert that user2 is not registered
      expect(
        t1.keys.has(Poseidon.hash(user2.publicKey.toFields()).toString())
      ).toBeFalsy();

      await expect(
        mkStoreMessageTx({
          zkapp,
          message: invalidMessage,
          nullifier: user2.mkNullifier(NullifierMessage),
          address: user2.publicKey,
          force: false,
        })
      ).rejects.toThrow();

      // no address store event emited
      const { addressesTree: t2 } = await buildMerkleTrees(zkapp);
      expect(t2).toEqual(currentAddressTree);

      // the root has not change
      expect(zkapp.addressesRoot.get()).toEqual(
        currentAddressTree.tree.getRoot()
      );
    });

    test('Non-registered user can not store a valid message', async () => {
      // preliminary checks
      const root = zkapp.addressesRoot.get();
      expect(root).toEqual(currentAddressTree.tree.getRoot());

      const { addressesTree: t1 } = await buildMerkleTrees(zkapp);
      expect(t1).toEqual(currentAddressTree);

      // assert that user2 is registered
      expect(
        t1.keys.has(Poseidon.hash(user2.publicKey.toFields()).toString())
      ).toBeFalsy();

      await expect(
        mkStoreMessageTx({
          zkapp,
          message: validMessage,
          nullifier: user2.mkNullifier(NullifierMessage),
          address: user2.publicKey,
          force: false,
        })
      ).rejects.toThrow();

      // no address store event emited
      const { addressesTree: t2 } = await buildMerkleTrees(zkapp);
      expect(t2).toEqual(currentAddressTree);

      // the root has not change
      expect(zkapp.addressesRoot.get()).toEqual(
        currentAddressTree.tree.getRoot()
      );
    });

    test('Registered user can store a valid message', async () => {
      // preliminary checks
      const root = zkapp.addressesRoot.get();
      expect(root).toEqual(currentAddressTree.tree.getRoot());

      const { addressesTree: t1, messagesMap: m1 } =
        await buildMerkleTrees(zkapp);
      expect(t1).toEqual(currentAddressTree);

      log.warn('messagesMap', m1);

      // assert that user1 is registered
      expect(
        t1.keys.has(Poseidon.hash(user1.publicKey.toFields()).toString())
      ).toBeTruthy();

      const nullifier = user1.mkNullifier(NullifierMessage);

      // assert theres no message linked to the nullifier
      expect(m1.has(nullifier.key().toString())).toBeFalsy();

      const tx = await mkStoreMessageTx({
        zkapp,
        message: validMessage,
        nullifier,
        address: user1.publicKey,
        force: false,
      });
      await user1.signAndSend(tx);

      // no address store event emited
      const { addressesTree: t2, messagesMap: m2 } =
        await buildMerkleTrees(zkapp);
      expect(t2).toEqual(currentAddressTree);

      // the address root has not changed
      expect(zkapp.addressesRoot.get()).toEqual(
        currentAddressTree.tree.getRoot()
      );

      // assert that theres a new message linked to the nullifier
      expect(m2.has(nullifier.key().toString())).toBeTruthy();
      // and it is the same message
      expect(m2.get(nullifier.key().toString())).toEqual(validMessage);

      currentMessagesMap = m2;
    });

    test('Registered user can not store more than one message', async () => {
      // preliminary checks
      const root = zkapp.addressesRoot.get();
      expect(root).toEqual(currentAddressTree.tree.getRoot());

      const { addressesTree: t1, messagesMap } = await buildMerkleTrees(zkapp);
      expect(t1).toEqual(currentAddressTree);

      expect(messagesMap).toEqual(currentMessagesMap);

      // assert that user1 is registered
      expect(
        t1.keys.has(Poseidon.hash(user1.publicKey.toFields()).toString())
      ).toBeTruthy();

      const nullifier = user1.mkNullifier(NullifierMessage);

      // assert theres a message linked to the nullifier
      expect(messagesMap.has(nullifier.key().toString())).toBeTruthy();

      await expect(
        mkStoreMessageTx({
          zkapp,
          message: validMessage,
          nullifier,
          address: user1.publicKey,
          force: false,
        })
      ).rejects.toThrow();

      // no address store event emited
      const { addressesTree: t2 } = await buildMerkleTrees(zkapp);
      expect(t2).toEqual(currentAddressTree);

      // the address root has not changed
      expect(zkapp.addressesRoot.get()).toEqual(
        currentAddressTree.tree.getRoot()
      );
    });
  }
          );
});
