/**
 * SchemeExplainerAction
 * ─────────────────────────────────────────────────────────────────────────────
 * Agentforce Invocable Action — Scheme & Promotion Explainer
 *
 * Handles all four distributor scheme queries in one action:
 *
 *   MODE 1 — "list"
 *     Returns all currently active schemes with a plain-language summary
 *     of what each scheme offers (product discount, free goods, or slab).
 *
 *   MODE 2 — "product"
 *     Given a product name (partial match), returns all active schemes
 *     that include that product — with discount %, free goods detail,
 *     and any slab benefits available.
 *
 *   MODE 3 — "calculate"
 *     Given a product name and an order quantity, calculates the exact
 *     benefit the distributor would receive — rupee discount, free goods
 *     quantity, and which slab tier they fall into.
 *
 *   MODE 4 — "compare"
 *     Given a product name, compares ALL active schemes that cover that
 *     product side by side and recommends the best one.
 *
 * Data model used:
 *   Scheme__c               — master scheme record
 *   Scheme_Product__c       — product-level discount + free goods
 *   Scheme_Slab__c          — order-value based slab discounts
 *   Scheme_Application__c   — not queried (only used for applying schemes)
 *
 * Author : (your name)
 * Version: 1.0
 */
public with sharing class SchemeExplainerAction {

    // ─────────────────────────────────────────────────────────────────────────
    // INPUT
    // ─────────────────────────────────────────────────────────────────────────
    public class SchemeRequest {

        @InvocableVariable(
            label='Query Mode'
            description='What the distributor wants to know. Accepted values: "list" (all active schemes), "product" (schemes for a specific product), "calculate" (benefit for a quantity), "compare" (best scheme for a product).'
            required=true
        )
        public String queryMode;

        @InvocableVariable(
            label='Product Name'
            description='Product name to search for. Required for modes: product, calculate, compare. Partial name match is supported (e.g. "Cement" will match "Cement OPC 53").'
            required=false
        )
        public String productName;

        @InvocableVariable(
            label='Order Quantity'
            description='The quantity the distributor wants to order. Required for mode: calculate. Used to compute exact benefit (discount rupees, free goods, slab tier).'
            required=false
        )
        public Decimal orderQuantity;

        @InvocableVariable(
            label='Order Amount'
            description='The total order value in rupees. Optional for mode: calculate. Used to find matching slab discount if provided.'
            required=false
        )
        public Decimal orderAmount;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OUTPUT
    // ─────────────────────────────────────────────────────────────────────────
    public class SchemeResult {

        @InvocableVariable(label='Success')
        public Boolean isSuccess;

        @InvocableVariable(label='Error Message')
        public String errorMessage;

        @InvocableVariable(label='Response Summary')
        public String responseSummary;

        @InvocableVariable(label='Has Active Schemes')
        public Boolean hasActiveSchemes;

        @InvocableVariable(label='Scheme Count')
        public Integer schemeCount;

        @InvocableVariable(label='Best Scheme Name')
        public String bestSchemeName;

        @InvocableVariable(label='Best Scheme Benefit')
        public String bestSchemeBenefit;

        @InvocableVariable(label='Calculated Discount Amount')
        public Decimal calculatedDiscountAmount;

        @InvocableVariable(label='Calculated Free Goods Quantity')
        public Integer calculatedFreeGoodsQty;

        @InvocableVariable(label='Calculated Free Product Name')
        public String calculatedFreeProductName;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ENTRY POINT
    // ─────────────────────────────────────────────────────────────────────────
    @InvocableMethod(
        label='Scheme Explainer'
        description='Answers all distributor scheme queries. Use mode "list" for all active schemes, "product" for schemes on a specific product, "calculate" for exact benefit on a quantity/amount, "compare" to find the best scheme for a product.'
        category='Scheme Management'
    )
    public static List<SchemeResult> explainSchemes(List<SchemeRequest> requests) {
        List<SchemeResult> results = new List<SchemeResult>();
        for (SchemeRequest req : requests) {
            results.add(process(req));
        }
        return results;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ROUTER
    // ─────────────────────────────────────────────────────────────────────────
    private static SchemeResult process(SchemeRequest req) {

        SchemeResult result = new SchemeResult();
        result.isSuccess       = false;
        result.hasActiveSchemes = false;
        result.schemeCount     = 0;

        if (String.isBlank(req.queryMode)) {
            result.errorMessage = 'Query mode is required. Please specify: list, product, calculate, or compare.';
            return result;
        }

        String mode = req.queryMode.trim().toLowerCase();

        try {
            if      (mode == 'list')      return handleList(req);
            else if (mode == 'product')   return handleProduct(req);
            else if (mode == 'calculate') return handleCalculate(req);
            else if (mode == 'compare')   return handleCompare(req);
            else {
                result.errorMessage = 'Unknown mode: "' + req.queryMode + '". Valid modes are: list, product, calculate, compare.';
                return result;
            }
        } catch (Exception e) {
            result.isSuccess    = false;
            result.errorMessage = 'An error occurred: ' + e.getMessage();
            return result;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODE 1 — LIST all active schemes
    // ─────────────────────────────────────────────────────────────────────────
    private static SchemeResult handleList(SchemeRequest req) {

        SchemeResult result = new SchemeResult();

        // Fetch all active schemes with their products and slabs
        List<Scheme__c> schemes = [
            SELECT  Id, Name, Scheme_Type__c, Start_Date__c, End_Date__c, Status__c,
                    (SELECT Product__r.Name, Discount_Percentage__c,
                            Free_Product__r.Name, Free_Quantity__c, Minimum_Quantity__c
                     FROM   Scheme_Products__r),
                    (SELECT From_Amount__c, To_Amount__c, Discount__c
                     FROM   Scheme_Slabs__r
                     ORDER BY From_Amount__c ASC)
            FROM    Scheme__c
            WHERE   Status__c = 'Active'
              AND   Start_Date__c <= TODAY
              AND   End_Date__c   >= TODAY
            ORDER BY End_Date__c ASC
        ];

        if (schemes.isEmpty()) {
            result.isSuccess       = true;
            result.hasActiveSchemes = false;
            result.schemeCount     = 0;
            result.responseSummary = 'There are no active schemes running at the moment. '
                + 'Please check back later or contact your sales representative.';
            return result;
        }

        result.hasActiveSchemes = true;
        result.schemeCount      = schemes.size();

        String summary = '📋 Active Schemes (' + schemes.size() + ' running)\n'
            + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        for (Scheme__c s : schemes) {
            summary += buildSchemeBlock(s);
            summary += '\n';
        }

        summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            + 'Want to know the exact benefit for a specific product or quantity? '
            + 'Just ask me to calculate or compare!';

        result.responseSummary = summary;
        result.isSuccess       = true;
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODE 2 — PRODUCT: schemes for a specific product
    // ─────────────────────────────────────────────────────────────────────────
    private static SchemeResult handleProduct(SchemeRequest req) {

        SchemeResult result = new SchemeResult();

        if (String.isBlank(req.productName)) {
            result.errorMessage = 'Please provide a product name to search for schemes.';
            return result;
        }

        String searchTerm = '%' + req.productName.trim() + '%';

        // Find scheme products that match — then get the parent schemes
        List<Scheme_Product__c> matchingProducts = [
            SELECT  Id, Scheme__c, Scheme__r.Name, Scheme__r.Scheme_Type__c,
                    Scheme__r.Start_Date__c, Scheme__r.End_Date__c, Scheme__r.Status__c,
                    Product__r.Name, Discount_Percentage__c,
                    Free_Product__r.Name, Free_Quantity__c, Minimum_Quantity__c
            FROM    Scheme_Product__c
            WHERE   Product__r.Name LIKE :searchTerm
              AND   Scheme__r.Status__c  = 'Active'
              AND   Scheme__r.Start_Date__c <= TODAY
              AND   Scheme__r.End_Date__c   >= TODAY
        ];

        if (matchingProducts.isEmpty()) {
            result.isSuccess       = true;
            result.hasActiveSchemes = false;
            result.schemeCount     = 0;
            result.responseSummary = 'No active schemes found for "' + req.productName + '" at this time.\n\n'
                + 'This could mean:\n'
                + '• No scheme is currently running for this product\n'
                + '• The product name might be slightly different — try a shorter search term\n\n'
                + 'Type "show all schemes" to see everything that\'s currently active.';
            return result;
        }

        // Also fetch slab schemes (not product-specific but relevant)
        Set<Id> schemeIds = new Set<Id>();
        for (Scheme_Product__c sp : matchingProducts) {
            schemeIds.add(sp.Scheme__c);
        }

        Map<Id, List<Scheme_Slab__c>> slabsByScheme = getSlabsByScheme(schemeIds);

        result.hasActiveSchemes = true;
        result.schemeCount      = matchingProducts.size();

        String summary = '🏷 Schemes available for "' + req.productName + '" ('
            + matchingProducts.size() + ' found)\n'
            + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        for (Scheme_Product__c sp : matchingProducts) {
            summary += '📌 ' + sp.Scheme__r.Name + '\n';
            summary += '   Type: ' + (sp.Scheme__r.Scheme_Type__c != null ? sp.Scheme__r.Scheme_Type__c : 'General') + '\n';
            summary += '   Valid: ' + formatDate(sp.Scheme__r.Start_Date__c)
                + ' to ' + formatDate(sp.Scheme__r.End_Date__c) + '\n';
            summary += '   Product: ' + sp.Product__r.Name + '\n';

            if (sp.Minimum_Quantity__c != null && sp.Minimum_Quantity__c > 0) {
                summary += '   Min. Order Qty: ' + sp.Minimum_Quantity__c.intValue() + ' units\n';
            }
            if (sp.Discount_Percentage__c != null && sp.Discount_Percentage__c > 0) {
                summary += '   💰 Discount: ' + sp.Discount_Percentage__c.intValue() + '% off\n';
            }
            if (sp.Free_Product__r != null && sp.Free_Quantity__c != null) {
                summary += '   🎁 Free Goods: ' + sp.Free_Quantity__c.intValue()
                    + ' units of ' + sp.Free_Product__r.Name + '\n';
            }

            // Show slab info if available
            if (slabsByScheme.containsKey(sp.Scheme__c)) {
                List<Scheme_Slab__c> slabs = slabsByScheme.get(sp.Scheme__c);
                summary += '   📊 Slab Discounts:\n';
                for (Scheme_Slab__c slab : slabs) {
                    summary += '      ₹' + formatAmount(slab.From_Amount__c)
                        + ' – ₹' + formatAmount(slab.To_Amount__c)
                        + ' → ' + slab.Discount__c.intValue() + '% off\n';
                }
            }
            summary += '\n';
        }

        summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            + 'Want me to calculate your exact saving for a specific quantity? '
            + 'Tell me how many units you plan to order!';

        result.responseSummary = summary;
        result.isSuccess       = true;
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODE 3 — CALCULATE: exact benefit for a quantity/amount
    // ─────────────────────────────────────────────────────────────────────────
    private static SchemeResult handleCalculate(SchemeRequest req) {

        SchemeResult result = new SchemeResult();

        if (String.isBlank(req.productName)) {
            result.errorMessage = 'Please provide the product name to calculate scheme benefit.';
            return result;
        }
        if (req.orderQuantity == null || req.orderQuantity <= 0) {
            result.errorMessage = 'Please provide the quantity you want to order so I can calculate the benefit.';
            return result;
        }

        String searchTerm = '%' + req.productName.trim() + '%';

        List<Scheme_Product__c> matchingProducts = [
            SELECT  Id, Scheme__c, Scheme__r.Name, Scheme__r.Scheme_Type__c,
                    Scheme__r.Start_Date__c, Scheme__r.End_Date__c,
                    Product__r.Name, Discount_Percentage__c,
                    Free_Product__r.Name, Free_Quantity__c, Minimum_Quantity__c
            FROM    Scheme_Product__c
            WHERE   Product__r.Name    LIKE :searchTerm
              AND   Scheme__r.Status__c     = 'Active'
              AND   Scheme__r.Start_Date__c <= TODAY
              AND   Scheme__r.End_Date__c   >= TODAY
        ];

        if (matchingProducts.isEmpty()) {
            result.isSuccess       = true;
            result.hasActiveSchemes = false;
            result.responseSummary = 'No active schemes found for "' + req.productName
                + '". No discount or free goods apply to this order.';
            return result;
        }

        // Get unit price from pricebook for discount calculation
        Decimal unitPrice = getUnitPrice(req.productName);

        Set<Id> schemeIds = new Set<Id>();
        for (Scheme_Product__c sp : matchingProducts) schemeIds.add(sp.Scheme__c);
        Map<Id, List<Scheme_Slab__c>> slabsByScheme = getSlabsByScheme(schemeIds);

        String summary = '🧮 Scheme Benefit Calculation\n'
            + 'Product: ' + req.productName + '\n'
            + 'Order Quantity: ' + req.orderQuantity.intValue() + ' units\n';

        if (req.orderAmount != null) {
            summary += 'Order Amount: ₹' + formatAmount(req.orderAmount) + '\n';
        }
        summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        Decimal bestDiscount     = 0;
        Integer bestFreeQty      = 0;
        String  bestFreeProduct  = '';
        String  bestSchemeName   = '';
        Decimal bestSlabDiscount = 0;

        for (Scheme_Product__c sp : matchingProducts) {

            Boolean meetsMinQty = (sp.Minimum_Quantity__c == null
                || req.orderQuantity >= sp.Minimum_Quantity__c);

            summary += '📌 ' + sp.Scheme__r.Name + '\n';

            if (!meetsMinQty) {
                summary += '   ⚠ Minimum quantity required: ' + sp.Minimum_Quantity__c.intValue()
                    + ' units. You need '
                    + (sp.Minimum_Quantity__c - req.orderQuantity).intValue()
                    + ' more units to qualify.\n\n';
                continue;
            }

            // Product discount
            if (sp.Discount_Percentage__c != null && sp.Discount_Percentage__c > 0) {
                Decimal discountAmt = 0;
                if (unitPrice > 0) {
                    discountAmt = (req.orderQuantity * unitPrice * sp.Discount_Percentage__c) / 100;
                    summary += '   💰 ' + sp.Discount_Percentage__c.intValue() + '% discount = ₹'
                        + formatAmount(discountAmt) + ' saving\n';
                } else {
                    summary += '   💰 ' + sp.Discount_Percentage__c.intValue() + '% discount applies\n';
                }

                if (discountAmt > bestDiscount) {
                    bestDiscount   = discountAmt;
                    bestSchemeName = sp.Scheme__r.Name;
                }
            }

            // Free goods
            if (sp.Free_Product__r != null && sp.Free_Quantity__c != null
                && sp.Free_Quantity__c > 0) {
                summary += '   🎁 Free: ' + sp.Free_Quantity__c.intValue()
                    + ' units of ' + sp.Free_Product__r.Name + '\n';

                if (sp.Free_Quantity__c.intValue() > bestFreeQty) {
                    bestFreeQty     = sp.Free_Quantity__c.intValue();
                    bestFreeProduct = sp.Free_Product__r.Name;
                    if (String.isBlank(bestSchemeName)) bestSchemeName = sp.Scheme__r.Name;
                }
            }

            // Slab discount — match by order amount if provided
            if (slabsByScheme.containsKey(sp.Scheme__c) && req.orderAmount != null) {
                for (Scheme_Slab__c slab : slabsByScheme.get(sp.Scheme__c)) {
                    if (req.orderAmount >= slab.From_Amount__c
                        && req.orderAmount <= slab.To_Amount__c) {
                        Decimal slabSaving = (req.orderAmount * slab.Discount__c) / 100;
                        summary += '   📊 Slab match: ₹' + formatAmount(slab.From_Amount__c)
                            + '–₹' + formatAmount(slab.To_Amount__c)
                            + ' tier → ' + slab.Discount__c.intValue()
                            + '% = ₹' + formatAmount(slabSaving) + ' saving\n';

                        if (slabSaving > bestSlabDiscount) {
                            bestSlabDiscount = slabSaving;
                            if (String.isBlank(bestSchemeName)) bestSchemeName = sp.Scheme__r.Name;
                        }
                    }
                }
            } else if (slabsByScheme.containsKey(sp.Scheme__c) && req.orderAmount == null) {
                List<Scheme_Slab__c> slabs = slabsByScheme.get(sp.Scheme__c);
                summary += '   📊 Slab discounts also available — share your order value for exact calculation\n';
            }

            summary += '\n';
        }

        // Best deal summary
        summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        Decimal totalBenefit = bestDiscount + bestSlabDiscount;

        if (totalBenefit > 0 || bestFreeQty > 0) {
            summary += '✅ Best benefit for your order:\n';
            if (totalBenefit > 0) {
                summary += '   Total discount: ₹' + formatAmount(totalBenefit) + '\n';
            }
            if (bestFreeQty > 0) {
                summary += '   Free goods: ' + bestFreeQty + ' units of ' + bestFreeProduct + '\n';
            }
            if (String.isNotBlank(bestSchemeName)) {
                summary += '   Under scheme: ' + bestSchemeName + '\n';
            }
        } else {
            summary += 'No benefit currently qualifies for the given quantity/amount.\n'
                + 'Try increasing your order quantity to meet minimum thresholds.';
        }

        result.responseSummary            = summary;
        result.isSuccess                  = true;
        result.hasActiveSchemes           = true;
        result.schemeCount                = matchingProducts.size();
        result.calculatedDiscountAmount   = totalBenefit;
        result.calculatedFreeGoodsQty     = bestFreeQty;
        result.calculatedFreeProductName  = bestFreeProduct;
        result.bestSchemeName             = bestSchemeName;
        result.bestSchemeBenefit          = totalBenefit > 0
            ? '₹' + formatAmount(totalBenefit) + ' discount'
            : (bestFreeQty > 0 ? bestFreeQty + ' free units of ' + bestFreeProduct : 'None');

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODE 4 — COMPARE: best scheme side by side
    // ─────────────────────────────────────────────────────────────────────────
    private static SchemeResult handleCompare(SchemeRequest req) {

        SchemeResult result = new SchemeResult();

        if (String.isBlank(req.productName)) {
            result.errorMessage = 'Please provide the product name to compare schemes.';
            return result;
        }

        String searchTerm = '%' + req.productName.trim() + '%';

        List<Scheme_Product__c> matchingProducts = [
            SELECT  Id, Scheme__c, Scheme__r.Name, Scheme__r.Scheme_Type__c,
                    Scheme__r.End_Date__c,
                    Product__r.Name, Discount_Percentage__c,
                    Free_Product__r.Name, Free_Quantity__c, Minimum_Quantity__c
            FROM    Scheme_Product__c
            WHERE   Product__r.Name    LIKE :searchTerm
              AND   Scheme__r.Status__c     = 'Active'
              AND   Scheme__r.Start_Date__c <= TODAY
              AND   Scheme__r.End_Date__c   >= TODAY
            ORDER BY Discount_Percentage__c DESC NULLS LAST
        ];

        if (matchingProducts.isEmpty()) {
            result.isSuccess       = true;
            result.hasActiveSchemes = false;
            result.responseSummary = 'No active schemes found for "' + req.productName
                + '" to compare. Type "show all schemes" to see what\'s running.';
            return result;
        }

        if (matchingProducts.size() == 1) {
            result.isSuccess       = true;
            result.hasActiveSchemes = true;
            result.schemeCount     = 1;
            result.bestSchemeName  = matchingProducts[0].Scheme__r.Name;
            result.responseSummary = 'Only one active scheme found for "' + req.productName
                + '" — no comparison needed.\n\n'
                + '📌 ' + matchingProducts[0].Scheme__r.Name + '\n'
                + buildProductLine(matchingProducts[0])
                + '\nThis is automatically your best option!';
            return result;
        }

        Set<Id> schemeIds = new Set<Id>();
        for (Scheme_Product__c sp : matchingProducts) schemeIds.add(sp.Scheme__c);
        Map<Id, List<Scheme_Slab__c>> slabsByScheme = getSlabsByScheme(schemeIds);

        Decimal unitPrice      = getUnitPrice(req.productName);
        Decimal bestValue      = 0;
        String  bestName       = '';
        String  bestBenefit    = '';

        String summary = '⚖ Scheme Comparison for "' + req.productName + '"\n'
            + '(' + matchingProducts.size() + ' active schemes)\n'
            + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        Integer rank = 1;
        for (Scheme_Product__c sp : matchingProducts) {

            summary += rank + '. ' + sp.Scheme__r.Name + '\n';
            summary += '   Expires: ' + formatDate(sp.Scheme__r.End_Date__c) + '\n';

            if (sp.Minimum_Quantity__c != null && sp.Minimum_Quantity__c > 0) {
                summary += '   Min Qty: ' + sp.Minimum_Quantity__c.intValue() + ' units\n';
            }

            Decimal schemeValue = 0;

            if (sp.Discount_Percentage__c != null && sp.Discount_Percentage__c > 0) {
                summary += '   💰 Discount: ' + sp.Discount_Percentage__c.intValue() + '% off';
                if (unitPrice > 0 && req.orderQuantity != null) {
                    schemeValue = (req.orderQuantity * unitPrice * sp.Discount_Percentage__c) / 100;
                    summary += ' (≈ ₹' + formatAmount(schemeValue) + ' on ' + req.orderQuantity.intValue() + ' units)';
                }
                summary += '\n';
            }

            if (sp.Free_Product__r != null && sp.Free_Quantity__c != null) {
                summary += '   🎁 Free: ' + sp.Free_Quantity__c.intValue()
                    + ' units of ' + sp.Free_Product__r.Name + '\n';
            }

            if (slabsByScheme.containsKey(sp.Scheme__c)) {
                summary += '   📊 Has slab discounts (share order value for exact saving)\n';
            }

            if (schemeValue > bestValue) {
                bestValue   = schemeValue;
                bestName    = sp.Scheme__r.Name;
                bestBenefit = sp.Discount_Percentage__c.intValue() + '% discount';
                if (sp.Free_Product__r != null) {
                    bestBenefit += ' + ' + sp.Free_Quantity__c.intValue()
                        + ' free units of ' + sp.Free_Product__r.Name;
                }
            } else if (bestValue == 0 && sp.Free_Quantity__c != null && sp.Free_Quantity__c > 0) {
                bestName    = sp.Scheme__r.Name;
                bestBenefit = sp.Free_Quantity__c.intValue() + ' free units of ' + sp.Free_Product__r.Name;
            }

            summary += '\n';
            rank++;
        }

        summary += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        if (String.isNotBlank(bestName)) {
            summary += '🏆 Best scheme: ' + bestName + '\n';
            summary += '   Benefit: ' + bestBenefit + '\n';
        }

        result.responseSummary  = summary;
        result.isSuccess        = true;
        result.hasActiveSchemes = true;
        result.schemeCount      = matchingProducts.size();
        result.bestSchemeName   = bestName;
        result.bestSchemeBenefit = bestBenefit;

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    // Build a readable block for one scheme (used in list mode)
    private static String buildSchemeBlock(Scheme__c s) {
        String block = '📌 ' + s.Name + '\n';
        block += '   Type: ' + (s.Scheme_Type__c != null ? s.Scheme_Type__c : 'General') + '\n';
        block += '   Valid: ' + formatDate(s.Start_Date__c) + ' to ' + formatDate(s.End_Date__c) + '\n';

        if (s.Scheme_Products__r != null && !s.Scheme_Products__r.isEmpty()) {
            for (Scheme_Product__c sp : s.Scheme_Products__r) {
                block += '   • ' + sp.Product__r.Name;
                if (sp.Discount_Percentage__c != null && sp.Discount_Percentage__c > 0) {
                    block += ' — ' + sp.Discount_Percentage__c.intValue() + '% off';
                }
                if (sp.Minimum_Quantity__c != null && sp.Minimum_Quantity__c > 0) {
                    block += ' (min ' + sp.Minimum_Quantity__c.intValue() + ' units)';
                }
                if (sp.Free_Product__r != null) {
                    block += ' + ' + sp.Free_Quantity__c.intValue()
                        + ' free ' + sp.Free_Product__r.Name;
                }
                block += '\n';
            }
        }

        if (s.Scheme_Slabs__r != null && !s.Scheme_Slabs__r.isEmpty()) {
            block += '   Slab discounts: ';
            List<String> slabLabels = new List<String>();
            for (Scheme_Slab__c slab : s.Scheme_Slabs__r) {
                slabLabels.add('₹' + formatAmount(slab.From_Amount__c)
                    + '-₹' + formatAmount(slab.To_Amount__c)
                    + '→' + slab.Discount__c.intValue() + '%');
            }
            block += String.join(slabLabels, ' | ') + '\n';
        }

        return block;
    }

    // Build one product line for compare
    private static String buildProductLine(Scheme_Product__c sp) {
        String line = '';
        if (sp.Discount_Percentage__c != null && sp.Discount_Percentage__c > 0) {
            line += '   💰 ' + sp.Discount_Percentage__c.intValue() + '% discount\n';
        }
        if (sp.Free_Product__r != null && sp.Free_Quantity__c != null) {
            line += '   🎁 ' + sp.Free_Quantity__c.intValue() + ' free units of '
                + sp.Free_Product__r.Name + '\n';
        }
        if (sp.Minimum_Quantity__c != null && sp.Minimum_Quantity__c > 0) {
            line += '   Min Qty: ' + sp.Minimum_Quantity__c.intValue() + ' units\n';
        }
        return line;
    }

    // Get slabs for a set of scheme IDs
    private static Map<Id, List<Scheme_Slab__c>> getSlabsByScheme(Set<Id> schemeIds) {
        Map<Id, List<Scheme_Slab__c>> result = new Map<Id, List<Scheme_Slab__c>>();
        for (Scheme_Slab__c slab : [
            SELECT Id, Scheme__c, From_Amount__c, To_Amount__c, Discount__c
            FROM   Scheme_Slab__c
            WHERE  Scheme__c IN :schemeIds
            ORDER BY From_Amount__c ASC
        ]) {
            if (!result.containsKey(slab.Scheme__c)) {
                result.put(slab.Scheme__c, new List<Scheme_Slab__c>());
            }
            result.get(slab.Scheme__c).add(slab);
        }
        return result;
    }

    // Get unit price from standard pricebook for discount amount calculation
    private static Decimal getUnitPrice(String productName) {
        try {
            List<PricebookEntry> pbes = [
                SELECT UnitPrice
                FROM   PricebookEntry
                WHERE  Product2.Name LIKE :('%' + productName + '%')
                  AND  IsActive      = true
                  AND  Pricebook2.IsStandard = true
                LIMIT  1
            ];
            return pbes.isEmpty() ? 0 : pbes[0].UnitPrice;
        } catch (Exception e) {
            return 0;
        }
    }

    // Format date nicely
    private static String formatDate(Date d) {
        if (d == null) return 'N/A';
        return d.format();
    }

    // Format currency amount without decimals for readability
    private static String formatAmount(Decimal amt) {
        if (amt == null) return '0';
        // Indian number format
        String numStr   = String.valueOf(amt.setScale(0));
        String lastThree  = numStr.length() > 3 ? numStr.substring(numStr.length() - 3) : numStr;
        String remaining  = numStr.length() > 3 ? numStr.substring(0, numStr.length() - 3) : '';
        if (String.isNotBlank(remaining)) {
            remaining = remaining.replaceAll('(\\d)(?=(\\d{2})+$)', '$1,');
            return remaining + ',' + lastThree;
        }
        return lastThree;
    }
}