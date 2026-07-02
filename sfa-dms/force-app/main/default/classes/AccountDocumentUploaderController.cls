public with sharing class AccountDocumentUploaderController {

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getAvailableDocs(Id accountId) {

        if (accountId == null) return new List<Map<String, String>>();

        Account acc = [
            SELECT GST_Uploaded__c,
                   PAN_Uploaded__c,
                   Aadhar_Uploaded__c,
                   Address_Proof_Uploaded__c
            FROM Account
            WHERE Id = :accountId
        ];

        List<Map<String, String>> options = new List<Map<String, String>>();

        if (!acc.GST_Uploaded__c) {
            options.add(buildOption('GST_Uploaded__c', 'GST Certificate'));
        }
        if (!acc.PAN_Uploaded__c) {
            options.add(buildOption('PAN_Uploaded__c', 'PAN Card'));
        }
        if (!acc.Aadhar_Uploaded__c) {
            options.add(buildOption('Aadhar_Uploaded__c', 'Aadhar Card'));
        }
        if (!acc.Address_Proof_Uploaded__c) {
            options.add(buildOption('Address_Proof_Uploaded__c', 'Address Proof'));
        }

        return options;
    }

    private static Map<String, String> buildOption(String value, String label) {
        return new Map<String, String>{
            'label' => label,
            'value' => value
        };
    }

    @AuraEnabled
    public static void updateCheckbox(Id accountId, String fieldName) {

        if (accountId == null || String.isBlank(fieldName)) return;

        Account acc = new Account(Id = accountId);
        acc.put(fieldName, true);
        update acc;
    }
    
//     @AuraEnabled(cacheable=true)
// public static Account getAccountDocumentStatus(Id accountId) {
//     return [
//         SELECT GST_Uploaded__c,
//                PAN_Uploaded__c,
//                Aadhar_Uploaded__c,
//                Address_Proof_Uploaded__c
//         FROM Account
//         WHERE Id = :accountId
//     ];
// }

}