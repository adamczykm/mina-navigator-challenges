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
  Message,
  ProcessMessageBatch,
  ProcessMessageBatchProof,
  MessageBoxContract,
  processBatchSequentiallySized,
} from './MessageBox.js';
import { Logger, ILogObj } from 'tslog';
import { memoizationContext } from 'o1js/dist/node/lib/provable.js';

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

export const getDeployMessageBoxTx = async (keys: {
  zkappKey: PrivateKey;
  sender: PublicKey;
}) => {
  log.info('Compiling MessageBox programs');
  await ProcessMessageBatch.compile();
  await MessageBoxContract.compile();

  const { zkappKey, sender } = keys;
  const zkappAddress = zkappKey.toPublicKey();

  const zkapp = new MessageBoxContract(zkappAddress);

  log.info('Creating the deploy tx');
  const tx = await Mina.transaction(sender, () => {
    AccountUpdate.fundNewAccount(sender);
    zkapp.deploy();
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

  const { tx: deployZkAppTx, zkapp } = await getDeployMessageBoxTx({
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
    zkappKey,
    zkappAddress: zkappKey.toPublicKey(),
  };
};

export const processBatchInChunks = async (
  zkapp: MessageBoxContract,
  zkappKey: PrivateKey,
  ownerKey: PrivateKey,
  owner: PublicKey,
  msgs: Message[],
  chunkSize: number
) => {
  if (!msgs) throw new Error('No messages provided!');

  log.info('Creating the proof of processing batch of messages in chunks');
  const batchProof = await processBatchSequentiallySized(msgs, chunkSize);

  log.info('Building the `processBatch` tx');
  const tx = await Mina.transaction(owner, () => {
    zkapp.processBatch(batchProof);
  });
  log.info('Proving the `processBatch` tx');
  await tx.prove();
  const retTx = tx.sign([zkappKey, ownerKey]);

  log.info('Signing and sending the `processBatch` tx');
  const retTxId = await retTx.send();
  return {
    tx: retTx,
    txId: retTxId,
  };
};

