import {
  Field,
  Provable,
  SmartContract,
  state,
  State,
  method,
  PublicKey,
  Poseidon,
  MerkleWitness,
  MerkleTree,
  Nullifier,
  MerkleMapWitness,
  Permissions,
  MerkleMap,
  Struct,
  Bool,
  CircuitString,
  Circuit,
} from 'o1js';
import { Permission } from 'o1js/dist/node/lib/account_update';
import { Logger, ILogObj } from 'tslog';

const log = new Logger<ILogObj>({ name: 'SecretVault' });

export const MaxAddressesCount = 100;

export const TreeHeight = Math.ceil(Math.log2(MaxAddressesCount)) + 1;

export class SecretVaultMerkleWitness extends MerkleWitness(TreeHeight) {}

export const createSecretVaultMerkleTree = (leaves?: Field[]) => {
const t = new MerkleTree(TreeHeight);
  if (leaves) {
    if (leaves.length > MaxAddressesCount) {
      throw new Error(`Max leaves count is {MaxAddressesCount} `);
    }
    t.fill(leaves);
  }
  return t;
};

export const InitialRoot = createSecretVaultMerkleTree().getRoot();

export const NullifierMessage = CircuitString.fromString("CanStoreAnyAddress").toFields();

export const setInitialState = (zkapp: SecretVault, admin: PublicKey) => {
  // zkapp.account.permissions.set({
  //   // ...SecretVaultPermissions,
  // });
  zkapp.messageCount.set(new Field(0));
  zkapp.nullifierRoot.set(new MerkleMap().getRoot());
  zkapp.addressesRoot.set(InitialRoot);
  zkapp.adminAccountHash.set(Poseidon.hash(admin.toFields()));
};

export const SecretVaultPermissions = {};

export class MessageEvent extends Struct({ message: Field, nullifier: Field }) {}

/**
 Implementation of the Mina Navigators LearnToEarn challenge 1:
https://file.notion.so/f/f/4b60fb8f-466a-4a1b-acd2-bdaf14b1e513/f8581776-9b8d-4257-884c-e611e325e0d1/mina_navigators_challenge1.pdf?id=f96f1373-1281-44f5-9bb3-e54d15972dce&table=block&spaceId=4b60fb8f-466a-4a1b-acd2-bdaf14b1e513&expirationTimestamp=1706313600000&signature=KUv6tUJPgtj6upSpdOIZYZRty8Xx_oWM9fDOqu7oFoo&downloadName=mina+navigators+challenge1.pdf
   */
export class SecretVault extends SmartContract {
  // store the addresses in a merkle tree
  @state(Field) addressesRoot = State<Field>();
  // to prohibit the same address from storing multiple messages
  @state(Field) nullifierRoot = State<Field>();
  // as requested
  @state(Field) messageCount = State<Field>();
  // admin account
  @state(Field) adminAccountHash = State<Field>();

  events = { 'store-address': Field, 'store-message': MessageEvent };

  /**
   * This method allows the contract owner to add a new address to the vault.
   * It assumes that no more than `MaxAddressesCount` addresses will be added.
   * NOTE. The contract could be broken if the owner uses witness that does
   * not use the next available free leaf slot.
   */
  @method storeAddress(
    address: PublicKey,
    slotWitness: SecretVaultMerkleWitness,
    adminNullifier: Nullifier
  ) {
    Provable.asProver(() => {
      log.debug('entering SecretVault.storeAddress');
    });

    const hash = Poseidon.hash(address.toFields());
    Provable.asProver(() => {
      log.debug('Address hash:', hash.toString());
    });
    const currentRoot = this.addressesRoot.getAndRequireEquals();

    Provable.asProver(() => {
      log.debug('Current root: ', currentRoot.toString());
    });

    // verify the admin nullifier
    adminNullifier.verify([currentRoot]);
    Poseidon.hash(adminNullifier.getPublicKey().toFields()).assertEquals(
      this.adminAccountHash.getAndRequireEquals()
    );

    // verify that slot witness matches the current root

    Provable.asProver(() => {
      const slotwitnessroot = slotWitness.calculateRoot(hash);
      log.debug('Slot witness root:', slotwitnessroot.toString());
    });

    slotWitness.calculateRoot(new Field(0)).assertEquals(currentRoot);

    // compute the new root
    const addressesRoot = slotWitness.calculateRoot(hash);

    // update the on-chain root
    this.addressesRoot.set(addressesRoot);

    // broadcast the newly added address
    this.emitEvent('store-address', hash);

    Provable.asProver(() => {
      log.debug('exiting SecretVault.storeAddress');
    });
  }

  /**
   * This method allows anyone with whitelisted addresss to add a new message to the vault.
   * The message must follow the format specified in `CheckMessage.ts`.
   */
  @method storeMessage(
    nullifier: Nullifier,
    nullifierWitness: MerkleMapWitness,
    senderAddressWitness: SecretVaultMerkleWitness,
    message: Field
  ) {
    log.debug('entering SecretVault.storeMessage');
    // --- message

    // check the message format
    this.checkMessage(message).assertTrue(
      'The provided message has an invalid format.'
    );

    // --- address

    // verify if the sender is eligible to send a message
    const senderAddress = nullifier.getPublicKey();
    // const senderAddressHash = Poseidon.hash([new Field(0)]);
    const senderAddressHash = Poseidon.hash(senderAddress.toFields());
    const currentAddressRoot = this.addressesRoot.getAndRequireEquals();

    // verify the witness
    senderAddressWitness
      .calculateRoot(senderAddressHash)
      .assertEquals(currentAddressRoot);

    // --- nullifier

    // verify the nullifier
    nullifier.verify(NullifierMessage);

    // verify the nullifier witness
    const nullifierRoot = this.nullifierRoot.getAndRequireEquals();

    // check if the nullifier has been used before
    // it also kinda verifies the witness
    nullifier.assertUnused(nullifierWitness, nullifierRoot);

    // --- update

    // set used and update the on-chain root
    let newRoot = nullifier.setUsed(nullifierWitness);
    // we update the on-chain root
    this.nullifierRoot.set(newRoot);

    // update the message count
    const messageCount = this.messageCount.getAndRequireEquals();
    this.messageCount.set(messageCount.add(1));

    // broadcast the newly added message
    this.emitEvent('store-message', { message, nullifier: nullifier.key() });
    log.debug('exiting SecretVault.storeMessage');
  }

  @method checkMessage(message: Field): Bool {
    const bits = message.toBits(6).reverse();

    // Condition for the first rule
    const condition1stop = Provable.if(bits[0], bits[1].or(bits[2]).or(bits[3]).or(bits[4]).or(bits[5]), Bool(false));

    // Condition for the second rule
    const condition2stop = Provable.if(bits[1], bits[2].not(), Bool(false));

    // Condition for the third rule
    const condition3stop = Provable.if(bits[3], bits[4].or(bits[5]), Bool(false));

    // Final result - if any of the conditions is true, then the message is invalid
    return condition1stop.or(condition2stop).or(condition3stop).not();
  }
}
