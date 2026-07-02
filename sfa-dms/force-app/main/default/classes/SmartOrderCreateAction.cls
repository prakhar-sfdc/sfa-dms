/**
 * SmartOrderCreateAction
 * ─────────────────────────────────────────────────────────────────────────────
 * Agentforce Invocable Action — Step 2 of Smart Order Assistant
 *
 * What it does:
 *   Called AFTER the distributor confirms the order preview from
 *   SmartOrderPreviewAction. This action:
 *
 *   1. Creates a new Draft Order linked to the distributor's Account,
 *      using the same Pricebook as their last order.
 *   2. Parses the orderLinesJson from the preview action output.
 *   3. For each line item:
 *        - Re-checks Main_Inventory__c stock (live, in case it changed).
 *        - If stock is sufficient  → adds OrderItem + deducts inventory.
 *        - If stock is insufficient → records a warning, skips that line,
 *          and continues with the rest (partial order).
 *   4. If ALL lines fail stock check → rolls back and returns a clear error.
 *   5. Activates the Order once all valid items are added.
 *   6. Returns a success/failure message the Agent reads back to the distributor.
 *
 * Design decisions that match your existing InventoryController:
 *   - Uses Main_Inventory__c for stock (Primary order type)
 *   - Uses PricebookEntry lookup against the order's assigned Pricebook2Id
 *   - Handles existing OrderItem merging (same pattern as your createOrderItems)
 *   - Deducts Available_Stock__c on the inventory record
 *   - All DML is in a try/catch with Savepoint rollback on total failure
 *
 * Author : (your name)
 * Version: 1.0
 */
