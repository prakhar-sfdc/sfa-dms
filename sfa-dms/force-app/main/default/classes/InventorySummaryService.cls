/**
 * InventorySummaryService
 * ─────────────────────────────────────────────────────────────────────────────
 * Agentforce Action: Collects inventory, inventory line items, dealer orders,
 * and product sales trends, then calls an Einstein Prompt Builder template
 * ("Inventory_AI_Summary") to return a natural-language summary with insights.
 *
 * Invocable so it can be wired directly to an Agentforce Agent Action.
 * UserInfo.getUserId() is used to get the current user — works in both
 * Agentforce (system context) and AuraEnabled (user context) calls.
 * ─────────────────────────────────────────────────────────────────────────────
 */
public with sharing class InventorySummaryService {

    // ── Invocable wrapper for Agentforce ─────────────────────────────────────

    public class ActionInput {
        @InvocableVariable(label='User Message' description='What the user typed (unused, kept for agent wiring)')
        public String userMessage;
    }

    public class ActionOutput {
        @InvocableVariable(label='Inventory Summary' description='AI-generated inventory summary with insights')
        public String summary;
    }

    @InvocableMethod(
        label='Get Inventory Summary'
        description='Returns an AI-generated inventory summary with stock-up and dealer outreach recommendations.'
        category='Inventory'
    )
    public static List<ActionOutput> getInventorySummary(List<ActionInput> inputs) {
        ActionOutput out = new ActionOutput();
        try {
            out.summary = buildAndCallAI();
        } catch (Exception e) {
            out.summary = 'Error generating inventory summary: ' + e.getMessage();
        }
        return new List<ActionOutput>{ out };
    }

    // ── Also expose as @AuraEnabled so it can be tested from LWC ────────────

    @AuraEnabled
    public static String getAIInventorySummary() {
        try {
            return buildAndCallAI();
        } catch (Exception e) {
            System.debug('InventorySummaryService ERROR ==> ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    // ── Core logic ───────────────────────────────────────────────────────────

    private static String buildAndCallAI() {

        // UserInfo.getUserId() works in both Agentforce (system context)
        // and AuraEnabled (user context) — no need to pass it as input
        Id currentUserId = UserInfo.getUserId();

        User currentUser = [
            SELECT Id, AccountId
            FROM User
            WHERE Id = :currentUserId
            LIMIT 1
        ];
        // Id accountId = currentUser.AccountId;
		Id accountId = '001dL00001rJ9tSQAS';

        if (accountId == null) {
            throw new AuraHandledException('User is not linked to a Distributor Account.');
        }

        // ── 1. Inventory records ─────────────────────────────────────────────
        List<Dealer_Inventory__c> inventoryRecords = [
            SELECT Id,
                   Product__c,
                   Product__r.Name,
                   Product__r.ProductCode,
                   Available_Stock__c,
                   Reorder_Level__c,
                   Last_Restocked_Date__c,
                   Distributor__c
            FROM Dealer_Inventory__c
            WHERE Distributor__c = :accountId
            ORDER BY Available_Stock__c ASC
            LIMIT 100
        ];

        // ── 2. Collect product Ids to query sales trend ──────────────────────
        Set<Id> productIds = new Set<Id>();
        for (Dealer_Inventory__c inv : inventoryRecords) {
            if (inv.Product__c != null) productIds.add(inv.Product__c);
        }

        // ── 3. Dealers under this distributor (fetch BEFORE OrderItems) ──────
        // Must fetch dealers first so we can build dealerAccountIds set
        // to use in the OrderItem WHERE clause.
        // REASON: Salesforce does NOT support cross-object filters beyond one
        // level in a child SOQL WHERE clause — using Order.Account.Onboarded_By__c
        // causes a compile/runtime error. We resolve this by first fetching
        // dealer Account IDs and filtering Order.AccountId IN :dealerAccountIds.
        Date trendStart = Date.today().addDays(-120);

        List<Account> dealers = [
            SELECT Id, Name, Phone, Email__c,
                (SELECT Id, Net_Amount__c, EffectiveDate,
                        (SELECT Product2Id, Product2.Name, Quantity, TotalPrice
                         FROM OrderItems)
                 FROM Orders
                 WHERE EffectiveDate >= :trendStart
                 ORDER BY EffectiveDate DESC)
            FROM Account
            WHERE Onboarded_By__c = :'005dL00001jNq6j'
            LIMIT 50
        ];

        // Build dealer account ID set for safe single-level filter below
        Set<Id> dealerAccountIds = new Set<Id>();
        for (Account a : dealers) {
            dealerAccountIds.add(a.Id);
        }

        // ── 4. Order Items (last 90 days) — product sales trend ──────────────
        // FIX: filter by Order.AccountId IN dealerAccountIds (single-level)
        // instead of Order.Account.Onboarded_By__c (multi-level — unsupported)
        List<OrderItem> trendItems = new List<OrderItem>();
        if (!productIds.isEmpty() && !dealerAccountIds.isEmpty()) {
            trendItems = [
                SELECT Product2Id,
                       Product2.Name,
                       Quantity,
                       TotalPrice,
                       Order.EffectiveDate,
                       Order.AccountId,
                       Order.Account.Name
                FROM OrderItem
                WHERE Product2Id IN :productIds
                  AND Order.EffectiveDate >= :trendStart
                  AND Order.AccountId IN :dealerAccountIds
                LIMIT 500
            ];
        }

        // ── 5. Aggregate: product → total qty sold + revenue ─────────────────
        Map<Id, Decimal>  productQtySold    = new Map<Id, Decimal>();
        Map<Id, Decimal>  productRevenue    = new Map<Id, Decimal>();
        Map<Id, String>   productNames      = new Map<Id, String>();
        Map<Id, Map<Id, Decimal>> prodDealerQty = new Map<Id, Map<Id, Decimal>>();
        Map<Id, String>   dealerNames       = new Map<Id, String>();

        for (Account dealer : dealers) {
            dealerNames.put(dealer.Id, dealer.Name);
        }

        for (OrderItem oi : trendItems) {
            Id pid   = oi.Product2Id;
            Id accId = oi.Order.AccountId;

            productNames.put(pid, oi.Product2.Name);

            Decimal prevQty = productQtySold.containsKey(pid) ? productQtySold.get(pid) : 0;
            productQtySold.put(pid, prevQty + (oi.Quantity != null ? oi.Quantity : 0));

            Decimal prevRev = productRevenue.containsKey(pid) ? productRevenue.get(pid) : 0;
            productRevenue.put(pid, prevRev + (oi.TotalPrice != null ? oi.TotalPrice : 0));

            if (!prodDealerQty.containsKey(pid)) {
                prodDealerQty.put(pid, new Map<Id, Decimal>());
            }
            Map<Id, Decimal> dqMap = prodDealerQty.get(pid);
            Decimal prevDQ = dqMap.containsKey(accId) ? dqMap.get(accId) : 0;
            dqMap.put(accId, prevDQ + (oi.Quantity != null ? oi.Quantity : 0));
        }

        // ── 6. Build AI payload: inventory items ─────────────────────────────
        List<Map<String, Object>> inventoryAiData = new List<Map<String, Object>>();
        List<Map<String, Object>> overstockList   = new List<Map<String, Object>>();
        List<Map<String, Object>> understockList  = new List<Map<String, Object>>();

        for (Dealer_Inventory__c inv : inventoryRecords) {
            Id pid          = inv.Product__c;
            String pName    = inv.Product__r.Name;
            Decimal stock   = inv.Available_Stock__c != null ? inv.Available_Stock__c : 0;
            Decimal reorder = inv.Reorder_Level__c   != null ? inv.Reorder_Level__c   : 0;
            Decimal qtySold = productQtySold.containsKey(pid) ? productQtySold.get(pid) : 0;
            Decimal revenue = productRevenue.containsKey(pid) ? productRevenue.get(pid) : 0;

            // Find top dealer for this product
            String  topDealerName    = null;
            String  topDealerContact = null;
            Decimal topDealerQty     = 0;

            if (prodDealerQty.containsKey(pid)) {
                for (Id did : prodDealerQty.get(pid).keySet()) {
                    Decimal dq = prodDealerQty.get(pid).get(did);
                    if (dq > topDealerQty) {
                        topDealerQty  = dq;
                        topDealerName = dealerNames.containsKey(did) ? dealerNames.get(did) : 'Unknown';
                    }
                }
            }

            // Find contact details for top dealer
            // Uses PersonEmail (standard field on Person Account)
            // Change to a.Email__c if your org uses a custom email field instead
            if (topDealerName != null) {
                for (Account a : dealers) {
                    if (a.Name == topDealerName) {
                        topDealerContact = a.Phone != null ? a.Phone : a.Email__c;
                        break;
                    }
                }
            }

            // Classify stock health
            String stockStatus;
            if (stock == 0) {
                stockStatus = 'out_of_stock';
            } else if (reorder > 0 && stock < reorder) {
                stockStatus = 'low_stock';
            } else if (qtySold > 0 && stock > (qtySold * 3)) {
                stockStatus = 'overstock';
            } else {
                stockStatus = 'healthy';
            }

            Map<String, Object> item = new Map<String, Object>{
                'productId'         => pid,
                'productName'       => pName,
                'availableStock'    => stock,
                'reorderLevel'      => reorder,
                'qtySoldLast90Days' => qtySold,
                'revenueLast90Days' => formatCurrency(revenue),
                'stockStatus'       => stockStatus,
                'topDealerName'     => topDealerName,
                'topDealerContact'  => topDealerContact,
                'topDealerQty'      => topDealerQty
            };
            inventoryAiData.add(item);

            if (stockStatus == 'low_stock' || stockStatus == 'out_of_stock') {
                understockList.add(item);
            } else if (stockStatus == 'overstock') {
                overstockList.add(item);
            }
        }

        // ── 7. Build AI payload: dealer summary ──────────────────────────────
        List<Map<String, Object>> dealerAiData = new List<Map<String, Object>>();
        for (Account a : dealers) {
            Decimal dealerTotal = 0;
            Integer orderCount  = 0;
            Set<String> topProds = new Set<String>();

            if (a.Orders != null) {
                for (Order o : a.Orders) {
                    orderCount++;
                    if (o.Net_Amount__c != null) dealerTotal += o.Net_Amount__c;
                    if (o.OrderItems != null) {
                        for (OrderItem oi : o.OrderItems) {
                            if (oi.Product2 != null) topProds.add(oi.Product2.Name);
                        }
                    }
                }
            }

            dealerAiData.add(new Map<String, Object>{
                'dealerName'       => a.Name,
                'phone'            => a.Phone,
                'totalOrderValue'  => formatCurrency(dealerTotal),
                'recentOrderCount' => orderCount,
                'productsOrdered'  => new List<String>(topProds)
            });
        }

        // ── 8. Summary stats for the prompt ──────────────────────────────────
        Map<String, Object> summaryStats = new Map<String, Object>{
            'totalProducts'   => inventoryRecords.size(),
            'outOfStockCount' => countByStatus(inventoryAiData, 'out_of_stock'),
            'lowStockCount'   => countByStatus(inventoryAiData, 'low_stock'),
            'overstockCount'  => countByStatus(inventoryAiData, 'overstock'),
            'healthyCount'    => countByStatus(inventoryAiData, 'healthy'),
            'totalDealers'    => dealers.size(),
            'reportDate'      => String.valueOf(Date.today())
        };

        // ── 9. Call Einstein Prompt Builder ───────────────────────────────────
        ConnectApi.WrappedValue inventoryVal  = new ConnectApi.WrappedValue();
        inventoryVal.value  = JSON.serialize(inventoryAiData);

        ConnectApi.WrappedValue overstockVal  = new ConnectApi.WrappedValue();
        overstockVal.value  = JSON.serialize(overstockList);

        ConnectApi.WrappedValue understockVal = new ConnectApi.WrappedValue();
        understockVal.value = JSON.serialize(understockList);

        ConnectApi.WrappedValue dealerVal     = new ConnectApi.WrappedValue();
        dealerVal.value     = JSON.serialize(dealerAiData);

        ConnectApi.WrappedValue statsVal      = new ConnectApi.WrappedValue();
        statsVal.value      = JSON.serialize(summaryStats);

        Map<String, ConnectApi.WrappedValue> params = new Map<String, ConnectApi.WrappedValue>{
            'Input:Inventory_Data'  => inventoryVal,
            'Input:Overstock_Data'  => overstockVal,
            'Input:Understock_Data' => understockVal,
            'Input:Dealer_Data'     => dealerVal,
            'Input:Summary_Stats'   => statsVal
        };

        ConnectApi.EinsteinPromptTemplateGenerationsInput aiInput =
            new ConnectApi.EinsteinPromptTemplateGenerationsInput();
        aiInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
        aiInput.additionalConfig.applicationName = 'PromptBuilderPreview';
        aiInput.isPreview   = false;
        aiInput.inputParams = params;

        ConnectApi.EinsteinPromptTemplateGenerationsRepresentation aiOutput =
            ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
                'Inventory_AI_Summary', aiInput
            );

        if (aiOutput == null
                || aiOutput.generations == null
                || aiOutput.generations.isEmpty()) {
            throw new AuraHandledException('Einstein returned no response.');
        }

        String rawText = aiOutput.generations[0].text;
        System.debug('Inventory AI raw output ==> ' + rawText);
        return rawText;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String formatCurrency(Decimal amount) {
        if (amount == null || amount == 0) return '₹0';
        if (amount >= 10000000) return '₹' + (amount / 10000000).setScale(2) + 'Cr';
        if (amount >= 100000)   return '₹' + (amount / 100000).setScale(1)   + 'L';
        if (amount >= 1000)     return '₹' + (amount / 1000).setScale(1)     + 'K';
        return '₹' + amount.setScale(0);
    }

    private static Integer countByStatus(List<Map<String, Object>> data, String status) {
        Integer count = 0;
        for (Map<String, Object> item : data) {
            if (status.equals(item.get('stockStatus'))) count++;
        }
        return count;
    }
}