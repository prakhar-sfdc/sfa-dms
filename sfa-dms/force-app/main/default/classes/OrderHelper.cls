public with sharing class OrderHelper {
    @AuraEnabled(cacheable=true)
    public static List<OrderItem> getOrderProducts(Id orderId) {
        return [
            SELECT Id, Product2Id, Product2.Name, Quantity, UnitPrice
            FROM OrderItem
            WHERE OrderId = :orderId
        ];
    }
}