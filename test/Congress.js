const web3 = global.web3;

contract('Congress', function(accounts) {

    //Congress initial params for testing
    const congressInitialParams = {
        minimumQuorumForProposals: 3,
        minutesForDebate: 5,
        marginOfVotesForMajority: 2,
        congressLeader: accounts[0]
    };
    //Proposal params for testing
    const proposalParams = {
        beneficiary: accounts[9],
        etherAmount: 1,
        JobDescription: 'Some job description',
        transactionBytecode: web3.sha3('some content')
    };

    //positions of field from Proposal struct
    // struct Proposal {
    //     address recipient;
    //     uint amount;
    //     string description;
    //     uint votingDeadline;
    //     bool executed;
    //     bool proposalPassed;
    //     uint numberOfVotes;
    //     int currentResult;
    //     bytes32 proposalHash;
    //     Vote[] votes;
    //     mapping (address => bool) voted;
    // }
    const PROPOSAL_VOTING_DEADLINE_FIELD = 3;
    const PROPOSAL_EXECUTED_FIELD = 4;
    const PROPOSAL_PASSED_FIELD = 4;
    const PROPOSAL_NUMBER_OF_VOTES_FIELD = 6;
    const PROPOSAL_CURRENT_RESULT = 7;

    let congress;

    //create new smart contract instance before each test method
    beforeEach(async function() {
        congress = await Congress.new(...Object.values(congressInitialParams), {
            value: web3.toWei(2, 'ether') // money for proposals
        });
    });

    it("should set initial attributes", async function() {
        assert.equal(await congress.minimumQuorum(), congressInitialParams.minimumQuorumForProposals);
        assert.equal(await congress.debatingPeriodInMinutes(), congressInitialParams.minutesForDebate);
        assert.equal(await congress.majorityMargin(), congressInitialParams.marginOfVotesForMajority);

        //by default tx goes from accounts[0]
        assert.equal(await congress.owner(), accounts[0]);
    });


    it("should allow owner to add members", async function() {
        //try  to add 3 members
        for (let i = 1; i <= 3; i++) {
            let addResult = await congress.addMember(accounts[i], 'Name for account ' + i);

            //members array positions starts from 2.
            //members[0] - empty, members[1] - owner/founder, who deployed contract
            let memberInfoFromContract = await congress.members(i + 1);

            assert.equal(memberInfoFromContract[0], accounts[i]);
            assert.equal(memberInfoFromContract[1], 'Name for account ' + i);
        }
    });


    it("should disallow no owner to add members", async function() {
        let addError;
        try {
            //contract throws error here
            await congress.addMember(accounts[1], 'Name for account 1', {
                from: accounts[9]
            });
        } catch (error) {
            addError = error;
        }
        assert.notEqual(addError, undefined, 'Error must be thrown');
        assert.isAbove(addError.message.search('invalid JUMP'), -1, 'invalid JUMP error must be returned');
    });


    it("should set member attribute 'memberSince' (uint) equal to block creation", async function() {
        let addResultTx = await congress.addMember(accounts[5], 'Name for account 5');
        let memberInfoFromContract = await congress.members(2);

        //Information about block by tx id, returned by "addMember" changing state method
        let block = web3.eth.getBlock(web3.eth.getTransactionReceipt(addResultTx).blockNumber);

        //3rd attr of "Member" struct - now , m
        assert.equal(memberInfoFromContract[2], block.timestamp);
    });


    it("should fire event 'ProposalAdded' when member add proposal", async function() {
        let proposedAddedEvetListener = congress.ProposalAdded();

        await congress.addMember(accounts[5], 'Name for account 5');
        await congress.newProposal(...Object.values(proposalParams), {
            from: accounts[5]
        });

        let proposalAddedLog = await new Promise(
            (resolve, reject) => proposedAddedEvetListener.get(
                (error, log) => error ? reject(error) : resolve(log)
            ));

        assert.equal(proposalAddedLog.length, 1, 'should be 1 event');

        let eventArgs = proposalAddedLog[0].args;
        assert.equal(eventArgs.proposalID, 0);
        assert.equal(eventArgs.recipient, proposalParams.beneficiary);
        assert.equal(eventArgs.amount, proposalParams.etherAmount);
        assert.equal(eventArgs.description, proposalParams.JobDescription);
    });



    it("should pay for executed proposal", async function() {

        let curAccount9Balance = web3.eth.getBalance(accounts[9]).toNumber();

        //proposal votingDeadline = now + debatingPeriodInMinutes (2 - set in Congres constructor)* 1 minutes;
        await congress.newProposal(...Object.values(proposalParams), {
            from: accounts[0] //account[0] already member
        });

        // we need minimumQuorumForProposals = 3 votes (setted in constructor)
        // so add 3 members and vote
        for (let i of[3, 4, 5]) {
            await congress.addMember(accounts[i], 'Name for account ' + i);
            //vote from account[i] for proposal with position = 0, with support = true
            await congress.vote(0, true, 'Some justification text from account ' + i, {
                from: accounts[i]
            });
        }


        let curProposalState = await congress.proposals(0);

        // increase time for 10 minutes, more then minutesForDebate (5)
        let incrTime = await new Promise((resolve, reject) => {
            web3.currentProvider.sendAsync({
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [10 * 600],
                id: new Date().getTime()
            }, (error, result) => {
                return error ? reject(error) : resolve(result.result);
            });

        });

        //check that we are ready for execute proposal
        assert.equal(curProposalState[PROPOSAL_EXECUTED_FIELD], false, 'proposal not yet executed');
        assert.equal(curProposalState[PROPOSAL_NUMBER_OF_VOTES_FIELD], 3, 'proposal now have 3 votes');
        assert.isAtLeast(curProposalState[PROPOSAL_NUMBER_OF_VOTES_FIELD],
            congressInitialParams.minimumQuorumForProposals,
            'current proposal votes amount is more or even to minimumQuorumForProposals');
        assert.isAbove(curProposalState[PROPOSAL_CURRENT_RESULT],
            congressInitialParams.marginOfVotesForMajority,
            'current proposal result is more or even to marginOfVotesForMajority');
        assert.isNotOk(curProposalState[PROPOSAL_PASSED_FIELD]);

        assert.isOk(await congress.checkProposalCode(
            0, proposalParams.beneficiary, proposalParams.etherAmount, proposalParams.transactionBytecode));

        //so we have all conditions for executig proposal:
        //3 votes for proposal, time more then "minutesForDebate"
        //method executeProposal for proposal 0 should work
        await congress.executeProposal(0, proposalParams.transactionBytecode);

        let newAccount9Balance = web3.eth.getBalance(accounts[9]).toNumber();
        assert.equal(web3.fromWei(newAccount9Balance - curAccount9Balance, 'ether'), proposalParams.etherAmount,
            'balance of acccount[9] must increase to proposalParams.etherAmount');

        let newProposalState = await congress.proposals(0);
        assert.isOk(newProposalState[PROPOSAL_PASSED_FIELD]);

    });

});
