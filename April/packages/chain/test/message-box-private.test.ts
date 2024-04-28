import "reflect-metadata"

import { TestingAppChain } from "@proto-kit/sdk";
import { CircuitString, PrivateKey, PublicKey, UInt64 } from "o1js";
import { log } from "@proto-kit/common";
import { AgentCode, AgentDetails, AgentId, Message, MessageNumber, MessageText } from "../src/message-box.js";
import { AgentTxInfo, MessageBoxPrivate, ProcessMessageProgram } from "../src/message-box-private.js";

log.setLevel("debug");

describe("messagebox-private tests", () => {
  let appChain = TestingAppChain.fromRuntime({
    MessageBoxPrivate,
  });
  let agentWhitelist: Map<AgentId, AgentDetails>;
  let agentPrivateKey: PrivateKey;
  let agentPublicKey: PublicKey;
  let messageBox: MessageBoxPrivate;

  beforeAll(async () => {
    await ProcessMessageProgram.compile()
  })

  beforeEach(async () => {
    appChain = TestingAppChain.fromRuntime({
      MessageBoxPrivate,
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
        MessageBoxPrivate: { agentWhitelist },
        Balances: {}
      },
    });

    await appChain.start();

    agentPrivateKey = PrivateKey.random();
    agentPublicKey = agentPrivateKey.toPublicKey();

    appChain.setSigner(agentPrivateKey);

    messageBox = appChain.runtime.resolve("MessageBoxPrivate");

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

  it("cant prepopulate at block 1+", async () => {

    const tx1 = await appChain.transaction(agentPublicKey, () => {
      for (const [agentId, agentDetails] of agentWhitelist) {
        messageBox.populateAgentWhitelist(agentId, agentDetails);
      }
    });

    await tx1.sign();
    await tx1.send();

    const block = await appChain.produceBlock();

    expect(block?.height.assertGreaterThan(0));
    expect(block?.transactions[0].status.toBoolean()).toBe(false);


  }, 1_000_000)

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
    let message = await appChain.query.runtime.MessageBoxPrivate.agents.get(agentId);

    // initial message number is 0
    expect(message?.lastMessageNumber.equals(new MessageNumber(0)).toBoolean()).toBe(true);

    const proof = await ProcessMessageProgram.checkMessage(
      agentWhitelist.get(agentId)!,
      newMessage
    );

    const tx1 = await appChain.transaction(agentPublicKey, () => {
      messageBox.processMessagePrivately(proof)
    });

    await tx1.sign();
    await tx1.send();

    block = await appChain.produceBlock();

    message = await appChain.query.runtime.MessageBoxPrivate.agents.get(agentId);
    const txInfo: AgentTxInfo = await appChain.query.runtime.MessageBoxPrivate.agentTxInfo.get(agentId) as AgentTxInfo;

    // tx worked
    expect(block?.transactions[0].status.toBoolean()).toBe(true);
    // state got updated
    expect(message?.lastMessageNumber.equals(new MessageNumber(1)).toBoolean()).toBe(true);

    expect(txInfo.blockHeight.equals(UInt64.from(block!.height)).toBoolean()).toBe(true);
    expect(txInfo.msgSenderPubKey.equals(agentPublicKey).toBoolean()).toBe(true);
    expect(txInfo.msgTxNonce.equals(UInt64.from(1)).toBoolean()).toBe(true);


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

    const agentDet =
      new AgentDetails({
        lastMessageNumber: new MessageNumber(0),
        securityCode: AgentCode.fromString("A8")
      })

    const proof = await ProcessMessageProgram.checkMessage(
      agentDet,
      newMessage
    );

    const tx1 = await appChain.transaction(agentPublicKey, () => {
      messageBox.processMessagePrivately(proof)
    });

    await tx1.sign();
    await tx1.send();

    const block = await appChain.produceBlock();

    const message = await appChain.query.runtime.MessageBoxPrivate.agents.get(agentId);

    // tx didnt work
    expect(block?.transactions[0].status.toBoolean()).toBe(false);
    // state not updated
    expect(message?.lastMessageNumber.equals(new MessageNumber(0)).toBoolean()).toBe(undefined);
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

    await expect(ProcessMessageProgram.checkMessage(
      agentWhitelist.get(agentId)!,
      newMessage)).rejects.toThrow();

  }
  , 1_000_000);

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

    await expect(ProcessMessageProgram.checkMessage(
      agentWhitelist.get(agentId)!,
      newMessage)).rejects.toThrow();
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

    await expect(ProcessMessageProgram.checkMessage(
      agentWhitelist.get(agentId)!,
      newMessage)).rejects.toThrow();
  }, 1_000_000);

});

