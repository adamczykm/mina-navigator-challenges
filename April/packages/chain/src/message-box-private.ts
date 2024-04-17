import { Bool, Struct } from "o1js";
// import { Logger, ILogObj } from "tslog";
import { RuntimeModule,runtimeModule, runtimeMethod, state } from "@proto-kit/module";
import { StateMap, assert } from "@proto-kit/protocol";
import { log } from "@proto-kit/common";

import { Provable, Experimental } from "o1js";
import { AgentId, Message, AgentDetails, MessageNumber, AgentCode, processMessage, safeFieldGet } from "./message-box";

export class ProcessMessageOutput extends Struct({
  messageNumber: MessageNumber,
  agentId: AgentId
}) {}


export const ProcessMessageProgram = Experimental.ZkProgram({
  publicInput: AgentDetails,
  publicOutput: ProcessMessageOutput,

  methods: {
    checkMessage: {
      privateInputs: [Message],
      method(agentDetails: AgentDetails, message: Message) {
        const validMessage: Bool = processMessage(message, agentDetails);
        validMessage.assertTrue();
        return new ProcessMessageOutput({
          messageNumber: message.messageNumber,
          agentId: message.details.agentId
        });
      },
    },
  },
});


export class ProcessMessageProof extends Experimental.ZkProgram.Proof(ProcessMessageProgram) {}

@runtimeModule()
export class MessageBoxPrivate extends RuntimeModule<{agentWhitelist: Map<AgentId, AgentDetails>}> {

  @state() public agents = StateMap.from<AgentId, AgentDetails>(AgentId, AgentDetails);

  @runtimeMethod()
  public processMessage(proof: ProcessMessageProof): void {

    proof.verify();

    const proofOutput: ProcessMessageOutput = proof.publicOutput;

    // make sure that agent exists
    const agentOption = this.agents.get(proofOutput.agentId)

    const dummy = new AgentDetails({
      lastMessageNumber: new MessageNumber(0),
      securityCode: AgentCode.fromString("00")
    });

    const agent: AgentDetails = Provable.if(
      agentOption.isSome,
      agentOption.value,
      safeFieldGet(this.config.agentWhitelist, proofOutput.agentId, dummy)
    );

    log.info('Config whitelist: ', this.config.agentWhitelist.keys().next().value);

    assert(agent.securityCode.equals(AgentCode.fromString("00")).not(), "Agent does not exist");


    // update the agent's last message number
    const newAgentDetails = new AgentDetails({
      lastMessageNumber: proofOutput.messageNumber,
      securityCode: agent.securityCode,
    });

    this.agents.set(proofOutput.agentId, newAgentDetails);
  }
}
