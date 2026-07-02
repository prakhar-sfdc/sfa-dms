public with sharing class AccountDocMasterController {

    // ✅ Create/Fetch single master record for Account
    @AuraEnabled
    public static Id getOrCreateAccountDocMaster(Id accountId) {
        if (accountId == null) return null;

        List<Account_Document__c> existing = [
            SELECT Id
            FROM Account_Document__c
            WHERE Account__c = :accountId
            LIMIT 1
        ];

        if (!existing.isEmpty()) {
            return existing[0].Id;
        }

        Account_Document__c doc = new Account_Document__c();
        doc.Account__c = accountId;
        doc.Unique_Account_Key__c = String.valueOf(accountId);
        insert doc;

        return doc.Id;
    }

    // ✅ Get master record for checklist view
    @AuraEnabled(cacheable=true)
    public static Account_Document__c getAccountDocMaster(Id accountId) {
        if (accountId == null) return null;

        List<Account_Document__c> docs = [
            SELECT Id, Account__c,
                   GST_Certificate_Completed_On__c,
                   Adhar_Card_Completed_On__c,
                   PAN_Card_Completed_On__c,
                   Address_Proof_Completed_On__c
            FROM Account_Document__c
            WHERE Account__c = :accountId
            LIMIT 1
        ];

        return docs.isEmpty() ? null : docs[0];
    }

    // ✅ Return only Pending docs (Hide completed docs from dropdown)
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getPendingDocTypeOptions(Id accountId) {
        if (accountId == null) return new List<Map<String, String>>();

        List<Account_Document__c> docs = [
            SELECT Id,
                   GST_Certificate_Completed_On__c,
                   Adhar_Card_Completed_On__c,
                   PAN_Card_Completed_On__c,
                   Address_Proof_Completed_On__c
            FROM Account_Document__c
            WHERE Account__c = :accountId
            LIMIT 1
        ];

        if (docs.isEmpty()) {
            return new List<Map<String, String>>();
        }

        Account_Document__c master = docs[0];

        List<Map<String, String>> options = new List<Map<String, String>>();

        if (master.GST_Certificate_Completed_On__c == null) {
            options.add(new Map<String, String>{ 'label' => 'GST Certificate', 'value' => 'GST Certificate' });
        }
        if (master.Adhar_Card_Completed_On__c == null) {
            options.add(new Map<String, String>{ 'label' => 'Adhar Card', 'value' => 'Adhar Card' });
        }
        if (master.PAN_Card_Completed_On__c == null) {
            options.add(new Map<String, String>{ 'label' => 'PAN Card', 'value' => 'PAN Card' });
        }
        if (master.Address_Proof_Completed_On__c == null) {
            options.add(new Map<String, String>{ 'label' => 'Address Proof', 'value' => 'Address Proof' });
        }

        return options;
    }

    // ✅ After upload: mark completed datetime + rename file title
    @AuraEnabled
    public static void markDocCompletedAndRenameFile(
        Id masterDocId,
        String documentType,
        Id contentDocumentId
    ) {
        if (masterDocId == null || String.isBlank(documentType) || contentDocumentId == null) return;

        DateTime nowDT = System.now();

        Account_Document__c upd = new Account_Document__c(Id = masterDocId);

        if (documentType == 'GST Certificate') {
            upd.GST_Certificate_Completed_On__c = nowDT;
        } else if (documentType == 'Adhar Card') {
            upd.Adhar_Card_Completed_On__c = nowDT;
        } else if (documentType == 'PAN Card') {
            upd.PAN_Card_Completed_On__c = nowDT;
        } else if (documentType == 'Address Proof') {
            upd.Address_Proof_Completed_On__c = nowDT;
        }

        update upd;

        // ✅ Rename file title (shows same name in Notes & Files)
        ContentDocument cd = [
            SELECT Id, Title
            FROM ContentDocument
            WHERE Id = :contentDocumentId
            LIMIT 1
        ];

        cd.Title = documentType;
        update cd;
    }
}