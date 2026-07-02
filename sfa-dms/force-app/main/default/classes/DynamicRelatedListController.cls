public with sharing class DynamicRelatedListController {

    @AuraEnabled(cacheable=true)
    public static List<SObject> getRelatedRecords(
        String objectApiName,
        String parentFieldApiName,
        String fieldList,
        Id recordId
    ) {
        if (String.isBlank(objectApiName) ||
            String.isBlank(parentFieldApiName) ||
            String.isBlank(fieldList) ||
            recordId == null) {
            return new List<SObject>();
        }

        String query = 'SELECT Id, ' + fieldList +
                       ' FROM ' + objectApiName +
                       ' WHERE ' + parentFieldApiName + ' = :recordId' +
                       ' ORDER BY CreatedDate DESC';

        return Database.query(query);
    }
}