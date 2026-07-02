public class OCRQueueable implements Queueable, Database.AllowsCallouts {

    private Id contentDocumentId;
    private Id accountId;
    private String documentType;

    public OCRQueueable(Id contentDocumentId, Id accountId, String documentType) {
        this.contentDocumentId = contentDocumentId;
        this.accountId = accountId;
        this.documentType = documentType;
    }

    public void execute(QueueableContext context) {

        System.debug('🔥 OCR STARTED');

        // 🔹 Get latest file
        ContentVersion cv = [
            SELECT VersionData, FileType
            FROM ContentVersion
            WHERE ContentDocumentId = :contentDocumentId
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];

        // 🔹 Prepare HTTP request
        Http http = new Http();
        HttpRequest req = new HttpRequest();

        req.setEndpoint('https://prod-ml.fracto.tech/upload-file-smart-ocr');
        req.setMethod('POST');
        req.setHeader('x-api-key', 'KLO-TUS-A76C08-GPF1BO-7008MEKJ');

        // 🔥 MULTIPART FORM-DATA (IMPORTANT FIX)
       String boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

req.setHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);

// 🔥 Convert file to base64 (only for embedding inside multipart)
String fileBase64 = EncodingUtil.base64Encode(cv.VersionData);

String body = '';

// parserApp
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="parserApp"\r\n\r\n';
body += 'MNXASQzLS7XQXOK6\r\n';

// model
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="model"\r\n\r\n';
body += 'v1\r\n';

// extra_accuracy
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="extra_accuracy"\r\n\r\n';
body += 'false\r\n';

// file
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="file"; filename="document.jpg"\r\n';
body += 'Content-Type: image/jpeg\r\n';
body += 'Content-Transfer-Encoding: base64\r\n\r\n';

body += fileBase64 + '\r\n';

// closing boundary
body += '--' + boundary + '--';

// 🔥 FINAL STEP
req.setBody(body);

        // 🔹 Send request
        HttpResponse res = http.send(req);

        System.debug('Status Code: ' + res.getStatusCode());
        System.debug('OCR RESPONSE: ' + res.getBody());

        if (res.getStatusCode() != 200) {
            System.debug('❌ OCR API failed');
            return;
        }

        // 🔹 Parse response
        Map<String, Object> result =
            (Map<String, Object>) JSON.deserializeUntyped(res.getBody());

        Account acc = new Account(Id = accountId);

        // =========================
        // PAN EXTRACTION
        // =========================
        if (documentType == 'PAN_Card__c') {

            Map<String, Object> others = (Map<String, Object>) result.get('others');

            if (others != null && others.get('pan_number') != null) {
                acc.PAN_Number__c = ((String) others.get('pan_number')).toUpperCase();
            }
        }

        // =========================
        // AADHAAR EXTRACTION
        // =========================
        if (documentType == 'Aadhaar_Card__c') {

            if (result.get('aadhaar_number') != null) {
                acc.Aadhar_Number__c = (String) result.get('aadhaar_number');
            }
        }

        // 🔹 Update Account
        update acc;

        System.debug('✅ OCR COMPLETED');
    }

    // 🔥 Helper method for MIME type
    private static String getMimeType(String fileType) {

        if (fileType == 'PNG') return 'image/png';
        if (fileType == 'JPG' || fileType == 'JPEG') return 'image/jpeg';
        if (fileType == 'PDF') return 'application/pdf';

        return 'application/octet-stream';
    }
}