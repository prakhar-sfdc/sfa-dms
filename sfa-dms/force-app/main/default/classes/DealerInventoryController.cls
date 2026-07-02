public with sharing class DealerInventoryController {

    @AuraEnabled(cacheable=true)
    public static List<Dealer_Inventory__c> getDealerInventory(){

        return [

            SELECT Id,
                   Product__r.Name,
                   Available_Stock__c,
                   Unit_Price__c
            FROM Dealer_Inventory__c
            WHERE Available_Stock__c >= 0
            ORDER BY Product__r.Name

        ];

    }

}