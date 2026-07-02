public with sharing class InventoryMovementHandler {

    private static final String PRIMARY_RT = 'Primary';

    // ================= ORDER FLOW =================
    public static void handleOrderDelivered(List<Id> orderIds) {

        List<Order> orders = [
            SELECT Id, AccountId, RecordType.DeveloperName, Tagged_by__c
            FROM Order
            WHERE Id IN :orderIds
        ];

        // Collect all Tagged_by__c User Ids from secondary orders
        Set<Id> taggedUserIds = new Set<Id>();
        for (Order ord : orders) {
            if (ord.RecordType.DeveloperName != PRIMARY_RT && ord.Tagged_by__c != null) {
                taggedUserIds.add(ord.Tagged_by__c);
            }
        }

        // Resolve User → AccountId for distributors on secondary orders
        Map<Id, Id> userToAccountMap = new Map<Id, Id>();
        if (!taggedUserIds.isEmpty()) {
            for (User u : [SELECT Id, AccountId FROM User WHERE Id IN :taggedUserIds]) {
                userToAccountMap.put(u.Id, u.AccountId);
            }
        }

        Map<Id, Order> orderMap = new Map<Id, Order>(orders);

        List<OrderItem> items = [
            SELECT Id, OrderId, Product2Id, Quantity, UnitPrice
            FROM OrderItem
            WHERE OrderId IN :orderIds
        ];

        List<InventoryWrapper> wrapperList = new List<InventoryWrapper>();

        for (OrderItem oi : items) {
            Order ord = orderMap.get(oi.OrderId);

            // For secondary orders: dealerId = order's AccountId,
            //                        distributorAccountId = Tagged_by__c user's AccountId
            // For primary orders:   distributorAccountId = order's AccountId, dealerId = null
            Id distributorAccountId;
            if (ord.RecordType.DeveloperName == PRIMARY_RT) {
                distributorAccountId = ord.AccountId;
            } else {
                distributorAccountId = userToAccountMap.get(ord.Tagged_by__c);
            }

            wrapperList.add(new InventoryWrapper(
                ord.RecordType.DeveloperName,
                ord.AccountId,          // dealerAccountId (for secondary) / distributorAccountId (for primary)
                distributorAccountId,   // always the distributor's Account
                oi.Product2Id,
                oi.Quantity,
                oi.UnitPrice,
                ord.Id,
                ord.Id
            ));
        }

        processInventoryCommon(wrapperList);
    }

    // ================= SUB ORDER FLOW =================
    public static void handleSubOrderDelivered(List<Id> subOrderIds) {

        List<Sub_Order__c> subOrders = [
            SELECT Id, Account__c,
                   Order__c,
                   Order__r.RecordType.DeveloperName,
                   Order__r.Tagged_by__c
            FROM Sub_Order__c
            WHERE Id IN :subOrderIds
        ];

        // Collect Tagged_by__c User Ids from secondary sub-orders
        Set<Id> taggedUserIds = new Set<Id>();
        for (Sub_Order__c so : subOrders) {
            if (so.Order__r.RecordType.DeveloperName != PRIMARY_RT && so.Order__r.Tagged_by__c != null) {
                taggedUserIds.add(so.Order__r.Tagged_by__c);
            }
        }

        Map<Id, Id> userToAccountMap = new Map<Id, Id>();
        if (!taggedUserIds.isEmpty()) {
            for (User u : [SELECT Id, AccountId FROM User WHERE Id IN :taggedUserIds]) {
                userToAccountMap.put(u.Id, u.AccountId);
            }
        }

        Map<Id, Sub_Order__c> subOrderMap = new Map<Id, Sub_Order__c>(subOrders);

        List<Sub_Order_Product__c> items = [
            SELECT Id, Sub_Order__c, Product__c, Product_Quantity__c, Unit_Price__c
            FROM Sub_Order_Product__c
            WHERE Sub_Order__c IN :subOrderIds
        ];

        List<InventoryWrapper> wrapperList = new List<InventoryWrapper>();

        for (Sub_Order_Product__c sop : items) {
            Sub_Order__c so = subOrderMap.get(sop.Sub_Order__c);

            Id distributorAccountId;
            if (so.Order__r.RecordType.DeveloperName == PRIMARY_RT) {
                distributorAccountId = so.Account__c;
            } else {
                distributorAccountId = userToAccountMap.get(so.Order__r.Tagged_by__c);
            }

            wrapperList.add(new InventoryWrapper(
                so.Order__r.RecordType.DeveloperName,
                so.Account__c,          // dealer account
                distributorAccountId,   // distributor account
                sop.Product__c,
                sop.Product_Quantity__c,
                sop.Unit_Price__c,
                so.Id,
                so.Order__c
            ));
        }

        processInventoryCommon(wrapperList);
    }

    // ================= COMMON ENGINE =================
    private static void processInventoryCommon(List<InventoryWrapper> items) {

        if (items.isEmpty()) return;

        Set<Id> productIds   = new Set<Id>();
        Set<Id> accountIds   = new Set<Id>();

        for (InventoryWrapper w : items) {
            productIds.add(w.productId);
            accountIds.add(w.distributorAccountId);
        }

        // ── Dealer Inventory (keyed by Product + Distributor Account) ─────────
        Map<String, Dealer_Inventory__c> invMap = new Map<String, Dealer_Inventory__c>();
        for (Dealer_Inventory__c inv : [
            SELECT Id, Product__c, Distributor__c, Available_Stock__c
            FROM Dealer_Inventory__c
            WHERE Product__c IN :productIds
              AND Distributor__c IN :accountIds
        ]) {
            invMap.put(inv.Product__c + '-' + inv.Distributor__c, inv);
        }

        // ── Main Inventory ────────────────────────────────────────────────────
        Map<Id, Main_Inventory__c> mainInvMap = new Map<Id, Main_Inventory__c>();
        for (Main_Inventory__c mi : [
            SELECT Id, Product__c, Available_Stock__c
            FROM Main_Inventory__c
            WHERE Product__c IN :productIds
        ]) {
            mainInvMap.put(mi.Product__c, mi);
        }

        // ── DML Lists ─────────────────────────────────────────────────────────
        List<Dealer_Inventory__c>                toInsert     = new List<Dealer_Inventory__c>();
        List<Dealer_Inventory__c>                toUpdate     = new List<Dealer_Inventory__c>();
        List<Distributor_Inventory_Line_Item__c> logs         = new List<Distributor_Inventory_Line_Item__c>();
        List<Main_Inventory__c>                  mainToUpdate = new List<Main_Inventory__c>();
        List<Main_Inventory_Line_Item__c>        mainLogs     = new List<Main_Inventory_Line_Item__c>();

        // ── Main Loop ─────────────────────────────────────────────────────────
        for (InventoryWrapper w : items) {

            Boolean isPrimary    = w.recordType == PRIMARY_RT;
            Id      distributorId = w.distributorAccountId;   // always the real distributor
            Id      dealerId      = isPrimary ? null : w.dealerAccountId;
            String  key           = w.productId + '-' + distributorId;

            Dealer_Inventory__c inv = invMap.get(key);

            // ── PRIMARY ───────────────────────────────────────────────────────
            if (isPrimary) {

                // Main Inventory Outward
                Main_Inventory__c mainInv = mainInvMap.get(w.productId);

                if (mainInv == null || mainInv.Available_Stock__c < w.quantity) {
                    throw new AuraHandledException(
                        'Main inventory insufficient for product: ' + w.productId
                    );
                }

                mainInv.Available_Stock__c -= w.quantity;
                mainToUpdate.add(mainInv);

                mainLogs.add(new Main_Inventory_Line_Item__c(
                    Product__c        = w.productId,
                    Quantity__c       = w.quantity,
                    Type__c           = 'Outward',
                    Order__c          = w.parentOrderId,
                    Distributor__c    = distributorId,
                    Unit_Price__c     = w.unitPrice,
                    Main_Inventory__c = mainInv.Id
                ));

                // Dealer Inventory Inward
                if (inv == null) {
                    inv = new Dealer_Inventory__c(
                        Product__c         = w.productId,
                        Distributor__c     = distributorId,
                        Available_Stock__c = w.quantity,
                        Unit_Price__c      = w.unitPrice
                    );
                    toInsert.add(inv);
                    invMap.put(key, inv);
                } else {
                    inv.Available_Stock__c += w.quantity;
                    toUpdate.add(inv);
                }

                // Inward log — Dealer_Inventory__c Id backfilled after insert if new
                logs.add(new Distributor_Inventory_Line_Item__c(
                    Product__c          = w.productId,
                    Quantity__c         = w.quantity,
                    Type__c             = 'Inward',
                    Distributor__c      = distributorId,
                    Order__c            = w.parentOrderId,
                    Unit_Price__c       = w.unitPrice,
                    Dealer_Inventory__c = inv.Id    // null if brand-new; backfilled below
                ));
            }

            // ── SECONDARY ─────────────────────────────────────────────────────
            else {

                if (inv == null || inv.Available_Stock__c < w.quantity) {
                    throw new AuraHandledException(
                        'Insufficient distributor stock for product: ' + w.productId
                        + ' | Distributor Account: ' + distributorId
                    );
                }

                inv.Available_Stock__c -= w.quantity;
                toUpdate.add(inv);

                logs.add(new Distributor_Inventory_Line_Item__c(
                    Product__c          = w.productId,
                    Quantity__c         = w.quantity,
                    Type__c             = 'Outward',
                    Distributor__c      = distributorId,
                    Dealer__c           = dealerId,
                    Order__c            = w.parentOrderId,
                    Unit_Price__c       = w.unitPrice,
                    Dealer_Inventory__c = inv.Id
                ));
            }
        }

        // ── Save ──────────────────────────────────────────────────────────────
        if (!mainToUpdate.isEmpty()) update mainToUpdate;
        if (!mainLogs.isEmpty())     insert mainLogs;

        // Insert new Dealer Inventory records first to get their Ids
        if (!toInsert.isEmpty()) {
            insert toInsert;

            // Backfill Dealer_Inventory__c Id on Inward logs that were built
            // before the new record had an Id
            for (Distributor_Inventory_Line_Item__c log : logs) {
                if (log.Dealer_Inventory__c == null && log.Type__c == 'Inward') {
                    String logKey = log.Product__c + '-' + log.Distributor__c;
                    Dealer_Inventory__c newInv = invMap.get(logKey);
                    if (newInv != null) {
                        log.Dealer_Inventory__c = newInv.Id;
                    }
                }
            }
        }

        if (!toUpdate.isEmpty()) update toUpdate;
        if (!logs.isEmpty())     insert logs;
    }

    // ================= WRAPPER =================
    public class InventoryWrapper {

        public String  recordType;
        public Id      dealerAccountId;       // the order's AccountId (dealer for secondary, distributor for primary)
        public Id      distributorAccountId;  // always the distributor's Account
        public Id      productId;
        public Decimal quantity;
        public Decimal unitPrice;
        public Id      sourceId;
        public Id      parentOrderId;

        public InventoryWrapper(
            String  rt,
            Id      dealerAcc,
            Id      distributorAcc,
            Id      prod,
            Decimal qty,
            Decimal price,
            Id      src,
            Id      parentOrd
        ) {
            recordType           = rt;
            dealerAccountId      = dealerAcc;
            distributorAccountId = distributorAcc;
            productId            = prod;
            quantity             = qty;
            unitPrice            = price;
            sourceId             = src;
            parentOrderId        = parentOrd;
        }
    }
}