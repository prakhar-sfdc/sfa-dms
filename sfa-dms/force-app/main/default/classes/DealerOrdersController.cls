public with sharing class DealerOrdersController {

// @AuraEnabled(cacheable=true)
// public static List<Map<String, Object>> getOrderFieldSet() {

//     List<Map<String, Object>> fieldsList = new List<Map<String, Object>>();

//     Schema.FieldSet fieldSet = Schema.SObjectType.Order.FieldSets.Dealer_Order_Form;

//     Map<String, Schema.SObjectField> fieldMap =
//         Schema.SObjectType.Order.fields.getMap();

//     for (Schema.FieldSetMember f : fieldSet.getFields()) {

//         Schema.DescribeFieldResult d =
//             fieldMap.get(f.getFieldPath()).getDescribe();

//         Map<String, Object> fieldData = new Map<String, Object>();

//         fieldData.put('label', f.getLabel());
//         fieldData.put('fieldPath', f.getFieldPath());
//         fieldData.put('type', String.valueOf(d.getType()));
//         fieldData.put('isLookup', d.getType() == Schema.DisplayType.Reference);
//         fieldData.put('isPicklist', d.getType() == Schema.DisplayType.Picklist);
//         fieldData.put('isDate', d.getType() == Schema.DisplayType.Date);
//         fieldData.put('isBoolean', d.getType() == Schema.DisplayType.Boolean);

//         // Picklist values
//         if (d.getType() == Schema.DisplayType.Picklist) {

//             List<Map<String, String>> options = new List<Map<String, String>>();

//             for (Schema.PicklistEntry p : d.getPicklistValues()) {
//                 options.add(new Map<String, String>{
//                     'label' => p.getLabel(),
//                     'value' => p.getValue()
//                 });
//             }

//             fieldData.put('options', options);
//         }

//         fieldsList.add(fieldData);
//     }

//     return fieldsList;
// }

// @AuraEnabled(cacheable=true)
// public static Id getLoggedInUserAccount() {

//     User u = [
//         SELECT Id, Contact.AccountId
//         FROM User
//         WHERE Id = :UserInfo.getUserId()
//         LIMIT 1
//     ];

//     return u.Contact.AccountId;
// }

//     @AuraEnabled(cacheable=true)
//     public static List<Order> getOrders() {
//         try {
//             return [
//                 SELECT Id, OrderNumber, Status, EffectiveDate, TotalAmount,
//                        Account.Name, Estimated_Delivery_Date__c,RecordType.Name
//                 FROM Order
//                 ORDER BY CreatedDate DESC
//                 LIMIT 50
//             ];
//         } catch (Exception e) {
//             throw new AuraHandledException('Error fetching orders: ' + e.getMessage());
//         }
//     }

//     @AuraEnabled(cacheable=true)
//     public static List<Account> getAccounts() {
//         try {
//             return [SELECT Id, Name FROM Account LIMIT 100];
//         } catch (Exception e) {
//             throw new AuraHandledException('Error fetching accounts: ' + e.getMessage());
//         }
//     }

//     @AuraEnabled(cacheable=true)
//     public static List<Pricebook2> getPricebooks() {
//         try {
//             return [SELECT Id, Name FROM Pricebook2 WHERE IsActive = true];
//         } catch (Exception e) {
//             throw new AuraHandledException('Error fetching pricebooks: ' + e.getMessage());
//         }
//     }

//     @AuraEnabled(cacheable=true)
//     public static List<Contact> getDealerContacts() {
//         try {
//             return [SELECT Id, Name FROM Contact WHERE RecordType.Name = 'Dealer' LIMIT 100];
//         } catch (Exception e) {
//             throw new AuraHandledException('Error fetching accounts: ' + e.getMessage());
//         }
//     }

//     @AuraEnabled
//     public static Id createOrder(String orderData) {
//         try {

//            Map<String, Object> fields = (Map<String, Object>) JSON.deserializeUntyped(orderData);

// Order ord = new Order();

// for (String key : fields.keySet()) {
//     ord.put(key, fields.get(key));
// } 

//             // 🔥 FETCH ACCOUNT ADDRESS & COPY TO ORDER
// if (ord.AccountId != null) {

//     Account acc = [
//         SELECT BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
//                ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry
//         FROM Account
//         WHERE Id = :ord.AccountId
//         LIMIT 1
//     ];

//     // Billing Address
//     ord.BillingStreet = acc.BillingStreet;
//     ord.BillingCity = acc.BillingCity;
//     ord.BillingState = acc.BillingState;
//     ord.BillingPostalCode = acc.BillingPostalCode;
//     ord.BillingCountry = acc.BillingCountry;

//     // Shipping Address
//     ord.ShippingStreet = acc.ShippingStreet;
//     ord.ShippingCity = acc.ShippingCity;
//     ord.ShippingState = acc.ShippingState;
//     ord.ShippingPostalCode = acc.ShippingPostalCode;
//     ord.ShippingCountry = acc.ShippingCountry;
// }

//             insert ord;
//             return ord.Id;

//         } catch (Exception e) {
//             throw new AuraHandledException('Error creating order: ' + e.getMessage());
//         }
//     }

//     @AuraEnabled(cacheable=true)
//     public static Order getOrderDetail(Id orderId) {
//         try {
//             return [
//                 SELECT Id, OrderNumber, Status, EffectiveDate, EndDate, TotalAmount,
//                        Account.Name,
//                        PoNumber, PoDate,
//                        Type,
//                        BillToContact.Name,
//                        ShipToContact.Name,
//                        Estimated_Delivery_Date__c,
//                        CreatedDate,
//                        Pricebook2Id,
//                        BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
//                        ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry,
//                        Tagged_By__c, Tagged_By__r.Name,
//                        Tagged_to__c, Tagged_to__r.Name
//                 FROM Order
//                 WHERE Id = :orderId
//             ];
//         } catch (Exception e) {
//             throw new AuraHandledException('Error fetching order detail: ' + e.getMessage());
//         }
//     }

//     @AuraEnabled(cacheable=true)
//     public static List<OrderItem> getOrderItems(Id orderId) {
//         try {
//             return [
//                 SELECT Id, OrderId, PricebookEntryId, Product2Id, Product2.Name,
//                        Quantity, UnitPrice, TotalPrice
//                 FROM OrderItem
//                 WHERE OrderId = :orderId
//             ];
//         } catch (Exception e) {
//             throw new AuraHandledException('Error fetching order items: ' + e.getMessage());
//         }
//     }


//     /*
//     FETCH PRODUCTS ONLY FROM DEALER INVENTORY
//     */
//     @AuraEnabled(cacheable=true)
// public static List<ProductWrapper> getActiveProductsForPricebook(Id pricebook2Id, Id orderId) {

//     try {

//         Order ord = [
//             SELECT RecordTypeId
//             FROM Order
//             WHERE Id = :orderId
//             LIMIT 1
//         ];

//         // 🏭 PRIMARY ORDER → MAIN INVENTORY
//         if (ord.RecordTypeId == '012dL00000CFuarQAD') {

//             List<Main_Inventory__c> mainStock = [
//     SELECT Product__c, Available_Stock__c
//     FROM Main_Inventory__c
// ];

// Map<Id, Decimal> stockMap = new Map<Id, Decimal>();

// for (Main_Inventory__c inv : mainStock) {
//     stockMap.put(inv.Product__c, inv.Available_Stock__c);
// }

// List<PricebookEntry> pbes = [
//     SELECT Id, Product2Id, Product2.Name, UnitPrice
//     FROM PricebookEntry
//     WHERE Pricebook2Id = :pricebook2Id
//     AND IsActive = true
//     ORDER BY Product2.Name
// ];

// List<ProductWrapper> result = new List<ProductWrapper>();

// for (PricebookEntry pbe : pbes) {
//     Decimal stock = stockMap.containsKey(pbe.Product2Id)
//     ? stockMap.get(pbe.Product2Id)
//     : 0;

// if (stock > 0) {
//     result.add(new ProductWrapper(
//         pbe.Id,
//         pbe.Product2.Name,
//         pbe.UnitPrice,
//         stock
//     ));
// }
// }

// return result;
//         }

//         // 🏪 SECONDARY ORDER → EXISTING LOGIC
//         else {

//            List<Dealer_Inventory__c> inventoryList = [
//     SELECT Product__c, Available_Stock__c
//     FROM Dealer_Inventory__c
// ];

// Map<Id, Decimal> stockMap = new Map<Id, Decimal>();

// for (Dealer_Inventory__c inv : inventoryList) {
//     stockMap.put(inv.Product__c, inv.Available_Stock__c);
// }

// List<PricebookEntry> pbes = [
//     SELECT Id, Product2Id, Product2.Name, UnitPrice
//     FROM PricebookEntry
//     WHERE Pricebook2Id = :pricebook2Id
//     AND IsActive = true
//     ORDER BY Product2.Name
// ];

// List<ProductWrapper> result = new List<ProductWrapper>();

// for (PricebookEntry pbe : pbes) {
//     Decimal stock = stockMap.containsKey(pbe.Product2Id)
//     ? stockMap.get(pbe.Product2Id)
//     : 0;

// if (stock > 0) {
//     result.add(new ProductWrapper(
//         pbe.Id,
//         pbe.Product2.Name,
//         pbe.UnitPrice,
//         stock
//     ));
// }
// }

// return result;
//         }

//     } catch (Exception e) {
//         throw new AuraHandledException('Error fetching products: ' + e.getMessage());
//     }
// }


//     /*
//     CREATE ORDER ITEMS + VALIDATE INVENTORY + REDUCE STOCK
//     */
//    @AuraEnabled
// public static void createOrderItems(Id orderId, List<Map<String, Object>> items) {

//     try {

//         // 🔹 Get Order Type
//         Order ord = [
//             SELECT RecordTypeId
//             FROM Order
//             WHERE Id = :orderId
//             LIMIT 1
//         ];

//         // 🔹 Collect PricebookEntry Ids
//         Set<Id> pricebookEntryIds = new Set<Id>();

//         for (Map<String, Object> item : items) {
//             pricebookEntryIds.add((Id) item.get('pricebookEntryId'));
//         }

//         // 🔹 Fetch Pricebook Entries
//         Map<Id, PricebookEntry> pricebookMap = new Map<Id, PricebookEntry>(
//             [
//                 SELECT Id, Product2Id, Product2.Name
//                 FROM PricebookEntry
//                 WHERE Id IN :pricebookEntryIds
//             ]
//         );

//         // 🔹 Collect Product Ids
//         Set<Id> productIds = new Set<Id>();

//         for (PricebookEntry pbe : pricebookMap.values()) {
//             productIds.add(pbe.Product2Id);
//         }

//         // 🔹 Dealer Inventory Map (for Secondary)
//         Map<Id, Dealer_Inventory__c> dealerInventoryMap = new Map<Id, Dealer_Inventory__c>();

//         for (Dealer_Inventory__c inv : [
//             SELECT Id, Product__c, Available_Stock__c
//             FROM Dealer_Inventory__c
//             WHERE Product__c IN :productIds
//         ]) {
//             dealerInventoryMap.put(inv.Product__c, inv);
//         }

//         // 🔹 Main Inventory Map (for Primary)
//         Map<Id, Main_Inventory__c> mainInventoryMap = new Map<Id, Main_Inventory__c>();

//         for (Main_Inventory__c inv : [
//             SELECT Id, Product__c, Available_Stock__c
//             FROM Main_Inventory__c
//             WHERE Product__c IN :productIds
//         ]) {
//             mainInventoryMap.put(inv.Product__c, inv);
//         }

//         // 🔹 Lists to update
//         List<OrderItem> orderItemsToInsert = new List<OrderItem>();
//         List<Dealer_Inventory__c> dealerInventoryToUpdate = new List<Dealer_Inventory__c>();
//         List<Main_Inventory__c> mainInventoryToUpdate = new List<Main_Inventory__c>();

//         // 🔥 CORE LOOP
//         for (Map<String, Object> item : items) {

//             Id pbeId = (Id) item.get('pricebookEntryId');
//             Decimal qty = (Decimal) item.get('quantity');
//             Decimal unitPrice = (Decimal) item.get('unitPrice');

//             PricebookEntry pbe = pricebookMap.get(pbeId);

//             // ================================
//             // 🏭 PRIMARY ORDER LOGIC
//             // ================================
//             if (ord.RecordTypeId == '012dL00000CFuarQAD') {

//                 Main_Inventory__c mainInv = mainInventoryMap.get(pbe.Product2Id);

//                 if (mainInv == null || mainInv.Available_Stock__c <= 0) {
//                     throw new AuraHandledException(
//                         'Product ' + pbe.Product2.Name + ' is out of main inventory.'
//                     );
//                 }

//                 if (qty > mainInv.Available_Stock__c) {
//                     throw new AuraHandledException(
//                         'Insufficient main inventory for product: ' + pbe.Product2.Name
//                     );
//                 }

//                 // Deduct from Main Inventory
//                 mainInv.Available_Stock__c -= qty;
//                 mainInventoryToUpdate.add(mainInv);
//             }

//             // ================================
//             // 🏪 SECONDARY ORDER LOGIC
//             // ================================
//             else {

//                 Dealer_Inventory__c dealerInv = dealerInventoryMap.get(pbe.Product2Id);

//                 if (dealerInv == null || dealerInv.Available_Stock__c <= 0) {
//                     throw new AuraHandledException(
//                         'Product ' + pbe.Product2.Name + ' is out of stock.'
//                     );
//                 }

//                 if (qty > dealerInv.Available_Stock__c) {
//                     throw new AuraHandledException(
//                         'Available inventory is less for product: ' + pbe.Product2.Name
//                     );
//                 }

//                 // Deduct from Dealer Inventory
//                 dealerInv.Available_Stock__c -= qty;
//                 dealerInventoryToUpdate.add(dealerInv);
//             }

//             // 🔹 Create Order Item
//             OrderItem oi = new OrderItem();
//             oi.OrderId = orderId;
//             oi.PricebookEntryId = pbeId;
//             oi.Quantity = qty;
//             oi.UnitPrice = unitPrice;

//             orderItemsToInsert.add(oi);
//         }

//         // 🔹 Insert Order Items
//         insert orderItemsToInsert;

//         // 🔹 Update Inventories
//         if (!dealerInventoryToUpdate.isEmpty()) {
//             update dealerInventoryToUpdate;
//         }

//         if (!mainInventoryToUpdate.isEmpty()) {
//             update mainInventoryToUpdate;
//         }

//     } catch (Exception e) {

//         throw new AuraHandledException(
//             'Error creating order items: ' + e.getMessage()
//         );
//     }
// }

// @AuraEnabled
// public static void updateOrderStage(Id orderId, String status) {
//     Order ord = [SELECT Id, Status FROM Order WHERE Id = :orderId LIMIT 1];

//     ord.Status = status;
//     update ord;
// }

// public class ProductWrapper {
//     @AuraEnabled public Id pricebookEntryId;
//     @AuraEnabled public String productName;
//     @AuraEnabled public Decimal unitPrice;
//     @AuraEnabled public Decimal availableStock;

//     public ProductWrapper(Id pbeId, String name, Decimal price, Decimal stock) {
//         this.pricebookEntryId = pbeId;
//         this.productName = name;
//         this.unitPrice = price;
//         this.availableStock = stock;
//     }
// }

// @AuraEnabled
// public static void updateOrder(String orderData) {

//     Map<String, Object> fields =
//         (Map<String, Object>) JSON.deserializeUntyped(orderData);

//     Order ord = new Order();

//     for (String key : fields.keySet()) {
//         ord.put(key, fields.get(key));
//     }

//     update ord;
// }
}