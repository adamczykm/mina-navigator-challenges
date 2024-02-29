# February 2024: Mina Navigators Challenge

### Explanation of the solution

#### Why there's no dispatching of a single message?

The Challenge content states that the spy master receives messages that arrive of batches of 50-200.
Nowhere is stated that the spy master can receive a single message.
Therefore we can assume that the structure with which the spy master gets in contact with is just 
an array of messages.

#### Storing the highest processed number

The requirement is that there's a contract that stores the highest message number of the processed 
messages.

#### Duplicate messages

Given my interpretation of the challenge2 requirements "processing" a duplicate is a no-op.
It will not stop the processing.
The details do not need to be checked (as stated in the challenge2 description) and the 
contract state will not be updated anyway.

#### Auxilliary ZkProgram for processing the batches.

It makes sense to process the batch offline and only then make updates to the contract with proofs
resulting from batch processing. This allows lesser number of transactions and dividing the batches
into smaller chunks - necessary because of the "low spec hardware requirement".

#### Feedback on the challenge.

It's nice that the challenges are not too simple and one needs to think what actually needs to be implemented.
However there's definitely a lot of space of unambiguity in the understanding of the challenge's requirements.
