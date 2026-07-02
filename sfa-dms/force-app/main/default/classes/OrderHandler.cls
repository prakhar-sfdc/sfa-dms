public with sharing class OrderHandler {

    public static void handleBeforeInsert(List<Order> orders) {

        // 🔹 Get current user details
        User currentUser = [
            SELECT Id, Profile.Name, AccountId
			FROM User
            WHERE Id = :UserInfo.getUserId()
        ];

        // 🔹 Identify Partner User
        Boolean isPartnerUser = currentUser.Profile.Name.contains('Partner');

        // 🔹 Fetch Record Types for Order
        Map<Id, RecordType> rtMap = new Map<Id, RecordType>(
            [SELECT Id, DeveloperName 
             FROM RecordType 
             WHERE SObjectType = 'Order']
        );

        // 🔁 Loop through Orders
        for (Order ord : orders) {

            // 🚫 Skip if no RecordType
            if (ord.RecordTypeId == null) continue;

            RecordType rt = rtMap.get(ord.RecordTypeId);

            // 🚫 Apply ONLY for Primary
            if (rt == null) {
                continue;
            }

            if(rt.DeveloperName == 'Primary'){
            // ✅ Partner Community User Logic
            if (isPartnerUser) {

                // Set Account from User
                if (currentUser.AccountId != null) {
                    ord.AccountId = currentUser.AccountId;
                }

                ord.Tagged_By__c = currentUser.Id;
                ord.Order_punched_by__c = 'Self';

            } 
            // ✅ Internal User Logic
            else {

                ord.Tagged_By__c = currentUser.Id;
                ord.Order_punched_by__c = 'Sales-Person';
            }
            }else{
                ord.Tagged_By__c = currentUser.Id;
            }
        }
    }
}