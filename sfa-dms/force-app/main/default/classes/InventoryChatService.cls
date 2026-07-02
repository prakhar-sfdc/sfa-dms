/**
 * InventoryChatService
 * ─────────────────────────────────────────────────────────────────────────────
 * Powers a conversational inventory assistant.
 *
 * The user types a message in an LWC chat UI.
 * The LWC sends:
 *   - userMessage      : what the user just typed
 *   - conversationJson : the full chat history so far (JSON array)
 *   - days             : number of days to look back (parsed client-side
 *                        from the message, or carried from previous turn)
 *
 * This class:
 *   1. Parses `days` from the message if the user said "last 30 days" etc.
 *   2. Pulls fresh inventory + dealer + order data for that window.
 *   3. Sends everything to Einstein Prompt Builder with the conversation
 *      history so the LLM can answer in context.
 *   4. Returns the AI reply + the resolved `days` value back to the LWC.
 * ─────────────────────────────────────────────────────────────────────────────
 */
public with sharing class InventoryChatService {

    // ── Invocable wrapper (Agentforce) ────────────────────────────────────────

    public class ActionInput {
        @InvocableVariable(label='User Message')
        public String userMessage;

        @InvocableVariable(label='Conversation JSON')
        public String conversationJson;

        @InvocableVariable(label='Days')
        public Integer days;
    }

    public class ActionOutput {
        @InvocableVariable(label='AI Reply')
        public String aiReply;

        @InvocableVariable(label='Resolved Days')
        public Integer resolvedDays;
    }

    @InvocableMethod(
        label='Inventory Chat'
        description='Conversational inventory assistant. Accepts a user message and chat history, returns an AI reply.'
        category='Inventory'
    )
    public static List<ActionOutput> inventoryChat(List<ActionInput> inputs) {
        ActionInput inp = inputs[0];
        ActionOutput out = new ActionOutput();
        try {
            Map<String, Object> result = processChat(
                inp.userMessage,
                inp.conversationJson,
                inp.days
            );
            out.aiReply      = (String)  result.get('aiReply');
            out.resolvedDays = (Integer) result.get('resolvedDays');
        } catch (Exception e) {
            out.aiReply      = 'Sorry, I ran into an error: ' + e.getMessage();
            out.resolvedDays = inp.days != null ? inp.days : 90;
        }
        return new List<ActionOutput>{ out };
    }

    // ── AuraEnabled (LWC direct call) ─────────────────────────────────────────

    @AuraEnabled
    public static String chat(String userMessage, String conversationJson, Integer days) {
        try {
            Map<String, Object> result = processChat(userMessage, conversationJson, days);
            return JSON.serialize(result);
        } catch (Exception e) {
            System.debug('InventoryChatService ERROR ==> ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    private static Map<String, Object> processChat(
        String userMessage,
        String conversationJson,
        Integer days
    ) {
        // 1. Resolve how many days to look back
        //    Priority: explicit mention in current message > carried value > default 90
        Integer resolvedDays = extractDays(userMessage);
        if (resolvedDays == null) resolvedDays = (days != null ? days : 90);

        // 2. Get current user / distributor account
        Id currentUserId = '005dL00001jNq6j';
        User currentUser = [SELECT Id, AccountId FROM User WHERE Id = :currentUserId LIMIT 1];
        Id accountId = '001dL00001rJ9tSQAS';
        if (accountId == null) {
            throw new AuraHandledException('User is not linked to a Distributor Account.');
        }

        // 3. Pull data
        Date trendStart = Date.today().addDays(-resolvedDays);

        List<Dealer_Inventory__c> inventoryRecords = [
            SELECT Id, Product__c, Product__r.Name, Product__r.ProductCode,
                   Available_Stock__c, Reorder_Level__c, Last_Restocked_Date__c
            FROM Dealer_Inventory__c
            WHERE Distributor__c = :accountId
            ORDER BY Available_Stock__c ASC
            LIMIT 100
        ];

        Set<Id> productIds = new Set<Id>();
        for (Dealer_Inventory__c inv : inventoryRecords) {
            if (inv.Product__c != null) productIds.add(inv.Product__c);
        }

        List<Account> dealers = [
            SELECT Id, Name, Phone, Email__c,
                (SELECT Id, Net_Amount__c, EffectiveDate,
                        (SELECT Product2Id, Product2.Name, Quantity, TotalPrice FROM OrderItems)
                 FROM Orders
                 WHERE EffectiveDate >= :trendStart
                 ORDER BY EffectiveDate DESC)
            FROM Account
            WHERE Onboarded_By__c = :currentUserId
            LIMIT 50
        ];

        Set<Id> dealerAccountIds = new Set<Id>();
        for (Account a : dealers) dealerAccountIds.add(a.Id);

        List<OrderItem> trendItems = new List<OrderItem>();
        if (!productIds.isEmpty() && !dealerAccountIds.isEmpty()) {
            trendItems = [
                SELECT Product2Id, Product2.Name, Quantity, TotalPrice,
                       Order.EffectiveDate, Order.AccountId, Order.Account.Name
                FROM OrderItem
                WHERE Product2Id IN :productIds
                  AND Order.EffectiveDate >= :trendStart
                  AND Order.AccountId IN :dealerAccountIds
                LIMIT 500
            ];
        }

        // 4. Aggregate
        Map<Id, Decimal>           productQtySold  = new Map<Id, Decimal>();
        Map<Id, Decimal>           productRevenue  = new Map<Id, Decimal>();
        Map<Id, Map<Id, Decimal>>  prodDealerQty   = new Map<Id, Map<Id, Decimal>>();
        Map<Id, String>            dealerNames     = new Map<Id, String>();

        for (Account a : dealers) dealerNames.put(a.Id, a.Name);

        for (OrderItem oi : trendItems) {
            Id pid   = oi.Product2Id;
            Id accId = oi.Order.AccountId;

            Decimal prevQty = productQtySold.containsKey(pid) ? productQtySold.get(pid) : 0;
            productQtySold.put(pid, prevQty + (oi.Quantity != null ? oi.Quantity : 0));

            Decimal prevRev = productRevenue.containsKey(pid) ? productRevenue.get(pid) : 0;
            productRevenue.put(pid, prevRev + (oi.TotalPrice != null ? oi.TotalPrice : 0));

            if (!prodDealerQty.containsKey(pid)) prodDealerQty.put(pid, new Map<Id, Decimal>());
            Map<Id, Decimal> dqMap = prodDealerQty.get(pid);
            Decimal prevDQ = dqMap.containsKey(accId) ? dqMap.get(accId) : 0;
            dqMap.put(accId, prevDQ + (oi.Quantity != null ? oi.Quantity : 0));
        }

        // 5. Build inventory payload
        List<Map<String, Object>> inventoryPayload  = new List<Map<String, Object>>();
        List<Map<String, Object>> overstockPayload  = new List<Map<String, Object>>();
        List<Map<String, Object>> understockPayload = new List<Map<String, Object>>();

        for (Dealer_Inventory__c inv : inventoryRecords) {
            Id      pid     = inv.Product__c;
            Decimal stock   = inv.Available_Stock__c != null ? inv.Available_Stock__c : 0;
            Decimal reorder = inv.Reorder_Level__c   != null ? inv.Reorder_Level__c   : 0;
            Decimal qtySold = productQtySold.containsKey(pid) ? productQtySold.get(pid) : 0;
            Decimal revenue = productRevenue.containsKey(pid) ? productRevenue.get(pid) : 0;

            // Top dealer for this product
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
            if (topDealerName != null) {
                for (Account a : dealers) {
                    if (a.Name == topDealerName) {
                        topDealerContact = a.Phone != null ? a.Phone : a.Email__c;
                        break;
                    }
                }
            }

            String stockStatus;
            if      (stock == 0)                            stockStatus = 'out_of_stock';
            else if (reorder > 0 && stock < reorder)       stockStatus = 'low_stock';
            else if (qtySold > 0 && stock > (qtySold * 3)) stockStatus = 'overstock';
            else                                            stockStatus = 'healthy';

            Map<String, Object> item = new Map<String, Object>{
                'productName'       => inv.Product__r.Name,
                'availableStock'    => stock,
                'reorderLevel'      => reorder,
                'qtySold'           => qtySold,
                'revenue'           => formatCurrency(revenue),
                'stockStatus'       => stockStatus,
                'topDealerName'     => topDealerName,
                'topDealerContact'  => topDealerContact,
                'topDealerQty'      => topDealerQty
            };
            inventoryPayload.add(item);
            if (stockStatus == 'low_stock' || stockStatus == 'out_of_stock') understockPayload.add(item);
            else if (stockStatus == 'overstock') overstockPayload.add(item);
        }

        // 6. Build dealer payload
        List<Map<String, Object>> dealerPayload = new List<Map<String, Object>>();
        for (Account a : dealers) {
            Decimal total  = 0;
            Integer orders = 0;
            Set<String> prods = new Set<String>();
            if (a.Orders != null) {
                for (Order o : a.Orders) {
                    orders++;
                    if (o.Net_Amount__c != null) total += o.Net_Amount__c;
                    if (o.OrderItems != null) {
                        for (OrderItem oi : o.OrderItems) {
                            if (oi.Product2 != null) prods.add(oi.Product2.Name);
                        }
                    }
                }
            }
            dealerPayload.add(new Map<String, Object>{
                'dealerName'      => a.Name,
                'phone'           => a.Phone,
                'totalOrderValue' => formatCurrency(total),
                'orderCount'      => orders,
                'products'        => new List<String>(prods)
            });
        }

        // 7. Summary stats
        Map<String, Object> stats = new Map<String, Object>{
            'totalProducts'   => inventoryRecords.size(),
            'outOfStockCount' => countByStatus(inventoryPayload, 'out_of_stock'),
            'lowStockCount'   => countByStatus(inventoryPayload, 'low_stock'),
            'overstockCount'  => countByStatus(inventoryPayload, 'overstock'),
            'healthyCount'    => countByStatus(inventoryPayload, 'healthy'),
            'totalDealers'    => dealers.size(),
            'daysAnalysed'    => resolvedDays,
            'reportDate'      => String.valueOf(Date.today()),
            'fromDate'        => String.valueOf(trendStart)
        };

        // 8. Parse conversation history
        List<Object> conversationHistory = new List<Object>();
        if (!String.isBlank(conversationJson)) {
            try {
                conversationHistory = (List<Object>) JSON.deserializeUntyped(conversationJson);
            } catch (Exception e) {
                System.debug('Could not parse conversation: ' + e.getMessage());
            }
        }

       // 9. Merge inventory + stats into one payload  ← NEW
Map<String, Object> inventoryContext = new Map<String, Object>{
    'stats'       => stats,
    'inventory'   => inventoryPayload,
    'understock'  => understockPayload,
    'overstock'   => overstockPayload
};

// 10. Call Einstein Prompt Builder  ← was step 9
ConnectApi.WrappedValue msgVal  = new ConnectApi.WrappedValue(); msgVal.value  = userMessage;
ConnectApi.WrappedValue histVal = new ConnectApi.WrappedValue(); histVal.value = JSON.serialize(conversationHistory);
ConnectApi.WrappedValue invVal  = new ConnectApi.WrappedValue(); invVal.value  = JSON.serialize(inventoryContext);
ConnectApi.WrappedValue dealVal = new ConnectApi.WrappedValue(); dealVal.value = JSON.serialize(dealerPayload);

Map<String, ConnectApi.WrappedValue> params = new Map<String, ConnectApi.WrappedValue>{
    'Input:User_Message'         => msgVal,
    'Input:Conversation_History' => histVal,
    'Input:Inventory_Context'    => invVal,   // ← replaces 4 old vars
    'Input:Dealer_Data'          => dealVal
};

        ConnectApi.EinsteinPromptTemplateGenerationsInput aiInput =
            new ConnectApi.EinsteinPromptTemplateGenerationsInput();
        aiInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
        aiInput.additionalConfig.applicationName = 'PromptBuilderPreview';
        aiInput.isPreview   = false;
        aiInput.inputParams = params;

        ConnectApi.EinsteinPromptTemplateGenerationsRepresentation aiOutput =
            ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
                'Inventory_Chat_Assistant', aiInput
            );

        if (aiOutput == null || aiOutput.generations == null || aiOutput.generations.isEmpty()) {
            throw new AuraHandledException('Einstein returned no response.');
        }

        String aiReply = aiOutput.generations[0].text;
        System.debug('Inventory Chat AI reply ==> ' + aiReply);

        return new Map<String, Object>{
            'aiReply'      => aiReply,
            'resolvedDays' => resolvedDays
        };
    }

    // ── Parse days from natural language ─────────────────────────────────────
    // Handles: "last 30 days", "past 7 days", "last week", "last month",
    //          "last 2 weeks", "last 3 months", "this week", "today"
    private static Integer extractDays(String msg) {
        if (String.isBlank(msg)) return null;
        String m = msg.toLowerCase();

        // Explicit number: "last 30 days", "past 45 days"
        Pattern p = Pattern.compile('(?:last|past)\\s+(\\d+)\\s+days?');
        Matcher mt = p.matcher(m);
        if (mt.find()) return Integer.valueOf(mt.group(1));

        // Weeks: "last 2 weeks"
        Pattern pw = Pattern.compile('(?:last|past)\\s+(\\d+)\\s+weeks?');
        Matcher mw = pw.matcher(m);
        if (mw.find()) return Integer.valueOf(mw.group(1)) * 7;

        // Months: "last 3 months"
        Pattern pm = Pattern.compile('(?:last|past)\\s+(\\d+)\\s+months?');
        Matcher mm2 = pm.matcher(m);
        if (mm2.find()) return Integer.valueOf(mm2.group(1)) * 30;

        // Named periods
        if (m.contains('today'))                             return 1;
        if (m.contains('this week') || m.contains('last week'))   return 7;
        if (m.contains('this month') || m.contains('last month')) return 30;
        if (m.contains('last quarter'))                      return 90;
        if (m.contains('last year'))                         return 365;

        return null; // not found — caller keeps previous value
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