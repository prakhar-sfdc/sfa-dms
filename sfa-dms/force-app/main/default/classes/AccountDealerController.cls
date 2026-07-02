public with sharing class AccountDealerController {

    public static void handleBeforeInsert(List<Account> newAccounts) {

        // Get Dealer RecordTypeId
        Id dealerRtId = Schema.SObjectType.Account
            .getRecordTypeInfosByName()
            .get('Dealer')
            .getRecordTypeId();

        for (Account acc : newAccounts) {

            if (acc.RecordTypeId == dealerRtId) {

                acc.Onboarded_by__c = UserInfo.getUserId();
                acc.Onboarding_Date__c = Date.today();
            }
        }
    }
}