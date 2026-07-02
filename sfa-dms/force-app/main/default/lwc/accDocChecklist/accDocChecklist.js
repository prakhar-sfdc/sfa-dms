import { LightningElement, api, wire } from 'lwc';
import getDocStatus from '@salesforce/apex/accDocumentChecklistController.getDocStatus';

export default class DocumentChecklist extends LightningElement {
    @api accountId;
    docStatus;

    @wire(getDocStatus, { accountId: '$accountId' })
    wiredStatus({ error, data }) {
        if (data) {
            this.docStatus = data.map(item => {
                const isSubmitted = item.status === true;
                return {
                    label: item.label,
                    status: item.status,
                    statusIcon: isSubmitted ? '✅' : '⌛',
                    statusText: isSubmitted ? 'Submitted' : 'Pending',
                    statusClass: isSubmitted ? 'status submitted' : 'status pending',
                    statusStyle: isSubmitted
                        ? 'background-color: #e6ffed; border-left: 4px solid #2ecc71;'
                        : 'background-color: #fff8f6; border-left: 4px solid #e67e22;'
                };
            });
        } else if (error) {
            console.error('Error loading document checklist', error);
        }
    }
}