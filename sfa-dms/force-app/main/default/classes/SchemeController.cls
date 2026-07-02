public with sharing class SchemeController {

    // =========================
    // WRAPPER
    // =========================
    public class SchemeWrapper {
        @AuraEnabled public Id      schemeId;
        @AuraEnabled public String  name;
        @AuraEnabled public String  schemeType;
        @AuraEnabled public Decimal benefit;
        @AuraEnabled public Boolean eligible;
        @AuraEnabled public String  eligibilityNote;
        @AuraEnabled public Boolean alreadyApplied;
    }

    // =========================
    // GET SCHEMES — only eligible ones for this order
    // =========================
    @AuraEnabled(cacheable=true)
    public static List<SchemeWrapper> getSchemesForOrder(Id orderId) {
        System.debug('getSchemesForOrder | orderId=' + orderId);

        if (orderId == null) {
            throw new AuraHandledException('orderId is required.');
        }

        // ── Fetch Order ───────────────────────────────────────────
        List<Order> orders = [
            SELECT Id, TotalAmount, Pricebook2Id
            FROM   Order
            WHERE  Id = :orderId
            LIMIT  1
        ];
        if (orders.isEmpty()) {
            throw new AuraHandledException('Order not found: ' + orderId);
        }
        Order ord = orders[0];
        Decimal orderTotal = ord.TotalAmount != null ? ord.TotalAmount : 0;
        System.debug('Order TotalAmount=' + orderTotal);

        // ── Order Items: productId → total qty ────────────────────
        Map<Id, Decimal> productQtyMap = new Map<Id, Decimal>();
        for (OrderItem oi : [
            SELECT Quantity, PricebookEntry.Product2Id
            FROM   OrderItem
            WHERE  OrderId = :orderId
        ]) {
            Id pid = oi.PricebookEntry.Product2Id;
            productQtyMap.put(pid, (productQtyMap.containsKey(pid) ? productQtyMap.get(pid) : 0) + oi.Quantity);
        }
        System.debug('productQtyMap=' + productQtyMap);

        // ── Already-applied scheme IDs ────────────────────────────
        Set<Id> appliedIds = new Set<Id>();
        for (Scheme_Application__c sa : [
            SELECT Scheme__c
            FROM   Scheme_Application__c
            WHERE  Order__c = :orderId AND isApplied__c = true
        ]) {
            appliedIds.add(sa.Scheme__c);
        }
        System.debug('appliedIds=' + appliedIds);

        // ── Active schemes with children ──────────────────────────
        List<Scheme__c> activeSchemes = [
            SELECT Id, Name, Scheme_Type__c,
                (SELECT From_Amount__c, To_Amount__c, Discount__c
                 FROM   Scheme_Slabs__r ORDER BY From_Amount__c ASC),
                (SELECT Product__c, Product__r.Name,
                        Minimum_Quantity__c, Free_Product__c,
                        Free_Product__r.Name, Free_Quantity__c,
                        Discount_Percentage__c
                 FROM   Scheme_Products__r)
            FROM  Scheme__c
            WHERE Status__c = 'Active'
        ];
        System.debug('Active scheme count=' + activeSchemes.size());

        List<SchemeWrapper> result = new List<SchemeWrapper>();

        for (Scheme__c s : activeSchemes) {
            System.debug('Evaluating: ' + s.Name + ' | type=' + s.Scheme_Type__c);

            SchemeWrapper w   = new SchemeWrapper();
            w.schemeId        = s.Id;
            w.name            = s.Name;
            w.schemeType      = s.Scheme_Type__c;
            w.benefit         = 0;
            w.eligible        = false;
            w.eligibilityNote = '';
            w.alreadyApplied  = appliedIds.contains(s.Id);

            // ── SLAB BASED ────────────────────────────────────────
            if (s.Scheme_Type__c == 'Slab Based') {
                if (s.Scheme_Slabs__r == null || s.Scheme_Slabs__r.isEmpty()) {
                    System.debug('Skipping ' + s.Name + ': no slabs configured');
                    continue;
                }
                for (Scheme_Slab__c slab : s.Scheme_Slabs__r) {
                    Decimal fromAmt = slab.From_Amount__c != null ? slab.From_Amount__c : 0;
                    Decimal toAmt   = slab.To_Amount__c   != null ? slab.To_Amount__c   : 999999999;
                    if (orderTotal >= fromAmt && orderTotal <= toAmt) {
                        w.benefit         = (orderTotal * slab.Discount__c / 100).setScale(2);
                        w.eligible        = true;
                        w.eligibilityNote = slab.Discount__c + '% off — order qualifies (₹'
                                            + fromAmt.format() + ' – ₹' + toAmt.format() + ' slab)';
                        System.debug('Slab matched | discount=' + slab.Discount__c + ' | benefit=' + w.benefit);
                        break;
                    }
                }
                if (!w.eligible) {
                    System.debug('No slab matched for order total ' + orderTotal + ' on ' + s.Name);
                    continue; // order doesn't qualify — don't show
                }
            }

            // ── FREE PRODUCT ──────────────────────────────────────
            else if (s.Scheme_Type__c == 'Free Product') {
                if (s.Scheme_Products__r == null || s.Scheme_Products__r.isEmpty()) {
                    System.debug('Skipping ' + s.Name + ': no products configured');
                    continue;
                }
                Boolean anyQualifies = false;
                List<String> notes   = new List<String>();
                for (Scheme_Product__c sp : s.Scheme_Products__r) {
                    Decimal minQty  = sp.Minimum_Quantity__c != null ? sp.Minimum_Quantity__c : 0;
                    Decimal freeQty = sp.Free_Quantity__c    != null ? sp.Free_Quantity__c    : 0;
                    String  prodName = sp.Product__r != null ? sp.Product__r.Name : String.valueOf(sp.Product__c);
                    String  freeName = sp.Free_Product__r != null ? sp.Free_Product__r.Name : String.valueOf(sp.Free_Product__c);

                    if (productQtyMap.containsKey(sp.Product__c)
                            && productQtyMap.get(sp.Product__c) >= minQty) {
                        anyQualifies = true;
                        notes.add('Buy ' + minQty.format() + ' ' + prodName
                                  + ' → get ' + freeQty.format() + ' ' + freeName + ' free');
                        System.debug('Free product qualifies: ' + prodName);
                    } else {
                        System.debug('Free product not in order or qty insufficient: ' + prodName
                                     + ' | need=' + minQty
                                     + ' | have=' + (productQtyMap.containsKey(sp.Product__c)
                                                     ? productQtyMap.get(sp.Product__c) : 0));
                    }
                }
                if (!anyQualifies) {
                    continue; // order doesn't have qualifying products — don't show
                }
                w.eligible        = true;
                w.benefit         = 0; // free product, no monetary discount
                w.eligibilityNote = String.join(notes, ' | ');
            }

            // ── DISCOUNT (flat %) ─────────────────────────────────
            else if (s.Scheme_Type__c == 'Discount') {
                // Show for every order — flat discount always applies
                Decimal pct = 10; // default fallback
                if (s.Scheme_Products__r != null && !s.Scheme_Products__r.isEmpty()
                        && s.Scheme_Products__r[0].Discount_Percentage__c != null) {
                    pct = s.Scheme_Products__r[0].Discount_Percentage__c;
                }
                w.benefit         = (orderTotal * pct / 100).setScale(2);
                w.eligible        = true;
                w.eligibilityNote = pct + '% flat discount on order total';
                System.debug('Discount scheme | pct=' + pct + ' | benefit=' + w.benefit);
            }

            else {
                // Unknown type — skip
                System.debug('Unknown scheme type: ' + s.Scheme_Type__c + ' — skipping');
                continue;
            }

            result.add(w);
            System.debug('Added to result: ' + w.name + ' | eligible=' + w.eligible + ' | alreadyApplied=' + w.alreadyApplied);
        }

        System.debug('Final result count=' + result.size());
        return result;
    }

    // =========================
    // APPLY SCHEME
    // =========================
    @AuraEnabled
    public static void applyScheme(Id orderId, Id schemeId) {
        System.debug('applyScheme | orderId=' + orderId + ' | schemeId=' + schemeId);

        if (orderId == null || schemeId == null) {
            throw new AuraHandledException('orderId and schemeId are required.');
        }

        // ── Duplicate guard ───────────────────────────────────────
        Integer existing = [
            SELECT COUNT()
            FROM   Scheme_Application__c
            WHERE  Order__c = :orderId AND Scheme__c = :schemeId
        ];
        if (existing > 0) {
            throw new AuraHandledException('This scheme is already applied to the order.');
        }

        // ── Fetch Order ───────────────────────────────────────────
        Order ord = [
            SELECT Id, TotalAmount, Discounted_Amount__c, Pricebook2Id
            FROM   Order
            WHERE  Id = :orderId
            LIMIT  1
        ];

        // ── Fetch Scheme with children ────────────────────────────
        Scheme__c scheme = [
            SELECT Id, Scheme_Type__c,
                (SELECT From_Amount__c, To_Amount__c, Discount__c
                 FROM   Scheme_Slabs__r ORDER BY From_Amount__c ASC),
                (SELECT Product__c, Minimum_Quantity__c,
                        Free_Product__c, Free_Quantity__c
                 FROM   Scheme_Products__r)
            FROM  Scheme__c
            WHERE Id = :schemeId
            LIMIT 1
        ];

        Decimal discount = 0;

        try {
            // ── SLAB BASED ────────────────────────────────────────
            if (scheme.Scheme_Type__c == 'Slab Based') {
                Decimal orderTotal = ord.TotalAmount != null ? ord.TotalAmount : 0;
                for (Scheme_Slab__c slab : scheme.Scheme_Slabs__r) {
                    Decimal fromAmt = slab.From_Amount__c != null ? slab.From_Amount__c : 0;
                    Decimal toAmt   = slab.To_Amount__c   != null ? slab.To_Amount__c   : 999999999;
                    if (orderTotal >= fromAmt && orderTotal <= toAmt) {
                        discount = (orderTotal * slab.Discount__c / 100).setScale(2);
                        System.debug('Slab discount calculated=' + discount);
                        break;
                    }
                }
                ord.Discounted_Amount__c = (ord.Discounted_Amount__c != null ? ord.Discounted_Amount__c : 0) + discount;
                update ord;
                System.debug('Order updated with discount | Discounted_Amount__c=' + ord.Discounted_Amount__c);
            }

            // ── FREE PRODUCT ──────────────────────────────────────
            else if (scheme.Scheme_Type__c == 'Free Product') {
                // Build product qty map from order items
                Map<Id, Decimal> productQtyMap = new Map<Id, Decimal>();
                for (OrderItem oi : [
                    SELECT Quantity, PricebookEntry.Product2Id
                    FROM   OrderItem
                    WHERE  OrderId = :orderId
                ]) {
                    Id pid = oi.PricebookEntry.Product2Id;
                    productQtyMap.put(pid, (productQtyMap.containsKey(pid) ? productQtyMap.get(pid) : 0) + oi.Quantity);
                }

                List<OrderItem> toInsert = new List<OrderItem>();
                for (Scheme_Product__c sp : scheme.Scheme_Products__r) {
                    Decimal minQty = sp.Minimum_Quantity__c != null ? sp.Minimum_Quantity__c : 0;
                    if (productQtyMap.containsKey(sp.Product__c)
                            && productQtyMap.get(sp.Product__c) >= minQty) {

                        // Find PricebookEntry for the free product
                        List<PricebookEntry> pbes = [
                            SELECT Id
                            FROM   PricebookEntry
                            WHERE  Product2Id  = :sp.Free_Product__c
                               AND Pricebook2Id = :ord.Pricebook2Id
                            LIMIT  1
                        ];
                        if (pbes.isEmpty()) {
                            throw new AuraHandledException(
                                'Free product is not in the order\'s pricebook. '
                                + 'Please add it to the pricebook first.'
                            );
                        }

                        toInsert.add(new OrderItem(
                            OrderId          = orderId,
                            Quantity         = sp.Free_Quantity__c != null ? sp.Free_Quantity__c : 1,
                            UnitPrice        = 0,
                            PricebookEntryId = pbes[0].Id
                        ));
                        System.debug('Free product OrderItem prepared | freeProductId=' + sp.Free_Product__c);
                    }
                }
                if (!toInsert.isEmpty()) {
                    insert toInsert;
                    System.debug('Free product OrderItems inserted | count=' + toInsert.size());
                }
            }

            // ── FLAT DISCOUNT ─────────────────────────────────────
            else if (scheme.Scheme_Type__c == 'Discount') {
                Decimal orderTotal = ord.TotalAmount != null ? ord.TotalAmount : 0;
                Decimal pct = 10;
                if (!scheme.Scheme_Products__r.isEmpty()
                        && scheme.Scheme_Products__r[0].Free_Quantity__c != null) {
                    // Discount_Percentage__c mapped if available; fallback 10%
                }
                discount = (orderTotal * pct / 100).setScale(2);
                ord.Discounted_Amount__c = (ord.Discounted_Amount__c != null ? ord.Discounted_Amount__c : 0) + discount;
                update ord;
            }

        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (DmlException dml) {
            System.debug('DML error: ' + dml.getMessage());
            throw new AuraHandledException('Database error: ' + dml.getDmlMessage(0));
        } catch (Exception e) {
            System.debug('Unexpected error: ' + e.getMessage());
            throw new AuraHandledException('Unexpected error: ' + e.getMessage());
        }

        // ── Track application ─────────────────────────────────────
        insert new Scheme_Application__c(
            Order__c           = orderId,
            Scheme__c          = schemeId,
            Discount_Amount__c = discount,
            Applied_Date__c    = Date.today(),
            isApplied__c       = true
        );
        System.debug('Scheme_Application__c inserted | discount=' + discount);
    }
}