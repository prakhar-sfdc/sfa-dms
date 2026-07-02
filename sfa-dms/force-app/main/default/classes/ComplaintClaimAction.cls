public with sharing class ComplaintClaimAction {

    // ─────────────────────────────────────────────
    // INPUT
    // ─────────────────────────────────────────────
    public class ClaimRequest {

        @InvocableVariable(
            label='Distributor Email'
            description='Registered email address of the distributor. Used to fetch their Account automatically.'
            required=true
        )
        public String distributorEmail;

        @InvocableVariable(
            label='Order Number'
            description='The order number from the distributor delivery. Example: ORD-00123'
            required=true
        )
        public String orderNumber;

        @InvocableVariable(
            label='Product Name'
            description='Name or partial name of the damaged product. Example: Cement OPC 53'
            required=true
        )
        public String productName;

        @InvocableVariable(
            label='Damaged Quantity'
            description='Number of units reported as damaged by the distributor'
            required=true
        )
        public Integer damagedQuantity;

        @InvocableVariable(
            label='Case Subject'
            description='Short subject line for the complaint. Example: Damaged bags received in last delivery'
            required=true
        )
        public String caseSubject;

        @InvocableVariable(
            label='Case Description'
            description='Detailed description of the complaint in the distributor\'s own words.'
            required=true
        )
        public String caseDescription;

        @InvocableVariable(
            label='Delivery Date'
            description='Date when the distributor received the delivery. Optional.'
            required=false
        )
        public Date deliveryDate;


    }

    // ─────────────────────────────────────────────
    // OUTPUT
    // ─────────────────────────────────────────────
    public class ClaimResult {

        @InvocableVariable(label='Success')
        public Boolean isSuccess;

        @InvocableVariable(label='Error Message')
        public String errorMessage;

        @InvocableVariable(label='Case Number')
        public String caseNumber;

        @InvocableVariable(label='Case ID')
        public Id caseId;

        @InvocableVariable(label='Priority')
        public String priority;

        @InvocableVariable(label='Claim Amount')
        public Decimal claimAmount;

        @InvocableVariable(label='SLA Commitment')
        public String slaCommitment;

        @InvocableVariable(label='Resolved Product Name')
        public String resolvedProductName;

        @InvocableVariable(label='Confirmed Order Number')
        public String confirmedOrderNumber;

        @InvocableVariable(label='Distributor Name')
        public String distributorName;
    }

    // ─────────────────────────────────────────────
    // ENTRY POINT
    // ─────────────────────────────────────────────
    @InvocableMethod(
        label='File Complaint or Claim'
        description='Fetches distributor account by email, creates a damaged goods claim Case linked to Order and Product. Returns case number, claim amount, priority, and SLA commitment.'
        category='Complaint Management'
    )
    public static List<ClaimResult> fileClaim(List<ClaimRequest> requests) {
        List<ClaimResult> results = new List<ClaimResult>();
        for (ClaimRequest req : requests) {
            results.add(process(req));
        }
        return results;
    }

    // ─────────────────────────────────────────────
    // CORE LOGIC
    // ─────────────────────────────────────────────
    private static ClaimResult process(ClaimRequest req) {

        ClaimResult result = new ClaimResult();
        result.isSuccess = false;

        // ── 1. Validate required inputs ──
        if (String.isBlank(req.distributorEmail)) {
            result.errorMessage = 'Email address is required to file a claim.';
            return result;
        }
        if (String.isBlank(req.orderNumber)) {
            result.errorMessage = 'Order number is required to file a claim.';
            return result;
        }
        if (String.isBlank(req.productName)) {
            result.errorMessage = 'Product name is required to file a claim.';
            return result;
        }
        if (req.damagedQuantity == null || req.damagedQuantity <= 0) {
            result.errorMessage = 'Please provide the number of damaged units.';
            return result;
        }
        if (String.isBlank(req.caseSubject)) {
            result.errorMessage = 'A subject is required to file a claim.';
            return result;
        }
        if (String.isBlank(req.caseDescription)) {
            result.errorMessage = 'A description is required to file a claim.';
            return result;
        }

        // ── 2. Fetch Account by Email ──
        // First try Contact email → get Account
        List<Contact> contacts = [
            SELECT Id, AccountId, Account.Name
            FROM   Contact
            WHERE  Email = :req.distributorEmail.trim()
              AND  AccountId != null
            LIMIT  1
        ];

        Id accountId;
        String accountName;

        if (!contacts.isEmpty()) {
            accountId   = contacts[0].AccountId;
            accountName = contacts[0].Account.Name;
        } else {
            // Fallback — try Account email field directly
            List<Account> accounts = [
                SELECT Id, Name
                FROM   Account
                WHERE  Email__c    = :req.distributorEmail.trim()
                LIMIT  1
            ];
            if (accounts.isEmpty()) {
                result.errorMessage = 'No distributor account found for email "'
                    + req.distributorEmail + '". '
                    + 'Please verify the email address and try again.';
                return result;
            }
            accountId   = accounts[0].Id;
            accountName = accounts[0].Name;
        }

        // ── 3. Find Order under this Account ──
        List<Order> orders = [
            SELECT Id, OrderNumber, AccountId
            FROM   Order
            WHERE  OrderNumber = :req.orderNumber.trim()
              AND  AccountId   = :accountId
            LIMIT  1
        ];
        if (orders.isEmpty()) {
            result.errorMessage = 'Order "' + req.orderNumber
                + '" was not found under your account. '
                + 'Please double-check the order number.';
            return result;
        }

        // ── 4. Find Product ──
        List<Product2> products = [
            SELECT Id, Name
            FROM   Product2
            WHERE  Name     LIKE :('%' + req.productName.trim() + '%')
              AND  IsActive = true
            LIMIT  1
        ];
        if (products.isEmpty()) {
            result.errorMessage = 'Product "' + req.productName
                + '" was not found. '
                + 'Please check the product name and try again.';
            return result;
        }

        // ── 5. Get Unit Price ──
        Decimal unitPrice = 0;
        List<PricebookEntry> pbes = [
            SELECT UnitPrice
            FROM   PricebookEntry
            WHERE  Product2Id            = :products[0].Id
              AND  IsActive              = true
              AND  Pricebook2.IsStandard = true
            LIMIT  1
        ];
        if (!pbes.isEmpty()) {
            unitPrice = pbes[0].UnitPrice;
        }

        Decimal claimAmount = req.damagedQuantity * unitPrice;

        // ── 6. Priority + SLA Logic ──
        String priority;
        String sla;

        if (req.damagedQuantity >= 100) {
            priority = 'Critical';
            sla      = '24 hours';
        } else if (req.damagedQuantity >= 50) {
            priority = 'High';
            sla      = '48 hours';
        } else if (req.damagedQuantity >= 10) {
            priority = 'Medium';
            sla      = '72 hours';
        } else {
            priority = 'Low';
            sla      = '5 business days';
        }

        // ── 7. Create Case ──
        Case c = new Case(
            Subject              = req.caseSubject,
            Description          = req.caseDescription,
            Status               = 'New',
            Priority             = priority,
            Origin               = 'Chat',
            Type                 = 'Claim',
            AccountId            = accountId,
            Order__c             = orders[0].Id,
            Product__c   = products[0].Id,
            Quantity_Damaged__c  = req.damagedQuantity,
            Claim_Amount__c      = claimAmount,
            Claim_Status__c      = 'Open'
        );
        insert c;

        // ── 8. Re-query for Case Number ──
        c = [SELECT Id, CaseNumber FROM Case WHERE Id = :c.Id];

        // ── 9. Return Result ──
        result.isSuccess            = true;
        result.caseId               = c.Id;
        result.caseNumber           = c.CaseNumber;
        result.priority             = priority;
        result.claimAmount          = claimAmount;
        result.slaCommitment        = sla;
        result.resolvedProductName  = products[0].Name;
        result.confirmedOrderNumber = orders[0].OrderNumber;
        result.distributorName      = accountName;

        return result;
    }
}