import { LightningElement, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getDocStatus from '@salesforce/apex/dealerDocumentChecklistController.getDocStatus';

export default class DocumentChecklist extends LightningElement {

    recordId;
    docStatus;
    isLoaded = false;

    // 🔥 GET recordId FROM URL
    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
        if (currentPageReference) {

            console.log('Page Ref:', currentPageReference);

            // LWR uses this format
            this.recordId = currentPageReference.attributes?.recordId 
                || currentPageReference.state?.recordId;

            console.log('recordId from URL:', this.recordId);
        }
    }

    // 🔥 CALL APEX ONLY WHEN recordId IS READY
    @wire(getDocStatus, { accountId: '$recordId' })
    wiredStatus({ error, data }) {

        console.log('WIRE FIRED, recordId:', this.recordId);

        if (data) {
            console.log('DATA:', data);

            this.docStatus = data.map(item => {
                const isSubmitted = item.status === true;

                 return {
                    label: item.label,
                    status: item.status,
                    statusIcon: isSubmitted ? '✅' : '⏳',
                    statusText: isSubmitted ? 'Submitted' : 'Pending',
                    statusClass: isSubmitted ? 'status submitted' : 'status pending',
                    statusStyle: isSubmitted
                        ? 'background: linear-gradient(135deg, #f0fdf4 0%, #e6f9ed 100%); border-left: 4px solid #10b981;'
                        : 'background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #f59e0b;'
                };
            });

            this.isLoaded = true;

        } else if (error) {
            console.error('ERROR:', error);
            this.isLoaded = true;
        }
    }
}