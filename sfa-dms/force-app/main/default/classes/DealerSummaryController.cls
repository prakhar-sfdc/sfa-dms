public with sharing class DealerSummaryController {

    // ── Wrappers ──────────────────────────────────────────
    public class SummaryWrapper {
        @AuraEnabled public Decimal totalOrdersAmount  = 0;
        @AuraEnabled public Decimal totalPayments      = 0;
        @AuraEnabled public Decimal totalCreditNotes   = 0;
        @AuraEnabled public Decimal totalDebitNotes    = 0;
    }

    public class OrderWrapper {
        @AuraEnabled public Id      orderId;
        @AuraEnabled public String  orderNumber;
        @AuraEnabled public Date    orderDate;
        @AuraEnabled public String  status;
        @AuraEnabled public Decimal netAmount;
        @AuraEnabled public List<OrderItemWrapper> items;
    }

    public class OrderItemWrapper {
        @AuraEnabled public String  productName;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Decimal unitPrice;
        @AuraEnabled public Decimal totalPrice;
    }

    public class PaymentWrapper {
        @AuraEnabled public String  paymentName;
        @AuraEnabled public Date    paymentDate;
        @AuraEnabled public String  mode;
        @AuraEnabled public String  status;
        @AuraEnabled public Decimal amount;
    }

    public class AdjustmentWrapper {
        @AuraEnabled public String  name;
        @AuraEnabled public Date    adjustmentDate;
        @AuraEnabled public String  type;
        @AuraEnabled public String  reason;
        @AuraEnabled public Decimal amount;
    }

    // ── Summary (existing) ────────────────────────────────
    @AuraEnabled(cacheable=true)
    public static SummaryWrapper getDealerSummary(Id accountId) {
        SummaryWrapper res = new SummaryWrapper();

        for (AggregateResult ar : [
            SELECT SUM(Net_Amount__c) total FROM Order WHERE AccountId = :accountId
        ]) { res.totalOrdersAmount = (Decimal) ar.get('total'); }

        for (AggregateResult ar : [
            SELECT SUM(Amount__c) total FROM Payment__c
            WHERE Account__c = :accountId AND Status__c != 'Cancelled'
        ]) { res.totalPayments = (Decimal) ar.get('total'); }

        for (AggregateResult ar : [
            SELECT SUM(Amount__c) total FROM Financial_Adjustment__c
            WHERE Account__c = :accountId AND Type__c = 'Credit Note'
        ]) { res.totalCreditNotes = (Decimal) ar.get('total'); }

        for (AggregateResult ar : [
            SELECT SUM(Amount__c) total FROM Financial_Adjustment__c
            WHERE Account__c = :accountId AND Type__c = 'Debit Note'
        ]) { res.totalDebitNotes = (Decimal) ar.get('total'); }

        return res;
    }

    // ── Orders with line items ────────────────────────────
    @AuraEnabled(cacheable=true)
    public static List<OrderWrapper> getDealerOrders(Id accountId) {
        List<OrderWrapper> result = new List<OrderWrapper>();

        for (Order o : [
            SELECT Id, OrderNumber, EffectiveDate, Status, Net_Amount__c,
            (
                SELECT PricebookEntry.Product2.Name, Quantity,
                       UnitPrice, TotalPrice
                FROM OrderItems
            )
            FROM Order
            WHERE AccountId = :accountId
            ORDER BY EffectiveDate DESC
        ]) {
            OrderWrapper ow  = new OrderWrapper();
            ow.orderId       = o.Id;
            ow.orderNumber   = o.OrderNumber;
            ow.orderDate     = o.EffectiveDate;
            ow.status        = o.Status;
            ow.netAmount     = o.Net_Amount__c;
            ow.items         = new List<OrderItemWrapper>();

            for (OrderItem oi : o.OrderItems) {
                OrderItemWrapper iw = new OrderItemWrapper();
                iw.productName  = oi.PricebookEntry.Product2.Name;
                iw.quantity     = oi.Quantity;
                iw.unitPrice    = oi.UnitPrice;
                iw.totalPrice   = oi.TotalPrice;
                ow.items.add(iw);
            }

            result.add(ow);
        }
        return result;
    }

    // ── Payments ──────────────────────────────────────────
    @AuraEnabled(cacheable=true)
    public static List<PaymentWrapper> getDealerPayments(Id accountId) {
        List<PaymentWrapper> result = new List<PaymentWrapper>();

        for (Payment__c p : [
            SELECT Name, Payment_Date__c, Payment_Mode__c, Status__c, Amount__c
            FROM Payment__c
            WHERE Account__c = :accountId
            AND Status__c != 'Cancelled'
            ORDER BY Payment_Date__c DESC
        ]) {
            PaymentWrapper pw = new PaymentWrapper();
            pw.paymentName   = p.Name;
            pw.paymentDate   = p.Payment_Date__c;
            pw.mode          = p.Payment_Mode__c;
            pw.status        = p.Status__c;
            pw.amount        = p.Amount__c;
            result.add(pw);
        }
        return result;
    }

    // ── Credit & Debit Notes ──────────────────────────────
    @AuraEnabled(cacheable=true)
    public static List<AdjustmentWrapper> getDealerAdjustments(Id accountId, String type) {
        List<AdjustmentWrapper> result = new List<AdjustmentWrapper>();

        for (Financial_Adjustment__c fa : [
            SELECT Name, Issue_Date__c, Type__c, Reason__c, Amount__c
            FROM Financial_Adjustment__c
            WHERE Account__c = :accountId
            AND Type__c = :type
            ORDER BY Issue_Date__c DESC
        ]) {
            AdjustmentWrapper aw = new AdjustmentWrapper();
            aw.name           = fa.Name;
            aw.adjustmentDate = fa.Issue_Date__c;
            aw.type           = fa.Type__c;
            aw.reason         = fa.Reason__c;
            aw.amount         = fa.Amount__c;
            result.add(aw);
        }
        return result;
    }
}