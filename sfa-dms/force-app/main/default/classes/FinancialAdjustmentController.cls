public with sharing class FinancialAdjustmentController {

    // ✅ Fetch Order Products
    @AuraEnabled(cacheable=true)
    public static List<OrderItemWrapper> getOrderItems(Id orderId) {

        List<OrderItemWrapper> result = new List<OrderItemWrapper>();

        for (OrderItem oi : [
            SELECT Id, Quantity, UnitPrice,
                   PricebookEntry.Product2Id,
                   PricebookEntry.Product2.Name
            FROM OrderItem
            WHERE OrderId = :orderId
        ]) {
            result.add(new OrderItemWrapper(
                oi.Id,
                oi.PricebookEntry.Product2Id,
                oi.PricebookEntry.Product2.Name,
                oi.Quantity,
                oi.UnitPrice
            ));
        }

        return result;
    }

    // ✅ STEP 1 → Create Adjustment Header
    @AuraEnabled
    public static Id createAdjustmentHeader(Financial_Adjustment__c adj) {
        try {
            insert adj;
            return adj.Id;
        } catch (Exception e) {
            throw new AuraHandledException('createAdjustmentHeader failed: ' + e.getMessage());
        }
    }

    // ✅ STEP 2 → Create Line Items via JSON deserialization
    @AuraEnabled
    public static void createAdjustmentLines(Id adjId, String linesJson) {
        try {
            // ✅ Deserialize JSON string → reliable field mapping
            List<LineWrapper> lines = (List<LineWrapper>) JSON.deserialize(
                linesJson,
                List<LineWrapper>.class
            );

            System.debug('adjId => ' + adjId);
            System.debug('Lines received => ' + lines);

            List<Financial_Adjustment_Line_Item__c> lineList = new List<Financial_Adjustment_Line_Item__c>();

            for (LineWrapper lw : lines) {
                System.debug('Product: ' + lw.productId + ' | Qty: ' + lw.quantity + ' | Price: ' + lw.unitPrice);

                lineList.add(new Financial_Adjustment_Line_Item__c(
                    Adjustment__c = adjId,
                    Product__c = lw.productId,
                    Quantity__c = lw.quantity,
                    Unit_Price__c = lw.unitPrice
                ));
            }

            insert lineList;

        } catch (Exception e) {
            throw new AuraHandledException('createAdjustmentLines failed: ' + e.getMessage());
        }
    }

    // ✅ Wrapper Classes
    public class OrderItemWrapper {
        @AuraEnabled public Id orderItemId;
        @AuraEnabled public Id productId;
        @AuraEnabled public String productName;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Decimal unitPrice;

        public OrderItemWrapper(Id oiId, Id pId, String name, Decimal qty, Decimal price) {
            orderItemId = oiId;
            productId = pId;
            productName = name;
            quantity = qty;
            unitPrice = price;
        }
    }

    public class LineWrapper {
        @AuraEnabled public Id productId;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Decimal unitPrice;
    }
}