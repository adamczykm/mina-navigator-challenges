import { jest } from '@jest/globals';
import { Bool, Field } from 'o1js';
import { Logger, ILogObj } from 'tslog';
import {
  DetailsBounds,
  MessageDetails,
  checkSumFails,
  ProcessMessageBatch,
  Message,
  details,
  processBatchSequentially,
  checkBoundsFail,
  checkLocationFails,
} from './MessageBox';

const log = new Logger<ILogObj>({ name: 'MessageBox.test' });

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

describe('Testing Challenge2 - SpyMaster Message Box', () => {
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
    describe('Check the contract behaviour - only valid messages', () => {
      // prepare a set of 5 valid messages with consecutive numbers

      // then assert that the highest message number is 5
      console.log('temp');
    }),
    describe('Check the contract behaviour - only valid messages - batched', () => {
      // prepare a set of 5 valid messages with consecutive numbers use batchsize 2

      // then assert that the highest message number is 5

      console.log('temp');
    }),
    describe('Check the contract behaviour - including invalid messages', () => {
      // prepare a set of [invalid and valid] with consecutive numbers
      // then assert that the highest message number is 2

      // prepare a set of [valid and invalid] with consecutive numbers
      // then assert that the highest message number is 1

      // prepare a set of [valid, valid, valid, invalid ] with consecutive numbers
      // then assert that the highest message number is 1
      console.log('temp');
    }),
    describe('Check the contract behaviour - incl invalid and random order', () => {
      // v4 v1 i6 -> 4
      console.log('temp');
    }),
    describe('Check the contract behaviour - including agent zero messages', () => {
      // v4 v1 zi6 i7 -> 6
      console.log('temp');
    }),
    describe('Check the contract behaviour - including duplicates (invalid for tests)', () => {
      // v4 v1 i6 -> 4
      console.log('temp');
    });
});
