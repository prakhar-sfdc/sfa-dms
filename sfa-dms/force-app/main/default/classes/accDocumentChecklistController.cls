public with sharing class accDocumentChecklistController {
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getDocStatus(Id accountId) {
        Account acc = [
            SELECT GST_Uploaded__c,
                   PAN_Uploaded__c,
                   Aadhar_Uploaded__c,
                   Address_Proof_Uploaded__c
            FROM Account
            WHERE Id = :accountId
        ];

        List<Map<String, Object>> result = new List<Map<String, Object>>();

        result.add(buildStatus('GST Certificate', acc.GST_Uploaded__c));
        result.add(buildStatus('PAN Card', acc.PAN_Uploaded__c));
        result.add(buildStatus('Aadhar Card', acc.Aadhar_Uploaded__c));
        result.add(buildStatus('Address Proof', acc.Address_Proof_Uploaded__c));


        return result;
    }

    private static Map<String, Object> buildStatus(String label, Boolean status) {
        return new Map<String, Object>{
            'label' => label,
            'status' => status != null && status
        };
    }
}