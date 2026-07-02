import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getRelatedRecords from '@salesforce/apex/DynamicRelatedListController.getRelatedRecords';

export default class DynamicRelatedList extends LightningElement {

    // Config from Experience Builder
    @api objectApiName;
    @api parentFieldApiName;
    @api fields; // Example: Name,Email,Phone

    data = [];
    columns = [];
    recordId;

    // ✅ Get recordId from LWR URL
    @wire(CurrentPageReference)
    getPageRef(pageRef) {
        if (pageRef) {
            this.recordId =
                pageRef.attributes?.recordId ||
                pageRef.state?.recordId;
        }
    }

    connectedCallback() {
        this.generateColumns();
    }

    // Generate datatable columns dynamically
    generateColumns() {
        if (!this.fields) return;

        this.columns = this.fields.split(',').map(field => {
            field = field.trim();

            return {
                label: this.formatLabel(field),
                fieldName: field,
                type: 'text'
            };
        });
    }

    // Convert API name to readable label
    formatLabel(field) {
        return field.replace(/__/g, ' ')
                    .replace(/_/g, ' ')
                    .replace(/([A-Z])/g, ' $1')
                    .trim();
    }

    // Fetch related records
    @wire(getRelatedRecords, {
        objectApiName: '$objectApiName',
        parentFieldApiName: '$parentFieldApiName',
        fieldList: '$fields',
        recordId: '$recordId'
    })
    wiredRecords({ data, error }) {
        if (data) {
            this.data = data.map(row => {
                return { ...row };
            });
        } else if (error) {
            console.error('Error fetching records', error);
        }
    }
}