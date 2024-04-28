import "reflect-metadata"

import { TestingAppChain } from "@proto-kit/sdk";
import { CircuitString, PrivateKey, PublicKey } from "o1js";
import { log } from "@proto-kit/common";
import { AgentCode, AgentDetails, AgentId, Message, MessageBox, MessageNumber, MessageText } from "../src/message-box";

log.setLevel("error");

describe("messagebox tests", () => {
  let appChain = TestingAppChain.fromRuntime({
    MessageBox,
  });
  let agentWhitelist: Map<AgentId, AgentDetails>;
  let agentPrivateKey: PrivateKey;
  let agentPublicKey: PublicKey;
  let messageBox: MessageBox;


  beforeEach(async () => {
    appChain = TestingAppChain.fromRuntime({
      MessageBox,
    });

    agentWhitelist = new Map([[
      new AgentId(7),
      new AgentDetails({
        lastMessageNumber: new MessageNumber(0),
        securityCode: AgentCode.fromString("A7")
      })
    ]])

    appChain.configurePartial({
      Runtime: {
        MessageBox: { agentWhitelist },
        Balances: {}
      },
    });

    await appChain.start();

    agentPrivateKey = PrivateKey.random();
    agentPublicKey = agentPrivateKey.toPublicKey();

    appChain.setSigner(agentPrivateKey);

    messageBox = appChain.runtime.resolve("MessageBox");

    // prepopulate the state

    const tx1 = await appChain.transaction(agentPublicKey, () => {
      for (const [agentId, agentDetails] of agentWhitelist) {
        messageBox.populateAgentWhitelist(agentId, agentDetails);
      }
    });

    await tx1.sign();
    await tx1.send();

    const block = await appChain.produceBlock();
    expect(block?.height.equals(0));

    expect(block?.transactions[0].status.toBoolean()).toBe(true);
  });

  it("should update the state on a valid message", async () => {
    const agentId: AgentId = agentWhitelist.keys().next().value;

    const newMessage: Message = {
      details: {
        agentId,
        text: MessageText.fromString("Hello World!"),
        securityCode: agentWhitelist.get(agentId)!.securityCode
      },
      messageNumber: new MessageNumber(1)
    };

    let block = await appChain.produceBlock();
    let message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    const tx1 = await appChain.transaction(agentPublicKey, () => {
      messageBox.processMessage(newMessage)
    });

    await tx1.sign();
    await tx1.send();

    block = await appChain.produceBlock();

    message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    expect(block?.transactions[0].status.toBoolean()).toBe(true);
    expect(message?.lastMessageNumber.equals(new MessageNumber(1)).toBoolean()).toBe(true);
  }, 1_000_000);

  it("should fail for unexisting agent", async () => {
    const agentId: AgentId = new AgentId(8);

    const newMessage: Message = {
      details: {
        agentId,
        text: MessageText.fromString("Hello World!"),
        securityCode: AgentCode.fromString("A8")
      },
      messageNumber: new MessageNumber(1)
    };

    let block = await appChain.produceBlock();
    let message = await appChain.query.runtime.MessageBox.agents.get(agentId);


    const tx1 = await appChain.transaction(agentPublicKey, () => {
      messageBox.processMessage(newMessage)
    });

    await tx1.sign();
    await tx1.send();

    block = await appChain.produceBlock();

    message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    expect(block?.transactions[0].status.toBoolean()).toBe(false);
  }, 1_000_000);

  it("should fail with invalid security code", async () => {
    const agentId: AgentId = agentWhitelist.keys().next().value;

    const newMessage: Message = {
      details: {
        agentId,
        text: MessageText.fromString("Hello World!"),
        securityCode: AgentCode.fromString("A8")
      },
      messageNumber: new MessageNumber(1)
    };

    let block = await appChain.produceBlock();
    let message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    const tx1 = await appChain.transaction(agentPublicKey, () => {
      messageBox.processMessage(newMessage)
    });

    await tx1.sign();
    await tx1.send();

    block = await appChain.produceBlock();

    message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    expect(block?.transactions[0].status.toBoolean()).toBe(false);
  }, 1_000_000);

  it("should fail with invalid message length", async () => {
    const agentId: AgentId = agentWhitelist.keys().next().value;

    const newMessage: Message = {
      details: {
        agentId,
        text: new MessageText({ text: CircuitString.fromString("Hello World") }),
        securityCode: AgentCode.fromString("A7")
      },
      messageNumber: new MessageNumber(1)
    };

    let block = await appChain.produceBlock();
    let message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    const tx1 = await appChain.transaction(agentPublicKey, () => {
      messageBox.processMessage(newMessage)
    });

    await tx1.sign();
    await tx1.send();

    block = await appChain.produceBlock();

    message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    expect(block?.transactions[0].status.toBoolean()).toBe(false);
  }, 1_000_000);

  it("should fail with invalid message number", async () => {
    const agentId: AgentId = agentWhitelist.keys().next().value;

    const newMessage: Message = {
      details: {
        agentId,
        text: MessageText.fromString("Hello World!"),
        securityCode: AgentCode.fromString("A7")
      },
      messageNumber: new MessageNumber(0)
    };

    let block = await appChain.produceBlock();
    let message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    const tx1 = await appChain.transaction(agentPublicKey, () => {
      messageBox.processMessage(newMessage)
    });

    await tx1.sign();
    await tx1.send();

    block = await appChain.produceBlock();

    message = await appChain.query.runtime.MessageBox.agents.get(agentId);

    expect(block?.transactions[0].status.toBoolean()).toBe(false);
  }, 1_000_000);

});
