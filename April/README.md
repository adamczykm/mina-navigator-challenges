# Mina Navigators L2E Challenge #4

The repository contains slightly modified skeleton obtained by cloning ProtoKit starter-pack.
The solution to the challenge is in `./packages/chain/src/message-box-private.ts` (+ config in runtime.ts).
The tests to the challenge are in `./packages/chain/test/message-box-private.test.ts`

It is based by requirements on `./packages/chain/src/message-box.ts`

To see it in the works run tests `npm run test` in `./packages/chain`.
npx pnpm install && npx pnpm run build && npx pnpm run test --verbose true

## Some doubts

>
> Write a test to get the details (as above) for a particular block height.
>

I've had doubts on this requirement, i've consulted Laurence and my understanding
is that I should simply verify that the new transaction details state is
being stored. Which is done in one of the tests, namely here

line 129-131:
```
    expect(txInfo.blockHeight.equals(UInt64.from(block!.height)).toBoolean()).toBe(true);
    expect(txInfo.msgSenderPubKey.equals(agentPublicKey).toBoolean()).toBe(true);
    expect(txInfo.msgTxNonce.equals(UInt64.from(1)).toBoolean()).toBe(true);
```

The potential alternative understanding is to create a query that takes a block height
as a parameter and then queries for all agents and leaves only the ones that submitted their
last message at that block height, but this seemed like a stretch in interpretation
so i decided to stick with the straightforward understanding.

## Run it

NOTE: follow the instructions in protokit starter kit to setup workspace and dependencies:
```
nvm use
pnpm install
```

And then run tests to see the implementation in action:

```
npx pnpm run build && npx pnpm run test --verbose true
```

