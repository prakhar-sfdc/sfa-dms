/**
 * @description Apex Controller for the Sub Order Tracker LWC
 *              Handles data retrieval and status transitions for Sub Orders
 *              on the Experience Cloud site.
 */
public with sharing class SubOrderTrackerController {

    // ─────────────────────────────────────────────
    // Wrapper Classes
    // ─────────────────────────────────────────────

    public class SubOrderWrapper {
        @AuraEnabled public Sub_Order__c subOrder;
        @AuraEnabled public List<Sub_Order_Product__c> products;
        @AuraEnabled public List<Sub_Order_Transaction__c> transactions;
        @AuraEnabled public Decimal totalQuantity;
    }

    public class TransactionInput {
        @AuraEnabled public String  subOrderId;
        @AuraEnabled public String  currentStatus;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public String  contentDocumentId;
        @AuraEnabled public String  remarks;
    }

    // ─────────────────────────────────────────────
    // READ — Get full sub order details
    // ─────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static SubOrderWrapper getSubOrderDetails(String subOrderId) {
        if (String.isBlank(subOrderId)) {
            throw new AuraHandledException('Sub Order ID is required.');
        }

        SubOrderWrapper wrapper = new SubOrderWrapper();

        // Fetch Sub Order
        wrapper.subOrder = [
            SELECT  Id, Name, Status__c,
                    Order__c, Order__r.Name,
                    Account__c, Account__r.Name,
                    Order_Date__c, Quantity__c, Cost__c
            FROM    Sub_Order__c
            WHERE   Id = :subOrderId
            LIMIT   1
        ];

        // Fetch Products
        wrapper.products = [
            SELECT  Id, Name,
                    Product__c, Product__r.Name,
                    Product_Quantity__c,
                    Unit_Price__c, Total_Amount__c
            FROM    Sub_Order_Product__c
            WHERE   Sub_Order__c = :subOrderId
            ORDER BY Name ASC
        ];

        // Compute total quantity from products
        Decimal total = 0;
        for (Sub_Order_Product__c p : wrapper.products) {
            if (p.Product_Quantity__c != null) {
                total += p.Product_Quantity__c;
            }
        }
        wrapper.totalQuantity = total;

        // Fetch all transactions for history
        wrapper.transactions = [
            SELECT  Id, Name, Transaction_Type__c, Quantity__c,
                    Transaction_Date__c, Video_Attachment_Id__c, Remarks__c
            FROM    Sub_Order_Transaction__c
            WHERE   Sub_Order__c = :subOrderId
            ORDER BY CreatedDate ASC
        ];

        return wrapper;
    }

    // ─────────────────────────────────────────────
    // WRITE — Submit a transaction (status transition)
    // ─────────────────────────────────────────────

    @AuraEnabled
    public static String submitTransaction(TransactionInput input) {
        if (input == null || String.isBlank(input.subOrderId)) {
            throw new AuraHandledException('Invalid input.');
        }

        // Determine transition
        String transactionType;
        String newStatus;

        if (input.currentStatus == 'Processing') {
            transactionType = 'Dispatch';
            newStatus       = 'Dispatched';
        } else if (input.currentStatus == 'Dispatched') {
            transactionType = 'Delivery';
            newStatus       = 'Delivered';
        } else if (input.currentStatus == 'Delivered') {
            transactionType = 'Return';
            newStatus       = 'Returned';
        } else {
            throw new AuraHandledException('Sub order is already in a final state.');
        }

        Savepoint sp = Database.setSavepoint();
        try {
            // 1. Create transaction log
            Sub_Order_Transaction__c txn = new Sub_Order_Transaction__c(
                Sub_Order__c           = input.subOrderId,
                Transaction_Type__c    = transactionType,
                Quantity__c            = input.quantity,
                Transaction_Date__c    = DateTime.now(),
                Video_Attachment_Id__c = input.contentDocumentId,
                Remarks__c             = input.remarks
            );
            insert txn;

            // 2. Update Sub Order status
            Sub_Order__c subOrder = new Sub_Order__c(
                Id        = input.subOrderId,
                Status__c = newStatus
            );
            update subOrder;

            return newStatus;

        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('Transaction failed: ' + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────
    // READ — Get video download URL for a transaction
    // ─────────────────────────────────────────────

    @AuraEnabled(cacheable=true)
    public static String getVideoDownloadUrl(String contentDocumentId) {
        if (String.isBlank(contentDocumentId)) return null;
        try {
            ContentVersion cv = [
                SELECT Id, Title, FileExtension
                FROM   ContentVersion
                WHERE  ContentDocumentId = :contentDocumentId
                  AND  IsLatest = true
                LIMIT  1
            ];
            return '/sfc/servlet.shepherd/document/download/' + contentDocumentId;
        } catch (Exception e) {
            return null;
        }
    }
}