import { LightningElement, api, wire, track } from 'lwc';
import getAvailableDocs from '@salesforce/apex/AccountDocumentUploaderController.getAvailableDocs';
import updateCheckbox from '@salesforce/apex/AccountDocumentUploaderController.updateCheckbox';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

export default class AccountDocUploader extends LightningElement {

    @api accountId;

    @track selectedDoc;
    @track availableOptions = [];

    acceptedFormats = ['.pdf', '.png', '.jpg', '.jpeg'];

    wiredOptionsResult;

    @wire(getAvailableDocs, { accountId: '$accountId' })
    wiredOptions(result) {
        this.wiredOptionsResult = result;
        const { data, error } = result;

        if (data) {
            this.availableOptions = data;
        } else if (error) {
            this.showToast('Error', 'Unable to load document options', 'error');
        }
    }

    handleDocChange(event) {
        this.selectedDoc = event.detail.value;
    }

    async handleUploadFinished(event) {

        const uploadedFiles = event.detail.files;

        if (uploadedFiles.length > 0 && this.selectedDoc) {

            try {
                await updateCheckbox({
                    accountId: this.accountId,
                    fieldName: this.selectedDoc
                });

                this.showToast('Success', 'Document uploaded successfully', 'success');

                this.selectedDoc = null;
                this.dispatchEvent(new CustomEvent('close'));
                await refreshApex(this.wiredOptionsResult);


            } catch (error) {
                this.showToast('Error', 'Failed to update document status', 'error');
            }
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }
}