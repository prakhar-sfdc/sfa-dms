public with sharing class InvoiceService {

    @AuraEnabled
    public static Id generateInvoice(Id recordId) {

         if (recordId == null) {
        throw new AuraHandledException('Invalid input: recordId is required.');
    }

    // Derive object name from the recordId itself — no need to pass it from LWC
    String objectName = recordId.getSObjectType().getDescribe().getName();

        // 🔒 Prevent duplicate invoice
        if (objectName == 'Order') {
            if ([SELECT COUNT() FROM Order_Invoice__c WHERE Order__c = :recordId] > 0) {
                throw new AuraHandledException('Invoice already exists for this Order');
            }
        } else {
            if ([SELECT COUNT() FROM Order_Invoice__c WHERE Sub_Order__c = :recordId] > 0) {
                throw new AuraHandledException('Invoice already exists for this Sub Order');
            }
        }

        Order_Invoice__c invoice;

        // ================= ORDER =================
        if (objectName == 'Order') {

            Order ord = [
                SELECT Id, AccountId, BillingStreet, BillingCity,Net_Amount__c
                FROM Order
                WHERE Id = :recordId
            ];

            invoice = new Order_Invoice__c(
                Order__c = ord.Id,
                Customer__c = ord.AccountId,
                Invoice_Date__c = System.today(),
                Billing_Address__c = ord.BillingStreet + ', ' + ord.BillingCity,
                Status__c = 'Generated',
                Total_Amount__c=ord.Net_Amount__c,
                Invoice_Type__c = 'Primary'
            );

            insert invoice;

            List<OrderItem> items = [
                SELECT Product2Id, Quantity, UnitPrice
                FROM OrderItem
                WHERE OrderId = :ord.Id
            ];

            createOrderLineItems(invoice.Id, items);
        }

        // ================= SUB ORDER =================
        else if (objectName == 'Sub_Order__c') {

            Sub_Order__c so = [
                SELECT Id, Account__c
                FROM Sub_Order__c
                WHERE Id = :recordId
            ];

            invoice = new Order_Invoice__c(
                Sub_Order__c = so.Id,
                Customer__c = so.Account__c,
                Invoice_Date__c = System.today(),
                Status__c = 'Generated',
                Invoice_Type__c = 'Secondary'
            );

            insert invoice;

            List<Sub_Order_Product__c> items = [
                SELECT Product__c, Product_Quantity__c, Unit_Price__c
                FROM Sub_Order_Product__c
                WHERE Sub_Order__c = :so.Id
            ];

            createSubOrderLineItems(invoice.Id, items);
        }

        return invoice.Id;
    }

    private static void createOrderLineItems(Id invoiceId, List<OrderItem> items) {

        List<Order_Invoice_Line_Item__c> lines = new List<Order_Invoice_Line_Item__c>();
        Decimal subtotal = 0;

        for (OrderItem oi : items) {
            Decimal total = oi.Quantity * oi.UnitPrice;
            subtotal += total;

            lines.add(new Order_Invoice_Line_Item__c(
                Order_Invoice__c = invoiceId,
                Product__c = oi.Product2Id,
                Quantity__c = oi.Quantity,
                Unit_Price__c = oi.UnitPrice
            ));
        }

        insert lines;
        updateTotals(invoiceId, subtotal);
    }

    private static void createSubOrderLineItems(Id invoiceId, List<Sub_Order_Product__c> items) {

        List<Order_Invoice_Line_Item__c> lines = new List<Order_Invoice_Line_Item__c>();
        Decimal subtotal = 0;

        for (Sub_Order_Product__c sop : items) {
            Decimal total = sop.Product_Quantity__c * sop.Unit_Price__c;
            subtotal += total;

            lines.add(new Order_Invoice_Line_Item__c(
                Order_Invoice__c = invoiceId,
                Product__c = sop.Product__c,
                Quantity__c = sop.Product_Quantity__c,
                Unit_Price__c = sop.Unit_Price__c
            ));
        }

        insert lines;
        updateTotals(invoiceId, subtotal);
    }

    private static void updateTotals(Id invoiceId, Decimal subtotal) {

        Decimal tax = subtotal * 0.18;

        update new Order_Invoice__c(
            Id = invoiceId,
            Sub_Total__c = subtotal,
            Tax_Amount__c = tax,
            Total_Amount__c = subtotal + tax
        );
    }
}