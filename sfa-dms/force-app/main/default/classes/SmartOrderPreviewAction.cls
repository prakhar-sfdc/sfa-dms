/**
 * SmartOrderPreviewAction
 * ─────────────────────────────────────────────────────────────────────────────
 * Agentforce Invocable Action — Step 1 of Smart Order Assistant
 *
 * What it does:
 *   1. Accepts the distributor's account email (Email__c) + an optional
 *      adjustment percentage (e.g. 20 means "increase by 20%", -10 means
 *      "reduce by 10%", 0 means "repeat exactly").
 *   2. Finds the Account record via Email__c.
 *   3. Fetches the most recent Activated Order for that account.
 *   4. Pulls all OrderItems (line items) from that order.
 *   5. Applies the adjustment % to each line item quantity.
 *   6. Checks current Main_Inventory__c stock for each product.
 *   7. Returns a human-readable preview string the Agent surfaces to the
 *      distributor BEFORE any order is created.
 *
 * The agent shows the preview and asks: "Shall I place this order?"
 * If yes → SmartOrderCreateAction is called.
 *
 * Author : (your name)
 * Version: 1.0
 */
public with sharing class SmartOrderPreviewAction {

    // ─────────────────────────────────────────────────────────────────────────
    // INPUT wrapper — one record per agent invocation
    // ─────────────────────────────────────────────────────────────────────────
    public class OrderPreviewRequest {

        @InvocableVariable(
            label='Account Email'
            description='The Email__c field on the Account record of the distributor'
            required=true
        )
        public String accountEmail;

        @InvocableVariable(
            label='Adjustment Percentage'
            description='Positive = increase qty, Negative = decrease qty, 0 = exact repeat. E.g. 20 means +20%.'
            required=false
        )
        public Decimal adjustmentPercentage;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OUTPUT wrapper — returned to the Agent
    // ─────────────────────────────────────────────────────────────────────────
    public class OrderPreviewResult {

        @InvocableVariable(label='Success')
        public Boolean isSuccess;

        @InvocableVariable(label='Error Message')
        public String errorMessage;

        @InvocableVariable(label='Account Id')
        public String accountId;

        @InvocableVariable(label='Account Name')
        public String accountName;

        @InvocableVariable(label='Source Order Id')
        public String sourceOrderId;

        @InvocableVariable(label='Source Order Number')
        public String sourceOrderNumber;

        @InvocableVariable(label='Source Order Date')
        public String sourceOrderDate;

        @InvocableVariable(label='Pricebook Id')
        public String pricebookId;

        /**
         * JSON array string of line items — the Agent reads this and tells the
         * distributor what will be ordered.
         * Format:
         * [
         *   {
         *     "productId"       : "01tXXXXXX",
         *     "productName"     : "Cement OPC 53 Grade",
         *     "inventoryId"     : "aXXXXXXXX",
         *     "originalQty"     : 100,
         *     "adjustedQty"     : 120,
         *     "unitPrice"       : 380.00,
         *     "lineTotal"       : 45600.00,
         *     "availableStock"  : 500,
         *     "stockWarning"    : false,
         *     "stockMessage"    : ""
         *   },
         *   ...
         * ]
         */
        @InvocableVariable(label='Order Lines JSON')
        public String orderLinesJson;

        @InvocableVariable(label='Preview Summary')
        public String previewSummary;

        @InvocableVariable(label='Has Stock Warnings')
        public Boolean hasStockWarnings;

        @InvocableVariable(label='Estimated Order Total')
        public Decimal estimatedTotal;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INVOCABLE ENTRY POINT
    // ─────────────────────────────────────────────────────────────────────────
    @InvocableMethod(
        label='Preview Smart Order from Last Order'
        description='Fetches the distributor\'s last order by account email, applies an adjustment percentage to all quantities, checks inventory stock, and returns a preview for agent confirmation. Does NOT create any records.'
        category='Order Management'
    )
    public static List<OrderPreviewResult> previewOrder(List<OrderPreviewRequest> requests) {

        List<OrderPreviewResult> results = new List<OrderPreviewResult>();

        for (OrderPreviewRequest req : requests) {
            results.add(processSingle(req));
        }

        return results;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CORE LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    private static OrderPreviewResult processSingle(OrderPreviewRequest req) {

        OrderPreviewResult result = new OrderPreviewResult();
        result.isSuccess        = false;
        result.hasStockWarnings = false;
        result.estimatedTotal   = 0;

        try {
            // ── 1. Validate input ────────────────────────────────────────────
            if (String.isBlank(req.accountEmail)) {
                result.errorMessage = 'Account email is required. Please provide the distributor\'s registered email address.';
                return result;
            }

            Decimal adjPct = (req.adjustmentPercentage == null) ? 0 : req.adjustmentPercentage;

            // ── 2. Find Account by Email__c ──────────────────────────────────
            List<Account> accounts = [
                SELECT Id, Name, Email__c
                FROM Account
                WHERE Email__c = :req.accountEmail.trim()
                LIMIT 1
            ];

            if (accounts.isEmpty()) {
                result.errorMessage = 'No account found with email: ' + req.accountEmail
                    + '. Please verify the email address and try again.';
                return result;
            }

            Account acc = accounts[0];
            result.accountId   = acc.Id;
            result.accountName = acc.Name;

            // ── 3. Fetch last Activated Order ────────────────────────────────
            List<Order> lastOrders = [
                SELECT Id, OrderNumber, EffectiveDate, Pricebook2Id, Status
                FROM Order
                WHERE AccountId = :acc.Id
                  AND Status    = 'Activated'
                ORDER BY EffectiveDate DESC, CreatedDate DESC
                LIMIT 1
            ];

            if (lastOrders.isEmpty()) {
                result.errorMessage = 'No previous activated orders found for ' + acc.Name
                    + '. Cannot generate a repeat order. Please create a fresh order instead.';
                return result;
            }

            Order lastOrder = lastOrders[0];
            result.sourceOrderId     = lastOrder.Id;
            result.sourceOrderNumber = lastOrder.OrderNumber;
            result.sourceOrderDate   = lastOrder.EffectiveDate != null
                ? lastOrder.EffectiveDate.format()
                : '';
            result.pricebookId = lastOrder.Pricebook2Id;

            if (lastOrder.Pricebook2Id == null) {
                result.errorMessage = 'The last order (' + lastOrder.OrderNumber
                    + ') does not have a Price Book assigned. Please contact your sales manager.';
                return result;
            }

            // ── 4. Fetch OrderItems from last order ──────────────────────────
            List<OrderItem> lastItems = [
                SELECT Id,
                       Product2Id,
                       Product2.Name,
                       Quantity,
                       UnitPrice,
                       TotalPrice,
                       PricebookEntryId
                FROM OrderItem
                WHERE OrderId = :lastOrder.Id
            ];

            if (lastItems.isEmpty()) {
                result.errorMessage = 'The last order (' + lastOrder.OrderNumber
                    + ') has no line items. Cannot generate a repeat order.';
                return result;
            }

            // ── 5. Collect product IDs for inventory lookup ──────────────────
            Set<Id> productIds = new Set<Id>();
            for (OrderItem oi : lastItems) {
                productIds.add(oi.Product2Id);
            }

            // ── 6. Fetch Main Inventory stock for those products ─────────────
            Map<Id, Main_Inventory__c> inventoryByProduct = new Map<Id, Main_Inventory__c>();

            for (Main_Inventory__c inv : [
                SELECT Id, Product__c, Available_Stock__c
                FROM Main_Inventory__c
                WHERE Product__c IN :productIds
            ]) {
                inventoryByProduct.put(inv.Product__c, inv);
            }

            // ── 7. Fetch current PricebookEntry prices ───────────────────────
            Map<Id, PricebookEntry> pbeByProduct = new Map<Id, PricebookEntry>();

            for (PricebookEntry pbe : [
                SELECT Id, Product2Id, UnitPrice
                FROM PricebookEntry
                WHERE Product2Id  IN :productIds
                  AND Pricebook2Id = :lastOrder.Pricebook2Id
                  AND IsActive     = true
            ]) {
                pbeByProduct.put(pbe.Product2Id, pbe);
            }

            // ── 8. Build preview lines ───────────────────────────────────────
            List<Map<String, Object>> lines    = new List<Map<String, Object>>();
            Boolean                  hasWarn   = false;
            Decimal                  grandTotal = 0;
            List<String>             summaryLines = new List<String>();
            List<String>             warningLines = new List<String>();

            for (OrderItem oi : lastItems) {

                // Calculate adjusted quantity — round to nearest whole unit
                Decimal originalQty  = oi.Quantity;
                Decimal multiplier   = 1 + (adjPct / 100);
                Decimal adjustedQty  = (originalQty * multiplier).round(System.RoundingMode.HALF_UP);

                if (adjustedQty <= 0) {
                    adjustedQty = 1; // Minimum 1 unit
                }

                // Get current price (use last order price as fallback)
                Decimal unitPrice = oi.UnitPrice;
                if (pbeByProduct.containsKey(oi.Product2Id)) {
                    unitPrice = pbeByProduct.get(oi.Product2Id).UnitPrice;
                }

                Decimal lineTotal = adjustedQty * unitPrice;
                grandTotal += lineTotal;

                // Check inventory stock
                Decimal availableStock = 0;
                Id      inventoryId    = null;
                Boolean stockWarning   = false;
                String  stockMessage   = '';

                if (inventoryByProduct.containsKey(oi.Product2Id)) {
                    Main_Inventory__c inv = inventoryByProduct.get(oi.Product2Id);
                    availableStock = inv.Available_Stock__c != null ? inv.Available_Stock__c : 0;
                    inventoryId    = inv.Id;

                    if (adjustedQty > availableStock) {
                        stockWarning = true;
                        hasWarn      = true;
                        stockMessage = 'Only ' + availableStock.intValue()
                            + ' units available (you need ' + adjustedQty.intValue() + ')';
                        warningLines.add('• ' + oi.Product2.Name + ': ' + stockMessage);
                    }
                } else {
                    // Product not found in inventory at all
                    stockWarning = true;
                    hasWarn      = true;
                    stockMessage = 'Product not found in Main Inventory';
                    warningLines.add('• ' + oi.Product2.Name + ': ' + stockMessage);
                }

                // Build line map for JSON
                Map<String, Object> line = new Map<String, Object>();
                line.put('productId',      oi.Product2Id);
                line.put('productName',    oi.Product2.Name);
                line.put('inventoryId',    inventoryId);
                line.put('originalQty',    originalQty.intValue());
                line.put('adjustedQty',    adjustedQty.intValue());
                line.put('unitPrice',      unitPrice);
                line.put('lineTotal',      lineTotal);
                line.put('availableStock', availableStock.intValue());
                line.put('stockWarning',   stockWarning);
                line.put('stockMessage',   stockMessage);
                lines.add(line);

                // Build summary line for the agent to read out
                String adjLabel = (adjPct == 0) ? ''
                    : (adjPct > 0 ? ' (+' + adjPct.intValue() + '%)' : ' (' + adjPct.intValue() + '%)');
                summaryLines.add(
                    oi.Product2.Name
                    + ': ' + adjustedQty.intValue() + ' units @ ₹' + unitPrice.setScale(2)
                    + adjLabel
                    + (stockWarning ? ' ⚠ LOW STOCK' : '')
                );
            }

            result.orderLinesJson     = JSON.serialize(lines);
            result.hasStockWarnings   = hasWarn;
            result.estimatedTotal     = grandTotal;

            // ── 9. Build the full preview summary string for the Agent ────────
            String adjDesc = (adjPct == 0)
                ? 'repeat of your last order'
                : (adjPct > 0
                    ? adjPct.intValue() + '% increase on your last order'
                    : Math.abs(adjPct).intValue() + '% reduction on your last order');

            String summary = 'Here is the order preview for ' + acc.Name
                + ' based on a ' + adjDesc
                + ' (Order #' + lastOrder.OrderNumber
                + ' dated ' + result.sourceOrderDate + '):\n\n';

            for (String line : summaryLines) {
                summary += line + '\n';
            }

            summary += '\nEstimated Order Total: ₹' + grandTotal.setScale(2);

            if (hasWarn) {
                summary += '\n\n⚠ STOCK WARNINGS — the following products have insufficient inventory:\n';
                for (String w : warningLines) {
                    summary += w + '\n';
                }
                summary += '\nYou can still proceed — the order will be created for available quantities only, '
                    + 'or you can adjust quantities before confirming.';
            }

            summary += '\n\nShall I go ahead and create this order?';

            result.previewSummary = summary;
            result.isSuccess      = true;

        } catch (Exception e) {
            result.isSuccess    = false;
            result.errorMessage = 'An error occurred while generating the order preview: '
                + e.getMessage()
                + ' Please try again or contact support.';
        }

        return result;
    }
}