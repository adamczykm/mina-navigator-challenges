import { Character, Field, Provable, UInt64 } from "o1js";
import { Bool } from "o1js";
import { Struct } from "o1js";
// import { Logger, ILogObj } from "tslog";
import { RuntimeModule,runtimeModule, runtimeMethod, state } from "@proto-kit/module";
import { StateMap, assert } from "@proto-kit/protocol";
import { CircuitString } from "o1js";
import { log } from "@proto-kit/common";


export class AgentId extends Field {}
export class AgentCode extends Struct({
  c1: Field,
  c2: Field
}) {
  public equals(other: AgentCode): Bool {
    return this.c1.equals(other.c1).and(this.c2.equals(other.c2));
  }

  public toFields() : Field[] {
    return [this.c1, this.c2];
  }

  static fromString(code: string): AgentCode {
    if (code.length !== 2) {
      throw new Error("AgentCode must be 2 characters long");
    }
    return new AgentCode({
      c1: Character.fromString(code[0]).toField(),
      c2: Character.fromString(code[1]).toField()
    });
  }
}

export class MessageNumber extends Field {}

// export class MessageText extends Character[12] {}
export class MessageText extends Struct({
  text: CircuitString
}) {
  static fromString(text: string): MessageText {
    if (text.length !== 12) {
      throw new Error("MessageText must be 12 characters long");
    }
    return new MessageText({
      text: CircuitString.fromString(text)
    });
  }

  public equals(other: MessageText): Bool {
    return this.text.equals(other.text);
  }

  public isValid(): Bool {
    const t1: Bool = this.text.values[11].equals(Field(0)).not();
    const t2: Bool = this.text.values[12].equals(Field(0));
    return t1.and(t2);
  }
}

export class MessageDetails extends Struct({
  agentId: AgentId,
  text: MessageText,
  securityCode: AgentCode,
}) {}

export class Message extends Struct({
  details: MessageDetails,
  messageNumber: MessageNumber,
}) {}

export class AgentDetails extends Struct({
  lastMessageNumber: MessageNumber,
  securityCode: AgentCode,
}) {
  toFields(): Field[] {
    return [this.lastMessageNumber, this.securityCode.c1, this.securityCode.c2];
  }
}


function processMessage(message: Message, agent: AgentDetails): Bool {
  log.info('Processing message number: ', message.messageNumber, ' for agent: ', message.details.agentId);

  const validLength: Bool = message.details.text.isValid();
  const validSecurityCode: Bool = message.details.securityCode.equals(agent.securityCode);
  const validMessageNumber: Bool = message.messageNumber.greaterThan(agent.lastMessageNumber);

  const validMessage: Bool = validMessageNumber.and(validLength).and(validSecurityCode);
  return validMessage;
}

@runtimeModule()
export class MessageBox extends RuntimeModule<{agentWhitelist: Map<AgentId, AgentDetails>}> {

  @state() public agents = StateMap.from<AgentId, AgentDetails>(AgentId, AgentDetails);

  @runtimeMethod()
  public populateAgentWhitelist(
    agentId: AgentId,
    agentDetails: AgentDetails
  ): void {
    assert(
      UInt64.from(this.network.block.height).lessThanOrEqual(UInt64.from(0)),
      'Can only populate agent whitelist at genesis block'
    );
    this.agents.set(agentId, agentDetails);
  }

  @runtimeMethod()
  public processMessage(message: Message): void {

    // make sure that agent exists
    const agent = this.agents.get(message.details.agentId).value;

    // if agent not found the agent struct will be zeroed out
    const [f1, f2] = agent.securityCode.toFields();

    Provable.asProver(() => {
      Provable.log('f1 f2', [f1.toString(), f2.toString()])
      log.info('f1 f2', [f1.toString(), f2.toString()])
      log.info('Agent message: ', agent.lastMessageNumber.toString());
      log.info('Agent security: ', agent.securityCode.toString());
      log.info(
        'Agent security: ',
        agent.securityCode.toFields().map((f : Field) => f.toString())
      );
    });

    assert(
      f1
        .equals(new Field(0))
        .and(f2.equals(new Field(0)))
        .not(),
      'Agent does not exist'
    );

    const validMessage: Bool = processMessage(message, agent);
    assert(validMessage, "Invalid message");

    // update the agent's last message number
    const newAgentDetails = new AgentDetails({
      lastMessageNumber: message.messageNumber,
      securityCode: agent.securityCode,
    });

    this.agents.set(message.details.agentId, newAgentDetails);
  }
}