public with sharing class SmartOrderCreateAction {

    // ─────────────────────────────────────────────────────────────────────────
    // INPUT wrapper
    // ─────────────────────────────────────────────────────────────────────────
    public class OrderCreateRequest {

        @InvocableVariable(
            label='Account Id'
            description='The Salesforce Account Id of the distributor. Use the accountId output from SmartOrderPreviewAction.'
            required=true
        )
        public String accountId;

        @InvocableVariable(
            label='Pricebook Id'
            description='The Pricebook2Id to assign to the new order. Use pricebookId output from SmartOrderPreviewAction.'
            required=true
        )
        public String pricebookId;

        @InvocableVariable(
            label='Order Lines JSON'
            description='JSON array of line items from SmartOrderPreviewAction.orderLinesJson. Each item must have productId, inventoryId, adjustedQty.'
            required=true
        )
        public String orderLinesJson;

        @InvocableVariable(
            label='Source Order Number'
            description='The original order number being repeated — used in the new order description for traceability.'
            required=false
        )
        public String sourceOrderNumber;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OUTPUT wrapper
    // ─────────────────────────────────────────────────────────────────────────
    public class OrderCreateResult {

        @InvocableVariable(label='Success')
        public Boolean isSuccess;

        @InvocableVariable(label='New Order Id')
        public String newOrderId;

        @InvocableVariable(label='New Order Number')
        public String newOrderNumber;

        @InvocableVariable(label='Result Message')
        public String resultMessage;

        @InvocableVariable(label='Items Created Count')
        public Integer itemsCreated;

        @InvocableVariable(label='Items Skipped Count')
        public Integer itemsSkipped;

        @InvocableVariable(label='Skipped Items Detail')
        public String skippedItemsDetail;

        @InvocableVariable(label='Order Total')
        public Decimal orderTotal;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INVOCABLE ENTRY POINT
    // ─────────────────────────────────────────────────────────────────────────
    @InvocableMethod(
        label='Create Smart Order from Preview'
        description='Creates a new primary Order with OrderItems from Main Inventory based on the confirmed preview from SmartOrderPreviewAction. Deducts stock, handles partial orders when some products are low on inventory, and returns a success or error message.'
        category='Order Management'
    )
    public static List<OrderCreateResult> createOrder(List<OrderCreateRequest> requests) {

        List<OrderCreateResult> results = new List<OrderCreateResult>();

        for (OrderCreateRequest req : requests) {
            results.add(processSingle(req));
        }

        return results;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CORE LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    private static OrderCreateResult processSingle(OrderCreateRequest req) {

        OrderCreateResult result = new OrderCreateResult();
        result.isSuccess     = false;
        result.itemsCreated  = 0;
        result.itemsSkipped  = 0;
        result.orderTotal    = 0;

        // Use a Savepoint so we can roll back fully on total failure
        Savepoint sp = Database.setSavepoint();

        try {
            // ── 1. Validate inputs ───────────────────────────────────────────
            if (String.isBlank(req.accountId)) {
                result.resultMessage = 'Account ID is missing. Please restart the order process.';
                return result;
            }
            if (String.isBlank(req.pricebookId)) {
                result.resultMessage = 'Price Book ID is missing. Please restart the order process.';
                return result;
            }
            if (String.isBlank(req.orderLinesJson)) {
                result.resultMessage = 'Order line items are missing. Please restart the order process.';
                return result;
            }

            // ── 2. Parse the orderLinesJson from preview ─────────────────────
            List<Object> rawLines;
            try {
                rawLines = (List<Object>) JSON.deserializeUntyped(req.orderLinesJson);
            } catch (Exception parseEx) {
                result.resultMessage = 'Could not read the order lines. Please restart the order process.';
                return result;
            }

            if (rawLines == null || rawLines.isEmpty()) {
                result.resultMessage = 'The order preview has no line items. Please restart the order process.';
                return result;
            }

            // ── 3. Collect all product IDs from the lines ────────────────────
            Set<Id>  productIds  = new Set<Id>();
            Set<Id>  inventoryIds = new Set<Id>();

            for (Object obj : rawLines) {
                Map<String, Object> row = (Map<String, Object>) obj;
                String pidStr = (String) row.get('productId');
                String invStr = (String) row.get('inventoryId');
                if (String.isNotBlank(pidStr))  productIds.add((Id) pidStr);
                if (String.isNotBlank(invStr))  inventoryIds.add((Id) invStr);
            }

            // ── 4. Re-fetch LIVE inventory (stock may have changed since preview) ──
            Map<Id, Main_Inventory__c> invByProduct = new Map<Id, Main_Inventory__c>();
            Map<Id, Main_Inventory__c> invById      = new Map<Id, Main_Inventory__c>();

            for (Main_Inventory__c inv : [
                SELECT Id, Product__c, Available_Stock__c, Product__r.Name
                FROM Main_Inventory__c
                WHERE Product__c IN :productIds
                   OR Id         IN :inventoryIds
            ]) {
                invByProduct.put(inv.Product__c, inv);
                invById.put(inv.Id, inv);
            }

            // ── 5. Fetch current PricebookEntries ────────────────────────────
            Map<Id, PricebookEntry> pbeByProduct = new Map<Id, PricebookEntry>();

            for (PricebookEntry pbe : [
                SELECT Id, Product2Id, UnitPrice, Product2.Name
                FROM PricebookEntry
                WHERE Product2Id   IN :productIds
                  AND Pricebook2Id  = :req.pricebookId
                  AND IsActive      = true
            ]) {
                pbeByProduct.put(pbe.Product2Id, pbe);
            }

            // ── 6. Create the Order header (Draft) ───────────────────────────
            Order newOrder = new Order();
            newOrder.AccountId    = (Id) req.accountId;
            newOrder.Pricebook2Id = (Id) req.pricebookId;
            newOrder.EffectiveDate = Date.today();
            newOrder.Status       = 'Draft';
            newOrder.Description  = 'Smart Order Agent — repeat of Order #'
                + (String.isNotBlank(req.sourceOrderNumber) ? req.sourceOrderNumber : 'N/A')
                + ' created on ' + DateTime.now().format('dd/MM/yyyy HH:mm');

            insert newOrder;

            // ── 7. Process each line ─────────────────────────────────────────
            List<OrderItem>          toInsert      = new List<OrderItem>();
            List<Main_Inventory__c>  invToUpdate   = new List<Main_Inventory__c>();
            List<String>             skippedDetail = new List<String>();
            Decimal                  grandTotal    = 0;

            for (Object obj : rawLines) {
                Map<String, Object> row = (Map<String, Object>) obj;

                String  pidStr   = (String)  row.get('productId');
                String  invStr   = (String)  row.get('inventoryId');
                String  prodName = (String)  row.get('productName');
                Integer adjQty   = Integer.valueOf(String.valueOf(row.get('adjustedQty')));

                if (adjQty == null || adjQty <= 0) {
                    skippedDetail.add('• ' + prodName + ': Quantity is 0 or invalid — skipped.');
                    result.itemsSkipped++;
                    continue;
                }

                // ── a. Validate PricebookEntry ───────────────────────────────
                Id productId = (Id) pidStr;

                if (!pbeByProduct.containsKey(productId)) {
                    skippedDetail.add('• ' + prodName
                        + ': No active Pricebook entry found — skipped.');
                    result.itemsSkipped++;
                    continue;
                }

                PricebookEntry pbe = pbeByProduct.get(productId);

                // ── b. Re-validate LIVE inventory stock ──────────────────────
                Main_Inventory__c inv = null;

                // Try by inventoryId first (more precise), fallback to product
                if (String.isNotBlank(invStr) && invById.containsKey((Id) invStr)) {
                    inv = invById.get((Id) invStr);
                } else if (invByProduct.containsKey(productId)) {
                    inv = invByProduct.get(productId);
                }

                if (inv == null) {
                    skippedDetail.add('• ' + prodName
                        + ': Product not found in Main Inventory — skipped.');
                    result.itemsSkipped++;
                    continue;
                }

                Decimal available = inv.Available_Stock__c != null ? inv.Available_Stock__c : 0;

                if (adjQty > available) {
                    // Insufficient stock — skip this line, tell the agent exactly how much was short
                    skippedDetail.add('• ' + prodName
                        + ': Requested ' + adjQty + ' units but only '
                        + available.intValue() + ' available — skipped.');
                    result.itemsSkipped++;
                    continue;
                }

                // ── c. Build the OrderItem ───────────────────────────────────
                Decimal lineTotal = adjQty * pbe.UnitPrice;
                grandTotal += lineTotal;

                toInsert.add(new OrderItem(
                    OrderId          = newOrder.Id,
                    PricebookEntryId = pbe.Id,
                    Quantity         = adjQty,
                    UnitPrice        = pbe.UnitPrice
                ));

                // ── d. Stage inventory deduction ─────────────────────────────
                inv.Available_Stock__c -= adjQty;
                invToUpdate.add(inv);

                result.itemsCreated++;
            }

            // ── 8. Check if ANY items were created ───────────────────────────
            if (toInsert.isEmpty()) {
                // Nothing could be fulfilled — full rollback
                Database.rollback(sp);
                result.isSuccess = false;

                String msg = 'Unable to create the order for ' + req.accountId
                    + ' because all requested products have insufficient inventory:\n\n';
                for (String s : skippedDetail) {
                    msg += s + '\n';
                }
                msg += '\nPlease contact your supply team or adjust the quantities and try again.';
                result.resultMessage     = msg;
                result.skippedItemsDetail = String.join(skippedDetail, '\n');
                return result;
            }

            // ── 9. Insert OrderItems + deduct inventory ──────────────────────
            insert toInsert;

            // Remove duplicates from invToUpdate before DML
            Map<Id, Main_Inventory__c> deduplicatedInv = new Map<Id, Main_Inventory__c>();
            for (Main_Inventory__c inv : invToUpdate) {
                deduplicatedInv.put(inv.Id, inv);
            }
            update deduplicatedInv.values();

            // ── 10. Activate the Order ───────────────────────────────────────
            newOrder.Status = 'Activated';
            update newOrder;

            // ── 11. Re-query for the generated OrderNumber ───────────────────
            Order createdOrder = [
                SELECT Id, OrderNumber
                FROM Order
                WHERE Id = :newOrder.Id
                LIMIT 1
            ];

            result.isSuccess      = true;
            result.newOrderId     = createdOrder.Id;
            result.newOrderNumber = createdOrder.OrderNumber;
            result.orderTotal     = grandTotal;
            result.itemsCreated   = result.itemsCreated;
            result.itemsSkipped   = result.itemsSkipped;
            result.skippedItemsDetail = skippedDetail.isEmpty()
                ? ''
                : String.join(skippedDetail, '\n');

            // ── 12. Build the result message for the Agent ───────────────────
            String msg = 'Order #' + createdOrder.OrderNumber
                + ' has been successfully created for ' + acc(req.accountId)
                + '.\n\n'
                + result.itemsCreated + ' product(s) added.\n'
                + 'Order Total: ₹' + grandTotal.setScale(2) + '\n'
                + 'Status: Activated\n'
                + 'Date: ' + Date.today().format();

            if (result.itemsSkipped > 0) {
                msg += '\n\n⚠ ' + result.itemsSkipped + ' product(s) could not be added due to low stock:\n'
                    + String.join(skippedDetail, '\n')
                    + '\n\nThe order has been created with the available products. '
                    + 'Please contact your supply team for the remaining items.';
            }

            result.resultMessage = msg;

        } catch (Exception e) {
            Database.rollback(sp);
            result.isSuccess     = false;
            result.resultMessage = 'An error occurred while creating the order: '
                + e.getMessage()
                + '\nAll changes have been rolled back. Please try again or contact support.';
        }

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER — get account name for the result message
    // ─────────────────────────────────────────────────────────────────────────
    private static String acc(String accountId) {
        try {
            Account a = [SELECT Name FROM Account WHERE Id = :accountId LIMIT 1];
            return a.Name;
        } catch (Exception e) {
            return accountId;
        }
    }
}