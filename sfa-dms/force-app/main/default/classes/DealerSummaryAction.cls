public with sharing class DealerSummaryAction {

    public class DealerRequest {
        @InvocableVariable(label='Dealer Name' description='Name or partial name of the dealer provided by the user.' required=true)
        public String dealerName;
    }

    public class DealerResult {
        @InvocableVariable(label='Success')
        public Boolean isSuccess;

        @InvocableVariable(label='Error Message')
        public String errorMessage;

        @InvocableVariable(label='Account Name')
        public String accountName;

        @InvocableVariable(label='Dealer Profile')
        public String dealerProfile;

        @InvocableVariable(label='Orders Summary')
        public String ordersSummary;

        @InvocableVariable(label='Products Summary')
        public String productsSummary;

        @InvocableVariable(label='Payments Summary')
        public String paymentsSummary;

        @InvocableVariable(label='Scheme Benefits')
        public String schemeBenefits;
    }

    @InvocableMethod(label='Get Dealer Summary' description='Fetches complete dealer profile including secondary orders, products, payments, and scheme benefits by dealer name.' category='Dealer Management')
    public static List<DealerResult> getDealerSummary(List<DealerRequest> requests) {
        List<DealerResult> results = new List<DealerResult>();
        for (DealerRequest req : requests) {
            results.add(process(req));
        }
        return results;
    }

    private static DealerResult process(DealerRequest req) {

        DealerResult result   = new DealerResult();
        result.isSuccess      = false;

        if (String.isBlank(req.dealerName)) {
            result.errorMessage = 'Please provide a dealer name.';
            return result;
        }

        // ── 1. Find Account ──
        List<Account> accounts = [
            SELECT Id, Name, Dealer_Code__c,
                   BillingCity, BillingState,
                   Phone, Dealer_Type__c , Territory__c
            FROM   Account
            WHERE  Name LIKE :('%' + req.dealerName.trim() + '%')
            LIMIT  1
        ];

        if (accounts.isEmpty()) {
            result.errorMessage = 'No dealer found matching "' + req.dealerName + '". Please check the name and try again.';
            return result;
        }

        Account acc        = accounts[0];
        result.accountName = acc.Name;

        // ── 2. Dealer Profile ──
        result.dealerProfile =
            'Dealer Name: ' + acc.Name + '\n'
            + 'Dealer Account Number: ' + (acc.Dealer_Code__c != null ? acc.Dealer_Code__c : 'N/A') + '\n'
            + 'Dealer Type: ' + (acc.Dealer_Type__c != null ? acc.Dealer_Type__c : 'N/A') + '\n'
            + 'Location: ' + buildLocation(acc.BillingCity, acc.BillingState) + '\n'
            + 'Phone: ' + (acc.Phone != null ? acc.Phone : 'N/A') +'\n'
			+ 'Region: '+ (acc.Territory__c != null ? acc.Territory__c : 'N/A') ;

        // ── 3. Get Secondary Record Type ──
        List<RecordType> rtList = [
            SELECT Id
            FROM   RecordType
            WHERE  SObjectType = 'Order'
              AND  Name        = 'Secondary'
            LIMIT  1
        ];
        Id secondaryRTId = rtList.isEmpty() ? null : rtList[0].Id;

        // ── 4. Fetch Orders ──
        List<Order> orders = new List<Order>();
        if (secondaryRTId != null) {
            orders = [
                SELECT Id, OrderNumber, Name,
                       TotalAmount, EffectiveDate,
                       Estimated_Delivery_Date__c,
                       Discounted_Amount__c,
                       Net_Amount__c,
                       Order_Status__c,
                       Status,
                       PoNumber,
                       (SELECT Id,
                               Product2.Name,
                               Quantity,
                               UnitPrice,
                               TotalPrice
                        FROM   OrderItems)
                FROM   Order
                WHERE  AccountId    = :acc.Id
                  AND  RecordTypeId = :secondaryRTId
                ORDER BY EffectiveDate DESC
                LIMIT  50
            ];
        }

        // ── 5. Process Orders + Products ──
        Decimal totalOrderValue    = 0;
        Decimal totalDiscountedAmt = 0;
        Decimal totalNetAmt        = 0;
        String  ordersBlock        = '';
        Set<Id> orderIds           = new Set<Id>();
        Map<String, Decimal> productQtyMap = new Map<String, Decimal>();

        for (Order o : orders) {
            orderIds.add(o.Id);

            totalOrderValue    += (o.TotalAmount != null ? o.TotalAmount : 0);
            totalDiscountedAmt += (o.Discounted_Amount__c != null ? o.Discounted_Amount__c : 0);
            totalNetAmt        += (o.Net_Amount__c != null ? o.Net_Amount__c : 0);

            ordersBlock +=
                'Order: ' + o.OrderNumber + ' | ' + o.Name + '\n'
                + '  Status: ' + (o.Order_Status__c != null ? o.Order_Status__c : o.Status) + '\n'
                + '  Start Date: ' + formatDate(o.EffectiveDate) + '\n'
                + '  Est. Delivery: ' + formatDate(o.Estimated_Delivery_Date__c) + '\n'
                + '  Order Amount: Rs.' + formatAmt(o.TotalAmount) + '\n'
                + '  Discount: Rs.' + formatAmt(o.Discounted_Amount__c) + '\n'
                + '  Net Amount: Rs.' + formatAmt(o.Net_Amount__c) + '\n'
                + '  PO Number: ' + (o.PoNumber != null ? o.PoNumber : 'N/A') + '\n'
                + '---\n';

            if (o.OrderItems != null) {
                for (OrderItem oi : o.OrderItems) {
                    String pName = (oi.Product2 != null ? oi.Product2.Name : 'Unknown');
                    Decimal qty  = (oi.Quantity != null ? oi.Quantity : 0);
                    if (productQtyMap.containsKey(pName)) {
                        productQtyMap.put(pName, productQtyMap.get(pName) + qty);
                    } else {
                        productQtyMap.put(pName, qty);
                    }
                }
            }
        }

        result.ordersSummary =
            'Total Secondary Orders: ' + orders.size() + '\n'
            + 'Total Order Value: Rs.' + formatAmt(totalOrderValue) + '\n'
            + 'Total Discounts: Rs.' + formatAmt(totalDiscountedAmt) + '\n'
            + 'Total Net Value: Rs.' + formatAmt(totalNetAmt) + '\n\n'
            + 'Order Details:\n'
            + (String.isBlank(ordersBlock) ? 'No secondary orders found.' : ordersBlock);

        String productsBlock = '';
        for (String pName : productQtyMap.keySet()) {
            productsBlock += '- ' + pName + ' | Total Qty: ' + productQtyMap.get(pName).intValue() + '\n';
        }
        result.productsSummary =
            'Total Unique Products Purchased: ' + productQtyMap.size() + '\n\n'
            + 'Product Breakdown:\n'
            + (String.isBlank(productsBlock) ? 'No products found.' : productsBlock);

        // ── 6. Fetch Payments ──
        List<Payment__c> payments = [
            SELECT Id, Name,
                   Amount__c,
                   Applied_Amount__c,
                   Unallocated_Amount__c,
                   Payment_Date__c,
                   Payment_Mode__c,
                   Status__c,
                   Reference_Number__c,
                   Bank_Name__c,
                   Order__r.OrderNumber
            FROM   Payment__c
            WHERE  Account__c = :acc.Id
            ORDER BY Payment_Date__c DESC
            LIMIT  50
        ];

        Decimal totalPaid        = 0;
        Decimal totalApplied     = 0;
        Decimal totalUnallocated = 0;
        String  paymentsBlock    = '';

        for (Payment__c p : payments) {
            totalPaid        += (p.Amount__c != null ? p.Amount__c : 0);
            totalApplied     += (p.Applied_Amount__c != null ? p.Applied_Amount__c : 0);
            totalUnallocated += (p.Unallocated_Amount__c != null ? p.Unallocated_Amount__c : 0);

            paymentsBlock +=
                'Payment: ' + p.Name + '\n'
                + '  Date: ' + formatDate(p.Payment_Date__c) + '\n'
                + '  Amount: Rs.' + formatAmt(p.Amount__c) + '\n'
                + '  Applied: Rs.' + formatAmt(p.Applied_Amount__c) + '\n'
                + '  Unallocated: Rs.' + formatAmt(p.Unallocated_Amount__c) + '\n'
                + '  Mode: ' + (p.Payment_Mode__c != null ? p.Payment_Mode__c : 'N/A') + '\n'
                + '  Status: ' + (p.Status__c != null ? p.Status__c : 'N/A') + '\n'
                + '  Bank: ' + (p.Bank_Name__c != null ? p.Bank_Name__c : 'N/A') + '\n'
                + '  Reference: ' + (p.Reference_Number__c != null ? p.Reference_Number__c : 'N/A') + '\n'
                + '  Against Order: ' + (p.Order__r != null ? p.Order__r.OrderNumber : 'N/A') + '\n'
                + '---\n';
        }

        result.paymentsSummary =
            'Total Payments: ' + payments.size() + '\n'
            + 'Total Amount Paid: Rs.' + formatAmt(totalPaid) + '\n'
            + 'Total Applied: Rs.' + formatAmt(totalApplied) + '\n'
            + 'Total Unallocated: Rs.' + formatAmt(totalUnallocated) + '\n\n'
            + 'Payment Details:\n'
            + (String.isBlank(paymentsBlock) ? 'No payments found.' : paymentsBlock);

        // ── 7. Fetch Scheme Applications ──
        // Schema: Scheme_Application__c
        // Fields: Name, Order__c, Scheme__c, Scheme__r.Name,
        //         Discount_Amount__c, isApplied__c, Applied_Date__c
        String  schemesBlock      = '';
        Boolean hasSchemeBenefits = false;

        if (!orderIds.isEmpty()) {
            List<Scheme_Application__c> schemeApps = [
                SELECT Id,
                       Name,
                       Order__c,
                       Order__r.OrderNumber,
                       Scheme__c,
                       Scheme__r.Name,
                       Discount_Amount__c,
                       isApplied__c,
                       Applied_Date__c
                FROM   Scheme_Application__c
                WHERE  Order__c IN :orderIds
                  AND  isApplied__c = true
            ];

            if (!schemeApps.isEmpty()) {
                hasSchemeBenefits = true;
                Decimal totalSchemeDiscount = 0;

                for (Scheme_Application__c sa : schemeApps) {
                    Decimal discAmt = (sa.Discount_Amount__c != null ? sa.Discount_Amount__c : 0);
                    totalSchemeDiscount += discAmt;

                    schemesBlock +=
                        'Scheme Application: ' + sa.Name + '\n'
                        + '  Scheme Name: ' + (sa.Scheme__r != null ? sa.Scheme__r.Name : 'N/A') + '\n'
                        + '  Applied On Order: ' + (sa.Order__r != null ? sa.Order__r.OrderNumber : 'N/A') + '\n'
                        + '  Discount Amount: Rs.' + formatAmt(sa.Discount_Amount__c) + '\n'
                        + '  Applied Date: ' + formatDate(sa.Applied_Date__c) + '\n'
                        + '  Status: Applied\n'
                        + '---\n';
                }

                schemesBlock = 'Total Scheme Discount Received: Rs.' + formatAmt(totalSchemeDiscount) + '\n\n' + schemesBlock;
            }
        }

        result.schemeBenefits = hasSchemeBenefits
            ? 'Scheme Benefits Applied:\n' + schemesBlock
            : 'No scheme benefits applied on any order.';

        result.isSuccess = true;
        return result;
    }

    // ── Helpers ──
    private static String buildLocation(String city, String state) {
        List<String> parts = new List<String>();
        if (String.isNotBlank(city))  parts.add(city);
        if (String.isNotBlank(state)) parts.add(state);
        return parts.isEmpty() ? 'N/A' : String.join(parts, ', ');
    }

    private static String formatDate(Date d) {
        if (d == null) return 'N/A';
        return d.format();
    }

    private static String formatAmt(Decimal amt) {
        if (amt == null) return '0';
        String s     = String.valueOf(amt.setScale(0));
        String last3 = s.length() > 3 ? s.substring(s.length() - 3) : s;
        String rest  = s.length() > 3 ? s.substring(0, s.length() - 3) : '';
        if (String.isNotBlank(rest)) {
            rest = rest.replaceAll('(\\d)(?=(\\d{2})+$)', '$1,');
            return rest + ',' + last3;
        }
        return last3;
    }
}