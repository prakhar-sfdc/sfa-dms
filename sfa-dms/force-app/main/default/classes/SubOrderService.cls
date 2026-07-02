public with sharing class SubOrderService {
    
    // Wrapper for product splits
    public class ProductSplitWrapper {
        @AuraEnabled public String productId;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Decimal unitPrice;
    }

    // Wrapper for each SubOrder
    public class SubOrderWrapper {
        @AuraEnabled public String accountId;
        // @AuraEnabled public String name;
        // @AuraEnabled public String locationId;
        // @AuraEnabled public String plantId;
        @AuraEnabled public List<ProductSplitWrapper> productSplits;
    }

    @AuraEnabled
    public static void createSubOrders(Id parentOrderId, String subOrdersJson) {
        if (String.isBlank(parentOrderId)) {
            throw new AuraHandledException('Parent Order Id is required.');
        }
        if (String.isBlank(subOrdersJson)) {
            throw new AuraHandledException('SubOrders JSON is required.');
        }

        System.debug('📥 Incoming JSON: ' + subOrdersJson);

        // Deserialize JSON string into wrapper list
        List<SubOrderWrapper> subOrders =
            (List<SubOrderWrapper>) JSON.deserialize(subOrdersJson, List<SubOrderWrapper>.class);

        if (subOrders.isEmpty()) {
            throw new AuraHandledException('At least one SubOrder is required.');
        }

        System.debug('✅ Parsed SubOrders: ' + JSON.serializePretty(subOrders));

        Order parentOrder = [
    		SELECT Id, Qty__c, AccountId
    		FROM Order
    		WHERE Id = :parentOrderId
		];
        
        List<OrderItem> parentProducts = [
            SELECT Id, Product2Id, Product2.Name, Quantity, UnitPrice
            FROM OrderItem
            WHERE OrderId = :parentOrderId
        ];
        if (parentProducts.isEmpty()) {
            throw new AuraHandledException('No products found on parent order.');
        }

        Map<Id, OrderItem> parentProductMap = new Map<Id, OrderItem>();
        for (OrderItem oi : parentProducts) {
            parentProductMap.put(oi.Product2Id, oi);
        }

        // Validation: total splits should not exceed parent qty
        Map<Id, Decimal> totalSplitsByProduct = new Map<Id, Decimal>();
        for (SubOrderWrapper so : subOrders) {
            if (so.productSplits != null) {
                for (ProductSplitWrapper ps : so.productSplits) {
                    Decimal qty = ps.quantity != null ? ps.quantity : 0;
                    if (qty < 0) {
                        throw new AuraHandledException('Quantity cannot be negative.');
                    }

                    if (!String.isBlank(ps.productId)) {
                        Id prodId = Id.valueOf(ps.productId);
                        totalSplitsByProduct.put(
                            prodId,
                            (totalSplitsByProduct.containsKey(prodId) 
                                ? totalSplitsByProduct.get(prodId) : 0) + qty
                        );
                    }
                }
            }
        }
        for (OrderItem oi : parentProducts) {
            Decimal splitQty = totalSplitsByProduct.containsKey(oi.Product2Id) 
                                ? totalSplitsByProduct.get(oi.Product2Id) 
                                : 0;
            if (splitQty > oi.Quantity) {
                throw new AuraHandledException(
                    'Quantity for product ' + oi.Product2.Name + 
                    ' exceeds available quantity on order. ' + 
                    'Product Qty = ' + oi.Quantity + ', Assigned = ' + splitQty
                );
            }
        }

        // ✅ Only create SubOrders that have at least one valid product split
        List<Sub_Order__c> subOrderRecs = new List<Sub_Order__c>();
        Map<Integer, Sub_Order__c> indexToSubOrder = new Map<Integer, Sub_Order__c>();

        for (Integer i = 0; i < subOrders.size(); i++) {
            SubOrderWrapper so = subOrders[i];
            Boolean hasValidProduct = false;

            if (so.productSplits != null) {
                for (ProductSplitWrapper ps : so.productSplits) {
                    Decimal qty = ps.quantity != null ? ps.quantity : 0;
                    if (qty > 0 && !String.isBlank(ps.productId)) {
                        OrderItem parentOI = parentProductMap.get(Id.valueOf(ps.productId));
                        if (parentOI != null && parentOI.Quantity > 0) {
                            hasValidProduct = true;
                            break; // no need to check further
                        }
                    }
                }
            }

            if (hasValidProduct) {
                // Id accId = !String.isBlank(so.accountId) ? Id.valueOf(so.accountId) : null;
                // Id plantId=!String.isBlank(so.plantId) ? Id.valueOf(so.plantId) : null;
                // Id locationId=!String.isBlank(so.locationId) ? Id.valueOf(so.locationId) : null;
                Sub_Order__c newSo = new Sub_Order__c(
                    Order__c = parentOrderId,
                    Account__c =parentOrder.AccountId,
					Status__c= 'Processing',
                    // Plant__c=plantId,
                    // Location__c=so.locationId,
                    Order_Date__c=System.today()
                );
                subOrderRecs.add(newSo);
                indexToSubOrder.put(i, newSo);
            }
        }

        if (subOrderRecs.isEmpty()) {
            throw new AuraHandledException('No valid suborders to create (all quantities were 0).');
        }

        // Insert only suborders with valid products
        insert subOrderRecs;

        // Map back the inserted suborders to their index
        Map<Integer, Sub_Order__c> insertedSubOrders = new Map<Integer, Sub_Order__c>();
        List<Integer> indexes = new List<Integer>(indexToSubOrder.keySet());
        for (Integer j = 0; j < subOrderRecs.size(); j++) {
            insertedSubOrders.put(indexes[j], subOrderRecs[j]);
        }

        // Create SubOrder Products + track deductions
        List<Sub_Order_Product__c> subOrderProducts = new List<Sub_Order_Product__c>();
        Map<Id, Decimal> deductedByProduct = new Map<Id, Decimal>();

        for (Integer i = 0; i < subOrders.size(); i++) {
            SubOrderWrapper so = subOrders[i];
            Sub_Order__c newSo = insertedSubOrders.get(i);
            if (newSo == null) continue; // Skip suborders that had no valid products

            if (so.productSplits != null) {
                for (ProductSplitWrapper ps : so.productSplits) {
                    Decimal qty = ps.quantity != null ? ps.quantity : 0;
                    if (qty > 0 && !String.isBlank(ps.productId)) {
                        Id prodId = Id.valueOf(ps.productId);
                        OrderItem parentOI = parentProductMap.get(prodId);

                        if (parentOI != null && parentOI.Quantity > 0) {
                            subOrderProducts.add(new Sub_Order_Product__c(
                                Sub_Order__c = newSo.Id,
                                Product__c = prodId,
                                Product_Quantity__c = qty,
                                Unit_Price__c = parentOI.UnitPrice
                            ));

                            // Track deduction
                            deductedByProduct.put(
                                prodId,
                                (deductedByProduct.containsKey(prodId) ? deductedByProduct.get(prodId) : 0) + qty
                            );
                        }
                    }
                }
            }
        }

        if (!subOrderProducts.isEmpty()) {
            insert subOrderProducts;
        }

        // Deduct from OrderItems
        List<OrderItem> updateOrderItems = new List<OrderItem>();
        for (Id prodId : deductedByProduct.keySet()) {
            if (parentProductMap.containsKey(prodId)) {
                OrderItem oi = parentProductMap.get(prodId);
                oi.Quantity -= deductedByProduct.get(prodId);
                updateOrderItems.add(oi);
            }
        }
        if (!updateOrderItems.isEmpty()) {
            update updateOrderItems;
        }

        // Deduct from Parent Order total
        Decimal totalDeducted = 0;
        for (Decimal d : deductedByProduct.values()) {
            totalDeducted += d;
        }
        parentOrder.Qty__c = (parentOrder.Qty__c != null ? parentOrder.Qty__c : 0) - totalDeducted;
        update parentOrder;
    }
}