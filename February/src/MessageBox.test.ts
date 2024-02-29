import { jest } from '@jest/globals';
import { Bool, Field, PublicKey, PrivateKey } from 'o1js';
import { Logger, ILogObj } from 'tslog';
import {
  DetailsBounds,
  MessageDetails,
  checkSumFails,
  ProcessMessageBatch,
  checkBoundsFail,
  checkLocationFails,
  MessageBoxContract,
  Message,
  details,
} from './MessageBox';
import { processBatchInChunks, setupEnv } from './MessageBoxInteractions.js';

const log = new Logger<ILogObj>({ name: 'MessageBox.test' });

const AGENT_ZERO = 0
type Keys = {
  public: PublicKey;
  secret: PrivateKey;
};

const mkMessageDetails = (
  agentId: number,
  agentXLoc: number,
  agentYLoc: number,
  agentCheckSum: number
) => {
  return new MessageDetails({
    agentId: new Field(agentId),
    agentXLoc: new Field(agentXLoc),
    agentYLoc: new Field(agentYLoc),
    checkSum: new Field(agentCheckSum),
  });
};

const mkMessage = (
  msgNum: number,
  agentId: number,
  agentXLoc: number,
  agentYLoc: number,
  agentCheckSum: number
): Message => {
  return {
    num: msgNum,
    agentId,
    agentXLoc,
    agentYLoc,
    agentCheckSum,
  };
};

const minY = DetailsBounds.agentYLoc.min;

const mkValidMessage = (
  msgNum: number,
  agentId: number,
  agentXLoc: number,
  agentYLoc: number
): Message => {
  const agentCheckSum = agentXLoc + agentYLoc + agentId;
  const ret = mkMessage(msgNum, agentId, agentXLoc, agentYLoc, agentCheckSum);
  log.debug('Valid message', ret);
  log.debug('Valid message details', details(ret));
  if (checkSumFails(details(ret)).toBoolean()) {
    throw new Error('Sanity check: Invalid checksum');
  }
  if (checkLocationFails(details(ret)).toBoolean()) {
    throw new Error('Sanity check: Invalid location');
  }
  if (checkBoundsFail(details(ret)).toBoolean()) {
    throw new Error('Sanity check: Invalid bounds');
  }
  return ret;
};

const checkSumTest = (msg: MessageDetails): Bool => {
  const sum = msg.agentXLoc.add(msg.agentYLoc).add(msg.agentId);
  return sum.equals(msg.checkSum);
};

// Explicitly mock the checkSumFails function within the MessageBox module
jest.mock('./MessageBox', () => {
  const originalModule = jest.requireActual(
    './MessageBox'
  ) as typeof import('./MessageBox');

  // You can directly mock the specific function you want to test
  const mockedCheckSumFails = jest.fn<Bool, [MessageDetails]>(
    originalModule.checkSumFails
  );

  return {
    ...originalModule,
    checkSumFails: mockedCheckSumFails,
  };
});

