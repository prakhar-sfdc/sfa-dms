public with sharing class DealerManagementController {

    @AuraEnabled(cacheable=true)
public static List<User> getUsers() {
    return [
        SELECT Id, Name 
        FROM User 
        WHERE IsActive = true
        ORDER BY Name
    ];
}

    @AuraEnabled(cacheable=true)
    public static List<Contact> getDealers() {
        try {
            return [
                SELECT Id,
                   FirstName,
                   LastName,
                   Dealer_Code__c,
                   Phone,
                   Email,
                   Dealer_Status__c,
                   Credit_Limit__c
            FROM Contact
            WHERE RecordType.Name = 'Dealer'
            ORDER BY CreatedDate DESC
            ];
        }catch (Exception e) {
            throw new AuraHandledException('Error fetching dealers: ' + e.getMessage());
        }
    }

@AuraEnabled
public static Id createDealer(String dealerData) {

    Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(dealerData);

    Contact con = new Contact();

    for (String key : data.keySet()) {
        con.put(key, data.get(key));
    }

    // Required
    if (con.LastName == null) {
        con.LastName = 'Dealer';
    }

    con.RecordTypeId = [
        SELECT Id FROM RecordType 
        WHERE SObjectType = 'Contact' AND Name = 'Dealer'
        LIMIT 1
    ].Id;

    insert con;

    return con.Id;
}
private static Decimal safeDecimal(Object val) {
    if (val == null) return null;

    String str = String.valueOf(val);

    if (String.isBlank(str)) return null;

    return Decimal.valueOf(str);
}

@AuraEnabled(cacheable=true)
public static Contact getDealerDetail(Id dealerId) {
    try {
        return [
            SELECT Id, FirstName, LastName, Phone, Email,
                   Dealer_Code__c, Dealer_Status__c, Credit_Limit__c,
                   Dealer_Type__c, Territory__c,
                   GST_Certificate__c, PAN_Number__c, GST_Number__c,
                   PAN_Card__c, Aadhaar_Card__c, Bank_Proof__c,
                   Commission_Percentage__c, Payment_Terms__c,
                   Business_Registration__c, Address_Proof__c,
                   Onboarded_By__r.Name, Onboarding_Date__c
            FROM Contact
            WHERE Id = :dealerId
            LIMIT 1
        ];
    } catch (Exception e) {
        throw new AuraHandledException('Error fetching dealer detail: ' + e.getMessage());
    }
}

@AuraEnabled
public static void updateDealerDocumentFlag(Id dealerId, String documentField) {
    Contact con = new Contact(Id = dealerId);
    con.put(documentField, true);
    update con;
}

@AuraEnabled
public static void updateDealer(Id dealerId, String dealerData) {

    Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(dealerData);

    Contact con = new Contact(Id = dealerId);

    for (String key : data.keySet()) {
        con.put(key, data.get(key));
    }

    if (con.LastName == null) {
        con.LastName = 'Dealer';
    }

    update con;
}
@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getDealerFieldSet() {

    List<Map<String, Object>> fieldsList = new List<Map<String, Object>>();

    Schema.FieldSet fieldSet = Schema.SObjectType.Contact.FieldSets.Dealer_Form;

    Map<String, Schema.SObjectField> contactFields =
        Schema.SObjectType.Contact.fields.getMap();

    for (Schema.FieldSetMember f : fieldSet.getFields()) {

        Map<String, Object> fieldData = new Map<String, Object>();

        Schema.DescribeFieldResult d =
            contactFields.get(f.getFieldPath()).getDescribe();

        fieldData.put('label', f.getLabel());
        fieldData.put('fieldPath', f.getFieldPath());
        fieldData.put('type', String.valueOf(d.getType()));
        fieldData.put('isPicklist', d.getType() == Schema.DisplayType.Picklist);
        fieldData.put('isBoolean', d.getType() == Schema.DisplayType.Boolean);
        fieldData.put('isDate', d.getType() == Schema.DisplayType.Date);
        fieldData.put('isNumber', d.getType() == Schema.DisplayType.Currency ||
                                   d.getType() == Schema.DisplayType.Double ||
                                   d.getType() == Schema.DisplayType.Integer);

        // 🔥 PICKLIST VALUES
        if (d.getType() == Schema.DisplayType.Picklist) {

            List<Map<String, String>> options = new List<Map<String, String>>();

            for (Schema.PicklistEntry p : d.getPicklistValues()) {
                options.add(new Map<String, String>{
                    'label' => p.getLabel(),
                    'value' => p.getValue()
                });
            }

            fieldData.put('options', options);
        }

        fieldsList.add(fieldData);
    }

    return fieldsList;
}
}