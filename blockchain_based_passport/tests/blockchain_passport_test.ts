import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure that contract owner can add passport authorities",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(wallet1.address),
                types.utf8("Government Authority")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify authority was added
        let authorityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-authority', 
            [types.principal(wallet1.address)], deployer.address);
        assertEquals(authorityCheck.result, types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that non-owner cannot add authorities",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let wallet1 = accounts.get('wallet_1')!;
        let wallet2 = accounts.get('wallet_2')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(wallet2.address),
                types.utf8("Unauthorized Authority")
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1)); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that duplicate authorities cannot be added",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(wallet1.address),
                types.utf8("First Authority")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(wallet1.address),
                types.utf8("Duplicate Authority")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        assertEquals(block.receipts[1].result.expectErr(), types.uint(3)); // err-already-exists
    },
});

Clarinet.test({
    name: "Ensure that authorities can be removed by owner",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Add authority first
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(wallet1.address),
                types.utf8("Temporary Authority")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Remove authority
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'remove-authority', [
                types.principal(wallet1.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify authority is no longer active
        let authorityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-authority', 
            [types.principal(wallet1.address)], deployer.address);
        assertEquals(authorityCheck.result, types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that removing non-existent authority fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'remove-authority', [
                types.principal(wallet1.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(4)); // err-not-found
    },
});

Clarinet.test({
    name: "Ensure that authorized authorities can issue passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let citizen = accounts.get('wallet_2')!;
        
        // Add authority
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address)
        ]);
        
        // Issue passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("PP123456789"),
                types.principal(citizen.address),
                types.utf8("John Doe"),
                types.uint(19900101), // Date of birth
                types.utf8("United States"),
                types.uint(3650), // 10 years validity (blocks)
                types.some(types.utf8("https://metadata.example.com/passport1"))
            ], authority.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify passport was created
        let passportResult = chain.callReadOnlyFn('blockchain_passport', 'get-passport', 
            [types.utf8("PP123456789")], authority.address);
        let passport = passportResult.result.expectSome().expectTuple();
        assertEquals(passport['holder'], citizen.address);
        assertEquals(passport['full-name'], types.utf8("John Doe"));
        assertEquals(passport['nationality'], types.utf8("United States"));
        assertEquals(passport['is-valid'], types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that non-authorities cannot issue passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let unauthorized = accounts.get('wallet_1')!;
        let citizen = accounts.get('wallet_2')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("PP987654321"),
                types.principal(citizen.address),
                types.utf8("Jane Doe"),
                types.uint(19850515),
                types.utf8("Canada"),
                types.uint(3650),
                types.none()
            ], unauthorized.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1)); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that duplicate passport IDs cannot be issued",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let citizen1 = accounts.get('wallet_2')!;
        let citizen2 = accounts.get('wallet_3')!;
        
        // Add authority
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address)
        ]);
        
        // Issue first passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("DUPLICATE123"),
                types.principal(citizen1.address),
                types.utf8("First Person"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(3650),
                types.none()
            ], authority.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Try to issue duplicate passport ID
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("DUPLICATE123"), // Same ID
                types.principal(citizen2.address),
                types.utf8("Second Person"),
                types.uint(19950101),
                types.utf8("Country B"),
                types.uint(3650),
                types.none()
            ], authority.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(3)); // err-already-exists
    },
});

Clarinet.test({
    name: "Ensure that one holder cannot have multiple passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let citizen = accounts.get('wallet_2')!;
        
        // Add authority
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address)
        ]);
        
        // Issue first passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("FIRST123"),
                types.principal(citizen.address),
                types.utf8("John Doe"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(3650),
                types.none()
            ], authority.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Try to issue second passport to same holder
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("SECOND456"),
                types.principal(citizen.address), // Same holder
                types.utf8("John Doe"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(3650),
                types.none()
            ], authority.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(3)); // err-already-exists
    },
});

Clarinet.test({
    name: "Ensure that passport validity check works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let citizen = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("VALID123"),
                types.principal(citizen.address),
                types.utf8("John Doe"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(100), // Short validity for testing
                types.none()
            ], authority.address)
        ]);
        
        // Check validity (should be valid initially)
        let validityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', 
            [types.utf8("VALID123")], authority.address);
        assertEquals(validityCheck.result, types.bool(true));
        
        // Mine blocks to expire passport
        for (let i = 0; i < 101; i++) {
            chain.mineBlock([]);
        }
        
        // Check validity after expiration (should be invalid)
        validityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', 
            [types.utf8("VALID123")], authority.address);
        assertEquals(validityCheck.result, types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that authorities can revoke passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let citizen = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("REVOKE123"),
                types.principal(citizen.address),
                types.utf8("John Doe"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(3650),
                types.none()
            ], authority.address)
        ]);
        
        // Verify passport is initially valid
        let validityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', 
            [types.utf8("REVOKE123")], authority.address);
        assertEquals(validityCheck.result, types.bool(true));
        
        // Revoke passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'revoke-passport', [
                types.utf8("REVOKE123")
            ], authority.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify passport is now invalid
        validityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', 
            [types.utf8("REVOKE123")], authority.address);
        assertEquals(validityCheck.result, types.bool(false));
        
        // Verify passport still exists but is marked invalid
        let passportResult = chain.callReadOnlyFn('blockchain_passport', 'get-passport', 
            [types.utf8("REVOKE123")], authority.address);
        let passport = passportResult.result.expectSome().expectTuple();
        assertEquals(passport['is-valid'], types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that non-authorities cannot revoke passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let unauthorized = accounts.get('wallet_2')!;
        let citizen = accounts.get('wallet_3')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("PROTECT123"),
                types.principal(citizen.address),
                types.utf8("John Doe"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(3650),
                types.none()
            ], authority.address)
        ]);
        
        // Try to revoke from unauthorized account
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'revoke-passport', [
                types.utf8("PROTECT123")
            ], unauthorized.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(1)); // err-unauthorized
    },
});

