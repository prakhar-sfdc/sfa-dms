public class SubOrderInvoicePDFService implements Queueable {

    List<Id> subOrderIds;

    public SubOrderInvoicePDFService(List<Id> subOrderIds){
        this.subOrderIds = subOrderIds;
    }

    public void execute(QueueableContext qc){

        List<Sub_Order__c> subOrders = [
            SELECT Id, Name
            FROM Sub_Order__c
            WHERE Id IN :subOrderIds
        ];

        List<ContentVersion> files = new List<ContentVersion>();

        for(Sub_Order__c so : subOrders){

            PageReference pdfPage = Page.SubOrderInvoicePDF;
            pdfPage.getParameters().put('id', so.Id);
            pdfPage.setRedirect(true);

            Blob pdfBlob = pdfPage.getContentAsPDF();

            files.add(new ContentVersion(
                Title = 'Invoice_' + so.Name,
                PathOnClient = 'Invoice_' + so.Name + '.pdf',
                VersionData = pdfBlob,
                FirstPublishLocationId = so.Id
            ));
        }

        insert files;
    }
}