import { Balance } from "@proto-kit/library";
import { Balances } from "./balances";
import { ModulesConfig } from "@proto-kit/common";
import { AgentCode, AgentDetails, AgentId, MessageBox, MessageNumber } from "./message-box";

export const modules = {
  Balances,
  MessageBox
};

export const config: ModulesConfig<typeof modules> = {
  Balances: {
    totalSupply: Balance.from(10_000),
  },
  MessageBox: {
    // initial map of agents (whitelist)
    agentWhitelist: new Map([[
      new AgentId(7),
      new AgentDetails({
        lastMessageNumber: new MessageNumber(0),
        securityCode: AgentCode.fromString("A7")
      })
    ]])
  },
};

export default {
  modules,
  config,
};
