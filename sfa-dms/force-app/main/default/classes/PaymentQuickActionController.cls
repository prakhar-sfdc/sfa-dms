public with sharing class PaymentQuickActionController {

    @AuraEnabled
    public static Id createPayment(
        Id      orderId,
        Id      accountId,
        Decimal amount,
        String  paymentMode,
        String  referenceNumber,
        String  bankName,
        String  paymentDate
    ) {
        if (orderId == null || accountId == null) {
            throw new AuraHandledException('Order and Account are required.');
        }

        Date pd = null;
        if (String.isNotBlank(paymentDate)) {
            try {
                List<String> parts = paymentDate.split('-');
                pd = Date.newInstance(
                    Integer.valueOf(parts[0]),
                    Integer.valueOf(parts[1]),
                    Integer.valueOf(parts[2])
                );
            } catch (Exception e) {
                throw new AuraHandledException('Invalid payment date: ' + paymentDate);
            }
        }

        Payment__c payment = new Payment__c(
            Order__c            = orderId,
            Account__c          = accountId,
            Amount__c           = amount,
            Payment_Mode__c     = paymentMode,
            Reference_Number__c = referenceNumber,
            Bank_Name__c        = bankName,
            Payment_Date__c     = pd,
            Status__c           = 'Draft'
        );

        insert payment;
        return payment.Id;
    }

    @AuraEnabled
    public static void uploadReceipt(Id paymentId, String fileName, String base64Data) {
        if (paymentId == null || String.isBlank(base64Data)) return;

        ContentVersion cv = new ContentVersion(
            Title                  = fileName,
            PathOnClient           = fileName,
            VersionData            = EncodingUtil.base64Decode(base64Data),
            FirstPublishLocationId = paymentId
        );
        insert cv;
    }
}