public with sharing class InventoryController {

    public class InventoryWrapper {
        @AuraEnabled public Id productId;
        @AuraEnabled public String productName;
        @AuraEnabled public Decimal availableStock;
        @AuraEnabled public Decimal unitPrice;
        @AuraEnabled public Id inventoryId;
    }

    // ================= GET INVENTORY =================
    @AuraEnabled(cacheable=true)
    public static List<InventoryWrapper> getInventory(String recordType) {

        List<InventoryWrapper> result = new List<InventoryWrapper>();

        if (recordType == 'Primary') {

            for (Main_Inventory__c inv : [
                SELECT Id, Product__c, Product__r.Name, Available_Stock__c
                FROM Main_Inventory__c
            ]) {
                InventoryWrapper w = new InventoryWrapper();
                w.productId = inv.Product__c;
                w.productName = inv.Product__r.Name;
                w.availableStock = inv.Available_Stock__c;
                w.inventoryId = inv.Id;
                result.add(w);
            }

        } else {

            for (Dealer_Inventory__c inv : [
                SELECT Id, Product__c, Product__r.Name, Available_Stock__c, Unit_Price__c
                FROM Dealer_Inventory__c
            ]) {
                InventoryWrapper w = new InventoryWrapper();
                w.productId = inv.Product__c;
                w.productName = inv.Product__r.Name;
                w.availableStock = inv.Available_Stock__c;
                w.unitPrice = inv.Unit_Price__c;
                w.inventoryId = inv.Id;
                result.add(w);
            }
        }

        return result;
    }

    // ================= CREATE ORDER ITEMS =================
    @AuraEnabled
    public static void createOrderItems(Id orderId, String recordType, String payload) {

        List<Object> data = (List<Object>) JSON.deserializeUntyped(payload);

        List<OrderItem> orderItems = new List<OrderItem>();

                Order ord = [
    SELECT Id, Pricebook2Id
    FROM Order
    WHERE Id = :orderId
    LIMIT 1
];

if (ord.Pricebook2Id == null) {
    throw new AuraHandledException('Order does not have a Pricebook assigned');
}
Set<Id> productIds = new Set<Id>();

for (Object obj : data) {
    Map<String, Object> row = (Map<String, Object>) obj;
    productIds.add((Id) row.get('productId'));
}

Map<Id, PricebookEntry> pbeMap = new Map<Id, PricebookEntry>();

for (PricebookEntry pbe : [
    SELECT Id, Product2Id, UnitPrice
    FROM PricebookEntry
    WHERE Product2Id IN :productIds
    AND Pricebook2Id = :ord.Pricebook2Id
    AND IsActive = true
]) {
    pbeMap.put(pbe.Product2Id, pbe);
}

// 🔥 ADD THIS BLOCK HERE
Map<Id, OrderItem> existingItemsMap = new Map<Id, OrderItem>();

for (OrderItem oi : [
    SELECT Id, Quantity, PricebookEntry.Product2Id
    FROM OrderItem
    WHERE OrderId = :orderId
]) {
    existingItemsMap.put(oi.PricebookEntry.Product2Id, oi);
}

        if (recordType == 'Primary') {

            Map<Id, Main_Inventory__c> invMap = new Map<Id, Main_Inventory__c>(
                [SELECT Id, Product__c, Available_Stock__c FROM Main_Inventory__c]
            );

            for (Object obj : data) {
                Map<String, Object> row = (Map<String, Object>) obj;

                Id productId = (Id) row.get('productId');
                Decimal qty = Decimal.valueOf(String.valueOf(row.get('quantity')));
                Id invId = (Id) row.get('inventoryId');

                Main_Inventory__c inv = invMap.get(invId);

                if (qty > inv.Available_Stock__c) {
                    throw new AuraHandledException('Not enough stock for ' + inv.Product__c);
                }

                PricebookEntry pbe = pbeMap.get(productId);

if (pbe == null) {
    throw new AuraHandledException('No pricebook entry found for product');
}

if (existingItemsMap.containsKey(productId)) {
    OrderItem existing = existingItemsMap.get(productId);
    existing.Quantity += qty;
    orderItems.add(existing);
} else {
    orderItems.add(new OrderItem(
        OrderId = orderId,
        PricebookEntryId = pbe.Id,
        Quantity = qty,
        UnitPrice = pbe.UnitPrice
    ));
}

                inv.Available_Stock__c -= qty;
            }

            update invMap.values();

        } else {

            Map<Id, Dealer_Inventory__c> invMap = new Map<Id, Dealer_Inventory__c>(
                [SELECT Id, Product__c, Available_Stock__c, Unit_Price__c FROM Dealer_Inventory__c]
            );

            for (Object obj : data) {
                Map<String, Object> row = (Map<String, Object>) obj;

                Id productId = (Id) row.get('productId');
                Decimal qty = Decimal.valueOf(String.valueOf(row.get('quantity')));
                Id invId = (Id) row.get('inventoryId');

                Dealer_Inventory__c inv = invMap.get(invId);

                if (qty > inv.Available_Stock__c) {
                    throw new AuraHandledException('Not enough dealer stock');
                }

                PricebookEntry pbe = pbeMap.get(productId);

if (pbe == null) {
    throw new AuraHandledException('No pricebook entry found for product');
}
if (existingItemsMap.containsKey(productId)) {
    OrderItem existing = existingItemsMap.get(productId);
    existing.Quantity += qty;
    orderItems.add(existing);
} else {
    orderItems.add(new OrderItem(
        OrderId = orderId,
        PricebookEntryId = pbe.Id,
        Quantity = qty,
        UnitPrice = pbe.UnitPrice
    ));
}

                inv.Available_Stock__c -= qty;
            }

            update invMap.values();
        }

        List<OrderItem> toInsert = new List<OrderItem>();
List<OrderItem> toUpdate = new List<OrderItem>();

for (OrderItem oi : orderItems) {
    if (oi.Id == null) {
        toInsert.add(oi);
    } else {
        toUpdate.add(oi);
    }
}

if (!toInsert.isEmpty()) insert toInsert;
if (!toUpdate.isEmpty()) update toUpdate;
    }

    private static Decimal getPrice(Id productId) {
        PricebookEntry pbe = [
            SELECT UnitPrice
            FROM PricebookEntry
            WHERE Product2Id = :productId
            AND IsActive = true
            LIMIT 1
        ];
        return pbe.UnitPrice;
    }
}