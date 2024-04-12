# Mina Navigators L2E Challenge #3 - March/April

The repository contains slightly modified skeleton obtained by cloning ProtoKit starter-pack.
The solution to the challenge is in `./packages/chain/src/message-box.ts` (+ config in runtime.ts).
The tests to the challenge are in `./packages/chain/test/message-box.test.ts`
To see it in the works run tests `npm run test` in `./packages/chain`.

NOTE: follow the instructions in protokit starter kit to setup workspace and dependencies:
```
nvm use
pnpm install
```

## The answer to the privacy questions?

### Privacy concerns

The spy master is correct to be worried about the privacy.
The implemented solution is not private.
The contents of messages are visible in transactions.
The sequencer has a full visibility of messages being processed.
The sequencer by default allows to read all txs/messages to any user.
In other words - messages and their content are publicly available.

### How to deal with this situation?

In order to make messages private they should be processed in a verifiable computation done at the agent-side,
and only the proof of the computation should be sent. All the current message constaint could be checked this way
and the state of system could be updated accordingly without revealing sensitive information.
Additionally the state of the runtime module should be hiding at least the agents security codes.
The system state is transparent to the sequencer's host and users.
If the content of valid messages should be available to the spy master, the agents should also be able to
provide it in an encrypted form and not in plain-text.

