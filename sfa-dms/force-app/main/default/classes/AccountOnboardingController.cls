public with sharing class AccountOnboardingController {

    @AuraEnabled
    public static Id createAccount(Map<String, String> data) {

        System.debug('DATA RECEIVED => ' + JSON.serialize(data));

        // ===== Basic Validation =====
        if (data == null || String.isBlank(data.get('businessName'))) {
            throw new AuraHandledException('Business Name is required');
        }

        try {
            Account acc = new Account();

            // ===== BUSINESS INFO =====
            acc.Name = data.get('businessName');

            if (!String.isBlank(data.get('accountType'))) {
                acc.Type = data.get('accountType');
            }

            if (!String.isBlank(data.get('gstin'))) {
                acc.GSTIN__c = data.get('gstin');
            }

            // ===== ADDRESS INFO =====
            if (!String.isBlank(data.get('streetAddress'))) {
                acc.BillingStreet = data.get('streetAddress');
            }

            if (!String.isBlank(data.get('city'))) {
                acc.BillingCity = data.get('city');
            }

            if (!String.isBlank(data.get('state'))) {
                acc.BillingState = data.get('state');
            }

            if (!String.isBlank(data.get('country'))) {
                acc.BillingCountry = data.get('country');
            }

            if (!String.isBlank(data.get('pincode'))) {
                acc.BillingPostalCode = data.get('pincode');
            }

            // ===== OPTIONAL: SAVE PHONE ON ACCOUNT ALSO =====
            if (!String.isBlank(data.get('phoneNumber'))) {
                acc.Phone = data.get('phoneNumber');
            }

            insert acc;

            // ===== CONTACT CREATION =====
            if (!String.isBlank(data.get('contactPerson'))) {

                Contact con = new Contact();
                con.LastName = data.get('contactPerson');
                con.AccountId = acc.Id;

                if (!String.isBlank(data.get('phoneNumber'))) {
                    con.Phone = data.get('phoneNumber');
                }

                if (!String.isBlank(data.get('email'))) {
                    con.Email = data.get('email');
                }

                insert con;
            }

            return acc.Id;

        } catch (Exception e) {
            System.debug('ERROR => ' + e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }
}