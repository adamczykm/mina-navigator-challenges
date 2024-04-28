import { Bool, PublicKey, Struct, UInt64 } from 'o1js';
import { runtimeModule, runtimeMethod, state } from '@proto-kit/module';
import { assert, StateMap } from '@proto-kit/protocol';
import { log } from '@proto-kit/common';

import { Provable, Experimental } from 'o1js';
import {
  AgentId,
  Message,
  AgentDetails,
  MessageNumber,
  doProcessMessage,
  MessageBox,
} from './message-box.js';

export class ProcessMessageOutput extends Struct({
  messageNumber: MessageNumber,
  agentId: AgentId,
}) {}

export const ProcessMessageProgram = Experimental.ZkProgram({
  publicInput: AgentDetails,
  publicOutput: ProcessMessageOutput,

  methods: {
    checkMessage: {
      privateInputs: [Message],
      method(agentDetails: AgentDetails, message: Message) {
        const validMessage: Bool = doProcessMessage(message, agentDetails);
        validMessage.assertTrue();
        return new ProcessMessageOutput({
          messageNumber: message.messageNumber,
          agentId: message.details.agentId,
        });
      },
    },
  },
});

export class ProcessMessageProof extends Experimental.ZkProgram.Proof(
  ProcessMessageProgram
) {}

export class AgentTxInfo extends Struct({
  blockHeight: UInt64,
  msgSenderPubKey: PublicKey,
  msgTxNonce: UInt64,
}) {}

@runtimeModule()
export class MessageBoxPrivate extends MessageBox {
  @state() public agentTxInfo = StateMap.from(AgentId, AgentTxInfo);

  public override updateState(agentId: AgentId, agentDetails: AgentDetails): void {
    const agentTxInfo = new AgentTxInfo({
      blockHeight: this.network.block.height,
      msgSenderPubKey: this.transaction.sender.value,
      msgTxNonce: this.transaction.nonce.value,
    });

    this.agentTxInfo.set(agentId, agentTxInfo);
    super.updateState(agentId, agentDetails);
  }

  @runtimeMethod()
  public override processMessage(_: Message): void {
    assert(Bool(false), 'processMessage is not implemented in MessageBoxPrivate, use processMessagePrivately instead');
  }

  @runtimeMethod()
  public processMessagePrivately(proof: ProcessMessageProof): void {
    const proofOutput: ProcessMessageOutput = proof.publicOutput;

    // check for the agent existence
    const agent: AgentDetails = this.ensureAgent(proofOutput.agentId)

    proof.verify();

    // update the agent's last message number
    const newAgentDetails = new AgentDetails({
      lastMessageNumber: proofOutput.messageNumber,
      securityCode: agent.securityCode,
    });

    this.updateState(proofOutput.agentId, newAgentDetails);
  }
}
