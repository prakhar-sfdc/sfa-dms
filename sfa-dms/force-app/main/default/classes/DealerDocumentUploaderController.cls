public with sharing class DealerDocumentUploaderController {

    // =========================
    // GET AVAILABLE DOCS
    // =========================
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getAvailableDocs(Id accountId) {

        if (accountId == null) return new List<Map<String, String>>();

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

        List<Map<String, String>> options = new List<Map<String, String>>();

        if (!acc.GST_Certificate__c) {
            options.add(buildOption('GST_Certificate__c', 'GST Certificate'));
        }
        if (!acc.PAN_Card__c) {
            options.add(buildOption('PAN_Card__c', 'PAN Card'));
        }
        if (!acc.Aadhaar_Card__c) {
            options.add(buildOption('Aadhaar_Card__c', 'Aadhar Card'));
        }
        if (!acc.Bank_Proof__c) {
            options.add(buildOption('Bank_Proof__c', 'Bank Proof'));
        }
        if (!acc.Business_Registration__c) {
            options.add(buildOption('Business_Registration__c', 'Business Registration'));
        }
        if (!acc.Address_Proof__c) {
            options.add(buildOption('Address_Proof__c', 'Address Proof'));
        }

        return options;
    }

    private static Map<String, String> buildOption(String value, String label) {
        return new Map<String, String>{
            'label' => label,
            'value' => value
        };
    }

    // =========================
    // UPDATE CHECKBOX
    // =========================
    @AuraEnabled
    public static void updateCheckbox(Id accountId, String fieldName) {

        if (accountId == null || String.isBlank(fieldName)) return;

        Account acc = new Account(Id = accountId);
        acc.put(fieldName, true);

        Database.DMLOptions dmlOptions = new Database.DMLOptions();
        dmlOptions.DuplicateRuleHeader.allowSave = true;

        Database.update(acc, dmlOptions);
    }

    // =========================
    // OCR PROCESSING
    // =========================
//    @AuraEnabled
// public static void processOCR(Id contentDocumentId, Id accountId, String documentType) {

//     System.enqueueJob(new OCRQueueable(contentDocumentId, accountId, documentType));
// }

@AuraEnabled
public static void saveKYCData(Id accountId, String pan, String aadhaar, String gst) {

    Account acc = new Account(Id = accountId);

    System.debug('Account Id ' + accountId);
    System.debug('PAN ' + pan);
    System.debug('Aadhaar ' + aadhaar);
    System.debug('GST ' + gst);

    if (String.isNotBlank(pan)) {
        acc.PAN_Number__c = pan;
    }

    if (String.isNotBlank(aadhaar)) {
        acc.Aadhar_Number__c = aadhaar;
    }

    // 🔥 GST FIELD (create this if not exists)
    if (String.isNotBlank(gst)) {
        acc.GST_Number__c = gst;
    }

    update acc;
}
   
@AuraEnabled
public static Id uploadFileToSalesforce(
    Id recordId,
    String fileName,
    String base64Data
) {

    Blob fileBody = EncodingUtil.base64Decode(base64Data);

    ContentVersion cv = new ContentVersion(
        Title = fileName,
        PathOnClient = fileName,
        VersionData = fileBody,
        FirstPublishLocationId = recordId
    );

    insert cv;

    return cv.ContentDocumentId;
}

}