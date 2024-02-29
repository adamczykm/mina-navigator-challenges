
import {
  Bool,
  Field,
  method,
  Provable,
  SelfProof,
  SmartContract,
  state,
  State,
  Struct,
  ZkProgram,
} from "o1js";

export type Message = {
  num: number;
  agentId: number;
  agentXLoc: number;
  agentYLoc: number;
  agentCheckSum: number;
};


export class MessageDetails extends Struct({
  agentId: Field,
  agentXLoc: Field,
  agentYLoc: Field,
  checkSum: Field,
}) {}

export const details = (msg: Message) => {
  return new MessageDetails({
    agentId: new Field(msg.agentId),
    agentXLoc: new Field(msg.agentXLoc),
    agentYLoc: new Field(msg.agentYLoc),
    checkSum: new Field(msg.agentCheckSum),
  });
};

class BatchStatus extends Struct({
  highestMsgNumber: Field,
}) {}

export const DetailsBounds = {
  agentId: { min: 0, max: 3000 },
  agentXLoc: { min: 0, max: 15000 },
  agentYLoc: { min: 5000, max: 20000 },
};

export function checkSumFails(msg: MessageDetails): Bool {
  const sum = msg.agentXLoc.add(msg.agentYLoc).add(msg.agentId);
  return sum.equals(msg.checkSum).not();
}

export function checkLocationFails(msg: MessageDetails): Bool {
  return msg.agentYLoc.lessThanOrEqual(msg.agentXLoc);
}

export function checkBoundsFail(msg: MessageDetails): Bool {
  return msg.agentId
    .lessThan(DetailsBounds.agentId.min)
    .or(msg.agentId.greaterThan(DetailsBounds.agentId.max))
    .or(msg.agentXLoc.lessThan(DetailsBounds.agentXLoc.min))
    .or(msg.agentXLoc.greaterThan(DetailsBounds.agentXLoc.max))
    .or(msg.agentYLoc.lessThan(DetailsBounds.agentYLoc.min))
    .or(msg.agentYLoc.greaterThan(DetailsBounds.agentYLoc.max));
}

export const ProcessMessageBatch = ZkProgram({
  name: "process-mesage-batch",
  publicInput: Field,
  publicOutput: BatchStatus,

  methods: {
    initBatch: {
      privateInputs: [],
      method(lowestMsgNumber: Field) {
        return new BatchStatus({ highestMsgNumber: lowestMsgNumber });
      },
    },
    batchMessageCheck: {
      privateInputs: [SelfProof, MessageDetails],
      method(
        msgNumber: Field,
        earlierProof: SelfProof<Field, BatchStatus>,
        msg: MessageDetails,
      ) {
        earlierProof.verify();
        const currentNumber = earlierProof.publicOutput.highestMsgNumber;

        const detailsCheckFail = () =>
          checkBoundsFail(msg)
            .or(checkSumFails(msg))
            .or(checkLocationFails(msg));

        // if agent id is zero we dont do checks, if its not we do checks, if they succeed we process the number
        const nextNumber = Provable.if(
          msg.agentId
            .equals(0)
            .or(detailsCheckFail().not())
            .and(msgNumber.greaterThan(currentNumber)),
          msgNumber,
          currentNumber,
        );

        return new BatchStatus({ highestMsgNumber: nextNumber });
      },
    },
  },
});

export class ProcessMessageBatchProof extends ZkProgram.Proof(
  ProcessMessageBatch,
) {}

// process only `batchSize` messages at a time keeping the circuit size small
export const processBatchSequentiallySized = async (msgs: Array<Message>, batchSize: number) => {
  if (!msgs) throw new Error("No messages provided!");

  let proof = await ProcessMessageBatch.initBatch(new Field(0));

  for (let i = 0; i < msgs.length; i += batchSize) {
    const batch = msgs.slice(i, i + batchSize);
    proof = await processBatchSequentially(batch, proof);
  }

  return proof;

};

// process entire batch of messages
export const processBatchSequentially = async (msgs: Array<Message>, initialProof?: ProcessMessageBatchProof) => {
  if (!msgs) throw new Error("No messages provided!");

  let proof = initialProof || await ProcessMessageBatch.initBatch(new Field(0));

  for (const msg of msgs) {
    const msgNum = new Field(msg.num);
    proof = await ProcessMessageBatch.batchMessageCheck(
      msgNum,
      proof,
      details(msg),
    );
  }

  return proof;
};

export class MessageBoxContract extends SmartContract {
  // store the highest message number
  @state(Field) highestProcessedMessage = State<Field>();

  @method processBatch(batchProcessProof: ProcessMessageBatchProof) {
    batchProcessProof.verify();
    this.highestProcessedMessage.set(
      batchProcessProof.publicOutput.highestMsgNumber,
    );
  }
}
