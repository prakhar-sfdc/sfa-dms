public with sharing class PrimaryOrderController {

    // =========================================================
    // INNER DTOs
    // =========================================================

    public class FieldsetDTO {
        @AuraEnabled public List<String> viewFields;
        @AuraEnabled public List<String> editFields;

        public FieldsetDTO(List<String> viewFields, List<String> editFields) {
            this.viewFields = viewFields;
            this.editFields = editFields;
        }
    }

    public class OrderProductDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String productName;
        @AuraEnabled public String productCode;
        @AuraEnabled public String description;
        @AuraEnabled public Decimal quantity;
        @AuraEnabled public Decimal unitPrice;
        @AuraEnabled public Decimal listPrice;
        @AuraEnabled public Decimal totalPrice;
    }

    public class SubOrderDTO {
        @AuraEnabled public Id     id;
        @AuraEnabled public String name;
        @AuraEnabled public String status;
        @AuraEnabled public String createdDate;
        @AuraEnabled public String lastModifiedDate;
    }

    public class OrderWrapper {
        @AuraEnabled public String  id;
        @AuraEnabled public String  orderNumber;
        @AuraEnabled public String  accountName;
        @AuraEnabled public String  status;
        @AuraEnabled public Decimal totalAmount;
        @AuraEnabled public String  effectiveDate;
        @AuraEnabled public String  endDate;
        @AuraEnabled public String  description;
        @AuraEnabled public String  ownerName;
        @AuraEnabled public String  recordTypeName;
    }

    @AuraEnabled(cacheable=true)
    public static List<OrderWrapper> getPrimaryOrders() {
        List<OrderWrapper> result = new List<OrderWrapper>();
        for (Order o : [
            SELECT  Id, OrderNumber, Account.Name, Status,
                    TotalAmount, EffectiveDate, EndDate,
                    Description, RecordType.Name, Owner.Name, CreatedDate
            FROM    Order
            WHERE   RecordType.Name = 'Primary'
            ORDER BY CreatedDate DESC
            LIMIT   200
        ]) {
            OrderWrapper w   = new OrderWrapper();
            w.id             = o.Id;
            w.orderNumber    = o.OrderNumber;
            w.accountName    = o.Account    != null ? o.Account.Name    : '—';
            w.status         = o.Status;
            w.totalAmount    = o.TotalAmount != null ? o.TotalAmount    : 0;
            w.effectiveDate  = o.EffectiveDate != null ? o.EffectiveDate.format() : '—';
            w.endDate        = o.EndDate       != null ? o.EndDate.format()       : '—';
            w.description    = String.isNotBlank(o.Description) ? o.Description  : '—';
            w.ownerName      = o.Owner      != null ? o.Owner.Name      : '—';
            w.recordTypeName = o.RecordType != null ? o.RecordType.Name : '—';
            result.add(w);
        }
        return result;
    }

    // =========================================================
    // ── FIELDSET: view & edit fields for primaryOrderDetail ──
    // Uses fieldset named "Primary_fieldset" on the Order object.
    // Change the name below to match your org's fieldset API name.
    // =========================================================
    @AuraEnabled(cacheable=true)
    public static FieldsetDTO getPrimaryFieldsetFields() {
        List<String> viewFields = new List<String>();
        List<String> editFields = new List<String>();

        // ⚠️ Change 'Primary_fieldset' to your fieldset API name
        String fieldsetName = 'Primary_fieldset';
        Map<String, Schema.FieldSet> fsMap =
            Schema.SObjectType.Order.fieldSets.getMap();

        if (fsMap.containsKey(fieldsetName)) {
            for (Schema.FieldSetMember f : fsMap.get(fieldsetName).getFields()) {
                viewFields.add(f.getFieldPath());
                editFields.add(f.getFieldPath());
            }
        }
        return new FieldsetDTO(viewFields, editFields);
    }

    // =========================================================
    // ── FIELDSET: creation fields for visitDetailView modal ──
    // Uses a SEPARATE fieldset "Primary_Order_Create" so you can
    // show only relevant fields when creating a new order.
    // Change the name below to match your org's fieldset.
    // =========================================================
    @AuraEnabled(cacheable=true)
    public static List<String> getOrderCreationFields() {
        List<String> fieldNames = new List<String>();

        // ⚠️ Change 'Primary_Order_Create' to your fieldset API name
        String fieldsetName = 'Visit_order_form';
        Map<String, Schema.FieldSet> fsMap =
            Schema.SObjectType.Order.fieldSets.getMap();

        if (fsMap.containsKey(fieldsetName)) {
            for (Schema.FieldSetMember f : fsMap.get(fieldsetName).getFields()) {
                fieldNames.add(f.getFieldPath());
            }
        }
        return fieldNames;
    }

    // =========================================================
    // ── RECORD TYPE ID for "Primary" Orders ──────────────────
    // Returns the Id of the Active RecordType whose DeveloperName
    // is 'Primary' on the Order object.
    // ⚠️ Change 'Primary' if your RT DeveloperName is different.
    // =========================================================
    @AuraEnabled(cacheable=true)
    public static Id getPrimaryRecordTypeId() {
        List<RecordType> rts = [
            SELECT Id
            FROM   RecordType
            WHERE  SObjectType   = 'Order'
              AND  DeveloperName = 'Primary'
              AND  IsActive      = true
            LIMIT 1
        ];
        return rts.isEmpty() ? null : rts[0].Id;
    }

    // =========================================================
    // ── GET ORDERS LINKED TO A VISIT ─────────────────────────
    // Called by visitDetailView to populate the Orders tab list.
    // Assumes Order has a custom lookup Visit__c to Visit__c.
    // ⚠️ Adjust API names to match your org.
    // =========================================================
    @AuraEnabled(cacheable=false)
    public static List<Map<String, Object>> getVisitOrders(Id visitId) {
        List<Map<String, Object>> result = new List<Map<String, Object>>();

        for (Order o : [
            SELECT Id,
                   OrderNumber,
                   Status,
                   TotalAmount,
                   EffectiveDate,
                   Account.Name,
                   RecordType.Name
            FROM   Order
            WHERE  Visit__c = :visitId           /* ⚠️ custom Visit lookup field */
            ORDER BY CreatedDate DESC
        ]) {
            Map<String, Object> row = new Map<String, Object>();
            row.put('id',            o.Id);
            row.put('orderNumber',   o.OrderNumber);
            row.put('status',        o.Status);
            row.put('totalAmount',   o.TotalAmount);
            row.put('effectiveDate', o.EffectiveDate);
            row.put('accountName',   o.Account != null ? o.Account.Name : '—');
            row.put('recordType',    o.RecordType != null ? o.RecordType.Name : '—');
            result.add(row);
        }
        return result;
    }

    // =========================================================
    // ── GET ORDER LINE ITEMS (Order Products) ────────────────
    // Used by primaryOrderDetail → Products tab.
    // =========================================================
    @AuraEnabled(cacheable=false)
    public static List<OrderProductDTO> getOrderProducts(Id orderId) {
        List<OrderProductDTO> result = new List<OrderProductDTO>();

        for (OrderItem oi : [
            SELECT Id,
                   Product2.Name,
                   Product2.ProductCode,
                   Product2.Description,
                   Quantity,
                   UnitPrice,
                   ListPrice,
                   TotalPrice
            FROM   OrderItem
            WHERE  OrderId = :orderId
            ORDER BY CreatedDate ASC
        ]) {
            OrderProductDTO dto = new OrderProductDTO();
            dto.id          = oi.Id;
            dto.productName = oi.Product2 != null ? oi.Product2.Name : '—';
            dto.productCode = oi.Product2 != null ? oi.Product2.ProductCode : '—';
            dto.description = oi.Product2 != null ? oi.Product2.Description : '';
            dto.quantity    = oi.Quantity;
            dto.unitPrice   = oi.UnitPrice;
            dto.listPrice   = oi.ListPrice;
            dto.totalPrice  = oi.TotalPrice;
            result.add(dto);
        }
        return result;
    }

    // =========================================================
    // ── GET SUB ORDERS ───────────────────────────────────────
    // Used by primaryOrderDetail → Sub Orders tab.
    // Assumes Sub_Order__c is a custom object with a Parent_Order__c
    // lookup to Order.  ⚠️ Adjust object/field API names.
    // =========================================================
    @AuraEnabled(cacheable=false)
    public static List<SubOrderDTO> getSubOrders(Id orderId) {
        List<SubOrderDTO> result = new List<SubOrderDTO>();

        for (Sub_Order__c so : [
            SELECT Id,
                   Name,
                   Status__c,
                   CreatedDate,
                   LastModifiedDate
            FROM   Sub_Order__c
            WHERE  Order__c = :orderId   /* ⚠️ adjust field name */
            ORDER BY CreatedDate DESC
        ]) {
            SubOrderDTO dto          = new SubOrderDTO();
            dto.id                   = so.Id;
            dto.name                 = so.Name;
            dto.status               = so.Status__c;
            dto.createdDate          = so.CreatedDate != null
                ? so.CreatedDate.format('d MMM yyyy')
                : '—';
            dto.lastModifiedDate     = so.LastModifiedDate != null
                ? so.LastModifiedDate.format('d MMM yyyy')
                : '—';
            result.add(dto);
        }
        return result;
    }
}