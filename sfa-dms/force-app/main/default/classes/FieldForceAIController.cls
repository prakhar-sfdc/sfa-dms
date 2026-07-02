public with sharing class FieldForceAIController {

    public class AIInsightsResult {
        @AuraEnabled public List<Object> kpis;
        @AuraEnabled public List<Object> insights;
        @AuraEnabled public List<Object> weeklyPerformance;
        @AuraEnabled public List<Object> topProducts;
        @AuraEnabled public List<Object> dealerPerformance;
        @AuraEnabled public List<Object> actionItems;
        @AuraEnabled public List<Object> competitorAnalysis;
    }

    @AuraEnabled(cacheable=false)
    public static AIInsightsResult getFieldForceAIInsights() {
        try {
            Id userId = UserInfo.getUserId();
            Date thirtyDaysAgo = Date.today().addDays(-30);

            // ── 1. Orders ─────────────────────────────────────────────────────
            List<Order> orders = [
                SELECT OrderNumber, Status, EffectiveDate, Net_Amount__c, AccountId
                FROM Order
                WHERE CreatedById = :userId
                AND   EffectiveDate >= :thirtyDaysAgo
                ORDER BY EffectiveDate DESC
                LIMIT 50
            ];

            // ── 2. Order Items ────────────────────────────────────────────────
            Set<Id> orderIds = new Set<Id>();
            for (Order o : orders) orderIds.add(o.Id);

            List<OrderItem> orderItems = orderIds.isEmpty() ? new List<OrderItem>() : [
                SELECT Product2.Name, Quantity, TotalPrice
                FROM OrderItem
                WHERE OrderId IN :orderIds
                LIMIT 100
            ];

            // ── 3. Dealers ────────────────────────────────────────────────────
            List<Account> dealers = [
                SELECT Name, BillingCity,
                       (SELECT Net_Amount__c FROM Orders ORDER BY EffectiveDate DESC LIMIT 5)
                FROM Account
                WHERE RecordType.Name = 'Dealer'
                LIMIT 20
            ];

            // ── 4. Inventory ──────────────────────────────────────────────────
            List<Dealer_Inventory__c> inventory = new List<Dealer_Inventory__c>();
            if (!dealers.isEmpty()) {
                Set<Id> dealerIds = new Set<Id>();
                for (Account a : dealers) dealerIds.add(a.Id);
                inventory = [
                    SELECT Product__r.Name, Available_Stock__c, Distributor__r.Name
                    FROM Dealer_Inventory__c
                    WHERE Distributor__c IN :dealerIds
                    ORDER BY Available_Stock__c ASC
                    LIMIT 20
                ];
            }

            // ── 5. Recent Visits ──────────────────────────────────────────────
            List<Visit__c> recentVisits = [
                SELECT Account__r.Name, Visit_Status__c, Visit_Date__c, Planned_Start_Time__c
                FROM Visit__c
                WHERE OwnerId = :userId
                AND   Visit_Date__c >= :thirtyDaysAgo
                ORDER BY Visit_Date__c DESC
                LIMIT 30
            ];

            // ── 6. Competitor Market Analysis ─────────────────────────────────
            List<Competitor_Market_Analysis__c> competitorRecords = [
                SELECT
                    Name,
                    Account__r.Name,
                    Analysis_Date__c,
                    Competitor_Name__c,
                    Competitor_Price__c,
                    Competitor_Product__c,
                    Competitor_Stock__c,
                    Customer_Demand_Trend__c,
                    Dealer_Preference__c,
                    Display_Visibility__c,
                    Our_Price__c,
                    Our_Product__c,
                    Our_Stock__c,
                    Price_Difference_INR__c,
                    Price_Sensitivity__c,
                    Promo_Scheme_Active__c,
                    Shelf_Share_Percent__c,
                    Stock_Ratio__c,
                    Visit__r.Name
                FROM Competitor_Market_Analysis__c
                WHERE Analysis_Date__c >= :thirtyDaysAgo
                ORDER BY Analysis_Date__c DESC
                LIMIT 30
            ];

            // ── Build payloads ────────────────────────────────────────────────
            List<Map<String, Object>> orderPayload = new List<Map<String, Object>>();
            for (Order o : orders) {
                orderPayload.add(new Map<String, Object>{
                    'orderNumber' => o.OrderNumber,
                    'status'      => o.Status,
                    'date'        => String.valueOf(o.EffectiveDate),
                    'amount'      => o.Net_Amount__c
                });
            }

            List<Map<String, Object>> dealerPayload = new List<Map<String, Object>>();
            for (Account a : dealers) {
                Decimal tot = 0;
                if (a.Orders != null) {
                    for (Order o : a.Orders) {
                        if (o.Net_Amount__c != null) tot += o.Net_Amount__c;
                    }
                }
                dealerPayload.add(new Map<String, Object>{
                    'name'         => a.Name,
                    'city'         => a.BillingCity,
                    'totalRevenue' => tot
                });
            }

            List<Map<String, Object>> inventoryPayload = new List<Map<String, Object>>();
            for (Dealer_Inventory__c inv : inventory) {
                inventoryPayload.add(new Map<String, Object>{
                    'product' => inv.Product__r.Name,
                    'dealer'  => inv.Distributor__r.Name,
                    'stock'   => inv.Available_Stock__c
                });
            }

            List<Map<String, Object>> visitPayload = new List<Map<String, Object>>();
            for (Visit__c v : recentVisits) {
                visitPayload.add(new Map<String, Object>{
                    'account' => v.Account__r.Name,
                    'status'  => v.Visit_Status__c,
                    'date'    => String.valueOf(v.Visit_Date__c)
                });
            }

            List<Map<String, Object>> competitorPayload = new List<Map<String, Object>>();
            for (Competitor_Market_Analysis__c c : competitorRecords) {
                competitorPayload.add(new Map<String, Object>{
                    'account'          => c.Account__r != null ? c.Account__r.Name : '',
                    'analysisDate'     => c.Analysis_Date__c != null ? String.valueOf(c.Analysis_Date__c) : '',
                    'competitorName'   => c.Competitor_Name__c,
                    'competitorPrice'  => c.Competitor_Price__c,
                    'competitorProduct'=> c.Competitor_Product__c,
                    'competitorStock'  => c.Competitor_Stock__c,
                    'demandTrend'      => c.Customer_Demand_Trend__c,
                    'dealerPreference' => c.Dealer_Preference__c,
                    'displayVisibility'=> c.Display_Visibility__c,
                    'ourPrice'         => c.Our_Price__c,
                    'ourProduct'       => c.Our_Product__c,
                    'ourStock'         => c.Our_Stock__c,
                    'priceDifference'  => c.Price_Difference_INR__c,
                    'priceSensitivity' => c.Price_Sensitivity__c,
                    'promoActive'      => c.Promo_Scheme_Active__c,
                    'shelfShare'       => c.Shelf_Share_Percent__c,
                    'stockRatio'       => c.Stock_Ratio__c
                });
            }

            // ── Call Einstein Prompt Builder ──────────────────────────────────
            ConnectApi.WrappedValue orderVal      = new ConnectApi.WrappedValue();
            ConnectApi.WrappedValue dealerVal     = new ConnectApi.WrappedValue();
            ConnectApi.WrappedValue inventoryVal  = new ConnectApi.WrappedValue();
            ConnectApi.WrappedValue visitVal      = new ConnectApi.WrappedValue();
            ConnectApi.WrappedValue competitorVal = new ConnectApi.WrappedValue();

            orderVal.value      = JSON.serialize(orderPayload);
            dealerVal.value     = JSON.serialize(dealerPayload);
            inventoryVal.value  = JSON.serialize(inventoryPayload);
            visitVal.value      = JSON.serialize(visitPayload);
            competitorVal.value = JSON.serialize(competitorPayload);

            Map<String, ConnectApi.WrappedValue> inputParams = new Map<String, ConnectApi.WrappedValue>{
                'Input:Order_Data'      => orderVal,
                'Input:Dealer_Data'     => dealerVal,
                'Input:Inventory_Data'  => inventoryVal,
                'Input:Visit_Data'      => visitVal,
                'Input:Competitor_Data' => competitorVal
            };

            ConnectApi.EinsteinPromptTemplateGenerationsInput aiInput =
                new ConnectApi.EinsteinPromptTemplateGenerationsInput();
            aiInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
            aiInput.additionalConfig.applicationName = 'PromptBuilderPreview';
            aiInput.isPreview   = false;
            aiInput.inputParams = inputParams;

            ConnectApi.EinsteinPromptTemplateGenerationsRepresentation aiOutput =
                ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
                    'Field_Force_AI_Insights_Updated', aiInput
                );

            if (aiOutput == null
                || aiOutput.generations == null
                || aiOutput.generations.isEmpty()) {
                throw new AuraHandledException('Einstein returned no response.');
            }

            String rawText = aiOutput.generations[0].text;
            String cleaned = cleanJson(rawText);
            Map<String, Object> parsed =
                (Map<String, Object>) JSON.deserializeUntyped(cleaned);

            AIInsightsResult result = new AIInsightsResult();
            result.kpis              = safeList(parsed, 'kpis');
            result.insights          = safeList(parsed, 'insights');
            result.weeklyPerformance = safeList(parsed, 'weeklyPerformance');
            result.topProducts       = safeList(parsed, 'topProducts');
            result.dealerPerformance = safeList(parsed, 'dealerPerformance');
            result.actionItems       = safeList(parsed, 'actionItems');
            result.competitorAnalysis= safeList(parsed, 'competitorAnalysis');

            return result;

        } catch (Exception e) {
            System.debug('FieldForceAIController ERROR => ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    private static String cleanJson(String input) {
        if (String.isBlank(input)) return '{}';
        input = input.replaceAll('[\\u00A0\\u200B\\u200C\\u200D\\uFEFF]', ' ');
        input = input.replaceAll('[\\u2018\\u2019]', '\'');
        input = input.replaceAll('[\\u201C\\u201D]', '"');
        input = input.replaceAll('[\\n\\r\\t]', '');
        input = input.trim();
        Integer start  = input.indexOf('{');
        Integer ending = input.lastIndexOf('}');
        return (start != -1 && ending != -1)
            ? input.substring(start, ending + 1)
            : '{}';
    }

    private static List<Object> safeList(Map<String, Object> m, String key) {
        if (m.containsKey(key) && m.get(key) instanceof List<Object>) {
            return (List<Object>) m.get(key);
        }
        return new List<Object>();
    }
}