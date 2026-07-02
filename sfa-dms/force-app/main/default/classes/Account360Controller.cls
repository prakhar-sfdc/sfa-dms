public with sharing class Account360Controller {

    public class Account360Wrapper {
        @AuraEnabled public Account account;
        @AuraEnabled public List<Visit__c> visits;
        @AuraEnabled public List<Order> orders;
        @AuraEnabled public List<Financial_Adjustment__c> adjustments;
        @AuraEnabled public List<Payment__c> payments;         // adjust API name if different
        @AuraEnabled public List<Order_Invoice__c> invoices;   // adjust API name if different

        @AuraEnabled public Integer totalVisits;
        @AuraEnabled public Integer totalOrders;
        @AuraEnabled public Integer completedVisits;
        @AuraEnabled public Integer pendingVisits;
        @AuraEnabled public Date lastVisitDate;
    }

    // ── Default Account ──────────────────────────────────────────
    @AuraEnabled(cacheable=true)
    public static Id getDefaultAccountId() {
        List<Account> accList = [
            SELECT Id
            FROM Account
            WHERE OwnerId = :UserInfo.getUserId()
            ORDER BY LastModifiedDate DESC
            LIMIT 1
        ];
        return accList.isEmpty() ? null : accList[0].Id;
    }

    // ── Search Accounts ──────────────────────────────────────────
    @AuraEnabled(cacheable=true)
    public static List<Account> searchAccounts(String keyword) {
        if (String.isBlank(keyword)) return new List<Account>();
        String likeKey = '%' + keyword + '%';
        return [
            SELECT Id, Name, Phone, Type, Industry, GST_Number__c, Dealer_Status__c,
                   BillingCity, BillingState, BillingCountry,Email__c,RecordType.Name
            FROM Account
            WHERE Name LIKE :likeKey
            ORDER BY LastModifiedDate DESC
            LIMIT 10
        ];
    }

    // ── Account 360 ──────────────────────────────────────────────
    @AuraEnabled(cacheable=true)
    public static Account360Wrapper getAccount360(Id accountId) {
        if (accountId == null) return null;

        Account360Wrapper wrap = new Account360Wrapper();

        // ── Account ──────────────────────────────────────────────
        wrap.account = [
            SELECT Id, Name, Phone, Type, Industry, GSTIN__c, Account_Status__c,GST_Number__c,Dealer_Status__c,Email__c,RecordType.Name,
                   AccountNumber, Owner.Name,
                   BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
                   Last_Visit_Date__c, Next_Visit_Date__c, Total_Visits_This_Month__c
            FROM Account
            WHERE Id = :accountId
            LIMIT 1
        ];

        // ── Visits ───────────────────────────────────────────────
        wrap.visits = [
            SELECT Id, Name, Visit_Date__c, Visit_Status__c, Visit_Purpose__c,
                   Check_In_Time__c, Check_out_Time__c, Actual_Duration__c,
                   Planned_Duration__c, Remarks__c, Visit_Month__c, Visit_Year__c
            FROM Visit__c
            WHERE Account__c = :accountId
            ORDER BY Visit_Date__c DESC
            LIMIT 20
        ];

        // ── Orders ───────────────────────────────────────────────
        wrap.orders = [
            SELECT Id, Name, OrderNumber, EffectiveDate, TotalAmount, Status,
                   Type, Order_Status__c, Net_Amount__c, Discounted_Amount__c,
                   Qty__c, Estimated_Delivery_Date__c, Visit__c
            FROM Order
            WHERE AccountId = :accountId
            ORDER BY CreatedDate DESC
            LIMIT 20
        ];

        // ── Financial Adjustments ────────────────────────────────
        wrap.adjustments = [
            SELECT Id, Name, Issue_Date__c, Amount__c, Type__c, Status__c,
                   Reason__c, Sub_Reasons__c, Tax_Amount__c, Total_Amount__c,
                   Remaining_Amount__c, Adjusted_Amount__c, Description__c,
                   Order__c, Order_Invoice__c
            FROM Financial_Adjustment__c
            WHERE Account__c = :accountId
            ORDER BY CreatedDate DESC
            LIMIT 20
        ];

        // ── Payments ─────────────────────────────────────────────
        // NOTE: Replace Payment__c with your actual Payment object API name if different.
        wrap.payments = [
            SELECT Id, Name, Payment_Date__c, Amount__c, Payment_Mode__c, Status__c
            FROM Payment__c
            WHERE Account__c = :accountId
            ORDER BY CreatedDate DESC
            LIMIT 20
        ];
        // wrap.payments = new List<Payment__c>(); // placeholder — uncomment query above once confirmed

        // ── Invoices ─────────────────────────────────────────────
        // NOTE: Replace Order_Invoice__c with your actual Invoice object API name if different.
        wrap.invoices = [
            SELECT Id, Name, Invoice_Date__c, Total_Amount__c, Status__c
            FROM Order_Invoice__c
            WHERE Customer__c = :accountId
            ORDER BY CreatedDate DESC
            LIMIT 20
        ];
        // wrap.invoices = new List<Order_Invoice__c>(); // placeholder — uncomment query above once confirmed

        // ── KPIs ─────────────────────────────────────────────────
        wrap.totalVisits    = wrap.visits.size();
        wrap.totalOrders = wrap.orders.size();
        wrap.completedVisits = 0;
        wrap.pendingVisits   = 0;

        for (Visit__c v : wrap.visits) {
            if (v.Visit_Status__c == 'Completed'){ wrap.completedVisits++;}
            else {wrap.pendingVisits++;}
        }

        wrap.lastVisitDate = wrap.account.Last_Visit_Date__c;

        return wrap;
    }
}