const testUtil = require('solidity-test-util');

contract('Congress with using solidity-test-util', function(accounts) {

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

    //use testUtil.assertThrow
    it("should disallow no owner to add members", async function() {
        await testUtil.assertThrow(() => congress.addMember(accounts[1], 'Name for account 1', {
            from: accounts[9]
        }));
    });


    //use testUtil.getEventLog
    it("should fire event 'ProposalAdded' when member add proposal", async function() {
        await congress.addMember(accounts[5], 'Name for account 5');
        await congress.newProposal(...Object.values(proposalParams), {
            from: accounts[5]
        });

        let proposalAddedLog = await testUtil.getEventLog(congress.ProposalAdded());
        assert.equal(proposalAddedLog.length, 1, 'should be 1 event');

        let eventArgs = proposalAddedLog[0].args;
        assert.equal(eventArgs.proposalID, 0);
        assert.equal(eventArgs.recipient, proposalParams.beneficiary);
        assert.equal(eventArgs.amount, proposalParams.etherAmount);
        assert.equal(eventArgs.description, proposalParams.JobDescription);
    });


    //use testUtil.evmIncreaseTime
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
        await testUtil.evmIncreaseTime(60*10);

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
