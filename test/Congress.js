const web3 = global.web3;

contract('Congress', function(accounts) {

    const congressInitialParams = {
        minimumQuorumForProposals: 3,
        minutesForDebate: 5,
        marginOfVotesForMajority: 1,
        congressLeader: accounts[0]
    };

    let congress;

    //create new smart contract instance before each test method
    beforeEach(async function() {
        congress = await Congress.new(...Object.values(congressInitialParams));
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
        const proposalParams = {
          beneficiary :   accounts[9],
          etherAmount: 100,
          JobDescription : 'Some job description',
          transactionBytecode : web3.sha3('some content')
        };

        await congress.addMember(accounts[5], 'Name for account 5');
        await congress.newProposal(...Object.values (proposalParams),  {
                from: accounts[5]
            });

        let proposalAddedLog = await new Promise(
            (resolve, reject) => proposedAddedEvetListener.get(
                (error, log) => error ? reject(error) : resolve(log)
            ));

        assert.equal(proposalAddedLog.length, 1, 'should be 1 event');

        let eventArgs = proposalAddedLog[0].args;
        assert.equal(eventArgs.proposalID , 0);
        assert.equal(eventArgs.recipient , proposalParams.beneficiary);
        assert.equal(eventArgs.amount , proposalParams.etherAmount);
        assert.equal(eventArgs.description , proposalParams.JobDescription);
    });
});
