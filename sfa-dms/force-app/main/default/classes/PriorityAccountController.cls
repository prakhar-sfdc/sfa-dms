public with sharing class PriorityAccountController {

    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getPriorityAccounts(Integer limitSize) {

        if(limitSize == null || limitSize <= 0) limitSize = 5;

        List<Account> accList = [
            SELECT Id, Name, Priority__c
            FROM Account
            WHERE Priority__c != null
            ORDER BY Name
            LIMIT :limitSize
        ];

        List<Map<String, Object>> res = new List<Map<String, Object>>();

        for(Account a : accList){
            Map<String, Object> row = new Map<String, Object>();
            row.put('id', a.Id);
            row.put('name', a.Name);
            row.put('priority', a.Priority__c); // High/Medium/Low
            res.add(row);
        }

        return res;
    }
}