describe(`Testing Challenge2 - The SpyMaster's Message Box`, () => {
  beforeAll(async () => {
    log.info('Starting MessageBox tests');
    log.info('Compiling processMessageBatch program...');
    // let { verificationKey } =
    //   await ProcessMessageBatch.compile();
  }),
    describe('Check message logic tests', () => {
      beforeEach(() => {
        // Clears usage data but does not need to redefine the mock.
        jest.clearAllMocks();
      }),
        // cannot be tested - the message check gets into the zk circuit
        // test('Check processBatchSequentially calls checkSumFails with correct arguments', async () => {
        //   const messages: Message[] = [
        //     {
        //       num: 1,
        //       agentId: 100,
        //       agentXLoc: 200,
        //       agentYLoc: 300,
        //       agentCheckSum: 600,
        //     },
        //     {
        //       num: 2,
        //       agentId: 200,
        //       agentXLoc: 300,
        //       agentYLoc: 400,
        //       agentCheckSum: 900,
        //     },
        //   ];

        //   await processBatchSequentially(messages);

        //   messages.forEach((msg, index) => {
        //     expect(checkSumFails).toHaveBeenNthCalledWith(
        //       index + 1,
        //       details(msg)
        //     );
        //   });
        // });
        test('Check message checksum is the sum of message details - hardcoded cases', () => {
          const msg = mkMessageDetails(1, 2, 3, 6);
          expect(checkSumFails(msg).not()).toEqual(Bool(true));

          const msg2 = mkMessageDetails(1, 2, 3, 7);
          expect(checkSumFails(msg2).not()).toEqual(Bool(false));

          const msg3 = mkMessageDetails(1, 2, 3, 8);
          expect(checkSumFails(msg3).not()).toEqual(Bool(false));

          const msg4 = mkMessageDetails(100, 10, 1, 111);
          expect(checkSumFails(msg4).not()).toEqual(Bool(true));
        }),
        test('Check message checksum is the sum of message details - random tests', () => {
          const bounds = DetailsBounds;

          // generate random messages within bounds
          for (let i = 0; i < 100; i++) {
            const agentId = Math.floor(
              Math.random() * (bounds.agentId.max - bounds.agentId.min) +
                bounds.agentId.min
            );
            const agentXLoc = Math.floor(
              Math.random() * (bounds.agentXLoc.max - bounds.agentXLoc.min) +
                bounds.agentXLoc.min
            );
            const agentYLoc = Math.floor(
              Math.random() * (bounds.agentYLoc.max - bounds.agentYLoc.min) +
                bounds.agentYLoc.min
            );
            const agentCheckSum =
              agentXLoc + agentYLoc + agentId + Math.floor(3 * Math.random());
            const msg = mkMessageDetails(
              agentId,
              agentXLoc,
              agentYLoc,
              agentCheckSum
            );
            expect(checkSumFails(msg).not()).toEqual(checkSumTest(msg));
          }
        }),
        test('Test check that agentX <= agent Y', () => {
          const validChecksumMsg = (x: number, y: number, z: number) =>
            mkMessageDetails(x, y, z, x + y + z);

          // valid
          const bounds = DetailsBounds;

          let msg = validChecksumMsg(
            bounds.agentId.min,
            bounds.agentXLoc.min,
            bounds.agentYLoc.min
          );

          expect(checkLocationFails(msg)).toEqual(Bool(false));

          msg = validChecksumMsg(
            bounds.agentId.max,
            bounds.agentXLoc.max,
            bounds.agentXLoc.max + 1
          );
          expect(checkLocationFails(msg)).toEqual(Bool(false));

          // invalid
          msg = validChecksumMsg(
            bounds.agentId.min,
            bounds.agentYLoc.min,
            bounds.agentYLoc.min
          );
          expect(checkLocationFails(msg)).toEqual(Bool(true));

          msg = validChecksumMsg(
            bounds.agentId.max,
            bounds.agentXLoc.max,
            bounds.agentXLoc.max
          );
          expect(checkLocationFails(msg)).toEqual(Bool(true));
        }),
        test('Check message bounds behave as required', () => {
          const bounds = DetailsBounds;

          //generate valid random bounds
          for (let i = 0; i < 100; i++) {
            const agentId = Math.floor(
              Math.random() * (bounds.agentId.max - bounds.agentId.min) +
                bounds.agentId.min
            );
            const agentXLoc = Math.floor(
              Math.random() * (bounds.agentXLoc.max - bounds.agentXLoc.min) +
                bounds.agentXLoc.min
            );
            const agentYLoc = Math.floor(
              Math.random() * (bounds.agentYLoc.max - bounds.agentYLoc.min) +
                bounds.agentYLoc.min
            );
            const agentCheckSum = agentXLoc + agentYLoc + agentId;
            const msg = mkMessageDetails(
              agentId,
              agentXLoc,
              agentYLoc,
              agentCheckSum
            );
            expect(checkBoundsFail(msg)).toEqual(Bool(false));
          }

          // few manual cases
          // within bounds
          const validcheckSumMessage = (x: number, y: number, z: number) =>
            mkMessageDetails(x, y, z, x + y + z);
          let msg = validcheckSumMessage(1, 2, 10000);
          expect(checkBoundsFail(msg)).toEqual(Bool(false));

          // outside
          msg = validcheckSumMessage(1, 2, 4999);
          expect(checkBoundsFail(msg)).toEqual(Bool(true));

          msg = validcheckSumMessage(
            bounds.agentId.min - 1,
            bounds.agentXLoc.min + 1,
            bounds.agentYLoc.min + 1
          );
          expect(checkBoundsFail(msg)).toEqual(Bool(true));

          msg = validcheckSumMessage(
            bounds.agentId.min + 1,
            bounds.agentXLoc.min - 1,
            bounds.agentYLoc.min + 1
          );
          expect(checkBoundsFail(msg)).toEqual(Bool(true));

          msg = validcheckSumMessage(
            bounds.agentId.min + 1,
            bounds.agentXLoc.min - 1,
            bounds.agentYLoc.min - 1
          );
          expect(checkBoundsFail(msg)).toEqual(Bool(true));

          msg = validcheckSumMessage(
            bounds.agentId.max + 1,
            bounds.agentXLoc.min + 1,
            bounds.agentYLoc.min + 1
          );
          expect(checkBoundsFail(msg)).toEqual(Bool(true));

          msg = validcheckSumMessage(
            bounds.agentId.max - 1,
            bounds.agentXLoc.max + 1,
            bounds.agentYLoc.max - 1
          );
          expect(checkBoundsFail(msg)).toEqual(Bool(true));

          msg = validcheckSumMessage(
            bounds.agentId.max - 1,
            bounds.agentXLoc.max - 1,
            bounds.agentYLoc.max + 1
          );
          expect(checkBoundsFail(msg)).toEqual(Bool(true));
        });
    }),
    describe('Check the MessageBoxContract behaviour - no proofs ', () => {
      const proofsEnabled = true;
      let Local;
      let zkApp: MessageBoxContract;
      let zkAppAccount: Keys;
      let owner: Keys;

      beforeAll(async () => {
        log.info('Compiling MessageBox programs...');
        await ProcessMessageBatch.compile();
        await MessageBoxContract.compile();

        const {
          zkapp: app,
          owner: o,
          ownerKey,
          local,
          zkappKey,
          zkappAddress,
        } = await setupEnv({ proofsEnabled });

        zkAppAccount = {
          public: zkappAddress,
          secret: zkappKey,
        };

        zkApp = app;
        owner = {
          public: o,
          secret: ownerKey,
        };

        Local = local;
      });

      test('Check the contract behaviour - only valid messages', async () => {
        // prepare a set of 5 valid messages with consecutive numbers

        const msgs: Message[] = [
          mkValidMessage(1, 1, 1, minY),
          mkValidMessage(2, 2, 2, minY),
          mkValidMessage(3, 3, 3, minY),
          mkValidMessage(4, 4, 4, minY),
          mkValidMessage(5, 5, 5, minY),
        ];

        const oldH = zkApp.highestProcessedMessage.get();

        expect(oldH.equals(new Field(0))).toBeTruthy();

        const { tx, txId } = await processBatchInChunks(
          zkApp,
          zkAppAccount.secret,
          owner.secret,
          owner.public,
          msgs,
          2
        );

        const newH = zkApp.highestProcessedMessage.get();

        expect(newH.equals(new Field(5))).toBeTruthy();
      }),
        test('Check the contract behaviour - including invalid messages #1', async () => {
          // prepare a set of [invalid and valid] with consecutive numbers
          const oldH = zkApp.highestProcessedMessage.get();
          const oldHn = Number(oldH.toString());

          const msgs: Message[] = [
            mkMessage(oldHn + 1, 1, 1, 1, 13), // invalid bc minY
            mkValidMessage(oldHn + 2, 2, 2, minY),
          ];

          const { tx, txId } = await processBatchInChunks(
            zkApp,
            zkAppAccount.secret,
            owner.secret,
            owner.public,
            msgs,
            2
          );

          const newH = zkApp.highestProcessedMessage.get();

          expect(newH.equals(new Field(oldHn + 2))).toBeTruthy();

          // prepare a set of [valid and invalid] with consecutive numbers
          // then assert that the highest message number is 1

          // prepare a set of [valid, valid, valid, invalid ] with consecutive numbers
          // then assert that the highest message number is 1
          console.log('temp');
        }),
        test('Check the contract behaviour - including invalid messages #2', async () => {
          // prepare a set of [invalid and valid] with consecutive numbers
          const oldH = zkApp.highestProcessedMessage.get();
          const oldHn = Number(oldH.toString());

          const msgs: Message[] = [
            mkValidMessage(oldHn + 1, 2, 2, minY),
            mkMessage(oldHn + 2, 1, 1, 1, 13), // invalid bc minY
          ];

          const { tx, txId } = await processBatchInChunks(
            zkApp,
            zkAppAccount.secret,
            owner.secret,
            owner.public,
            msgs,
            2
          );

          const newH = zkApp.highestProcessedMessage.get();

          expect(newH.equals(new Field(oldHn + 1))).toBeTruthy();
        }),
        test('Check the contract behaviour - incl invalid and random order', async () => {
          // prepare a set of [invalid and valid] with consecutive numbers
          const oldH = zkApp.highestProcessedMessage.get();
          const oldHn = Number(oldH.toString());

          const msgs: Message[] = [
            mkMessage(oldHn + 100, 1, 1, 1, 13), // invalid bc minY
            mkValidMessage(oldHn + 101, 2, 2, minY),
            mkMessage(oldHn + 2, 1, 1, 1, 13), // invalid bc minY
            mkValidMessage(oldHn + 50, 2, 2, minY),
          ];

          const { tx, txId } = await processBatchInChunks(
            zkApp,
            zkAppAccount.secret,
            owner.secret,
            owner.public,
            msgs,
            2
          );

          const newH = zkApp.highestProcessedMessage.get();

          expect(newH.equals(new Field(oldHn + 101))).toBeTruthy();

        }),
        test('Check the contract behaviour - including agent zero messages', async () => {
          // v4 v1 zi6 i7 -> 6

          const oldH = zkApp.highestProcessedMessage.get();
          const oldHn = Number(oldH.toString());

          const msgs: Message[] = [
            mkValidMessage(oldHn + 4, 2, 2, minY),
            mkValidMessage(oldHn + 1, 2, 2, minY),
            mkMessage(oldHn + 6, AGENT_ZERO, 1, 1, 13), // valid bc agent_zero
            mkMessage(oldHn + 7, 10, 1, 1, 13), // valid bc agent_zero
          ];

          const { tx, txId } = await processBatchInChunks(
            zkApp,
            zkAppAccount.secret,
            owner.secret,
            owner.public,
            msgs,
            2
          );

          const newH = zkApp.highestProcessedMessage.get();

          expect(newH.equals(new Field(oldHn + 6))).toBeTruthy();

        }),
        test('Check the contract behaviour - including duplicates (invalid for tests)', async () => {
          // v4 v1 i6 -> 4
          const oldH = zkApp.highestProcessedMessage.get();
          const oldHn = Number(oldH.toString());

          const msgs: Message[] = [
            mkValidMessage(oldHn - 1, 2, 2, minY),
            mkMessage(oldHn - 2, AGENT_ZERO, 1, 1, 13), // valid bc agent_zero
            mkMessage(oldHn - 7, 10, 1, 1, 13), // invalid
          ];

          const { tx, txId } = await processBatchInChunks(
            zkApp,
            zkAppAccount.secret,
            owner.secret,
            owner.public,
            msgs,
            2
          );

          const newH = zkApp.highestProcessedMessage.get();

          expect(newH.equals(new Field(oldHn))).toBeTruthy();

        });
    });
});
