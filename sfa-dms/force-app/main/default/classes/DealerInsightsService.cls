public with sharing class DealerInsightsService {

    @AuraEnabled
    public static String getAIInsights() {
        try {
            User currentUser = [SELECT Id, AccountId FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
            Id userId    = currentUser.Id;
            Id accountId = currentUser.AccountId;

            if (accountId == null) {
                throw new AuraHandledException('User is not linked to a Dealer Account.');
            }

            // ── Queries ───────────────────────────────────────────────────────
            List<Order> orders = [
                SELECT OrderNumber, Status, EffectiveDate, Net_Amount__c
                FROM Order
                WHERE AccountId = :accountId
                ORDER BY EffectiveDate DESC
                LIMIT 50
            ];

            List<OrderItem> orderItems = [
                SELECT Product2.Name, Quantity, TotalPrice
                FROM OrderItem
                WHERE Order.AccountId = :accountId
                LIMIT 100
            ];

            List<Account> dealers = [
                SELECT Name, (SELECT Net_Amount__c FROM Orders)
                FROM Account
                WHERE Onboarded_By__c = :userId
                LIMIT 20
            ];

            List<Dealer_Inventory__c> inventory = [
                SELECT Product__r.Name, Available_Stock__c
                FROM Dealer_Inventory__c
                WHERE Distributor__c = :accountId
                ORDER BY Available_Stock__c ASC
                LIMIT 15
            ];

            // ── Scheme Queries ────────────────────────────────────────────────
            Date today = Date.today();

            // Active schemes (not yet ended)
            List<Scheme__c> activeSchemes = [
                SELECT Id, Name, Scheme_Type__c, Start_Date__c, End_Date__c, Status__c,
                    (SELECT Id, Product__c, Product__r.Name,
                            Discount_Percentage__c, Free_Product__c, Free_Product__r.Name,
                            Free_Quantity__c, Minimum_Quantity__c
                     FROM Scheme_Products__r),
                    (SELECT Id, From_Amount__c, To_Amount__c, Discount__c
                     FROM Scheme_Slabs__r
                     ORDER BY From_Amount__c ASC)
                FROM Scheme__c
                WHERE Status__c = 'Active'
                  AND (End_Date__c = null OR End_Date__c >= :today)
                LIMIT 20
            ];

            // Scheme applications for this account's orders
            Set<Id> orderIds = new Set<Id>();
            for (Order o : orders) orderIds.add(o.Id);

            List<Scheme_Application__c> applications = [
                SELECT Id, Scheme__c, Order__c, isApplied__c,
                       Discount_Amount__c, Applied_Date__c,
                       (SELECT Id, Product__c, Product__r.Name,
                               Discount_Amount__c, Quantity__c
                        FROM Scheme_Application_Line_Items__r)
                FROM Scheme_Application__c
                WHERE Order__c IN :orderIds
                LIMIT 100
            ];

            // Map: scheme Id → is applied (at least once) for this dealer
            Map<Id, Boolean> schemeAppliedMap = new Map<Id, Boolean>();
            Map<Id, Decimal> schemeDiscountMap = new Map<Id, Decimal>();
            for (Scheme_Application__c app : applications) {
                if (app.isApplied__c) {
                    schemeAppliedMap.put(app.Scheme__c, true);
                }
                Decimal prev = schemeDiscountMap.containsKey(app.Scheme__c)
                    ? schemeDiscountMap.get(app.Scheme__c) : 0;
                if (app.Discount_Amount__c != null) {
                    schemeDiscountMap.put(app.Scheme__c, prev + app.Discount_Amount__c);
                }
            }

            // Total order amount for this dealer (to calculate slab gap)
            Decimal totalOrderAmount = 0;
            for (Order o : orders) {
                if (o.Net_Amount__c != null) totalOrderAmount += o.Net_Amount__c;
            }

            // ── Build Scheme AI Data ──────────────────────────────────────────
            List<Map<String, Object>> schemeAiData = new List<Map<String, Object>>();
            List<Map<String, Object>> schemeCardData = new List<Map<String, Object>>();
            Integer scId = 1;

            for (Scheme__c s : activeSchemes) {
                Boolean isApplied = schemeAppliedMap.containsKey(s.Id)
                    ? schemeAppliedMap.get(s.Id) : false;
                Decimal totalDiscount = schemeDiscountMap.containsKey(s.Id)
                    ? schemeDiscountMap.get(s.Id) : 0;
                Integer daysLeft = s.End_Date__c != null
                    ? today.daysBetween(s.End_Date__c) : 9999;
                String schemeStatus = daysLeft <= 7 ? 'expiring_soon' : 'active';

                // Build product details
                List<Map<String, Object>> productsDetail = new List<Map<String, Object>>();
                for (Scheme_Product__c sp : s.Scheme_Products__r) {
                    Map<String, Object> pd = new Map<String, Object>{
                        'productName'       => sp.Product__r.Name,
                        'discountPercent'   => sp.Discount_Percentage__c,
                        'freeProduct'       => sp.Free_Product__r != null ? sp.Free_Product__r.Name : null,
                        'freeQuantity'      => sp.Free_Quantity__c,
                        'minimumQuantity'   => sp.Minimum_Quantity__c
                    };
                    productsDetail.add(pd);
                }

                // Build slab details + compute gap
                List<Map<String, Object>> slabsDetail = new List<Map<String, Object>>();
                String nextSlabGap = null;
                Decimal nextSlabDiscount = null;
                for (Scheme_Slab__c slab : s.Scheme_Slabs__r) {
                    slabsDetail.add(new Map<String, Object>{
                        'fromAmount'  => slab.From_Amount__c,
                        'toAmount'    => slab.To_Amount__c,
                        'discount'    => slab.Discount__c
                    });
                    // Find first slab dealer hasn't reached yet
                    if (nextSlabGap == null
                            && slab.From_Amount__c != null
                            && totalOrderAmount < slab.From_Amount__c) {
                        Decimal gap = slab.From_Amount__c - totalOrderAmount;
                        nextSlabGap      = formatCurrency(gap) + ' more to reach '
                            + slab.Discount__c + '% slab';
                        nextSlabDiscount = slab.Discount__c;
                    }
                }

                // Human-readable benefit string
                String benefit = '';
                if (s.Scheme_Type__c == 'Product Based' && !productsDetail.isEmpty()) {
                    Map<String, Object> fp = productsDetail[0];
                    if (fp.get('discountPercent') != null) {
                        benefit = fp.get('discountPercent') + '% off on ' + fp.get('productName');
                    } else if (fp.get('freeProduct') != null) {
                        benefit = 'Buy ' + fp.get('minimumQuantity') + ' ' + fp.get('productName')
                            + ', get ' + fp.get('freeQuantity') + ' ' + fp.get('freeProduct') + ' free';
                    }
                } else if (s.Scheme_Type__c == 'Slab Based' && !slabsDetail.isEmpty()) {
                    benefit = 'Up to ' + ((Decimal)slabsDetail[slabsDetail.size()-1].get('discount'))
                        + '% discount based on order value';
                }

                Map<String, Object> schemeMap = new Map<String, Object>{
                    'id'             => scId++,
                    'schemeName'     => s.Name,
                    'schemeType'     => s.Scheme_Type__c,
                    'startDate'      => s.Start_Date__c != null ? String.valueOf(s.Start_Date__c) : '',
                    'endDate'        => s.End_Date__c   != null ? String.valueOf(s.End_Date__c)   : 'No Expiry',
                    'daysLeft'       => daysLeft == 9999 ? null : daysLeft,
                    'status'         => schemeStatus,
                    'isApplied'      => isApplied,
                    'totalDiscount'  => formatCurrency(totalDiscount),
                    'benefit'        => benefit,
                    'gap'            => nextSlabGap != null ? nextSlabGap : (isApplied ? 'Already applied' : 'Check product quantities'),
                    'products'       => productsDetail,
                    'slabs'          => slabsDetail
                };

                schemeAiData.add(schemeMap);
                schemeCardData.add(schemeMap);
            }

            // ── KPIs ──────────────────────────────────────────────────────────
            Decimal totalSales = 0;
            for (Order o : orders) if (o.Net_Amount__c != null) totalSales += o.Net_Amount__c;

            Integer totalOrderCount = orders.size();
            Decimal avgOrderValue   = totalOrderCount > 0 ? (totalSales / totalOrderCount) : 0;

            Integer activeDealerCount = 0;
            for (Account a : dealers) {
                if (a.Orders != null && !a.Orders.isEmpty()) activeDealerCount++;
            }

            // Total scheme savings KPI
            Decimal totalSchemeSavings = 0;
            for (Decimal d : schemeDiscountMap.values()) totalSchemeSavings += d;

            List<Map<String, Object>> kpiData = new List<Map<String, Object>>{
                new Map<String, Object>{ 'id' => 1, 'title' => 'Monthly Sales',    'value' => formatCurrency(totalSales),           'subtitle' => 'From ' + totalOrderCount + ' orders'         },
                new Map<String, Object>{ 'id' => 2, 'title' => 'Active Dealers',   'value' => String.valueOf(activeDealerCount),     'subtitle' => 'Out of ' + dealers.size() + ' dealers'       },
                new Map<String, Object>{ 'id' => 3, 'title' => 'Active Schemes',   'value' => String.valueOf(activeSchemes.size()),  'subtitle' => String.valueOf(schemeAppliedMap.size()) + ' applied'  },
                new Map<String, Object>{ 'id' => 4, 'title' => 'Scheme Savings',   'value' => formatCurrency(totalSchemeSavings),   'subtitle' => 'Total discount earned'                       }
            };

            // ── Weekly Performance ────────────────────────────────────────────
            String[] dayOrder = new String[]{ 'Mon','Tue','Wed','Thu','Fri','Sat','Sun' };
            Map<String, Integer> dayOrders  = new Map<String, Integer> { 'Mon'=>0,'Tue'=>0,'Wed'=>0,'Thu'=>0,'Fri'=>0,'Sat'=>0,'Sun'=>0 };
            Map<String, Decimal> dayRevenue = new Map<String, Decimal>  { 'Mon'=>0,'Tue'=>0,'Wed'=>0,'Thu'=>0,'Fri'=>0,'Sat'=>0,'Sun'=>0 };

            for (Order o : orders) {
                if (o.EffectiveDate != null) {
                    String dow = getDayOfWeek(o.EffectiveDate);
                    dayOrders.put(dow, dayOrders.get(dow) + 1);
                    if (o.Net_Amount__c != null) dayRevenue.put(dow, dayRevenue.get(dow) + o.Net_Amount__c);
                }
            }

            List<Map<String, Object>> weeklyPerfData = new List<Map<String, Object>>();
            Integer wpId = 1;
            for (String d : dayOrder) {
                Integer cnt = dayOrders.get(d);
                if (cnt > 0) {
                    weeklyPerfData.add(new Map<String, Object>{
                        'id'      => wpId++,
                        'day'     => d,
                        'visits'  => cnt + (Integer) Math.round(cnt * 0.5),
                        'orders'  => cnt,
                        'revenue' => formatCurrency(dayRevenue.get(d))
                    });
                }
            }
            if (weeklyPerfData.isEmpty()) {
                for (String d : new String[]{ 'Mon','Tue','Wed','Thu','Fri' }) {
                    weeklyPerfData.add(new Map<String, Object>{ 'id' => wpId++, 'day' => d, 'visits' => 0, 'orders' => 0, 'revenue' => '₹0' });
                }
            }

            // ── Top Products ──────────────────────────────────────────────────
            Map<String, Decimal> productSalesMap = new Map<String, Decimal>();
            for (OrderItem oi : orderItems) {
                String pName = (oi.Product2 != null) ? oi.Product2.Name : 'Unknown';
                Decimal prev = productSalesMap.containsKey(pName) ? productSalesMap.get(pName) : 0;
                productSalesMap.put(pName, prev + (oi.TotalPrice != null ? oi.TotalPrice : 0));
            }

            List<Map<String, Object>> sortable = new List<Map<String, Object>>();
            for (String n : productSalesMap.keySet()) {
                sortable.add(new Map<String, Object>{ 'name' => n, 'sales' => productSalesMap.get(n) });
            }
            for (Integer i = 0; i < sortable.size() - 1; i++) {
                for (Integer j = 0; j < sortable.size() - 1 - i; j++) {
                    if ((Decimal)sortable[j].get('sales') < (Decimal)sortable[j+1].get('sales')) {
                        Map<String, Object> tmp = sortable[j];
                        sortable[j]   = sortable[j+1];
                        sortable[j+1] = tmp;
                    }
                }
            }

            List<Map<String, Object>> topProductsData = new List<Map<String, Object>>();
            Integer tpId = 1;
            for (Integer i = 0; i < Math.min(5, sortable.size()); i++) {
                topProductsData.add(new Map<String, Object>{
                    'id'    => tpId++,
                    'name'  => sortable[i].get('name'),
                    'sales' => formatCurrency((Decimal) sortable[i].get('sales'))
                });
            }
            if (topProductsData.isEmpty()) {
                for (Integer i = inventory.size() - 1; i >= Math.max(0, inventory.size() - 5); i--) {
                    Dealer_Inventory__c inv = inventory[i];
                    topProductsData.add(new Map<String, Object>{
                        'id'    => tpId++,
                        'name'  => inv.Product__r.Name,
                        'sales' => (inv.Available_Stock__c != null
                                    ? String.valueOf(Integer.valueOf(inv.Available_Stock__c)) + ' in stock'
                                    : '0 in stock')
                    });
                }
            }

            // ── Build AI Input ────────────────────────────────────────────────
            List<Map<String, Object>> orderAiData = new List<Map<String, Object>>();
            for (Order o : orders) {
                orderAiData.add(new Map<String, Object>{
                    'OrderNumber'   => o.OrderNumber,
                    'Status'        => o.Status,
                    'EffectiveDate' => String.valueOf(o.EffectiveDate),
                    'TotalAmount'   => o.Net_Amount__c
                });
            }

            List<Map<String, Object>> dealerAiData = new List<Map<String, Object>>();
            for (Account a : dealers) {
                Decimal tot = 0;
                if (a.Orders != null) for (Order o : a.Orders) if (o.Net_Amount__c != null) tot += o.Net_Amount__c;
                dealerAiData.add(new Map<String, Object>{ 'Name' => a.Name, 'TotalOrderAmount' => tot });
            }

            List<Map<String, Object>> inventoryAiData = new List<Map<String, Object>>();
            for (Dealer_Inventory__c inv : inventory) {
                inventoryAiData.add(new Map<String, Object>{
                    'ProductName'     => inv.Product__r.Name,
                    'Available_Stock' => inv.Available_Stock__c
                });
            }

            // ── Call Einstein ─────────────────────────────────────────────────
            ConnectApi.WrappedValue orderVal     = new ConnectApi.WrappedValue(); orderVal.value     = JSON.serialize(orderAiData);
            ConnectApi.WrappedValue dealerVal    = new ConnectApi.WrappedValue(); dealerVal.value    = JSON.serialize(dealerAiData);
            ConnectApi.WrappedValue inventoryVal = new ConnectApi.WrappedValue(); inventoryVal.value = JSON.serialize(inventoryAiData);
            ConnectApi.WrappedValue schemeVal    = new ConnectApi.WrappedValue(); schemeVal.value    = JSON.serialize(schemeAiData);

            Map<String, ConnectApi.WrappedValue> params = new Map<String, ConnectApi.WrappedValue>{
                'Input:Order_Data'     => orderVal,
                'Input:Dealer_Data'    => dealerVal,
                'Input:Inventory_Data' => inventoryVal,
                'Input:Scheme_Data'    => schemeVal
            };

            ConnectApi.EinsteinPromptTemplateGenerationsInput aiInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
            aiInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
            aiInput.additionalConfig.applicationName = 'PromptBuilderPreview';
            aiInput.isPreview   = false;
            aiInput.inputParams = params;

            ConnectApi.EinsteinPromptTemplateGenerationsRepresentation aiOutput =
                ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate('Dealer_AI_Insights', aiInput);

            if (aiOutput == null || aiOutput.generations == null || aiOutput.generations.isEmpty()) {
                throw new AuraHandledException('Einstein returned no response.');
            }

            String extracted = extractJson(aiOutput.generations[0].text);
            if (String.isBlank(extracted)) {
                throw new AuraHandledException('Could not extract JSON from AI response.');
            }

            Map<String, Object> aiResponse = (Map<String, Object>) JSON.deserializeUntyped(extracted);

            // ── Final Merged Response ─────────────────────────────────────────
            Map<String, Object> finalResponse = new Map<String, Object>{
                'kpis'              => kpiData,
                'weeklyPerformance' => weeklyPerfData,
                'topProducts'       => topProductsData,
                'schemes'           => schemeCardData,
                'insights'          => aiResponse.containsKey('insights')        ? aiResponse.get('insights')        : new List<Object>(),
                'recommendations'   => aiResponse.containsKey('recommendations') ? aiResponse.get('recommendations') : new List<Object>(),
                'schemeInsights'    => aiResponse.containsKey('schemeInsights')  ? aiResponse.get('schemeInsights')  : new List<Object>()
            };

            System.debug('FINAL RESPONSE ==> ' + JSON.serialize(finalResponse));
            return JSON.serialize(finalResponse);

        } catch (Exception e) {
            System.debug('DealerInsightsService ERROR ==> ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static String formatCurrency(Decimal amount) {
        if (amount == null || amount == 0) return '₹0';
        if (amount >= 100000) return '₹' + (amount / 100000).setScale(1) + 'L';
        if (amount >= 1000)   return '₹' + (amount / 1000).setScale(1)   + 'K';
        return '₹' + amount.setScale(0);
    }

    private static String getDayOfWeek(Date d) {
        Date refMonday = Date.newInstance(2024, 1, 1);
        Integer diff  = refMonday.daysBetween(d);
        Integer index = Math.mod(diff, 7);
        if (index < 0) index += 7;
        String[] days = new String[]{ 'Mon','Tue','Wed','Thu','Fri','Sat','Sun' };
        return days[index];
    }

    private static String extractJson(String input) {
        if (String.isBlank(input)) return '';
        input = input.replaceAll('[\\u00A0\\u200B\\u200C\\u200D\\uFEFF]', ' ');
        input = input.replaceAll('[\\u2018\\u2019]', '\'');
        input = input.replaceAll('[\\u201C\\u201D]', '"');
        input = input.trim();
        Integer start  = input.indexOf('{');
        Integer ending = input.lastIndexOf('}');
        return (start != -1 && ending != -1) ? input.substring(start, ending + 1) : '';
    }
}