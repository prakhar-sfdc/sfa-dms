public with sharing class dealerDocumentChecklistController {
   @AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getDocStatus(Id accountId) {
    try {

        System.debug('ACCOUNT ID RECEIVED: ' + accountId);

        Account acc = [
            SELECT GST_Certificate__c,
                   PAN_Card__c,
                   Aadhaar_Card__c,
                   Bank_Proof__c,
                   Business_Registration__c,
                   Address_Proof__c
            FROM Account
            WHERE Id = :accountId
            LIMIT 1
        ];

        List<Map<String, Object>> result = new List<Map<String, Object>>();

        result.add(buildStatus('GST Certificate', acc.GST_Certificate__c));	
        result.add(buildStatus('PAN Card', acc.PAN_Card__c));
        result.add(buildStatus('Aadhar Card', acc.Aadhaar_Card__c));
        result.add(buildStatus('Bank Proof', acc.Bank_Proof__c));
        result.add(buildStatus('Business Registration', acc.Business_Registration__c));
        result.add(buildStatus('Address Proof', acc.Address_Proof__c));

        return result;

    } catch (Exception e) {
        System.debug('ERROR: ' + e.getMessage());
        throw new AuraHandledException(e.getMessage());
    }
}

    private static Map<String, Object> buildStatus(String label, Boolean status) {
        return new Map<String, Object>{
            'label' => label,
            'status' => status != null && status
        };
    }
}