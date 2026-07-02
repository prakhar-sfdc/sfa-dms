public class SubOrderInvoicePDFController {

    public Sub_Order__c subOrder {get;set;}
    public List<Sub_Order_Product__c> products {get;set;}

    public SubOrderInvoicePDFController(){

        Id subOrderId = ApexPages.currentPage().getParameters().get('id');

        subOrder = [
            SELECT Id, Name, Cost__c,
                   Account__r.Name, Account__r.BillingStreet, Account__r.BillingCity,
                   Order__r.OrderNumber
            FROM Sub_Order__c
            WHERE Id = :subOrderId
            LIMIT 1
        ];

        products = [
            SELECT Product__r.Name, Product_Quantity__c, Unit_Price__c, Total_Amount__c
            FROM Sub_Order_Product__c
            WHERE Sub_Order__c = :subOrderId
        ];
    }
}