Clarinet.test({
    name: "Ensure that passport metadata can be updated",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let citizen = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("UPDATE123"),
                types.principal(citizen.address),
                types.utf8("John Doe"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(3650),
                types.some(types.utf8("https://old-metadata.com"))
            ], authority.address)
        ]);
        
        // Update metadata
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'update-passport-metadata', [
                types.utf8("UPDATE123"),
                types.some(types.utf8("https://new-metadata.com"))
            ], authority.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify metadata was updated
        let passportResult = chain.callReadOnlyFn('blockchain_passport', 'get-passport', 
            [types.utf8("UPDATE123")], authority.address);
        let passport = passportResult.result.expectSome().expectTuple();
        assertEquals(passport['metadata-url'], types.some(types.utf8("https://new-metadata.com")));
    },
});

Clarinet.test({
    name: "Ensure that passport validity can be extended",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let citizen = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("EXTEND123"),
                types.principal(citizen.address),
                types.utf8("John Doe"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(100), // Short initial validity
                types.none()
            ], authority.address)
        ]);
        
        // Get initial expiry date
        let passportResult = chain.callReadOnlyFn('blockchain_passport', 'get-passport', 
            [types.utf8("EXTEND123")], authority.address);
        let initialPassport = passportResult.result.expectSome().expectTuple();
        let initialExpiry = initialPassport['expiry-date'];
        
        // Extend validity
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'extend-passport-validity', [
                types.utf8("EXTEND123"),
                types.uint(1000) // Extend by 1000 blocks
            ], authority.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify expiry date was extended
        passportResult = chain.callReadOnlyFn('blockchain_passport', 'get-passport', 
            [types.utf8("EXTEND123")], authority.address);
        let extendedPassport = passportResult.result.expectSome().expectTuple();
        let newExpiry = extendedPassport['expiry-date'];
        
        // New expiry should be 1000 blocks later than initial
        assertEquals(newExpiry, types.uint(Number(initialExpiry.value) + 1000));
    },
});

Clarinet.test({
    name: "Ensure that holder passport lookup works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        let citizen = accounts.get('wallet_2')!;
        
        // Add authority and issue passport
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address),
            Tx.contractCall('blockchain_passport', 'issue-passport', [
                types.utf8("LOOKUP123"),
                types.principal(citizen.address),
                types.utf8("John Doe"),
                types.uint(19900101),
                types.utf8("Country A"),
                types.uint(3650),
                types.none()
            ], authority.address)
        ]);
        
        // Test holder lookup
        let holderResult = chain.callReadOnlyFn('blockchain_passport', 'get-holder-passport', 
            [types.principal(citizen.address)], authority.address);
        assertEquals(holderResult.result.expectSome(), types.utf8("LOOKUP123"));
        
        // Test lookup for non-holder
        let nonHolderResult = chain.callReadOnlyFn('blockchain_passport', 'get-holder-passport', 
            [types.principal(authority.address)], authority.address);
        assertEquals(nonHolderResult.result.expectNone(), types.none());
    },
});

Clarinet.test({
    name: "Ensure that operations on non-existent passports fail",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let authority = accounts.get('wallet_1')!;
        
        // Add authority
        let block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'add-authority', [
                types.principal(authority.address),
                types.utf8("Passport Office")
            ], deployer.address)
        ]);
        
        // Try operations on non-existent passport
        block = chain.mineBlock([
            Tx.contractCall('blockchain_passport', 'revoke-passport', [
                types.utf8("NONEXISTENT")
            ], authority.address),
            Tx.contractCall('blockchain_passport', 'update-passport-metadata', [
                types.utf8("NONEXISTENT"),
                types.some(types.utf8("https://metadata.com"))
            ], authority.address),
            Tx.contractCall('blockchain_passport', 'extend-passport-validity', [
                types.utf8("NONEXISTENT"),
                types.uint(1000)
            ], authority.address)
        ]);
        
        // All should fail with not-found error
        assertEquals(block.receipts[0].result.expectErr(), types.uint(4)); // err-not-found
        assertEquals(block.receipts[1].result.expectErr(), types.uint(4)); // err-not-found
        assertEquals(block.receipts[2].result.expectErr(), types.uint(4)); // err-not-found
    },
});

Clarinet.test({
    name: "Ensure that passport validity check handles non-existent passports",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        
        // Check validity of non-existent passport
        let validityCheck = chain.callReadOnlyFn('blockchain_passport', 'is-valid-passport?', 
            [types.utf8("NONEXISTENT")], deployer.address);
        assertEquals(validityCheck.result, types.bool(false));
        
        // Check passport retrieval for non-existent passport
        let passportResult = chain.callReadOnlyFn('blockchain_passport', 'get-passport', 
            [types.utf8("NONEXISTENT")], deployer.address);
        assertEquals(passportResult.result.expectNone(), types.none());
    },
});