public with sharing class OrderFormController {

    // 🔥 FIELD SET FETCH
    @AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getFieldSet(String recordType) {

    String fieldSetName;

    if (recordType == 'Primary') {
        fieldSetName = 'Primary_fieldset'; // replace
    } else {
        fieldSetName = 'Secondary_fieldset'; // replace
    }

    List<Map<String, Object>> fields = new List<Map<String, Object>>();

    Schema.FieldSet fs = Schema.SObjectType.Order.fieldSets.getMap().get(fieldSetName);

    for (Schema.FieldSetMember f : fs.getFields()) {

        Schema.DescribeFieldResult dfr =
            Schema.SObjectType.Order.fields.getMap().get(f.getFieldPath()).getDescribe();

        Map<String, Object> fieldData = new Map<String, Object>{
            'label' => f.getLabel(),
            'apiName' => f.getFieldPath(),
            'type' => String.valueOf(dfr.getType())
        };

        // 🔥 Picklist values
        if (dfr.getType() == Schema.DisplayType.Picklist) {

            List<Map<String, String>> options = new List<Map<String, String>>();

            for (Schema.PicklistEntry p : dfr.getPicklistValues()) {
                options.add(new Map<String, String>{
                    'label' => p.getLabel(),
                    'value' => p.getValue()
                });
            }

            fieldData.put('options', options);
        }

        fields.add(fieldData);
    }

    return fields;
}

    // 🔥 CREATE ORDER
    @AuraEnabled
    public static Id createOrder(String recordType, String data) {

        Map<String, Object> values = (Map<String, Object>) JSON.deserializeUntyped(data);

        RecordType rt = [
            SELECT Id FROM RecordType
            WHERE SObjectType = 'Order'
            AND DeveloperName = :recordType
            LIMIT 1
        ];

        Order ord = new Order();
        ord.RecordTypeId = rt.Id;

        // 🔥 Set dynamic fields
        for (String key : values.keySet()) {

    Object val = values.get(key);

    if (val == null) continue;

    Schema.DescribeFieldResult dfr =
        Order.SObjectType.getDescribe().fields.getMap().get(key).getDescribe();

    Schema.DisplayType type = dfr.getType();

    // 🔥 HANDLE TYPES
    if (type == Schema.DisplayType.Date) {
        ord.put(key, Date.valueOf((String) val));
    }
    else if (type == Schema.DisplayType.Datetime) {
        ord.put(key, Datetime.valueOf((String) val));
    }
    else if (type == Schema.DisplayType.Double ||
             type == Schema.DisplayType.Integer ||
             type == Schema.DisplayType.Currency) {

        ord.put(key, Decimal.valueOf(String.valueOf(val)));
    }
    else if (type == Schema.DisplayType.Boolean) {
        ord.put(key, (Boolean) val);
    }
    else {
        ord.put(key, val);
    }
}

        insert ord;

        return ord.Id;
    }
}