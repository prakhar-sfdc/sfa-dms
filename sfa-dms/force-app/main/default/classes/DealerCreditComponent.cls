public with sharing class DealerCreditComponent {

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getDealerCreditData(Id accountId) {

        if (accountId == null) {
            throw new AuraHandledException('Account Id required');
        }

        Map<String, Object> result = new Map<String, Object>();

        // 🔹 Account Data
        Account acc = [
            SELECT Credit_Limit__c, Commission_Percentage__c
            FROM Account
            WHERE Id = :accountId
            LIMIT 1
        ];

        // 🔹 Utilized (Orders)
        AggregateResult utilRes = [
            SELECT SUM(TotalAmount) total
            FROM Order
            WHERE AccountId = :accountId
            AND Status = 'Dispatched'
        ];

        Decimal utilized = (Decimal) utilRes.get('total');

        // 🔹 Top Product
        List<AggregateResult> prodAgg = [
            SELECT Product2.Name name, SUM(Quantity) qty
            FROM OrderItem
            WHERE Order.AccountId = :accountId
            GROUP BY Product2.Name
            ORDER BY SUM(Quantity) DESC
            LIMIT 1
        ];

        String topProduct = prodAgg.isEmpty()
            ? 'N/A'
            : (String) prodAgg[0].get('name');

        // 🔹 Response
        result.put('creditLimit', acc.Credit_Limit__c);
        result.put('commission', acc.Commission_Percentage__c);
        result.put('utilized', utilized == null ? 0 : utilized);
        result.put('topProduct', topProduct);

        return result;
    }
}