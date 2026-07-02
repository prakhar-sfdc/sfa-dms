public with sharing class DealerInsightsAction {

    public class ResponseWrapper {
        @InvocableVariable public String orders;
        @InvocableVariable public String dealers;
        @InvocableVariable public String inventory;
    }

    @InvocableMethod(label='Get Dealer Insights Data')
    public static List<ResponseWrapper> getData(List<String> input) {

        List<Order> orders = [
            SELECT Id, Status, EffectiveDate, TotalAmount
            FROM Order
            LIMIT 20
        ];

        List<Account> dealers = [
            SELECT Id, Name, AnnualRevenue
            FROM Account
            WHERE RecordType.Name = 'Dealer'
            LIMIT 20
        ];

        List<Dealer_Inventory__c> inventory = [
            SELECT Id, Name, Available_Stock__c
            FROM Dealer_Inventory__c
            LIMIT 20
        ];

        ResponseWrapper res = new ResponseWrapper();
        res.orders = JSON.serialize(orders);
        res.dealers = JSON.serialize(dealers);
        res.inventory = JSON.serialize(inventory);

        return new List<ResponseWrapper>{ res };
    }
}