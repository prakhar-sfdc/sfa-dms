public with sharing class LookupController {

    @AuraEnabled(cacheable=true)
    public static List<SObject> searchRecords(String searchKey, String objectName, Boolean isSecondary) {

        String query;

        // 🔥 Account filter for Secondary
        if (objectName == 'Account' && isSecondary) {

            query = 'SELECT Id, Name FROM Account ' +
                    'WHERE Name LIKE \'%' + searchKey + '%\' ' +
                    'AND Onboarded_By__c = \'' + UserInfo.getUserId() + '\' ' +
                    'LIMIT 10';

        } else {

            query = 'SELECT Id, Name FROM ' + objectName +
                    ' WHERE Name LIKE \'%' + searchKey + '%\' LIMIT 10';
        }

        return Database.query(query);
    }
}